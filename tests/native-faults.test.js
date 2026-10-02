import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { setImmediate as immediate } from 'node:timers/promises';
import { smartCompile } from '../src/core/pine.js';
import { observePineCompilation, dispatchPineCompilation } from '../src/core/pine-state.js';
import { prepareFeedBindings, parseFeedSpecs } from '../src/core/multi-feed.js';
import { acquireSession, sessionStatus, nativeCheckpoint, withLegacySession } from '../src/session.js';
import { recoverSession } from '../src/session-recovery.js';
import { deadline } from '../src/cdp.js';

function store() { return { getStore:()=>({getState:()=>({ui:{pendingRequests:{}},console:{messages:[]}}),subscribe:()=>()=>{}}) }; }
function fixtureOptions() { return { directory:mkdtempSync(join(tmpdir(),'tv-native-fault-')),host:'test',port:1 }; }
function page({loading=false, calculating=false, unreadable=false}={}) {
  const series={bars:()=>({firstIndex:()=>0,lastIndex:()=>0,valueAt:()=>[1]}),isLoading:()=>false};
  const model=(pending,sources=[])=>({mainSeries:()=>({...series,isLoading:()=>pending}),model:()=>({dataSources:()=>sources})});
  const active={symbol:()=> 'X:A',resolution:()=> '1',chartType:()=>1,_chartWidget:{model:()=>model(false)}};
  const inactive={model:()=>unreadable?{}:model(loading,calculating?[{id:()=> 'study',metaInfo:()=>({isTVScriptStrategy:true}),status:()=>({type:1})}]:[])};
  return {TradingViewApi:{_activeChartWidgetWV:{value:()=>active},_chartWidgetCollection:{getAll:()=>[active,inactive],metaInfo:{uid:{value:()=> 'QA'}}}}};
}
const document={querySelectorAll:()=>[]};
function recoveryDeps(options,pages,closed=[]) {
  return {acquireSession:()=>acquireSession({...options,recover:true}),connect:async({target})=>{
    if(!pages.has(target))throw new Error('target missing');
    return {Runtime:{evaluate:async({expression})=>({result:{value:runInNewContext(expression,{window:pages.get(target),document})}})},close:async()=>{closed.push(target);}};
  }};
}

it('generic getter, progress and transport failures retain dispatched compile fences until explicit quiescent recovery',async()=>{
  for(const error of [new Error('getter failed'),new Error('progress read failed'),Object.assign(new Error('WebSocket closed'),{code:'ECONNRESET'})]) {
    const options=fixtureOptions(),lease=acquireSession(options),window=page();let complete,late=false;
    const pending=new Promise(resolve=>{complete=resolve;});
    const controller={_editorStore:store(),getScriptIdVersion:()=>null,addToChart:async()=>{await pending;late=true;}};
    const deps={source:'//@version=6\nindicator("fault")\nplot(close)',sleep:()=>immediate(),
      stages:{context:()=>({}),begin:()=>({phase:'pending'}),observe:({token})=>observePineCompilation(window,controller,token),
        dispatch:({token})=>{nativeCheckpoint('pine compile','QA');return dispatchPineCompilation(window,controller,token);},status:()=>{throw error;},fail:()=>true},
      evaluate:expression=>runInNewContext(expression,{window}),readOutcome:async()=>({markers:[],targets:[],native_diagnostics:[],runtime_diagnostics:[]})};
    try {
      const result=await withLegacySession(lease,()=>smartCompile({_deps:deps}));
      assert.equal(result.recovery_required,true);lease.release({restored:!result.recovery_required});
      assert.equal(sessionStatus(options).recovery_required,true);
      assert.throws(()=>acquireSession(options),{code:'RECOVERY_REQUIRED'});
      const _deps=recoveryDeps(options,new Map([['QA',window]]));
      await assert.rejects(recoverSession({runId:lease.run_id,_deps}),{code:'NATIVE_BUSY'});
      complete();await window.__tvCliPineCompile.promise;assert.equal(late,true);
      assert.equal(sessionStatus(options).recovery_required,true);
      assert.equal((await recoverSession({runId:lease.run_id,_deps})).recovered,true);
    } finally {complete();lease.release();}
  }
});

it('exact-token undispatched compile failure cancels only its observer and releases its checkpoint',async()=>{
  const options=fixtureOptions(),lease=acquireSession(options),window=page();let calls=0;
  const controller={_editorStore:store(),getScriptIdVersion:()=>null};
  const deps={source:'indicator("fault")',stages:{context:()=>({}),begin:()=>({}),observe:({token})=>observePineCompilation(window,controller,token),
    dispatch:()=>{nativeCheckpoint('pine compile','QA');calls++;throw new Error('preflight rejected');},fail:()=>true},
    evaluate:expression=>runInNewContext(expression,{window}),readOutcome:async()=>({markers:[],targets:[],native_diagnostics:[],runtime_diagnostics:[]})};
  const result=await withLegacySession(lease,()=>smartCompile({_deps:deps}));
  assert.equal(result.recovery_required,false);assert.equal(window.__tvCliPineCompile.cancelled,true);assert.equal(calls,1);
  lease.release({restored:true});assert.equal(sessionStatus(options).recovery_required,false);
});

it('uncertain native layout expansion aborts fallback, provisioning and new tabs while its real deadline fence survives',async()=>{
  const options=fixtureOptions(),lease=acquireSession(options);let complete,attempts=0,opened=0,provisioned=0,pending=true;
  const native=new Promise(resolve=>{complete=()=>{pending=false;resolve();};});
  const adapter={discover:async()=>[{id:'QA'}],attach:async()=>({id:'QA'}),close:async()=>{},
    inventory:async()=>({targetId:'QA',visible:true,panes:[{index:0,symbol:'X:A',timeframe:'1',hasBar:true},{index:1,symbol:'X:B',timeframe:'1',hasBar:true}]}),
    setLayout:async()=>{attempts++;nativeCheckpoint('stream ohlcv provision','QA',{all_panes:true});await deadline(()=>native,{timeout:10});},
    provision:async()=>{provisioned++;},openTab:async()=>{opened++;}};
  try {
    await assert.rejects(withLegacySession(lease,()=>prepareFeedBindings(parseFeedSpecs(['X:A@1','X:B@1','X:C@1']),adapter,{allowReassignTargets:['QA']})),error=>error.code==='CDP_TIMEOUT'&&error.recovery_required===true);
    lease.release();assert.equal(attempts,1);assert.equal(opened,0);assert.equal(provisioned,0);assert.equal(pending,true);
    assert.equal(sessionStatus(options).recovery_required,true);
    const window=page();window.__tvCliNativeOperations={token:{pending:true}};
    const _deps=recoveryDeps(options,new Map([['QA',window]]));
    await assert.rejects(recoverSession({runId:lease.run_id,_deps}),{code:'NATIVE_BUSY'});
    complete();await native;delete window.__tvCliNativeOperations.token;
    assert.equal(sessionStatus(options).recovery_required,true);
    assert.equal((await recoverSession({runId:lease.run_id,_deps})).recovered,true);
  } finally {complete();lease.release();}
});

it('recovery checks inactive loading/calculation/unreadable panes and every historical target',async()=>{
  {
    const options=fixtureOptions(),lease=acquireSession(options);lease.checkpoint({native_quiescence_required:true,target_id:'QA',target_panes:{QA:[0]}});lease.release();
    const pages=new Map([['QA',page({loading:true,calculating:true})]]);
    assert.equal((await recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages)})).recovered,true,'Recorded pane0 recovery ignores unrelated pane1 loading/calculation.');
  }
  for(const state of [{loading:true},{calculating:true},{unreadable:true}]) {
    const options=fixtureOptions(),lease=acquireSession(options);lease.checkpoint({native_quiescence_required:true,target_id:'QA'});lease.release();
    const pages=new Map([['QA',page(state)]]),closed=[];
    await assert.rejects(recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages,closed)}),{code:'NATIVE_BUSY'});
    assert.equal(sessionStatus(options).recovery_required,true);assert.deepEqual(closed,['QA']);
    pages.set('QA',page());await recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages)});
  }
  for(const second of [null,'registry','loading','unreadable']) {
    const options=fixtureOptions(),lease=acquireSession(options);lease.checkpoint({native_quiescence_required:true,target_id:'QA-A',targets:['QA-A','QA-B']});lease.release();
    const pages=new Map([['QA-A',page()]]),closed=[];
    if(second){const p=page({loading:second==='loading',unreadable:second==='unreadable'});if(second==='registry')p.__tvCliNativeOperations={old:{pending:true}};pages.set('QA-B',p);}
    await assert.rejects(recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages,closed)}),{code:'NATIVE_BUSY'});
    assert.equal(sessionStatus(options).recovery_required,true);assert.ok(closed.includes('QA-A'));
    pages.set('QA-B',page());assert.equal((await recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages)})).verified_target_count,2);
  }
  const options=fixtureOptions(),lease=acquireSession(options);
  lease.checkpoint({native_quiescence_required:true,target_id:'QA',target_panes:{QA:[2]}});lease.release();
  const pages=new Map([['QA',page()]]);
  await assert.rejects(recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages)}),{code:'NATIVE_BUSY'});
  assert.equal(sessionStatus(options).recovery_required,true);
  const next=page(),all=next.TradingViewApi._chartWidgetCollection.getAll();next.TradingViewApi._chartWidgetCollection.getAll=()=>[...all,all[1]];pages.set('QA',next);
  await recoverSession({runId:lease.run_id,_deps:recoveryDeps(options,pages)});
});

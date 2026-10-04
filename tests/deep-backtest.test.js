import { it } from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { DEEP_PAGE_CODE } from '../src/deep-backtest-page.js';
import { deepPeriod,runDeep,waitDeep,resetNormal } from '../src/core/deep-backtest.js';
import { getProperties } from '../src/core/strategy-properties.js';
import { deepPage } from './fixtures/deep-page.mjs';
import { compilationState,invalidateEditedSource,prepareInputChange } from '../src/strategy-state.js';

const call=(p,name,...args)=>p.evaluate(`(async()=>{${DEEP_PAGE_CODE};return ${name}(window,${name==='inspectDeepSettlement'?'':'document,'}${args.map(a=>JSON.stringify(a)).join(',')});})()`);
async function start(p){const proof=await call(p,'verifyDeepSource','owned-study');assert.equal(proof.verified,true);const request={run_id:'exact-run',request_id:'exact-request',fingerprint:'fp',strategy_id:'owned-study',source_proof:proof,from_ms:1704067200000,to_ms:1704153600000,period:{from:'2024-01-01T00:00:00Z',to:'2024-01-02T00:00:00Z',timezone:'UTC'},properties_hash:'props-hash'};return call(p,'startDeepRun',request);}
const memoryStore=()=>{let row=null;return {read:()=>row,write:value=>{row=structuredClone(value);},list:()=>row?[{file:'private',record:row}]:[],update:(_,value)=>{row=structuredClone(value);}};};

it('Deep periods require explicit offsets, real calendar dates and nonempty whole-second native bounds',()=>{
  for(const args of [{from:'2024-01-01',to:'2024-01-02'},{from:'2024-02-30T00:00:00Z',to:'2024-03-02T00:00:00Z'},{from:'2024-01-01T00:00:00.100Z',to:'2024-01-01T00:00:00.900Z'},{from:'2024-01-02T00:00:00Z',to:'2024-01-01T00:00:00Z'}])assert.throws(()=>deepPeriod(args),e=>e.code==='INVALID_DEEP_PERIOD'&&e.details.mutation_dispatched===false);
  const result=deepPeriod({from:'2024-03-10T00:00:00-05:00',to:'2024-03-11T00:00:00-04:00',timezone:'America/New_York'});assert.equal(result.to_ms-result.from_ms,23*3600000);
});
it('Deep response identity is bound to each decoded report cycle and never adopts a later foreign report',async()=>{
  const p=deepPage();assert.equal((await start(p)).phase,'pending');assert.equal(p.dispatches(),1);await p.complete(10);
  assert.equal((await call(p,'inspectDeepRun','exact-run')).phase,'ready');const first=await call(p,'deepReportSnapshot','exact-run');assert.equal(first.success,true);assert.equal(first.snapshot.data.performance.all.netProfit,10);
  await p.complete(999,99);const foreign=await call(p,'deepReportSnapshot','exact-run');assert.equal(foreign.success,false);assert.equal(foreign.code,'DEEP_REPORT_UNVERIFIED');const settlement=await call(p,'inspectDeepSettlement','exact-run');assert.equal(settlement.known,true);assert.equal(settlement.settled,false);assert.equal(p.window.__tvCliDeepRun.snapshot,null);
});
it('source changes during asynchronous hashing reject before any Deep dispatch',async()=>{
  for(const changed of [0,1,2]){const p=deepPage(),crypto=p.window.crypto;let count=0;p.window.crypto={subtle:{digest:async(...args)=>{if(count++===changed)p.setEditorSource('changed during digest',false);return crypto.subtle.digest(...args);}}};
    const proof=await call(p,'verifyDeepSource','owned-study');assert.equal(proof.verified,false);assert.equal(p.dispatches(),0);
  }
});
it('a stale native manager kernel cannot borrow the current owned compile proof',async()=>{
  const p=deepPage();p.manager._activeStrategyInputs.value=()=>({studyName:'foreign',inputs:{text:'other',pineId:'foreign',pineVersion:9,in_cycle:99},dependencies:[]});
  const result=await start(p);assert.equal(result.success,false);assert.equal(result.code,'DEEP_KERNEL_UNVERIFIED');assert.equal(result.mutation_dispatched,false);assert.equal(p.dispatches(),0);
});
it('GUI or unrecorded native pending jobs are not disconnected or replaced',async()=>{
  const p=deepPage();p.manager.activeStrategyStatus.set({type:1});p.manager._requestId=41;p.manager._fromDate=123;p.manager._toDate=456;p.facade._isDeepBacktesting=true;
  const result=await start(p);assert.equal(result.code,'DEEP_NATIVE_JOB_PENDING');assert.equal(result.mutation_dispatched,false);assert.equal(p.dispatches(),0);assert.equal(p.manager._requestId,41);assert.equal(p.manager._fromDate,123);assert.equal(p.manager._toDate,456);
});
it('each native payload mismatch rejects before dispatch against the independent owned baseline',async()=>{
  const changes=[
    ['symbol',p=>{p.manager._symbolString.value=()=> 'FOREIGN';},'DEEP_CONTEXT_UNVERIFIED'],
    ['resolution',p=>{p.manager._resolution.value=()=>({value:()=> '240',isTicks:()=>false,isRange:()=>false});},'DEEP_CONTEXT_UNVERIFIED'],
    ['range',p=>{p.manager._resolution.value=()=>({value:()=> '10R',isTicks:()=>false,isRange:()=>true});},'DEEP_NATIVE_PATH_UNAVAILABLE'],
    ...['text','pineId','pineVersion','prop_fee','prop_qty_type'].map(id=>[id,p=>{const original=p.manager._activeStrategyInputs.value;p.manager._activeStrategyInputs.value=()=>{const n=original();n.inputs[id]=typeof n.inputs[id]==='object'?{...n.inputs[id],v:'foreign'}:'foreign';return n;};},'DEEP_KERNEL_UNVERIFIED']),
    ...['f','t','extra'].map(key=>[key,p=>{const original=p.manager._activeStrategyInputs.value;p.manager._activeStrategyInputs.value=()=>{const n=original();n.inputs.prop_fee[key]=key==='f'?false:'foreign';return n;};},'DEEP_KERNEL_UNVERIFIED']),
    ['dependencies',p=>{const original=p.manager._activeStrategyInputs.value;p.manager._activeStrategyInputs.value=()=>({...original(),dependencies:['unmapped']});},'DEEP_KERNEL_UNVERIFIED'],
  ];
  for(const [name,change,code] of changes){const p=deepPage();change(p);const result=await start(p);assert.equal(result.code,code,name);assert.equal(result.mutation_dispatched,false,name);assert.equal(p.dispatches(),0,name);assert.equal(p.manager._wsConnection,null,name);}
});
it('the final wire boundary blocks a payload changed after preflight',async()=>{
  const p=deepPage(),original=p.manager._sendRequest;let sent=0;
  p.manager._sendRequest=function(method,args){if(method==='history_create_session')p.manager._symbolString.value=()=> 'FOREIGN';if(method==='request_history_data')sent++;return original.call(this,method,args);};
  await assert.rejects(()=>start(p),/DEEP_REQUEST_CHANGED/);assert.equal(sent,0);assert.equal(p.dispatches(),0);assert.equal(p.window.__tvCliDeepRun.sent,undefined);
});
it('on-only reconnect hooks route to the current run and ignore old sockets',async()=>{
  const p=deepPage();await start(p);await p.complete();
  const connection=p.manager._wsConnection,capturedBind=p.manager._bindListeners.bind(p.manager),oldListener=connection.listeners.get('message')[0];
  p.window.__tvCliDeepRun.dispose();delete p.window.__tvCliDeepRun;
  connection._socket={};connection.listeners.clear();capturedBind();
  await start(p);await p.complete(20,1);assert.equal((await call(p,'deepReportSnapshot','exact-run')).snapshot.data.performance.all.netProfit,20);
  const proof=p.window.__tvCliDeepRun.cycle_proof;
  oldListener(JSON.stringify({m:'request_error',p:[p.manager._sessionid,1,'late old socket']}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(p.window.__tvCliDeepRun.cycle_proof,proof);assert.equal((await call(p,'inspectDeepRun','exact-run')).phase,'ready');
  assert.equal(connection.listeners.get('message').length,2);
});
it('auth-like asynchronous connection preparation cannot send after any owned baseline change',async()=>{
  const changes=[
    ['source',p=>p.setEditorSource('external source',true)],['version',p=>p.setDocumentVersion(2)],
    ['ordinary/properties',p=>p.externalFee(0.9)],['symbol/session/currency',p=>{p.chart._chartWidget.model().mainSeries().getSymbolString=()=> 'FOREIGN-extended';}],
    ['resolution',p=>{p.chart._chartWidget.model().mainSeries().interval=()=> '240';}],
    ['timezone',p=>{p.chart.getTimezone=()=> 'America/New_York';}],['generation',p=>{p.window.__tvCliWorkspace.nonce='foreign-generation';}],
    ['compile',p=>{p.window.__tvCliCompilation.token='foreign-compile';}],
  ];
  for(const [name,change] of changes){const p=deepPage(),request=p.manager.requestData;let resume,error,wire=0;const gate=new Promise(resolve=>{resume=resolve;});
    p.manager._sendRequest=method=>{if(method==='request_history_data')wire++;};
    p.manager.requestData=function(from,to){this._fromDate=from;this._toDate=to;this.activeStrategyStatus.set({type:1});gate.then(()=>request.call(this,from,to)).catch(e=>{error=e;});};
    assert.equal((await start(p)).success,true,name);assert.equal(p.dispatches(),0,name);change(p);resume();await new Promise(resolve=>setImmediate(resolve));
    assert.match(error?.message||'',/DEEP_REQUEST_CHANGED/,name);assert.equal(wire,0,name);assert.equal(p.dispatches(),0,name);assert.notEqual(p.window.__tvCliDeepRun.history_send_completed,true,name);
  }
});
it('zero trades retain native window evidence while missing/outside windows and trade timestamps fail period proof',async()=>{
  const cases=[['zero',r=>{r.trades=[];r.performance.all.totalTrades=0;},true],['missing window',r=>{delete r.settings;},false],['outside window',r=>{r.settings.dateRange.backtest.from-=86400000;},false],['missing entry',r=>{delete r.trades[0].entry.time;},false]];
  for(const [name,change,valid] of cases){const p=deepPage();await start(p);await p.complete(10,0,p.manager._sessionid,change);
    const proof=(await call(p,'deepReportSnapshot','exact-run')).snapshot.period_proof;assert.equal(proof.valid,valid,name);assert.equal(proof.coverage_completeness,'unknown',name);
  }
});
it('input-only ready reports with edited/unapplied source or null source hash cannot dispatch Deep',async()=>{
  const p=deepPage();p.setEditorSource('new uncompiled draft',true);invalidateEditedSource(p.window);prepareInputChange(p.window,'owned-study');p.pending();p.completeInputs();compilationState(p.window);
  assert.equal((await call(p,'verifyDeepSource','owned-study')).verified,false);
  let mutations=0;const result=await runDeep({from:'2024-01-01T00:00:00Z',to:'2024-01-02T00:00:00Z',request_id:'no-source',_deps:{properties:async()=>({success:true,report_verified:true,source_hash:null}),evaluateAsync:async(_,opts)=>{if(opts?.mutation)mutations++;},store:memoryStore()}});assert.equal(result.code,'DEEP_SOURCE_UNVERIFIED');assert.equal(mutations,0);
});
it('source-stale unknown native runs cannot be reset or silently removed',async()=>{
  const p=deepPage();await start(p);p.setEditorSource('external draft',true);p.manager.activeStrategyStatus.set(null);
  const store=memoryStore();store.write({request_id:'exact-request',run_id:'exact-run',phase:'unknown'});
  const result=await resetNormal({_deps:{store,evaluateAsync:p.evaluate}});assert.equal(result.success,false);assert.equal(result.code,'DEEP_RUN_UNSETTLED');assert.equal(store.read().phase,'unknown');assert.equal(p.window.__tvCliDeepRun.run_id,'exact-run');
});
it('an exact native rejection is observable even when setting initial null emits no report-change event',async()=>{
  const p=deepPage();await start(p);await p.error();const status=await call(p,'inspectDeepRun','exact-run');assert.equal(status.phase,'server_error');assert.equal(status.code,'DEEP_SERVER_ERROR');assert.equal(status.success,false);assert.equal(p.window.__tvCliDeepRun.report_cycle,0);
  const settlement=await call(p,'inspectDeepSettlement','exact-run');assert.equal(settlement.known,true);assert.equal(settlement.settled,true);assert.equal(settlement.phase,'server_error');
});
it('unknown persistent dispatch is observed, never resent, and wait timeout is not cancellation',async()=>{
  const p=deepPage(),store=memoryStore();let fail=true;const inspect=async(expression,opts)=>{const value=await p.evaluate(expression);if(opts?.mutation&&fail){fail=false;throw Error('response lost');}return value;};
  const options={from:'2024-01-01T00:00:00Z',to:'2024-01-02T00:00:00Z',request_id:'stable',_deps:{properties:()=>getProperties({_deps:{evaluate:p.evaluate}}),evaluateAsync:inspect,store}};
  await assert.rejects(()=>runDeep(options),/response lost/);assert.equal(store.read().phase,'unknown');assert.equal(p.dispatches(),1);
  const repeated=await runDeep(options);assert.equal(repeated.reused,true);assert.equal(p.dispatches(),1);
  let clock=0;const timeout=await waitDeep({run_id:repeated.run_id,timeout:200,_deps:{evaluateAsync:p.evaluate,now:()=>clock,sleep:async ms=>{clock+=ms;}}});assert.equal(timeout.code,'DEEP_WAIT_TIMEOUT');assert.equal(timeout.cancelled,false);assert.equal(p.dispatches(),1);
});

import {it} from 'node:test';
import assert from 'node:assert/strict';
import {createStrategyServerAlert,getStrategyServerAlert,operateStrategyServerAlert} from '../src/core/strategy-alerts.js';
import {strategyAlertPage} from './fixtures/strategy-alert-page.mjs';

const memoryStore=()=>{let row=null;return {read:()=>row,write:value=>{row=structuredClone(value);},list:()=>row?[{record:row}]:[]};};
const options=(p,store,extra={})=>({request_id:'owned-alert',mode:'both',name:'QA',message:'{"event":"{{strategy.order.alert_message}}"}',expiration:'2099-01-01T00:00:00Z',active:true,...extra,_deps:{store,evaluateAsync:p.evaluate}});
it('native strategy alerts preserve three modes, placeholders and paused creation with exact fresh readback',async()=>{
  for(const mode of ['fills','alerts','both'])for(const active of [false,true]){
    const p=strategyAlertPage(),store=memoryStore(),input=options(p,store,{mode,active});const result=await createStrategyServerAlert(input);
    assert.equal(result.success,true);assert.equal(result.active,active);assert.equal(result.mode,mode);assert.equal(result.message,undefined);assert.equal(result.message_hash.length,64);assert.equal(result.creation_provenance.server_source_hash_verified,false);assert.equal(result.creation_provenance.inputs_hash.length,64);
    assert.equal(p.counts().posts,1);assert.equal(p.counts().securityChecks,1);const raw=p.server.get(result.alert_id);assert.equal(raw.message,input.message);assert.equal(raw.web_hook,null);assert.equal(raw.email,false);assert.equal(raw.mobile_push,false);assert.equal(raw.conditions[0].strategy_mode,{fills:'strategy',alerts:'alerts',both:'strategy_and_alerts'}[mode]);
    const repeated=await createStrategyServerAlert(input);assert.equal(repeated.success,true);assert.equal(repeated.reused,true);assert.equal(repeated.alert_id,result.alert_id);assert.equal(p.counts().posts,1);assert.equal(p.server.get(7).message,'private user message');
  }
});
it('source/account/generation changes during native security preflight cannot dispatch the strategy snapshot',async()=>{
  for(const change of [p=>p.externalFee(0.5),p=>{p.user.id=456;},p=>{p.window.__tvCliWorkspace.nonce='foreign-generation';},p=>{p.source._getStudyIdWithLatestVersion=()=> 'ForeignScript';}]){
    const p=strategyAlertPage(),store=memoryStore();p.beforeSend(()=>change(p));const result=await createStrategyServerAlert(options(p,store));assert.equal(result.success,false);assert.equal(result.mutation_dispatched,false);assert.equal(p.counts().posts,0);assert.equal(store.read().phase,'rejected_known');assert.equal(Object.keys(p.window.__tvCliNativeOperations||{}).length,0);
  }
});
it('unsupported method/path/body/headers cannot reach native fetch or the SDK retry fallback',async()=>{
  const variants=[
    {path:'unknown_mutation',method:'GET'},
    {path:'list_alerts',method:'GET'},
    {path:'get_alerts',method:'DELETE'},
    {path:'create_alert',method:'GET'},
    {path:'create_alert',method:'POST',headers:{'X-Unknown':'value'}},
    {path:'create_alert',method:'POST',credentials:'same-origin'},
    {path:'create_alert',method:'POST',badBody:true},
  ];
  for(const variant of variants){const p=strategyAlertPage(),store=memoryStore();p.rest.createAlert=payload=>p.rest._fetch('https://pricealerts.tradingview.com/'+variant.path,{method:variant.method,credentials:variant.credentials||'include',body:variant.badBody?'malformed':JSON.stringify({payload}),...(variant.headers?{headers:variant.headers}:{})});
    const result=await createStrategyServerAlert(options(p,store));assert.equal(result.code,'STRATEGY_ALERT_NOT_DISPATCHED');assert.equal(result.mutation_dispatched,false);assert.equal(p.counts().posts,0);assert.equal(p.counts().reads,0);assert.equal(store.read().phase,'rejected_known');
  }
});
it('lost create response sends once despite native retry defaults and exact request reconciliation never creates again',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store);p.loseResponse();const unknown=await createStrategyServerAlert(input);assert.equal(unknown.code,'STRATEGY_ALERT_OUTCOME_UNKNOWN');assert.equal(store.read().phase,'unknown');assert.equal(p.counts().posts,1);assert.equal(unknown.error,undefined);
  const read=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(read.success,true);assert.equal(store.read().phase,'unknown');assert.equal(p.counts().posts,1);
  const reconciled=await createStrategyServerAlert(input);assert.equal(reconciled.success,true);assert.equal(reconciled.reused,true);assert.equal(store.read().phase,'created');assert.equal(p.counts().posts,1);
});
it('request conflicts, ambiguous readback and foreign server edits never adopt or modify existing alerts',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input);assert.equal(created.success,true);
  assert.equal((await createStrategyServerAlert({...input,message:'different'})).code,'STRATEGY_ALERT_REQUEST_CONFLICT');assert.equal(p.counts().posts,1);
  const raw=p.server.get(created.alert_id);raw.email=true;const read=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(read.success,false);assert.equal(read.code,'STRATEGY_ALERT_READBACK_UNVERIFIED');assert.equal(read.message,undefined);assert.equal(p.counts().posts,1);
});
it('creation keeps the original pinned snapshot when the chart changes after confirmed transport',async()=>{
  const p=strategyAlertPage(),store=memoryStore();p.afterSend(()=>p.externalFee(0.5));const result=await createStrategyServerAlert(options(p,store));assert.equal(result.success,true);assert.equal(result.snapshot_stale,true);assert.equal(result.snapshot_automatically_updated,false);assert.equal(p.counts().posts,1);
});
it('exact native server rejection is known and sanitized while a response without observed transport remains unknown',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store);p.rejectCreate('fixture_limit');const result=await createStrategyServerAlert(input);assert.equal(result.code,'STRATEGY_ALERT_SERVER_REJECTED');assert.equal(result.native_error_code,'fixture_limit');assert.equal(result.known_no_create,true);assert.equal(store.read().phase,'rejected_known');assert.equal(p.counts().posts,1);assert.equal(JSON.stringify(result).includes('private server rejection'),false);
  await createStrategyServerAlert(input);assert.equal(p.counts().posts,1);
  const missing=strategyAlertPage(),unknownStore=memoryStore();missing.collection.createAlert=async()=>({alertId:42});const unknown=await createStrategyServerAlert(options(missing,unknownStore));assert.equal(unknown.code,'STRATEGY_ALERT_OUTCOME_UNKNOWN');assert.equal(unknownStore.read().phase,'unknown');assert.equal(missing.counts().posts,0);
});
it('ambiguous correlation after a lost response cannot adopt either copied server alert',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store);p.loseResponse();await createStrategyServerAlert(input);const raw=p.server.get(101);p.server.set(102,{...structuredClone(raw),alert_id:102});
  const result=await createStrategyServerAlert(input);assert.equal(result.code,'STRATEGY_ALERT_AMBIGUOUS');assert.equal(result.success,false);assert.equal(store.read().phase,'unknown');assert.equal(p.counts().posts,1);
});
it('an unlinked SDK or unexpected mutation endpoint cannot evade the scoped native transport',async()=>{
  const unlinked=strategyAlertPage(),unlinkedStore=memoryStore();unlinked.collection._restRequestsHandler._restApi={};const unavailable=await createStrategyServerAlert(options(unlinked,unlinkedStore));assert.equal(unavailable.code,'STRATEGY_ALERT_NATIVE_UNSUPPORTED');assert.equal(unlinked.counts().posts,0);assert.equal(unlinked.counts().securityChecks,0);
  const changed=strategyAlertPage(),store=memoryStore();changed.rest.createAlert=payload=>changed.rest.request('alternate_create',payload);const blocked=await createStrategyServerAlert(options(changed,store));assert.equal(blocked.code,'STRATEGY_ALERT_NOT_DISPATCHED');assert.equal(changed.counts().posts,0);assert.equal(store.read().phase,'rejected_known');
});
it('foreign SDK engine/symbol/session/currency or source interval cannot borrow an owned source proof',async()=>{
  const changes=[
    p=>{const state=p.exports.getEditorStateForAlertFromStudy;p.exports.getEditorStateForAlertFromStudy=()=>({...state(),studyId:'ForeignScript'});},
    ...['symbol','session','currency-id'].map(key=>p=>{const state=p.exports.getEditorStateForAlertFromStudy;p.exports.getEditorStateForAlertFromStudy=()=>{const s=state();return {...s,symbol:{...s.symbol,[key]:'FOREIGN'}};};}),
    p=>{p.mainSeries.interval=()=> '240';},
    p=>{p.source._getStudyIdWithLatestVersion=()=> 'ForeignScript';},
    p=>{const raw=p.source.stateForAlert;p.source.stateForAlert=()=>({...raw(),fullId:'ForeignScript$owned-document'});const state=p.exports.getEditorStateForAlertFromStudy;p.exports.getEditorStateForAlertFromStudy=()=>({...state(),studyId:'ForeignScript'});},
  ];
  for(const change of changes){const p=strategyAlertPage(),store=memoryStore();change(p);const result=await createStrategyServerAlert(options(p,store));assert.equal(result.code,'STRATEGY_ALERT_TARGET_UNVERIFIED');assert.equal(result.mutation_dispatched,false);assert.equal(p.counts().posts,0);assert.equal(p.counts().securityChecks,0);assert.equal(store.read(),null);}
});
it('repeated cached factory definitions retain one exact SDK getter and one native fetch dependency',async()=>{
  const p=strategyAlertPage(),chunks=p.window.webpackChunktradingview,factory=chunks[0][1].alerts;
  const repeated=Function('return '+String(factory).replace('{','{"use strict";'))();chunks.push([['repeated'],{alerts:repeated}]);
  const result=await createStrategyServerAlert(options(p,memoryStore()));assert.equal(result.success,true);assert.equal(p.counts().posts,1);
});
it('owned strategy alert lifecycle verifies pause/resume/delete while preserving the user alert',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input);assert.equal(created.success,true);
  for(const action of ['pause','resume','delete']){const operationStore=memoryStore(),opts={request_id:input.request_id,operation_id:'owned-'+action,action,_deps:{...input._deps,operationStore}};
    const result=await operateStrategyServerAlert(opts);assert.equal(result.success,true);assert.equal(result.desired_state_verified,true);const repeated=await operateStrategyServerAlert(opts);assert.equal(repeated.success,true);assert.equal(repeated.reused,true);assert.equal(operationStore.read().phase,'verified');
  }
  assert.equal(p.counts().actions,3);assert.equal(p.server.has(created.alert_id),false);assert.equal(p.server.get(7).message,'private user message');
});
it('lost owned lifecycle replies reconcile desired state without retrying a mutation',async()=>{
  for(const action of ['pause','delete']){const p=strategyAlertPage(),store=memoryStore(),input=options(p,store);await createStrategyServerAlert(input);p.loseActionResponse();const operationStore=memoryStore(),opts={request_id:input.request_id,operation_id:'lost-'+action,action,_deps:{...input._deps,operationStore}};
    const unknown=await operateStrategyServerAlert(opts);assert.equal(unknown.code,'STRATEGY_ALERT_ACTION_UNKNOWN');assert.equal(operationStore.read().phase,'unknown');assert.equal(p.counts().actions,1);
    const actual=await operateStrategyServerAlert(opts);assert.equal(actual.success,true);assert.equal(actual.reused,true);assert.equal(actual.mutation_dispatched,false);assert.equal(p.counts().actions,1);
  }
});
it('GUI-edited server settings prevent owned lifecycle mutation and an operation ID cannot change actions',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input),operationStore=memoryStore(),opts={request_id:input.request_id,operation_id:'exact-operation',action:'pause',_deps:{...input._deps,operationStore}};
  p.server.get(created.alert_id).message='GUI modified';const refused=await operateStrategyServerAlert(opts);assert.equal(refused.code,'STRATEGY_ALERT_READBACK_UNVERIFIED');assert.equal(p.counts().actions,0);
  const conflict=await operateStrategyServerAlert({...opts,action:'delete'});assert.equal(conflict.code,'STRATEGY_ALERT_OPERATION_CONFLICT');assert.equal(p.counts().actions,0);
});
it('reconciliation that observes the wrong active state stays unsuccessful and never replays the operation',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input);p.loseActionResponse();const operationStore=memoryStore(),opts={request_id:input.request_id,operation_id:'lost-pause',action:'pause',_deps:{...input._deps,operationStore}};
  await operateStrategyServerAlert(opts);p.server.get(created.alert_id).active=true;const result=await operateStrategyServerAlert(opts);assert.equal(result.success,false);assert.equal(result.desired_state_verified,false);assert.equal(result.code,'STRATEGY_ALERT_ACTION_UNCONFIRMED');assert.equal(operationStore.read().phase,'unknown');assert.equal(p.counts().actions,1);
});

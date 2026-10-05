import {it} from 'node:test';
import assert from 'node:assert/strict';
import {createStrategyServerAlert,getStrategyServerAlert,operateStrategyServerAlert,getStrategyAlertFires} from '../src/core/strategy-alerts.js';
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
  assert.equal(store.read().result._private_diagnostic.server_rejection.message,'private server rejection details');assert.equal(result._private_diagnostic,undefined);
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
it('fresh server reads distinguish verified stale Properties/inputs from an unverified current chart without changing the alert',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input),raw=JSON.stringify(p.server.get(created.alert_id));
  const first=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(first.current_snapshot.verified,true);assert.equal(first.snapshot_stale,false);
  p.externalFee(0.5);const unverified=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(unverified.current_snapshot.verified,false);assert.equal(unverified.snapshot_stale,null);
  p.bind({id:'props-workspace',token:'props-token',layout:'fixture-layout',pine:'owned-document'});p.compile('new-properties-baseline');p.refreshReport();p.completeInputs();const stale=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(stale.current_snapshot.verified,true);assert.equal(stale.snapshot_stale,true);assert.equal(stale.current_snapshot.changes.inputs,true);assert.equal(stale.current_snapshot.changes.properties,true);assert.equal(stale.snapshot_automatically_updated,false);assert.equal(JSON.stringify(p.server.get(created.alert_id)),raw);assert.equal(p.counts().posts,1);
});
it('owned internal fire pages preserve native IDs/time bounds and hash messages without any mutation or external status',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input),empty=await getStrategyAlertFires({request_id:input.request_id,_deps:input._deps});assert.equal(empty.success,true);assert.equal(empty.count,0);assert.equal(empty.end_of_observed_log,true);
  p.fires.push(...[3,2,1].map(id=>({fire_id:id,alert_id:created.alert_id,fire_time:Date.UTC(2026,9,5,0,id),message:'private fire message',webhook:{error:'private delivery details'}})));
  const first=await getStrategyAlertFires({request_id:input.request_id,limit:2,_deps:input._deps});assert.equal(first.count,2);assert.equal(first.page_full,true);assert.equal(first.next_before,2);assert.equal(first.coverage_completeness,'unknown');assert.equal(first.data[0].message_hash.length,64);assert.equal(JSON.stringify(first).includes('private fire message'),false);assert.equal(JSON.stringify(first).includes('private delivery'),false);
  const next=await getStrategyAlertFires({request_id:input.request_id,limit:2,before:first.next_before,_deps:input._deps});assert.equal(next.count,1);assert.equal(next.end_of_observed_log,true);assert.equal(next.data[0].fire_id,'1');assert.equal(p.counts().actions,0);assert.equal(p.counts().posts,1);
  p.rest.listFires=async()=>[{fire_id:4,alert_id:7,fire_time:Date.now(),message:'other user message'}];assert.equal((await getStrategyAlertFires({request_id:input.request_id,_deps:input._deps})).code,'STRATEGY_ALERT_LOG_UNVERIFIED');
});
it('failed deletion absence reads are sanitized and preserve the exact unknown/deleted records',async()=>{
  for(const lost of [false,true]){const p=strategyAlertPage(),store=memoryStore(),input=options(p,store);await createStrategyServerAlert(input);const operationStore=memoryStore(),opts={request_id:input.request_id,operation_id:'safe-delete',action:'delete',_deps:{...input._deps,operationStore}};
    if(lost)p.loseActionResponse();await operateStrategyServerAlert(opts);const previous=JSON.stringify(store.read());p.rest.getAlerts=async()=>{throw Object.assign(Error('private https://user:secret@example.test/body'),{code:'offline'});};
    const result=lost?await operateStrategyServerAlert(opts):await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(result.success,false);assert.equal(result.code,'STRATEGY_ALERT_READBACK_FAILED');assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(store.read()),previous);assert.equal(p.counts().actions,1);
  }
});
it('fire pagination refuses outside/equal cursors, ascending/duplicate IDs and impossible calendar timestamps',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input),row=id=>({fire_id:id,alert_id:created.alert_id,fire_time:'2024-02-28T00:00:00Z',message:'private'});
  for(const rows of [[row(6)],[row(5)],[row(1),row(2)],[row(2),row(2)],[{...row(3),fire_time:'2024-02-30T00:00:00Z'}]]){p.rest.listFires=async()=>rows;const result=await getStrategyAlertFires({request_id:input.request_id,before:5,_deps:input._deps});assert.equal(result.success,false);assert.equal(result.code,'STRATEGY_ALERT_LOG_UNVERIFIED');assert.equal(result.data,undefined);}
});
it('server-added symbol fields must match the independently pinned wire symbol and all input values remain exact',async()=>{
  const p=strategyAlertPage(),store=memoryStore(),input=options(p,store),created=await createStrategyServerAlert(input),raw=p.server.get(created.alert_id);raw.symbol='='+JSON.stringify({symbol:'FIXTURE:OWNED',adjustment:'splits'});
  const matched=await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps});assert.equal(matched.success,true);assert.equal(matched.server_added_symbol_fields.adjustment,'splits');assert.equal(p.counts().posts,1);
  raw.symbol='='+JSON.stringify({symbol:'FIXTURE:OWNED',adjustment:'dividends'});assert.equal((await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps})).code,'STRATEGY_ALERT_READBACK_UNVERIFIED');
  raw.symbol='='+JSON.stringify({symbol:'FIXTURE:OWNED',unexpected:'value'});assert.equal((await getStrategyServerAlert({request_id:input.request_id,_deps:input._deps})).code,'STRATEGY_ALERT_READBACK_UNVERIFIED');
});

import {it} from 'node:test';
import assert from 'node:assert/strict';
import {createStrategyServerAlert,getStrategyServerAlert} from '../src/core/strategy-alerts.js';
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
  for(const change of [p=>p.externalFee(0.5),p=>{p.user.id=456;},p=>{p.window.__tvCliWorkspace.nonce='foreign-generation';}]){
    const p=strategyAlertPage(),store=memoryStore();p.beforeSend(()=>change(p));const result=await createStrategyServerAlert(options(p,store));assert.equal(result.success,false);assert.equal(result.mutation_dispatched,false);assert.equal(p.counts().posts,0);assert.equal(store.read().phase,'rejected_known');assert.equal(Object.keys(p.window.__tvCliNativeOperations||{}).length,0);
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

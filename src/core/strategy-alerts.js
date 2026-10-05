import {createHash,randomUUID} from 'node:crypto';
import {evaluateAsync} from '../connection.js';
import {currentWorkspaceSession} from '../session.js';
import {nativeRequestStore} from '../native-request-store.js';
import {STRATEGY_ALERT_PAGE_CODE} from '../strategy-alert-page.js';

export function validateStrategyAlert(options){
  const error=message=>{throw Object.assign(Error(message),{code:'INVALID_STRATEGY_ALERT',details:{mutation_dispatched:false}});};
  if(!/^[-a-zA-Z0-9_]{1,100}$/.test(options.request_id||''))error('A stable request ID is required.');
  if(!['fills','alerts','both'].includes(options.mode))error('Mode must be fills, alerts or both.');
  if(typeof options.name!=='string'||!options.name.trim()||options.name.length>100)error('Name must be 1..100 characters.');
  if(typeof options.message!=='string'||options.message.length>4000)error('An explicit text/JSON message up to 4000 characters is required.');
  if(typeof options.expiration!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(options.expiration)||!Number.isFinite(Date.parse(options.expiration))||Date.parse(options.expiration)<=Date.now())error('Expiration must be a future explicit-offset ISO timestamp.');
  const [year,month,day]=options.expiration.slice(0,10).split('-').map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())error('Expiration calendar date is invalid.');
  if(typeof options.active!=='boolean')error('Active must be explicitly represented by the adapter.');
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pageCall=(inspect,name,request,mutation=false)=>inspect(`(async()=>{${STRATEGY_ALERT_PAGE_CODE};return ${name}(window,${name==='readStrategyAlert'?'':'document,'}${JSON.stringify(request)});})()`,mutation?{mutation:true}:undefined);
function storeFor(request_id,_deps){const workspace=currentWorkspaceSession()?.workspace,store=_deps?.store||(workspace&&nativeRequestStore(workspace,'strategy-alert',request_id));if(!store)throw Object.assign(Error('A persistent named workspace alert ledger is required.'),{code:'WORKSPACE_REQUIRED'});return store;}
function project(record,result){return {...result,request_id:record.request_id,run_id:record.run_id,creation_provenance:{scope:'local_creation_record',document_id:record.source_proof.document_id,document_version:record.source_proof.document_version,source_hash:record.source_proof.source_hash,properties_fingerprint:createHash('sha256').update(record.source_proof.properties_fingerprint).digest('hex'),inputs_hash:record.source_proof.inputs_fingerprint,server_source_hash_verified:false},snapshot_automatically_updated:false};}

export async function createStrategyServerAlert(options){
  validateStrategyAlert(options);const {request_id,_deps}=options,inspect=_deps?.evaluateAsync||evaluateAsync,store=storeFor(request_id,_deps);
  const parameters={mode:options.mode,name:options.name,message:options.message,expiration:new Date(options.expiration).toISOString(),active:options.active,strategy_id:options.strategy_id??null},fingerprint=digest(parameters),previous=store.read();
  if(previous){
    if(previous.fingerprint!==fingerprint)return {success:false,code:'STRATEGY_ALERT_REQUEST_CONFLICT',mutation_dispatched:false};
    if(previous.phase==='rejected_known')return project(previous,{...previous.result,reused:true,mutation_dispatched:false});
    const actual=await pageCall(inspect,'readStrategyAlert',previous);if(actual.success)store.write({...previous,phase:'created',alert_id:actual.alert_id,result:actual});
    return project(previous,{...actual,reused:true,mutation_dispatched:false});
  }
  if(store.list().some(entry=>['dispatching','unknown'].includes(entry.record.phase)))return {success:false,code:'STRATEGY_ALERT_PENDING',error:'An earlier creation outcome is unknown; reconcile its exact request ID before a new creation.',mutation_dispatched:false};
  const run_id=randomUUID(),request={...parameters,request_id,run_id,server_name:parameters.name+' [tv:'+run_id+']'};
  const prepared=await pageCall(inspect,'prepareStrategyAlert',request);if(!prepared.success)return prepared;
  const intent={schema:1,...request,strategy_id:prepared.strategy_id,fingerprint,phase:'dispatching',source_proof:prepared.source_proof,account_hash:prepared.account_hash,wire:prepared.wire,started_at:new Date().toISOString()};
  store.write(intent);
  try{const result=await pageCall(inspect,'createStrategyAlert',intent,true);store.write({...intent,phase:result.success?'created':result.known_no_create||result.mutation_dispatched===false?'rejected_known':'unknown',...(result.alert_id?{alert_id:result.alert_id}:{}),result});return project(intent,result);}
  catch(error){store.write({...intent,phase:'unknown',error_code:error.code||'STRATEGY_ALERT_OUTCOME_UNKNOWN'});throw error;}
}

export async function getStrategyServerAlert({request_id,_deps}={}){
  if(!request_id)throw Object.assign(Error('Pass the exact owned creation request ID.'),{code:'INVALID_STRATEGY_ALERT'});
  const record=storeFor(request_id,_deps).read();if(!record)return {success:false,code:'STRATEGY_ALERT_NOT_OWNED',mutation_dispatched:false};
  if(record.phase==='rejected_known')return project(record,{...record.result,mutation_dispatched:false});
  return project(record,await pageCall(_deps?.evaluateAsync||evaluateAsync,'readStrategyAlert',record));
}

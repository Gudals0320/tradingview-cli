import {createHash,randomUUID} from 'node:crypto';
import {evaluateAsync} from '../connection.js';
import {currentWorkspaceSession} from '../session.js';
import {nativeRequestStore} from '../native-request-store.js';
import {STRATEGY_ALERT_PAGE_CODE} from '../strategy-alert-page.js';
export {digest,pageCall,storeFor,project};
export const strategyAlertSnapshotFingerprint=proof=>digest(Object.fromEntries(['document_id','document_version','source_hash','inputs_fingerprint','properties_fingerprint','semantic_context'].map(key=>[key,proof[key]])));

export function validateStrategyAlert(options,{require_future=false}={}){
  const error=message=>{throw Object.assign(Error(message),{code:'INVALID_STRATEGY_ALERT',details:{mutation_dispatched:false}});};
  if(!/^[-a-zA-Z0-9_]{1,100}$/.test(options.request_id||''))error('A stable request ID is required.');
  if(!['fills','alerts','both'].includes(options.mode))error('Mode must be fills, alerts or both.');
  if(typeof options.name!=='string'||!options.name.trim()||options.name.length>100)error('Name must be 1..100 characters.');
  if(typeof options.message!=='string'||options.message.length>4000)error('An explicit text/JSON message up to 4000 characters is required.');
  if(typeof options.expiration!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(options.expiration)||!Number.isFinite(Date.parse(options.expiration)))error('Expiration must be an explicit-offset ISO timestamp.');
  if(require_future&&Date.parse(options.expiration)<=Date.now())error('A new creation requires a future expiration. Existing exact requests can still reconcile without dispatch.');
  const [year,month,day]=options.expiration.slice(0,10).split('-').map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())error('Expiration calendar date is invalid.');
  if(typeof options.active!=='boolean')error('Active must be explicitly represented by the adapter.');
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pageCall=(inspect,name,request,mutation=false)=>inspect(`(async()=>{${STRATEGY_ALERT_PAGE_CODE};return ${name}(window,${['readStrategyAlert','observeStrategyAlertAction','mutateStrategyAlert','readStrategyAlertFires','prepareStrategyAlertUpdate','updateStrategyAlert'].includes(name)?'':'document,'}${JSON.stringify(request)});})()`,mutation?{mutation:true}:undefined);
function storeFor(request_id,_deps){const workspace=currentWorkspaceSession()?.workspace,store=_deps?.store||(workspace&&nativeRequestStore(workspace,'strategy-alert',request_id));if(!store)throw Object.assign(Error('A persistent named workspace alert ledger is required.'),{code:'WORKSPACE_REQUIRED'});return store;}
function project(record,result){const {_private_diagnostic,...output}=result;return {...output,request_id:record.request_id,run_id:record.run_id,creation_provenance:{scope:'local_creation_record',document_id:record.source_proof.document_id,document_version:record.source_proof.document_version,source_hash:record.source_proof.source_hash,properties_fingerprint:createHash('sha256').update(record.source_proof.properties_fingerprint).digest('hex'),inputs_hash:record.source_proof.inputs_fingerprint,server_source_hash_verified:false},snapshot_automatically_updated:false};}

export async function createStrategyServerAlert(options){
  validateStrategyAlert(options);const {request_id,_deps}=options,inspect=_deps?.evaluateAsync||evaluateAsync,store=storeFor(request_id,_deps);
  const parameters={mode:options.mode,name:options.name,message:options.message,expiration:new Date(options.expiration).toISOString(),active:options.active,strategy_id:options.strategy_id??null},fingerprint=digest(parameters),previous=store.read();
  if(previous){
    if(options.expected_snapshot_fingerprint&&strategyAlertSnapshotFingerprint(previous.source_proof)!==options.expected_snapshot_fingerprint)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
    if(previous.fingerprint!==fingerprint)return {success:false,code:'STRATEGY_ALERT_REQUEST_CONFLICT',mutation_dispatched:false};
    if(previous.phase==='deleted')return {success:false,code:'STRATEGY_ALERT_DELETED',request_id,alert_id:previous.alert_id,mutation_dispatched:false,replay_safe:false};
    if(previous.phase==='rejected_known')return project(previous,{...previous.result,reused:true,mutation_dispatched:false});
    const actual=await pageCall(inspect,'readStrategyAlert',previous);if(actual.success)store.write({...previous,phase:'created',alert_id:actual.alert_id,result:actual});
    return project(previous,{...actual,reused:true,mutation_dispatched:false});
  }
  validateStrategyAlert(options,{require_future:true});
  if(store.list().some(entry=>['dispatching','unknown'].includes(entry.record.phase)))return {success:false,code:'STRATEGY_ALERT_PENDING',error:'An earlier creation outcome is unknown; reconcile its exact request ID before a new creation.',mutation_dispatched:false};
  const run_id=randomUUID(),request={...parameters,request_id,run_id,server_name:parameters.name+' [tv:'+run_id+']'};
  const prepared=await pageCall(inspect,'prepareStrategyAlert',request);if(!prepared.success)return prepared;
  if(options.expected_snapshot_fingerprint&&strategyAlertSnapshotFingerprint(prepared.source_proof)!==options.expected_snapshot_fingerprint)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
  const intent={schema:1,...request,strategy_id:prepared.strategy_id,fingerprint,phase:'dispatching',source_proof:prepared.source_proof,account_hash:prepared.account_hash,wire:prepared.wire,started_at:new Date().toISOString()};
  store.write(intent);
  try{const result=await pageCall(inspect,'createStrategyAlert',intent,true);store.write({...intent,phase:result.success?'created':result.known_no_create||result.mutation_dispatched===false?'rejected_known':'unknown',...(result.alert_id?{alert_id:result.alert_id}:{}),result});return project(intent,result);}
  catch(error){store.write({...intent,phase:'unknown',error_code:error.code||'STRATEGY_ALERT_OUTCOME_UNKNOWN'});throw error;}
}

export async function getStrategyServerAlert({request_id,_deps}={}){
  if(!request_id)throw Object.assign(Error('Pass the exact owned creation request ID.'),{code:'INVALID_STRATEGY_ALERT'});
  const record=storeFor(request_id,_deps).read();if(!record)return {success:false,code:'STRATEGY_ALERT_NOT_OWNED',mutation_dispatched:false};
  if(record.phase==='deleted')return project(record,await pageCall(_deps?.evaluateAsync||evaluateAsync,'observeStrategyAlertAction',{...record,action:'delete'}));
  if(record.phase==='rejected_known')return project(record,{...record.result,mutation_dispatched:false});
  const inspect=_deps?.evaluateAsync||evaluateAsync,result=await pageCall(inspect,'readStrategyAlert',record);
  return project(record,{...result,...(result.success?await pageCall(inspect,'compareStrategyAlertSnapshot',record):{})});
}

export function validateStrategyAlertAction({request_id,operation_id,action,after_operation_id}){
  const valid=id=>/^[-a-zA-Z0-9_]{1,100}$/.test(id||'');
  if(!valid(request_id)||!valid(operation_id)||!['pause','resume','delete'].includes(action)||after_operation_id!==undefined&&(action!=='pause'||!valid(after_operation_id)||after_operation_id===operation_id))throw Object.assign(Error('Pass exact creation and stable operation IDs; recovery requires a distinct new pause ID.'),{code:'INVALID_STRATEGY_ALERT_ACTION'});
}
export async function operateStrategyServerAlert({request_id,operation_id,action,after_operation_id,_deps}={}){
  validateStrategyAlertAction({request_id,operation_id,action,after_operation_id});
  const creation=storeFor(request_id,_deps),record=creation.read();if(!record||!['created','deleted'].includes(record.phase)||!record.alert_id)return {success:false,code:'STRATEGY_ALERT_NOT_OWNED',mutation_dispatched:false};
  if(record.phase==='deleted'&&action!=='delete')return {success:false,code:'STRATEGY_ALERT_DELETED',alert_id:record.alert_id,mutation_dispatched:false};
  const workspace=currentWorkspaceSession()?.workspace,store=_deps?.operationStore||(workspace&&nativeRequestStore(workspace,'strategy-alert-operation',operation_id));if(!store)throw Object.assign(Error('Persistent operation ledger required.'),{code:'WORKSPACE_REQUIRED'});
  const inspect=_deps?.evaluateAsync||evaluateAsync,fingerprint=digest({request_id,alert_id:record.alert_id,action}),previous=store.read();
  if(previous&&(previous.fingerprint!==fingerprint||(previous.explicit_new_pause_after??null)!==(after_operation_id??null)))return {success:false,code:'STRATEGY_ALERT_OPERATION_CONFLICT',mutation_dispatched:false};
  const request={...record,action,operation_id};
  if(previous){const result=await pageCall(inspect,'observeStrategyAlertAction',request),verified=result.success&&result.desired_state_verified===true;if(verified){store.write({...previous,phase:'verified',reconciliation:result});if(action==='delete'&&record.phase!=='deleted')creation.write({...record,phase:'deleted',deletion:{operation_id,verified_at:new Date().toISOString(),original_creation_preserved:true}});}return project(record,{...result,success:verified,code:verified?undefined:result.code||'STRATEGY_ALERT_ACTION_UNCONFIRMED',operation_id,reused:true,mutation_dispatched:false});}
  const unresolved=store.list().filter(entry=>['dispatching','unknown'].includes(entry.record.phase)&&entry.record.alert_id===record.alert_id);
  if(unresolved.length){
    if(action!=='pause'||!after_operation_id||unresolved.length!==1||unresolved[0].record.operation_id!==after_operation_id||unresolved[0].record.action!=='pause')return {success:false,code:'STRATEGY_ALERT_ACTION_UNKNOWN',mutation_dispatched:false,replay_safe:false};
    const fresh=await pageCall(inspect,'readStrategyAlert',record);if(!fresh.success)return {...fresh,mutation_dispatched:false};
    if(fresh.active!==true)return project(record,{...fresh,desired_state_verified:true,performed:false,mutation_dispatched:false});
  }
  const intent={schema:1,operation_id,fingerprint,request_id,alert_id:record.alert_id,action,phase:'dispatching',started_at:new Date().toISOString(),...(after_operation_id?{explicit_new_pause_after:after_operation_id,original_outcome_preserved:true}:{})};store.write(intent);
  try{const result=await pageCall(inspect,record.phase==='deleted'?'observeStrategyAlertAction':'mutateStrategyAlert',request,record.phase!=='deleted');store.write({...intent,phase:result.success?'verified':result.known_no_mutation||result.mutation_dispatched===false?'rejected_known':'unknown',result});if(result.success&&action==='delete')creation.write({...record,phase:'deleted',deletion:{operation_id,verified_at:new Date().toISOString(),original_creation_preserved:true}});return project(record,{...result,operation_id});}
  catch(error){store.write({...intent,phase:'unknown',error_code:error.code||'STRATEGY_ALERT_ACTION_UNKNOWN'});throw error;}
}

export async function getStrategyAlertFires({request_id,limit=50,before,_deps}={}){
  if(!Number.isInteger(limit)||limit<1||limit>50||before!==undefined&&(!Number.isSafeInteger(before)||before<0))throw Object.assign(Error('Use limit 1..50 and a safe native fire-ID cursor.'),{code:'INVALID_STRATEGY_ALERT_LOG'});
  const record=storeFor(request_id,_deps).read();if(!record||!['created','deleted'].includes(record.phase)||!record.alert_id)return {success:false,code:'STRATEGY_ALERT_NOT_OWNED'};
  return pageCall(_deps?.evaluateAsync||evaluateAsync,'readStrategyAlertFires',{...record,limit,before});
}

export async function createStrategyAlertThenPause(options){
  const {request_id,_deps}=options;validateStrategyAlert({...options,active:true});
  if(!storeFor(request_id,_deps).read())validateStrategyAlert({...options,active:true},{require_future:true});
  const workspace=currentWorkspaceSession()?.workspace,store=_deps?.pauseCreationStore||(workspace&&nativeRequestStore(workspace,'strategy-alert-paused-create',request_id));if(!store)throw Object.assign(Error('Persistent two-step policy record required.'),{code:'WORKSPACE_REQUIRED'});
  const parameters={request_id,mode:options.mode,name:options.name,message:options.message,expiration:new Date(options.expiration).toISOString()},fingerprint=digest(parameters),previous=store.read();
  if(previous&&previous.fingerprint!==fingerprint)return {success:false,code:'STRATEGY_ALERT_REQUEST_CONFLICT',mutation_dispatched:false};
  let record=previous||{schema:1,request_id,fingerprint,policy:'create_active_then_pause',pause_operation_id:'initial-pause-'+digest(request_id).slice(0,40)};
  if(!previous)store.write(record);
  const create=await createStrategyServerAlert({...options,active:true});
  record={...record,create_result:create,...(!record.create_confirmed_at&&create.success?{create_confirmed_at:new Date().toISOString()}:{}),alert_id:create.alert_id??record.alert_id};store.write(record);
  if(!create.success)return {...create,policy:'create_active_then_pause',steps:{create},atomic:false,transient_active_possible:true};
  const pause=await operateStrategyServerAlert({request_id,operation_id:record.pause_operation_id,action:'pause',_deps});
  record={...record,pause_result:pause,...(pause.success&&!record.pause_confirmed_at?{pause_confirmed_at:new Date().toISOString()}:{}),phase:pause.success?'paused_verified':'pause_unconfirmed'};store.write(record);
  const windowMs=record.pause_confirmed_at?Date.parse(record.pause_confirmed_at)-Date.parse(record.create_confirmed_at):null;
  const fresh=pause.success?null:await getStrategyServerAlert({request_id,_deps}),active=pause.success?false:fresh?.success?fresh.active:null;
  if(!pause.success&&!record.recovery_operation_id){record={...record,recovery_attempt:1,recovery_operation_id:record.pause_operation_id+'-recovery-1'};store.write(record);}
  return {success:pause.success,code:pause.success?undefined:'STRATEGY_ALERT_CREATED_PAUSE_UNCONFIRMED',request_id,alert_id:create.alert_id,policy:'create_active_then_pause',atomic:false,reused_creation:create.reused===true,steps:{create,pause},active,active_state:pause.success?'inactive_verified':'ACTIVE_UNTIL_INACTIVE_VERIFIED',transient_active_possible:true,could_fire_during_active_window:true,active_window:{create_confirmed_at:record.create_confirmed_at,pause_confirmed_at:record.pause_confirmed_at??null,milliseconds:windowMs,scope:'client confirmation times; creation may predate first confirmation'},automatic_delete:false,replayed:false,...(!pause.success?{next_commands:['tv --workspace WORKSPACE alert strategy-get --request-id '+request_id,'tv --workspace WORKSPACE alert strategy-pause --request-id '+request_id+' --operation-id '+record.recovery_operation_id+' --after-operation-id '+record.pause_operation_id],next_pause_condition:'Only if fresh get still shows active; this explicit NEW operation sends a new pause and never replays the original.',deletion_requires_explicit_confirmation:true}:{})};
}

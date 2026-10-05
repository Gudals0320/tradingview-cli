import {evaluateAsync} from '../connection.js';
import {currentWorkspaceSession} from '../session.js';
import {nativeRequestStore} from '../native-request-store.js';
import {createStrategyServerAlert,getStrategyServerAlert,operateStrategyServerAlert,validateStrategyAlert,validateStrategyAlertAction,digest,pageCall,storeFor,project,strategyAlertSnapshotFingerprint} from './strategy-alerts.js';

const workflowStore=(kind,id,deps,key)=>deps?.[key]||nativeRequestStore(currentWorkspaceSession().workspace,kind,id);
export function validateStrategyAlertUpdate(options){
  validateStrategyAlertAction({...options,action:'pause'});
  const changes=Object.fromEntries(['name','message','expiration'].filter(key=>options[key]!==undefined).map(key=>[key,options[key]]));
  if(!Object.keys(changes).length)throw Object.assign(Error('Choose name, message or expiration; native modification explicitly restarts this alert.'),{code:'INVALID_STRATEGY_ALERT_UPDATE'});
  validateStrategyAlert({request_id:options.request_id,mode:'fills',name:changes.name??'unchanged',message:changes.message??'',expiration:changes.expiration??'2099-01-01T00:00:00Z',active:true});
  return changes;
}
export async function updateStrategyServerAlert(options){
  const changes=validateStrategyAlertUpdate(options),{request_id,operation_id,_deps}=options,creation=storeFor(request_id,_deps),record=creation.read();
  if(!record||record.phase!=='created')return {success:false,code:'STRATEGY_ALERT_NOT_OWNED',mutation_dispatched:false};
  const store=workflowStore('strategy-alert-operation',operation_id,_deps,'operationStore'),previous=store.read(),fingerprint=digest({request_id,alert_id:record.alert_id,action:'update',changes}),inspect=_deps?.evaluateAsync||evaluateAsync;
  if(previous&&previous.fingerprint!==fingerprint)return {success:false,code:'STRATEGY_ALERT_OPERATION_CONFLICT',mutation_dispatched:false};
  const adopt=(intent,result)=>{store.write({...intent,phase:'verified',result});creation.write({...record,wire:intent.update_wire,active:true,settings_expiration:changes.expiration??record.settings_expiration??record.expiration,creation_wire:record.creation_wire??record.wire,settings_updates:[...(record.settings_updates||[]).filter(row=>row.operation_id!==operation_id),{operation_id,at:new Date().toISOString(),changes_hash:digest(changes)}]});};
  if(previous){if(previous.phase==='rejected_known')return project(record,{...previous.result,reused:true,mutation_dispatched:false});const result=await pageCall(inspect,'readStrategyAlert',{...record,wire:previous.update_wire,active:true}),verified=result.success&&result.active===true;if(verified)adopt(previous,result);return project(record,{...result,success:verified,reused:true,mutation_dispatched:false,replay_safe:false});}
  if(store.list().some(entry=>['dispatching','unknown'].includes(entry.record.phase)&&entry.record.alert_id===record.alert_id))return {success:false,code:'STRATEGY_ALERT_ACTION_UNKNOWN',mutation_dispatched:false};
  const expiration=changes.expiration??record.settings_expiration??record.expiration;if(Date.parse(expiration)<=Date.now())return {success:false,code:'STRATEGY_ALERT_EXPIRED',mutation_dispatched:false};
  const prepared=await pageCall(inspect,'prepareStrategyAlertUpdate',{...record,changes});if(!prepared.success)return prepared;
  const intent={schema:1,operation_id,request_id,alert_id:record.alert_id,action:'update',changes,fingerprint,phase:'dispatching',update_wire:prepared.wire,started_at:new Date().toISOString()};store.write(intent);
  try{const result=await pageCall(inspect,'updateStrategyAlert',{...record,changes,update_wire:prepared.wire},true);if(result.success)adopt(intent,result);else store.write({...intent,phase:result.known_no_mutation||result.mutation_dispatched===false?'rejected_known':'unknown',result});return project(record,result);}
  catch(error){store.write({...intent,phase:'unknown',error_code:error.code||'STRATEGY_ALERT_UPDATE_UNKNOWN'});throw error;}
}

export function validateStrategyAlertReplacement(options){
  validateStrategyAlertAction({...options,action:'pause'});
  validateStrategyAlert({...options,request_id:options.replacement_request_id,active:true});
  if(options.request_id===options.replacement_request_id||!['gap','overlap'].includes(options.policy))throw Object.assign(Error('Choose a distinct replacement request ID and explicit gap or overlap policy.'),{code:'INVALID_STRATEGY_ALERT_REPLACEMENT'});
}
export async function planStrategyAlertReplacement(options){
  validateStrategyAlertReplacement(options);const {_deps}=options,old=await getStrategyServerAlert({request_id:options.request_id,_deps});if(!old.success)return old;
  validateStrategyAlert({...options,request_id:options.replacement_request_id,active:true},{require_future:true});
  const prepared=await pageCall(_deps?.evaluateAsync||evaluateAsync,'prepareStrategyAlert',{...options,request_id:options.replacement_request_id,active:true,run_id:'plan-'+digest(options.operation_id).slice(0,32),server_name:options.name+' [plan]'});if(!prepared.success)return prepared;
  const plan={old_request_id:options.request_id,old_alert_id:old.alert_id,new_request_id:options.replacement_request_id,new_snapshot_fingerprint:strategyAlertSnapshotFingerprint(prepared.source_proof),new_source_hash:prepared.source_proof.source_hash,new_document_version:prepared.source_proof.document_version,policy:options.policy,atomic:false,signal_gap_possible:options.policy==='gap',duplicate_signals_possible:options.policy==='overlap',old_alert_deleted:false,steps:options.policy==='gap'?['pause_old','create_new','verify_new']:['create_new','verify_new','pause_old'],automatic_rollback:false};
  return {success:true,plan};
}
export async function replaceStrategyServerAlert(options){
  validateStrategyAlertReplacement(options);const {request_id,operation_id,replacement_request_id,_deps}=options,store=workflowStore('strategy-alert-replacement',operation_id,_deps,'replacementStore'),fingerprint=digest({...options,_deps:undefined}),previous=store.read();
  if(previous&&previous.fingerprint!==fingerprint)return {success:false,code:'STRATEGY_ALERT_OPERATION_CONFLICT',mutation_dispatched:false};
  const planned=previous?{success:true,plan:previous.plan}:await planStrategyAlertReplacement(options);if(!planned.success)return planned;
  let record=previous||{schema:1,operation_id,fingerprint,plan:planned.plan,steps:{},phase:'running'};if(!previous)store.write(record);
  const child=(stage,fn)=>async()=>{const result=await fn();record={...record,steps:{...record.steps,[stage]:result},...(result.success?{[stage+'_confirmed_at']:record[stage+'_confirmed_at']||new Date().toISOString()}:{}),phase:result.success?'running':'incomplete'};store.write(record);return result.success;};
  const newDeps=_deps?{..._deps,store:_deps.replacementCreationStore||_deps.store}:undefined;
  const create=child('create_new',async()=>{const result=await createStrategyServerAlert({...options,request_id:replacement_request_id,active:true,expected_snapshot_fingerprint:record.plan.new_snapshot_fingerprint,_deps:newDeps});return result.success&&result.active!==true?{...result,success:false,code:'STRATEGY_ALERT_REPLACEMENT_NEW_INACTIVE'}:result;}),pause=child('pause_old',()=>operateStrategyServerAlert({request_id,operation_id:'replace-pause-'+digest(operation_id).slice(0,40),action:'pause',_deps}));
  const first=options.policy==='gap'?pause:create,second=options.policy==='gap'?create:pause;
  if(await first()&&await second()){record={...record,phase:'complete'};store.write(record);}
  const from=options.policy==='gap'?record.pause_old_confirmed_at:record.create_new_confirmed_at,to=options.policy==='gap'?record.create_new_confirmed_at:record.pause_old_confirmed_at;
  return {success:record.phase==='complete',code:record.phase==='complete'?undefined:'STRATEGY_ALERT_REPLACEMENT_INCOMPLETE',operation_id,plan:record.plan,old_alert_id:record.plan.old_alert_id,new_alert_id:record.steps.create_new?.alert_id??null,steps:record.steps,atomic:false,window:{from:from??null,to:to??null,milliseconds:from&&to?Math.max(0,Date.parse(to)-Date.parse(from)):null,scope:'client confirmation times; server transitions may predate confirmation'},old_alert_deleted:false,automatic_rollback:false,reused:!!previous};
}

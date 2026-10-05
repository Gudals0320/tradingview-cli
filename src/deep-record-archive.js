import {resolveWorkspace} from './workspace-registry.js';
import {loadWorkspace,workspaceStatus,assertObservationAdmission} from './workspace-store.js';
import {nativeRequestStore} from './native-request-store.js';
import {acquireResources} from './resource-lock.js';

export async function archiveDeepRecord(name,{request_id,run_id,acknowledge_no_adoption,timeout=30000,_deps}={}){
  if(!acknowledge_no_adoption||!request_id||!run_id)throw Object.assign(new Error('Pass exact request/run IDs and --acknowledge-no-adoption to preserve and retire only this private record.'),{code:'DEEP_ARCHIVE_CONFIRMATION_REQUIRED'});
  const file=(_deps?.resolve||resolveWorkspace)(name),workspace=(_deps?.load||loadWorkspace)(file);
  const resource=await (_deps?.acquire||acquireResources)(['workspace:'+workspace.id],{command:'workspace backtest-archive',workspace_id:workspace.id,timeout});
  try{
    const status=(_deps?.status||workspaceStatus)(file);assertObservationAdmission(status,name);
    if(status.operation)throw Object.assign(new Error('A workspace operation is active; wait before archiving the private record.'),{code:'WORKSPACE_BUSY'});
    const store=_deps?.store||nativeRequestStore(workspace,'deep',request_id),record=store.read();
    if(!record||record.request_id!==request_id||record.run_id!==run_id)throw Object.assign(new Error('Exact private Deep request/run identity does not match; nothing was archived.'),{code:'DEEP_ARCHIVE_ID_MISMATCH'});
    if(record.phase==='archived_unadopted')return {success:true,archived:true,reused:true,request_id,run_id,native_state_changed:false,native_work_cancelled:false,gui_report_modified:false,result_adopted:false,record_preserved:true};
    if(!['superseded','rejected_known','settled'].includes(record.phase)||record.phase==='superseded'&&!record.supersession_proof)throw Object.assign(new Error('A genuine pending/unknown outcome cannot be archived. First obtain exact superseded or settled evidence; this command does not discard uncertainty.'),{code:'DEEP_ARCHIVE_OUTCOME_UNKNOWN',details:{request_id,run_id,phase:record.phase,record_preserved:true,native_state_changed:false,result_adopted:false}});
    store.write({...record,phase:'archived_unadopted',archive:{previous_phase:record.phase,archived_at:new Date().toISOString(),acknowledged_no_adoption:true,original_record_preserved:true,native_state_changed:false}});
    return {success:true,archived:true,reused:false,request_id,run_id,native_state_changed:false,native_work_cancelled:false,gui_report_modified:false,result_adopted:false,record_preserved:true,next_action:'Use a new request ID after current GUI/native work is idle. This archive did not cancel, clear or reset Desktop work.'};
  }finally{resource.release();}
}

/** Persist only a fully admitted observation; called by the router after cleanup. */
export function noteDeepSupersession(reference,result,_deps){
  if(result?.code!=='DEEP_RUN_SUPERSEDED'||!result.supersession_proof||!result.provenance?.workspace_id)return result;
  try{
    const workspace=(_deps?.load||loadWorkspace)((_deps?.resolve||resolveWorkspace)(reference));if(workspace.id!==result.provenance.workspace_id)throw Object.assign(new Error('Workspace identity changed before recording supersession.'),{code:'WORKSPACE_OWNERSHIP_LOST'});
    const store=_deps?.store||nativeRequestStore(workspace,'deep',result.request_id),record=store.read();
    if(!record||record.run_id!==result.run_id||record.phase==='archived_unadopted')return result;
    store.write({...record,phase:'superseded',supersession_proof:{...result.supersession_proof,previous_phase:record.supersession_proof?.previous_phase??record.phase,observed_at:new Date().toISOString(),result_adopted:false,native_state_changed:false}});
    return {...result,supersession_recorded:true};
  }catch(error){return {...result,supersession_recorded:false,metadata_warning:{code:error.code||'DEEP_SUPERSESSION_WRITE_FAILED',error:'Private supersession evidence was not recorded; archive requires an already persisted eligible outcome.'}};}
}


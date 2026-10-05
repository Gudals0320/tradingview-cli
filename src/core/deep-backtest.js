import { randomUUID,createHash } from 'node:crypto';
import { evaluateAsync } from '../connection.js';
import { DEEP_PAGE_CODE } from '../deep-backtest-page.js';
import { getProperties } from './strategy-properties.js';
import { currentWorkspaceSession } from '../session.js';
import { nativeRequestStore } from '../native-request-store.js';

export function deepPeriod({from,to,timezone='UTC'}){
  const error=message=>{throw Object.assign(new Error(message),{code:'INVALID_DEEP_PERIOD',details:{mutation_dispatched:false}});};
  if(!from||!to||![from,to].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)))error('from/to must be explicit ISO-8601 timestamps with UTC offset; date-only/local times are refused.');
  const start=Date.parse(from),end=Date.parse(to);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)error('Require a finite increasing period.');
  if(start%1000||end%1000||Math.floor(start/1000)>=Math.floor(end/1000))error('Native Deep bounds use whole seconds; sub-second or empty native periods are refused.');
  for(const timestamp of [from,to]){const [year,month,day]=timestamp.slice(0,10).split('-').map(Number);if(day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())error('Invalid calendar date; normalized impossible dates are refused.');}
  try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{error('Unknown calculation timezone.');}
  if(!['UTC','Etc/UTC'].includes(timezone))throw Object.assign(new Error('Only native UTC calculation is verified; non-UTC native sessions can shift the requested period.'),{code:'DEEP_TIMEZONE_UNSUPPORTED',details:{mutation_dispatched:false,requested_timezone:timezone,supported_calculation_timezone:'Etc/UTC'}});
  return {from_ms:start,to_ms:end,period:{original_from:from,original_to:to,from:new Date(start).toISOString(),to:new Date(end).toISOString(),timezone,calculation_timezone:'Etc/UTC',bounds:'native from_to seconds; actual coverage is separate',native_from_seconds:Math.floor(start/1000),native_to_seconds:Math.floor(end/1000)}};
}

export async function runDeep({from,to,timezone,request_id,strategy_id,_deps}={}){
  const period=deepPeriod({from,to,timezone});
  if(!request_id||!/^[-a-zA-Z0-9_]{1,100}$/.test(request_id))throw Object.assign(new Error('A stable --request-id is required.'),{code:'INVALID_DEEP_REQUEST'});
  const properties=await (_deps?.properties||getProperties)({strategy_id,_deps:_deps?.propertiesDeps});
  if(!properties.success||properties.report_verified!==true||!properties.source_hash)return {success:false,code:'DEEP_SOURCE_UNVERIFIED',error:'Compile the owned source and verify its normal baseline before explicit Deep dispatch.',mutation_dispatched:false};
  const inspect=_deps?.evaluateAsync||evaluateAsync,workspace=currentWorkspaceSession()?.workspace;
  const sourceProof=await inspect(`(async()=>{${DEEP_PAGE_CODE};return verifyDeepSource(window,document,${JSON.stringify(properties.strategy_id)});})()`);
  if(!sourceProof.verified||sourceProof.source_hash!==properties.source_hash||createHash('sha256').update(sourceProof.properties_fingerprint||'').digest('hex')!==properties.effective_properties.fingerprint)return {success:false,code:'DEEP_SOURCE_UNVERIFIED',error:'Current saved/applied source, complete inputs and Properties have no matching compile proof.',mutation_dispatched:false};
  const fingerprint=createHash('sha256').update(JSON.stringify({period:period.period,strategy_id:properties.strategy_id,source_proof:sourceProof,properties:properties.effective_properties.fingerprint})).digest('hex');
  const request={...period,request_id,strategy_id:properties.strategy_id,source_proof:sourceProof,properties_hash:properties.effective_properties.fingerprint,fingerprint,run_id:randomUUID()};
  const store=_deps?.store||(workspace?nativeRequestStore(workspace,'deep',request_id):null);
  if(!store)throw Object.assign(new Error('Deep dispatch requires a persistent named workspace intent.'),{code:'WORKSPACE_REQUIRED'});
  const previous=store.read();
  if(previous?.phase==='archived_unadopted')return {success:false,code:'DEEP_RUN_ARCHIVED',error:'This preserved request record was explicitly retired without result adoption; use a new request ID.',run_id:previous.run_id,request_id:previous.request_id,mutation_dispatched:false,intent_preserved:true};
  if(previous&&previous.fingerprint!==fingerprint)return {success:false,code:'DEEP_REQUEST_CONFLICT',error:'This request ID already describes another source/settings/period.',mutation_dispatched:false};
  if(previous?.phase==='rejected_known')return {...(previous.no_history_dispatch_proof||previous.result||{success:false,code:'DEEP_NOT_DISPATCHED',error:'This request was rejected before history dispatch.'}),run_id:previous.run_id,request_id:previous.request_id,reused:true,mutation_dispatched:false};
  if(previous&&previous.phase!=='rejected_known'){
    const actual=await deepStatus({run_id:previous.run_id,_deps});
    if(actual.run_id===previous.run_id&&actual.no_history_dispatch_verified===true){store.write({...previous,phase:'rejected_known',no_history_dispatch_proof:actual,reconciled_at:new Date().toISOString()});return {...actual,reused:true};}
    if(actual.run_id===previous.run_id&&actual.phase){return {...actual,reused:true};}
    return {success:false,code:'DEEP_RUN_UNKNOWN',error:'Recorded native outcome cannot be inspected in this page/generation; preserve intent, do not resend.',request_id,run_id:previous.run_id,intent_preserved:true,replay_safe:false,mutation_dispatched:false};
  }
  for(const entry of store.list().filter(e=>e.record.request_id!==request_id&&!['settled','rejected_known','archived_unadopted'].includes(e.record.phase))){
    const settlement=await inspect(`(()=>{${DEEP_PAGE_CODE};return inspectDeepSettlement(window,${JSON.stringify(entry.record.run_id)});})()`);
    if(!settlement.settled)return {success:false,code:'DEEP_RUN_PENDING',error:'Another recorded native Deep outcome is pending or unknown; reconcile that exact run before a new dispatch.',run_id:entry.record.run_id,intent_preserved:true,mutation_dispatched:false};
    store.update(entry,{...entry.record,phase:'settled',settlement,settled_at:new Date().toISOString()});
  }
  const intent={schema:1,request_id,run_id:request.run_id,fingerprint,period:period.period,source_proof:sourceProof,source_hash:properties.source_hash,properties_fingerprint:properties.effective_properties.fingerprint,phase:'dispatching',started_at:new Date().toISOString()};
  store.write(intent);
  try{const result=await inspect(`(async()=>{${DEEP_PAGE_CODE};return startDeepRun(window,document,${JSON.stringify(request)});})()`,{mutation:true});
    store.write({...intent,phase:result.mutation_dispatched===false?'rejected_known':'accepted',result});return result;
  }catch(error){store.write({...intent,phase:'unknown',error_code:error.code||'NATIVE_OUTCOME_UNKNOWN'});throw error;}
}

export async function deepStatus({run_id,_deps}={}){
  return (_deps?.evaluateAsync||evaluateAsync)(`(()=>{${DEEP_PAGE_CODE};return inspectDeepRun(window,document,${JSON.stringify(run_id||null)});})()`);
}

export function deepTime(value){const date=new Date(value);return Number.isFinite(value)&&Number.isFinite(date.getTime())?date.toISOString():null;}

export async function waitDeep({run_id,timeout=30000,_deps}={}){
  if(!Number.isInteger(timeout)||timeout<1||timeout>300000)throw Object.assign(new Error('timeout must be 1..300000 ms.'),{code:'INVALID_DEEP_REQUEST'});
  const now=_deps?.now||Date.now,sleep=_deps?.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms))),start=now();let last;
  do{last=await deepStatus({run_id,_deps});if(now()-start>=timeout)break;if(!last.success||last.phase==='ready')return last;await sleep(Math.min(100,Math.max(1,timeout-(now()-start))));}while(now()-start<timeout);
  return {success:false,code:'DEEP_WAIT_TIMEOUT',error:'Finite wait expired; the native server job was not cancelled.',mode:'deep',run_id:last?.run_id||run_id||null,last_observed_phase:last?.phase||'unknown',cancelled:false};
}

export async function deepResults({run_id,offset=0,limit=100,report_revision,_deps}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)throw Object.assign(new Error('Require offset >= 0 and limit 1..500.'),{code:'INVALID_DEEP_REQUEST'});
  return (_deps?.evaluateAsync||evaluateAsync)(`(async()=>{${DEEP_PAGE_CODE};const read=await deepReportSnapshot(window,document,${JSON.stringify(run_id||null)});if(!read.success)return read;
    const snap=read.snapshot,data=snap.data;
    if(${JSON.stringify(report_revision||null)}&&${JSON.stringify(report_revision||null)}!==snap.revision)return {success:false,code:'REPORT_CHANGED',error:'Deep snapshot revision changed; restart at offset 0.',report_revision:snap.revision};
    ${deepTime.toString()}
    const range=data.settings?.dateRange?.backtest||null,actual=range&&Number.isFinite(range.from)&&Number.isFinite(range.to)?{from:deepTime(range.from),to:deepTime(range.to)}:null;
    if(!snap.period_proof.valid)return {success:false,code:snap.period_proof.code,error:'Native report window/trade timestamps do not verify the requested absolute period; no metrics/ledger are adopted.',requested_period:read.status.requested_period,computed_native_window:actual,period_proof:snap.period_proof,report_revision:snap.revision,result_adopted:false};
    const rows=data.trades.slice(${offset},${offset+limit});
    return {success:true,...read.status,mode:'deep',report_revision:snap.revision,currency:data.currency||null,performance:data.performance,
      requested_period:read.status.requested_period,computed_window:actual,period_proof:snap.period_proof,coverage:actual?'native_report_window':'unknown',coverage_completeness:'unknown',loaded_window:null,
      trade_window:data.trades.length?{from:deepTime(data.trades[0].entry?.time),to:deepTime(data.trades.at(-1).exit?.time)}:null,
      ledger:{total:data.trades.length,offset:${offset},limit:${limit},rows,has_more:${offset+limit}<data.trades.length,next_offset:${offset+limit}<data.trades.length?${offset}+rows.length:null,truncated:false,downsampled:false},
      snapshot:{revision:snap.revision,created_at:snap.created_at,hash_cost:'once_per_native_report_cycle',period_validation:'once_per_snapshot',pagination:'immutable_full_snapshot_sliced_in_page'}};
  })()`);
}

export async function resetNormal({_deps}={}){
  const inspect=_deps?.evaluateAsync||evaluateAsync,workspace=currentWorkspaceSession()?.workspace,store=_deps?.store||(workspace?nativeRequestStore(workspace,'deep','normal-reset'):null);
  if(!store)return {success:false,code:'WORKSPACE_REQUIRED',error:'Normal reset requires the persistent workspace request ledger.'};
  for(const entry of store.list().filter(e=>!['settled','rejected_known','archived_unadopted'].includes(e.record.phase))){const settlement=await inspect(`(()=>{${DEEP_PAGE_CODE};return inspectDeepSettlement(window,${JSON.stringify(entry.record.run_id)});})()`);
    if(!settlement.settled)return settlement.code==='DEEP_RUN_SUPERSEDED'?settlement:{success:false,code:'DEEP_RUN_UNSETTLED',error:'An exact persistent native run is pending or unknown; normal reset cannot abandon it.',run_id:entry.record.run_id,intent_preserved:true,mutation_dispatched:false};
    store.update(entry,{...entry.record,phase:'settled',settlement});
  }
  return inspect(`(()=>{${DEEP_PAGE_CODE};const run=window.__tvCliDeepRun;if(run){const status=inspectDeepSettlement(window,run.run_id);if(!status.settled)return status.code==='DEEP_RUN_SUPERSEDED'?status:{success:false,code:'DEEP_RUN_UNSETTLED',error:'Inspect the exact pending/unknown native job; normal reset does not abandon it.',mutation_dispatched:false};}
    const {facade,history}=findDeepReportProviders(document);if(!facade||!history||typeof facade.resetDeepBacktestingReportData!=='function')return {success:false,code:'DEEP_NATIVE_PATH_UNAVAILABLE',error:'Open the owned report with its native explicit reset capability.'};
    const admission=deepResetAdmission(window,facade,run);if(!admission.success)return admission;if(admission.already_normal)return {success:true,mode:'normal',performed:false,results_invalidated:false};
    const noHistory=run&&inspectDeepSettlement(window,run.run_id).no_history_dispatch_verified===true;
    history.handleSetIsDeepHistoryMode(false);facade.resetDeepBacktestingReportData();run?.dispose?.();
    if(noHistory){const manager=facade._deepBacktestingManager,toolkit=nativeDeepToolkit(window);manager._sendRequest=originalDeepSender(manager,toolkit?.consumer_source,true);}
    delete window.__tvCliDeepRun;return {success:true,mode:'normal',results_invalidated:true};})()`,{mutation:true});
}


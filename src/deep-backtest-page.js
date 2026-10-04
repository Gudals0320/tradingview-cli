import { STRATEGY_PAGE_CODE,pageStrategies,readStrategyReport,compiledIdentity } from './strategy-state.js';
import { findPineController,findPineEditor } from './core/desktop-dom.js';
import { readChartContext } from './chart-context.js';
import { effectiveStrategyProperties } from './strategy-properties.js';
import { canonicalPineSource } from './pine-source.js';

export async function verifyDeepSource(window,document,strategyId){
  const item=pageStrategies(window).find(s=>s.id===strategyId),controller=findPineController(document),editor=findPineEditor(document),epoch=window.__tvCliCompilation;
  const denied=()=>({verified:false,code:'DEEP_SOURCE_UNVERIFIED',mutation_dispatched:false});
  if(!item||!controller||!editor||controller.isModified?.()!==false||controller.isDraft?.()!==false||epoch?.phase!=='ready'||!epoch.report_verified||!epoch.source_hash||epoch.strategy_id!==strategyId||compiledIdentity(item.inputs)!==epoch.compiled_identity)return denied();
  const identity=controller.getScriptIdVersion(),pine=item.inputs.find(i=>i.id==='pineId')?.value,version=item.inputs.find(i=>i.id==='pineVersion')?.value;
  if(!identity?.scriptIdPart||pine!==identity.scriptIdPart||String(version)!==String(identity.version))return denied();
  const context=readChartContext(window),chart=window.TradingViewApi.activeChart?.()||window.TradingViewApi._activeChartWidgetWV.value();
  const semantic_context={symbol:context.symbol,resolution:context.resolution,chart_type:context.chart_type,wire:ownedDeepContext(window),symbol_definition:chart.symbolExt?.()||null,session:chart.symbolExt?.()?.session||null,timezone:chart.getTimezone?.()||null};
  const source=canonicalPineSource(editor.editor.getValue()),inputs=JSON.stringify(item.inputs),compiled=compiledIdentity(item.inputs),generation=window.__tvCliWorkspace?.nonce||null;
  const epochKey=JSON.stringify({token:epoch.token,phase:epoch.phase,source_hash:epoch.source_hash,report_verified:epoch.report_verified,compiled_identity:epoch.compiled_identity,inputs_fingerprint:epoch.inputs_fingerprint,accepted_cycle:epoch.accepted_cycle,cycle:epoch.calculation?.cycle});
  const hash=async value=>Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
  const [source_hash,inputs_fingerprint,compiled_fingerprint]=await Promise.all([hash(source),hash(inputs),hash(compiled)]);
  const after=pageStrategies(window).find(s=>s.id===strategyId),afterController=findPineController(document),afterEditor=findPineEditor(document),afterEpoch=window.__tvCliCompilation;
  const afterChart=window.TradingViewApi.activeChart?.()||window.TradingViewApi._activeChartWidgetWV.value(),afterContext=readChartContext(window);
  const afterSemantic={symbol:afterContext.symbol,resolution:afterContext.resolution,chart_type:afterContext.chart_type,wire:ownedDeepContext(window),symbol_definition:afterChart.symbolExt?.()||null,session:afterChart.symbolExt?.()?.session||null,timezone:afterChart.getTimezone?.()||null};
  const afterEpochKey=JSON.stringify({token:afterEpoch?.token,phase:afterEpoch?.phase,source_hash:afterEpoch?.source_hash,report_verified:afterEpoch?.report_verified,compiled_identity:afterEpoch?.compiled_identity,inputs_fingerprint:afterEpoch?.inputs_fingerprint,accepted_cycle:afterEpoch?.accepted_cycle,cycle:afterEpoch?.calculation?.cycle});
  if(afterController!==controller||afterEditor?.editor!==editor.editor||afterChart!==chart||afterEpoch!==epoch||epochKey!==afterEpochKey||afterController?.isModified?.()!==false||afterController?.isDraft?.()!==false||JSON.stringify(afterController?.getScriptIdVersion())!==JSON.stringify(identity)||canonicalPineSource(afterEditor?.editor.getValue()||'')!==source||JSON.stringify(after?.inputs)!==inputs||generation!==(window.__tvCliWorkspace?.nonce||null)||JSON.stringify(afterSemantic)!==JSON.stringify(semantic_context)||source_hash!==epoch.source_hash)return denied();
  return {verified:true,source_hash,document_id:identity.scriptIdPart,document_version:String(identity.version),inputs_fingerprint,compiled_fingerprint,semantic_context,page_generation:generation,compile_token:epoch.token};
}

/** Read cached modules already imported by the observed native Deep facade. */
export function nativeDeepToolkit(window){
  const modules=new Map();for(const chunk of window.webpackChunktradingview||[])for(const [id,factory] of Object.entries(chunk[1]||{}))modules.set(id,String(factory));
  const consumers=[...modules.values()].filter(text=>text.includes('BacktestingStrategyFacade:')&&text.includes('unpackNonSeriesDataCompressed')&&text.includes('WSBackendConnection'));
  if(consumers.length!==1)return null;
  const text=consumers[0],decodeAlias=text.match(/(\w+)\.unpackNonSeriesDataCompressed/)?.[1],connectionAlias=text.match(/new (\w+)\.WSBackendConnection/)?.[1];
  const dependency=alias=>alias&&text.match(new RegExp('\\b'+alias+'=\\w+\\((\\d+)\\)'))?.[1];
  const decodeId=dependency(decodeAlias),connectionId=dependency(connectionAlias);
  if(!decodeId||!connectionId)return null;
  let runtime;window.webpackChunktradingview.push([['tv-cli-deep-read-'+Date.now()],{},r=>{runtime=r;}]);
  if(typeof runtime!=='function')return null;
  const unpack=runtime(decodeId).unpackNonSeriesDataCompressed,Connection=runtime(connectionId).WSBackendConnection;
  return typeof unpack==='function'&&typeof Connection?.prototype?.on==='function'?{unpack,Connection}:null;
}

export function nativeKernelMatchesChart(window,strategyId,native){
  const item=pageStrategies(window).find(s=>s.id===strategyId);
  if(!item||!native||typeof native.inputs!=='object'||Array.isArray(native.inputs))return false;
  const meta=item.source.metaInfo?.();
  const engine=item.source._getStudyIdWithLatestVersion?.();
  if(typeof engine!=='string'||native.studyName!==engine)return false;
  const keys=Object.keys(native.inputs),expected=item.inputs;
  if(keys.length!==expected.length||expected.some(i=>!Object.hasOwn(native.inputs,i.id)))return false;
  for(const input of expected){
    const actual=native.inputs[input.id],type=meta.inputs?.find(i=>i.id===input.id)?.type;
    if(['text','pineId','pineVersion'].includes(input.id)){
      if(typeof actual!=='string'||actual!==input.value)return false;
    }else{
      if(!actual||typeof actual!=='object'||Array.isArray(actual)||Object.keys(actual).sort().join(',')!=='f,t,v'||actual.f!==true||!['text','integer','float','bool'].includes(type)||actual.t!==type||JSON.stringify(actual.v)!==JSON.stringify(input.value))return false;
    }
  }
  // Dependency-bearing native payloads need an independently mapped source
  // dependency contract; never assume a stale manager's dependency list is owned.
  return Array.isArray(native.dependencies)&&native.dependencies.length===0;
}

export function ownedDeepContext(window){
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value(),series=chart?._chartWidget?.model?.().mainSeries?.();
  const symbol=series?.getSymbolString?.(),resolution=series?.interval?.();
  if(typeof symbol!=='string'||!symbol||typeof resolution!=='string'||!resolution)return null;
  return {symbol,resolution};
}

export function installDeepAttribution(manager,run,toolkit){
  const packets=[],cycles=[];let sequence=0;
  const bind=()=>{
    const cycle=cycles.at(-1);if(!cycle)return;
    const matches=packets.filter(p=>p.decoded&&p.raw_report===cycle.raw_report);
    const candidates=matches.filter(p=>p.own&&p.sequence===sequence);
    run.cycle_proof=candidates.length&&!matches.some(p=>!p.own)?{cycle:cycle.cycle,sequence,kind:candidates[0].kind,session:candidates[0].session,request_number:candidates[0].request_number}:null;
    run.snapshot=null;
  };
  const response=async(raw,connection,socket)=>{
    const current=()=>hooks.active===active&&manager._wsConnection===connection&&(connection._socket||connection)===socket;
    if(!current())return;
    let message;try{message=JSON.parse(raw);}catch{sequence++;run.cycle_proof=null;run.snapshot=null;return;}
    if(message.m!=='request_data'&&!message.m?.includes('error'))return;
    const packet={sequence:++sequence,session:message.p?.[0],request_number:message.p?.[1],own:message.p?.[0]===run.sent?.session&&String(message.p?.[1])===String(run.request_before),kind:message.m==='request_data'?'ready':'server_error',decoded:false};
    packets.push(packet);run.cycle_proof=null;run.snapshot=null;
    try{
      if(packet.kind==='server_error'){packet.raw_report='null';packet.decoded=true;}
      else{const unpacked=await toolkit.unpack(message.p[2].ns.d);if(unpacked?.data?.report){packet.raw_report=JSON.stringify(unpacked.data.report);packet.decoded=true;}}
    }catch{/* Unreadable or foreign messages never become native outcome proof. */}
    if(current())bind();
  };
  let hooks=manager.__tvCliDeepAttributionHooks;
  if(!hooks){
    hooks={active:null,originalSet:manager._setData,originalBind:manager._bindListeners};
    manager._setData=function(data){const active=hooks.active,raw_report=JSON.stringify(data??null),result=hooks.originalSet.call(this,data);active?.changed(raw_report);return result;};
    // Native onReconnect captures this function. Keep a single stable wrapper
    // that delegates to the current run rather than a disposed old closure.
    manager._bindListeners=function(){hooks.active?.attach(this._wsConnection);return hooks.originalBind.call(this);};
    manager.__tvCliDeepAttributionHooks=hooks;
  }
  const attach=connection=>{
    if(typeof connection?.on!=='function')throw Error('DEEP_NATIVE_PATH_UNAVAILABLE: Native response listener unavailable before dispatch.');
    // This Desktop's WSBackendConnection has on() but no off(). Install one
    // bounded dispatcher per connection and detach this run's receiver on dispose.
    const socket=connection._socket||connection;
    if(connection.__tvCliDeepResponseRouter?.socket!==socket){const router={socket};if(connection.on('message',raw=>{if((connection._socket||connection)===socket&&manager._wsConnection===connection)hooks.active?.response(raw,connection,socket);})===false)throw Error('DEEP_NATIVE_PATH_UNAVAILABLE: Native listener was not admitted.');connection.__tvCliDeepResponseRouter=router;}
  };
  const active={attach,response,changed:raw_report=>{const report=manager.activeStrategyReportData?.value?.();run.cycle_report=report;run.cycle_report_json=JSON.stringify(report??null);cycles.push({cycle:run.report_cycle,raw_report});bind();}};
  hooks.active=active;
  if(manager._wsConnection)attach(manager._wsConnection);
  return ()=>{if(hooks.active===active)hooks.active=null;};
}

/** Resolve observed report providers; never mount a panel from a read command. */
export function findDeepReportProviders(document){
  const roots=document.querySelectorAll('[class*="reportContainer-"], [data-qa-id="date-range-menu"]');
  let facade=null,history=null;
  for(const root of roots){let node=root,fiber;for(let i=0;node&&i<10&&!fiber;i++,node=node.parentElement){const key=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(key)fiber=node[key];}
    for(let i=0;fiber&&i<60;i++,fiber=fiber.return){const value=fiber.memoizedProps?.value;
      if(typeof value?.requestDeepBacktestingData==='function'&&value._deepBacktestingManager)facade=value;
      if(typeof value?.handleSetIsDeepHistoryMode==='function'&&typeof value?.setDeepHistoryDateRange==='function')history=value;
    }
  }
  return {facade,history};
}

export function deepCurrentIdentity(window,document,strategyId){
  const item=pageStrategies(window).find(item=>item.id===strategyId),controller=findPineController(document),editor=findPineEditor(document);
  if(!item||!controller||!editor)return null;
  const identity=controller.getScriptIdVersion(),context=readChartContext(window),properties=effectiveStrategyProperties(window,item.id);
  return JSON.stringify({strategy_id:item.id,document_id:identity?.scriptIdPart,document_version:String(identity?.version),source:editor.editor.getValue(),inputs:item.inputs,effective_properties:properties?.fingerprint,
    editor_modified:controller.isModified?.(),editor_draft:controller.isDraft?.(),compile:{token:window.__tvCliCompilation?.token,phase:window.__tvCliCompilation?.phase,source_hash:window.__tvCliCompilation?.source_hash,report_verified:window.__tvCliCompilation?.report_verified},context:{symbol:context.symbol,resolution:context.resolution,chart_type:context.chart_type,wire:ownedDeepContext(window),session:window.TradingViewApi.activeChart?.().symbolExt?.()?.session||null,timezone:window.TradingViewApi.activeChart?.().getTimezone?.()||null},page_generation:window.__tvCliWorkspace?.nonce});
}

export function inspectDeepRun(window,document,runId){
  const run=window.__tvCliDeepRun;
  if(!run||runId&&run.run_id!==runId)return {success:false,code:'DEEP_RUN_UNKNOWN',error:'This page has no exact native Deep run; preserve private intent and never fall back to chart results.'};
  if(deepCurrentIdentity(window,document,run.strategy_id)!==run.identity)return {success:false,code:'DEEP_RESULT_STALE',error:'Source, inputs, Properties, context or generation changed; explicitly run a new request.',run_id:run.run_id,mode:'deep',result_adopted:false};
  const manager=run.facade._deepBacktestingManager;
  const visible=findDeepReportProviders(document).facade;
  if(visible&&visible!==run.facade)return {success:false,code:'DEEP_RESULT_GENERATION_CHANGED',error:'The native report provider was replaced; do not adopt the old job.',run_id:run.run_id,result_adopted:false};
  if(!run.facade._isDeepBacktesting||manager._fromDate!==run.from_ms||manager._toDate!==run.to_ms||manager._requestId>run.request_before+1)return {success:false,code:'DEEP_REQUEST_CHANGED',error:'Native mode/period/request identity changed outside this run.',run_id:run.run_id,mode:'deep',result_adopted:false};
  const status=manager.activeStrategyStatus?.value?.(),sent=run.history_send_completed===true;
  if(sent&&(!run.sent||run.sent.kernel!==run.kernel||run.sent.symbol!==run.native_symbol||run.sent.resolution!==run.native_resolution||run.sent.from_seconds!==Math.floor(run.from_ms/1000)||run.sent.to_seconds!==Math.floor(run.to_ms/1000)))return {success:false,code:'DEEP_REQUEST_CHANGED',error:'Actual transmitted native source/settings/period differ from the recorded run.',run_id:run.run_id,result_adopted:false};
  const phase=status?.type===3?'server_error':status?.type===2?'ready':sent?'pending':'accepted';
  if(['ready','server_error'].includes(phase)&&(!sent||phase==='ready'&&run.report_cycle<1||run.cycle_proof?.cycle!==run.report_cycle||run.cycle_proof?.kind!==phase))return {success:false,code:'DEEP_REPORT_UNVERIFIED',error:'The latest native report/outcome cycle has no exact decoded response attribution for this run.',run_id:run.run_id,result_adopted:false};
  return {success:phase!=='server_error',mode:'deep',run_id:run.run_id,request_id:run.request_id,phase,accepted_scope:'native_client',server_request_dispatched:sent,native_request_number:sent?run.request_before:null,
    server_acceptance:phase==='ready'?'native_response_verified':'unconfirmed',requested_period:run.requested_period,native_timezone:run.native_timezone,native_bounds:{from_seconds:Math.floor(run.from_ms/1000),to_seconds:Math.floor(run.to_ms/1000)},source_hash:run.source_hash,effective_properties_fingerprint:run.properties_hash,
    ...(phase==='server_error'?{code:'DEEP_SERVER_ERROR',error:status.errorDescription?.error||'Native Deep server calculation failed.'}:{})};
}

/** Native settlement is distinct from adopting a result for today's source. */
export function inspectDeepSettlement(window,runId){
  const run=window.__tvCliDeepRun;if(!run||run.run_id!==runId)return {known:false,settled:false};
  const manager=run.facade._deepBacktestingManager,status=manager.activeStrategyStatus?.value?.();
  if(!run.history_send_completed||manager._requestId!==run.request_before+1||manager._fromDate!==run.from_ms||manager._toDate!==run.to_ms||!run.sent||run.sent.kernel!==run.kernel)return {known:false,settled:false};
  const kind=status?.type===2?'ready':status?.type===3?'server_error':'pending';
  const settled=[2,3].includes(status?.type)&&run.cycle_proof?.cycle===run.report_cycle&&run.cycle_proof.kind===kind;
  return {known:true,settled,phase:status?.type===2?'ready':status?.type===3?'server_error':'pending',result_adopted:false,
    ...(settled&&status.type===2?{retained_report:manager.activeStrategyReportData.value()}: {})};
}

export async function startDeepRun(window,document,request){
  const old=window.__tvCliDeepRun;
  if(old?.request_id===request.request_id){if(old.request_fingerprint!==request.fingerprint)return {success:false,code:'DEEP_REQUEST_CONFLICT',error:'This request ID already describes another period/source.'};return {...inspectDeepRun(window,document,old.run_id),reused:true};}
  if(old){const status=inspectDeepRun(window,document,old.run_id);if(['accepted','pending'].includes(status.phase))return {success:false,code:'DEEP_RUN_PENDING',error:'An exact native Deep run is already pending; wait, never start another uncertain request.'};}
  const report=readStrategyReport(window,{strategy_id:request.strategy_id});if(!report.success)return {...report,mutation_dispatched:false};
  const sourceProof=await verifyDeepSource(window,document,report.strategy_id);
  if(!sourceProof.verified||JSON.stringify(sourceProof)!==JSON.stringify(request.source_proof))return {success:false,code:'DEEP_SOURCE_UNVERIFIED',error:'Saved/applied source or complete input identity changed before dispatch.',mutation_dispatched:false};
  const {facade,history}=findDeepReportProviders(document);
  if(!facade||!history)return {success:false,code:'DEEP_NATIVE_PATH_UNAVAILABLE',error:'Open the owned Strategy Report explicitly; this Desktop exposes no verified native Deep provider.',mutation_dispatched:false};
  if(facade._activeStrategy?.value?.()?.id!==report.strategy_id)return {success:false,code:'WORKSPACE_STUDY_MISMATCH',error:'The visible report provider is not the owned verified strategy.',mutation_dispatched:false};
  const identity=deepCurrentIdentity(window,document,report.strategy_id);
  if(!identity)return {success:false,code:'DEEP_SOURCE_UNVERIFIED',error:'Mounted saved document identity is unavailable.',mutation_dispatched:false};
  const manager=facade._deepBacktestingManager;
  const actualStatus=manager.activeStrategyStatus?.value?.();
  if([0,1].includes(actualStatus?.type)||manager._isConnected===true||manager._wsConnection?.isConnecting?.()===true||manager._wsConnection?.isConnected?.()===true)return {success:false,code:'DEEP_NATIVE_JOB_PENDING',error:'An existing native Deep job/connection is pending, including GUI or unrecorded work; no implicit disconnect or replacement.',mutation_dispatched:false};
  const toolkit=nativeDeepToolkit(window);
  if(!toolkit||typeof manager._setData!=='function'||typeof manager._bindListeners!=='function')return {success:false,code:'DEEP_NATIVE_PATH_UNAVAILABLE',error:'Authoritative native response decoder/monitoring is unavailable; no job was dispatched.',mutation_dispatched:false};
  const nativeInputs=manager._activeStrategyInputs?.value?.(),nativeInterval=manager._resolution?.value?.();
  if(!nativeInputs||nativeInterval?.isTicks?.()||nativeInterval?.isRange?.()||typeof manager._sendRequest!=='function')return {success:false,code:'DEEP_NATIVE_PATH_UNAVAILABLE',error:'Supported native request identity is unavailable for this interval.',mutation_dispatched:false};
  if(!nativeKernelMatchesChart(window,report.strategy_id,nativeInputs))return {success:false,code:'DEEP_KERNEL_UNVERIFIED',error:'Native Deep payload does not exactly map to the owned compiled/document/current inputs, or dependencies are unsupported.',mutation_dispatched:false};
  const kernel=JSON.stringify({study:nativeInputs.studyName,inputs:nativeInputs.inputs,deps:[...nativeInputs.dependencies]});
  const ownedContext=ownedDeepContext(window),native_symbol=ownedContext?.symbol,native_resolution=ownedContext?.resolution;
  if(!ownedContext||manager._symbolString?.value?.()!==native_symbol||nativeInterval.value?.()!==native_resolution)return {success:false,code:'DEEP_CONTEXT_UNVERIFIED',error:'Native symbol definition/session/currency or resolution differs from the owned main series.',mutation_dispatched:false};
  old?.dispose?.();
  const run=window.__tvCliDeepRun={run_id:request.run_id,request_id:request.request_id,request_fingerprint:request.fingerprint,strategy_id:report.strategy_id,source_hash:report.source_hash,properties_hash:request.properties_hash,
    identity,kernel,native_symbol,native_resolution,native_timezone:request.period.timezone==='UTC'?'Etc/UTC':request.period.timezone,from_ms:request.from_ms,to_ms:request.to_ms,requested_period:request.period,request_before:manager._requestId,facade,snapshot:null,report_cycle:0};
  const signal=manager.activeStrategyReportData;
  if(typeof signal?.subscribe!=='function'||typeof signal?.unsubscribe!=='function'){delete window.__tvCliDeepRun;return {success:false,code:'DEEP_NATIVE_PATH_UNAVAILABLE',error:'Native report revision monitoring is unavailable.',mutation_dispatched:false};}
  const changed=()=>{run.report_cycle++;run.snapshot=null;};signal.subscribe(changed);
  const originalSend=manager._sendRequest;
  const tracedSend=function(method,args){
    if(method==='switch_timezone'){args=[args[0],run.native_timezone];run.sent_timezone=run.native_timezone;}
    if(method==='request_history_data'){
      const sent={session:args[0],request_number:args[1],symbol:args[2],resolution:args[3],from_seconds:args[5]?.from_to?.from,to_seconds:args[5]?.from_to?.to,kernel:JSON.stringify({study:args[6],inputs:args[7],deps:args[8]})};
      if(args.length!==9||Object.keys(args[5]||{}).join(',')!=='from_to'||Object.keys(args[5]?.from_to||{}).sort().join(',')!=='from,to'||deepCurrentIdentity(window,document,run.strategy_id)!==run.identity||!nativeKernelMatchesChart(window,run.strategy_id,{studyName:args[6],inputs:args[7],dependencies:args[8]})||sent.kernel!==run.kernel||sent.symbol!==run.native_symbol||sent.resolution!==run.native_resolution||typeof sent.session!=='string'||!sent.session||sent.session!==manager._sessionid||sent.request_number!==run.request_before||args[4]!==0||sent.from_seconds!==Math.floor(run.from_ms/1000)||sent.to_seconds!==Math.floor(run.to_ms/1000)||run.sent_timezone!==run.native_timezone)throw Error('DEEP_REQUEST_CHANGED: Owned baseline and actual wire payload differ; history request was not dispatched.');
      run.sent=sent;
      run.history_send_attempted=true;
    }
    const result=originalSend.call(this,method,args);
    if(method==='request_history_data')run.history_send_completed=true;
    if(method==='history_create_session'){originalSend.call(this,'switch_timezone',[args[0],run.native_timezone]);run.sent_timezone=run.native_timezone;}
    return result;
  };
  manager._sendRequest=tracedSend;
  const attribution=installDeepAttribution(manager,run,toolkit);
  run.dispose=()=>{signal.unsubscribe(changed);attribution();if(manager._sendRequest===tracedSend)manager._sendRequest=originalSend;};
  // Observed native provider's false argument prevents copying a chart report
  // into the Deep slot. Date-state updates alone do not request a new job.
  history.handleSetIsDeepHistoryMode(true,false);
  history.setDeepHistoryDateRange({from:new Date(request.from_ms),to:new Date(request.to_ms)});
  facade.requestDeepBacktestingData(request.from_ms,request.to_ms);
  return {...inspectDeepRun(window,document,run.run_id),mutation_dispatched:true,reused:false};
}

export async function deepReportSnapshot(window,document,runId){
  const status=inspectDeepRun(window,document,runId);if(!status.success)return status;
  if(status.phase!=='ready')return {...status,success:false,code:'DEEP_REPORT_PENDING',error:'Exact native Deep calculation is not ready.'};
  const run=window.__tvCliDeepRun,manager=run.facade._deepBacktestingManager,report=manager.activeStrategyReportData?.value?.();
  if(!report||!report.performance||!Array.isArray(report.trades)||run.cycle_report!==report||!run.cycle_report_json)return {success:false,code:'DEEP_REPORT_UNVERIFIED',error:'Completed native job did not supply an attributed immutable Deep metrics/ledger report.'};
  const cycle=run.report_cycle;
  if(run.snapshot&&run.snapshot.reference===report&&run.snapshot.cycle===cycle)return {success:true,status,snapshot:run.snapshot};
  const data=JSON.parse(run.cycle_report_json);
  let outside=null,missing=false;
  for(const trade of data.trades){
    if(!Number.isFinite(trade.entry?.time)||!trade.isOpen&&!Number.isFinite(trade.exit?.time))missing=true;
    if(Number.isFinite(trade.entry?.time)&&(trade.entry.time<run.from_ms||trade.entry.time>run.to_ms)||!trade.isOpen&&Number.isFinite(trade.exit?.time)&&(trade.exit.time<run.from_ms||trade.exit.time>run.to_ms)){outside=trade;break;}
  }
  const range=data.settings?.dateRange?.backtest,windowKnown=Number.isFinite(range?.from)&&Number.isFinite(range?.to)&&range.from<=range.to;
  const windowInside=windowKnown&&range.from>=run.from_ms&&range.to<=run.to_ms;
  const period_proof={valid:outside===null&&windowInside&&!missing,code:outside||windowKnown&&!windowInside?'DEEP_PERIOD_MISMATCH':'DEEP_PERIOD_UNVERIFIED',native_time_unit:'milliseconds',report_window:windowKnown?'native_decoded_report':'unknown',trade_timestamps:missing?'unknown':data.trades.length?'checked':'no_trades',coverage_completeness:'unknown',checked_rows:data.trades.length,outside_trade_number:outside?.tradeNumber??null};
  const bytes=new TextEncoder().encode(JSON.stringify({run_id:run.run_id,identity:run.identity,cycle,data}));
  const digest=await window.crypto.subtle.digest('SHA-256',bytes);
  if(inspectDeepRun(window,document,runId).phase!=='ready'||manager.activeStrategyReportData.value()!==report||cycle!==run.report_cycle)return {success:false,code:'REPORT_CHANGED',error:'Native Deep report changed while snapshotting; restart collection.'};
  const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  run.snapshot={reference:report,cycle,data,revision,period_proof,created_at:new Date().toISOString()};
  return {success:true,status,snapshot:run.snapshot};
}

export const DEEP_PAGE_CODE=STRATEGY_PAGE_CODE+'\n'+[canonicalPineSource,findPineController,findPineEditor,verifyDeepSource,nativeDeepToolkit,nativeKernelMatchesChart,ownedDeepContext,installDeepAttribution,findDeepReportProviders,deepCurrentIdentity,inspectDeepRun,inspectDeepSettlement,startDeepRun,deepReportSnapshot].map(fn=>fn.toString()).join('\n');

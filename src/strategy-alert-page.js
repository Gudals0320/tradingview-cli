import {DEEP_PAGE_CODE,verifyDeepSource,deepCurrentIdentity} from './deep-backtest-page.js';
import {pageStrategies,readStrategyReport} from './strategy-state.js';

/** Discover already loaded native exports; unsupported shapes fail closed. */
export function strategyAlertToolkit(window){
  const wanted=['getAlertsCollection','getEditorStateForAlertFromStudy','getAlertsRestApi','getAlertSession','convertEditableAlertState','convertApiAlert','StudyMetaInfo','decodeExtendedSymbol','deriveSymbolStyle'],ids={};
  for(const chunk of window.webpackChunktradingview||[])for(const [id,factory]of Object.entries(chunk[1]||{})){const text=String(factory);for(const name of wanted)if(text.includes(name+':()=>'))(ids[name]??=new Set()).add(id);}
  if(wanted.some(name=>!ids[name]))return null;let runtime;window.webpackChunktradingview.push([['tv-cli-alert-read-'+Date.now()],{},r=>{runtime=r;}]);
  const exports={};for(const name of wanted){for(const id of ids[name]){const candidate=runtime(id)[name];if(typeof candidate!=='function')continue;if(exports[name]&&exports[name]!==candidate)return null;exports[name]=candidate;}}
  if(!wanted.every(name=>typeof exports[name]==='function')||typeof exports.StudyMetaInfo.cutDollarHash!=='function'||typeof exports.StudyMetaInfo.getStudyIdWithLatestVersion!=='function')return null;
  const consumers=new Map();for(const chunk of window.webpackChunktradingview||[])for(const [id,factory]of Object.entries(chunk[1]||{})){const code=String(factory),match=code.match(/\w+=(\w+)\.fetch,async/);if(code.includes('getAlertsRestApi:()=>')&&match){if(runtime(id).getAlertsRestApi!==exports.getAlertsRestApi)return null;const dependency=code.match(new RegExp(match[1]+'=\\w+\\((\\d+)\\)'))?.[1];if(!dependency||consumers.has(id)&&consumers.get(id)!==dependency)return null;consumers.set(id,dependency);}}
  if(consumers.size!==1)return null;const fetchId=[...consumers.values()][0];
  if(!fetchId)return null;exports.native_fetch=runtime(fetchId).fetch;
  return typeof exports.native_fetch==='function'?exports:null;
}

export function strategyAlertDto(state,request,resolution){
  const modes={fills:'strategy',alerts:'alerts',both:'strategy_and_alerts'};
  if(!modes[request.mode]||!state||state.type!=='strategy'||!state.pineId||!state.pineVersion||!state.studyId)return null;
  if(!state.inputs||typeof state.inputs!=='object'||Array.isArray(state.inputs)||!/^\d+(?:S|D|W|M)?$/.test(resolution))return null;
  if(request.mode!=='fills'&&!state.hasAlertFunction)return null;
  if(Object.values(state.inputs).some(value=>value&&typeof value==='object'))return null;
  if(Object.values(state.inputs).some(value=>value===undefined||typeof value==='number'&&!Number.isFinite(value)))return null;
  return {symbol:state.symbol,resolution,name:request.server_name,message:request.message,conditions:[{type:'strategy',strategyMode:modes[request.mode],resolution,series:[{type:'study',study:state.studyId,inputs:state.inputs,pineId:state.pineId,pineVersion:state.pineVersion}]}],expirationPolicy:{policy:'fixed_date',time:new Date(request.expiration)},autoDeactivate:false,popup:false,email:false,smsOverEmail:false,mobilePush:false,soundFile:null,soundDuration:0,webhook:null,notificationSchedule:null};
}

export function ownedStrategyAlertTarget(window,source,toolkit){
  try{
    const main=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries(),raw=source.stateForAlert(),meta=source.metaInfo();
    if(source.series()!==main||raw.fullId!==meta.fullId)return null;
    const engine=toolkit.StudyMetaInfo.cutDollarHash(meta.fullId),kernel=toolkit.StudyMetaInfo.getStudyIdWithLatestVersion(meta);
    if(source._getStudyIdWithLatestVersion()!==kernel||toolkit.StudyMetaInfo.cutDollarHash(raw.fullId)!==engine)return null;
    return JSON.parse(JSON.stringify({engine,kernel,symbol:toolkit.decodeExtendedSymbol(main.getAlertSymbolString()),resolution:main.interval(),document_id:raw.scriptIdPart,document_version:String(raw.scriptVersion),has_alert_function:raw.hasAlertFunction===true}));
  }catch{return null;}
}

export async function prepareStrategyAlert(window,document,request){
  const summary=readStrategyReport(window,{strategy_id:request.strategy_id});if(!summary.success)return {...summary,mutation_dispatched:false};
  const sourceProof=await verifyDeepSource(window,document,summary.strategy_id);if(!sourceProof.verified)return {success:false,code:'STRATEGY_ALERT_SOURCE_UNVERIFIED',mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const collection=toolkit.getAlertsCollection();await collection.ensureLoadedAlerts('editor');
  if(collection.readyState?.().value?.()?.status!=='ready')return {success:false,code:'STRATEGY_ALERT_SESSION_UNREADY',mutation_dispatched:false};
  const item=pageStrategies(window).find(s=>s.id===summary.strategy_id),state=toolkit.getEditorStateForAlertFromStudy(item.source),dto=strategyAlertDto(state,request,summary.context.resolution);
  if(!dto)return {success:false,code:'STRATEGY_ALERT_SNAPSHOT_UNSUPPORTED',error:'Exact native strategy, alert() capability or simple input mapping is unavailable.',mutation_dispatched:false};
  const target=ownedStrategyAlertTarget(window,item.source,toolkit);
  if(!target||target.resolution!==summary.context.resolution||target.document_id!==sourceProof.document_id||target.document_version!==sourceProof.document_version||state.studyId!==target.engine||request.mode!=='fills'&&!target.has_alert_function||!strategyAlertFieldsMatch(state.symbol,target.symbol)||!strategyAlertFieldsMatch(target.symbol,state.symbol))return {success:false,code:'STRATEGY_ALERT_TARGET_UNVERIFIED',mutation_dispatched:false};
  if(state.pineId!==sourceProof.document_id||String(state.pineVersion)!==sourceProof.document_version||Object.keys(state.inputs).length!==item.inputs.length||item.inputs.some(input=>JSON.stringify(state.inputs[input.id])!==JSON.stringify(input.value)))return {success:false,code:'STRATEGY_ALERT_SNAPSHOT_UNVERIFIED',mutation_dispatched:false};
  const user=toolkit.getAlertSession().user.value();if(!user||!['string','number'].includes(typeof user.id)||!String(user.id))return {success:false,code:'STRATEGY_ALERT_ACCOUNT_UNAVAILABLE',mutation_dispatched:false};
  const account_hash=Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(user.id)))),b=>b.toString(16).padStart(2,'0')).join('');
  const afterProof=await verifyDeepSource(window,document,summary.strategy_id);if(JSON.stringify(afterProof)!==JSON.stringify(sourceProof)||JSON.stringify(ownedStrategyAlertTarget(window,item.source,toolkit))!==JSON.stringify(target)||toolkit.getAlertSession().user.value()?.id!==user.id)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
  const wire=JSON.parse(JSON.stringify(toolkit.convertEditableAlertState(dto,toolkit.getAlertSession().sendLegacyExpiration)));
  if(wire.web_hook!==null||wire.email!==false||wire.sms_over_email!==false||wire.mobile_push!==false||wire.popup!==false||wire.sound_file!==null)return {success:false,code:'STRATEGY_ALERT_NOTIFICATION_UNVERIFIED',mutation_dispatched:false};
  const native_payload=JSON.parse(JSON.stringify({...wire,active:true,ignore_warnings:true,symbol_style:toolkit.deriveSymbolStyle(dto.conditions)}));
  return {success:true,strategy_id:summary.strategy_id,source_proof:sourceProof,identity:deepCurrentIdentity(window,document,summary.strategy_id),account_hash,target,dto,wire,native_payload};
}

export async function strategyAlertHash(window,value){return Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}

export function strategyAlertFieldsMatch(actual,expected){
  if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((value,i)=>strategyAlertFieldsMatch(actual[i],value));
  if(expected&&typeof expected==='object')return actual&&typeof actual==='object'&&Object.keys(expected).every(key=>Object.hasOwn(actual,key)&&strategyAlertFieldsMatch(actual[key],expected[key]));
  return actual===expected;
}

/** Always use fresh native REST readback, never the collection's cached requestAlert. */
export async function readStrategyAlert(window,request,rawOverride){
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED'};
  const session=toolkit.getAlertSession(),userId=session.user.value()?.id;
  if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  let raw;try{raw=rawOverride??await (request.alert_id?toolkit.getAlertsRestApi().getAlerts({alert_ids:[request.alert_id]}):toolkit.getAlertsRestApi().listAlerts());}catch(error){return {success:false,code:'STRATEGY_ALERT_READBACK_FAILED',native_error_code:typeof error.code==='string'||typeof error.code==='number'?error.code:null};}
  if(!Array.isArray(raw))return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED'};
  const candidates=raw.filter(alert=>request.alert_id?String(alert.alert_id)===String(request.alert_id):alert.name===request.wire.name);
  if(candidates.length!==1)return {success:false,code:candidates.length?'STRATEGY_ALERT_AMBIGUOUS':'STRATEGY_ALERT_OUTCOME_UNKNOWN',replay_safe:false,mutation_dispatched:false};
  let actual,wire;try{actual=toolkit.convertApiAlert(candidates[0]);wire=JSON.parse(JSON.stringify(toolkit.convertEditableAlertState(actual,session.sendLegacyExpiration)));}catch{return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED'};}
  let requestedSymbol,actualSymbol,ownedWireSymbol;try{requestedSymbol=toolkit.decodeExtendedSymbol(request.wire.symbol);actualSymbol=toolkit.decodeExtendedSymbol(wire.symbol);ownedWireSymbol=toolkit.decodeExtendedSymbol(request.source_proof.semantic_context.wire.symbol);}catch{return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',result_adopted:false};}
  const exact=(actual,expected)=>strategyAlertFieldsMatch(actual,expected)&&strategyAlertFieldsMatch(expected,actual);
  const symbolValid=Object.keys(requestedSymbol).every(key=>Object.hasOwn(actualSymbol,key)&&exact(actualSymbol[key],requestedSymbol[key]))&&Object.keys(actualSymbol).every(key=>Object.hasOwn(requestedSymbol,key)||Object.hasOwn(ownedWireSymbol,key)&&exact(actualSymbol[key],ownedWireSymbol[key]));
  const expectedFields={...request.wire};delete expectedFields.symbol;
  if(actual.type!=='strategy'||!symbolValid||!strategyAlertFieldsMatch(wire,expectedFields)||typeof actual.active!=='boolean')return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',alert_id:actual.alertId,result_adopted:false};
  const expectedInputs=request.wire.conditions[0].series[0].inputs,actualInputs=wire.conditions?.[0]?.series?.[0]?.inputs;
  if(!actualInputs||Object.keys(actualInputs).length!==Object.keys(expectedInputs).length)return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',result_adopted:false};
  const message_hash=await strategyAlertHash(window,actual.message);
  if(session.user.value()?.id!==userId)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  return {success:true,alert_id:actual.alertId,active:actual.active,server_state_changed:actual.active!==request.active,type:actual.type,mode:request.mode,name:actual.name,expiration:wire.expiration??wire.expiration_policy?.time??null,message_hash,message_body:'omitted',readback:'fresh_native_rest',settings_verified:true,server_added_symbol_fields:Object.fromEntries(Object.entries(actualSymbol).filter(([key])=>!Object.hasOwn(requestedSymbol,key))),symbol_extras_verified_against:'pinned_owned_main_series_wire_symbol',webhook:null,external_notifications:false,snapshot_automatically_updated:false,server_event_observed:false};
}

/** Intercept the native request builder, preserve security checks, send once. */
export async function createStrategyAlert(window,document,request){
  const prepared=await prepareStrategyAlert(window,document,request);if(!prepared.success)return prepared;
  if(JSON.stringify(prepared.source_proof)!==JSON.stringify(request.source_proof)||!strategyAlertFieldsMatch(prepared.wire,request.wire)||prepared.account_hash!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window),rest=toolkit.getAlertsRestApi(),collection=toolkit.getAlertsCollection(),userId=toolkit.getAlertSession().user.value()?.id;
  if(typeof rest._fetch!=='function'||typeof window.fetch!=='function'||collection._restRequestsHandler?._restApi!==rest||typeof rest._options?.baseRestUrl!=='string'||typeof rest._options?.originUrl!=='string'||rest._options.backendOverride!==undefined)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const nativeTarget=new window.URL(rest._options.baseRestUrl+'/create_alert',rest._options.originUrl);
  const original=rest._fetch,identity=prepared.identity;let attempted=false,knownRejected=false,rejectionCode=null,diagnostic=null,readbackPhase=false,readbackId=null;
  const transport=async(url,options)=>{
    const target=new window.URL(url);
    if(target.origin!==nativeTarget.origin||target.pathname!==nativeTarget.pathname){
      const getPath=new window.URL(rest._options.baseRestUrl+'/get_alerts',rest._options.originUrl).pathname,listPath=new window.URL(rest._options.baseRestUrl+'/list_alerts',rest._options.originUrl).pathname;
      let validGet=false;try{const expected={payload:{alert_ids:[readbackId]}},actual=JSON.parse(options.body);validGet=strategyAlertFieldsMatch(actual,expected)&&strategyAlertFieldsMatch(expected,actual);}catch{/* Not a known native read shape. */}
      if(readbackPhase&&options.credentials==='include'&&options.headers===undefined&&target.origin===nativeTarget.origin&&(target.pathname===getPath&&options.method==='POST'&&validGet||target.pathname===listPath&&options.method==='GET'&&options.body===undefined))return original.call(rest,url,options);
      throw Error('STRATEGY_ALERT_NATIVE_PATH_CHANGED');
    }
    let envelope,payload;try{envelope=JSON.parse(options.body);payload=envelope.payload;}catch{throw Error('STRATEGY_ALERT_REQUEST_CHANGED');}
    const currentIdentity=deepCurrentIdentity(window,document,prepared.strategy_id),source=pageStrategies(window).find(s=>s.id===prepared.strategy_id)?.source,checks={name:payload?.name===request.server_name,method:options.method==='POST',single_attempt:!attempted,identity:currentIdentity===identity,target:JSON.stringify(ownedStrategyAlertTarget(window,source,toolkit))===JSON.stringify(prepared.target),account:toolkit.getAlertSession().user.value()?.id===userId,wire:!!strategyAlertFieldsMatch(payload,prepared.native_payload)&&!!strategyAlertFieldsMatch(prepared.native_payload,payload),native_options:typeof options.body==='string'&&Object.keys(envelope).join(',')==='payload'&&options.credentials==='include'&&options.headers===undefined&&Object.keys(options).every(key=>['method','body','credentials','signal','referrer','referrerPolicy'].includes(key))};
    if(Object.values(checks).some(value=>!value)){const before=JSON.parse(identity),after=JSON.parse(currentIdentity);diagnostic={checks,changed_identity_fields:Object.keys(before).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after?.[key]))};throw Error('STRATEGY_ALERT_REQUEST_CHANGED');}
    const body=JSON.stringify({payload:{...payload,active:request.active}});attempted=true;
    // The native SDK normally retries its _fetch. Its observed request builder
    // still supplies URL/auth/session/body; this one-attempt transport avoids
    // duplicate creates after an uncertain HTTP response.
    const started=Date.now(),send=toolkit.native_fetch,response=await send(url,{...options,body},{logBodyOnError:false});
    try{const result=await response.clone().json();if(result.s==='error'||result.err){knownRejected=true;rejectionCode=result.err?.code??null;diagnostic={server_rejection:{code:rejectionCode,message:typeof result.errmsg==='string'?result.errmsg:null}};}}catch{/* Invalid/lost response remains unknown. */}
    return {response,metrics:{delay:Date.now()-started,statusCode:response.status}};
  };
  rest._fetch=transport;
  try{
    return await (async()=>{
      let created;try{created=await collection.createAlert(prepared.dto,{checkSecurityIssues:true});}
      catch(error){return {success:false,code:!attempted?'STRATEGY_ALERT_NOT_DISPATCHED':knownRejected?'STRATEGY_ALERT_SERVER_REJECTED':'STRATEGY_ALERT_OUTCOME_UNKNOWN',native_error_code:rejectionCode??(typeof error.code==='string'||typeof error.code==='number'?error.code:null),native_error_class:['Error','TypeError','AlertsCollectionError','AlertsRestApiError'].includes(error.name)?error.name:'NativeError',...(diagnostic?{_private_diagnostic:diagnostic}:{}),mutation_dispatched:attempted,known_no_create:!attempted||knownRejected,replay_safe:false};}
      if(!attempted||!created?.alertId)return {success:false,code:'STRATEGY_ALERT_OUTCOME_UNKNOWN',mutation_dispatched:true,replay_safe:false};
      readbackPhase=true;
      readbackId=created.alertId;
      const read=await readStrategyAlert(window,{...request,alert_id:created.alertId});
      if(!read.success||read.active!==request.active)return {...read,success:false,code:read.code||'STRATEGY_ALERT_ACTIVE_UNVERIFIED',alert_id:created.alertId,mutation_dispatched:true,replay_safe:false};
      return {...read,created:true,mutation_dispatched:true,snapshot_stale:deepCurrentIdentity(window,document,prepared.strategy_id)!==identity};
    })();
  }finally{if(rest._fetch===transport)rest._fetch=original;}
}

export async function observeStrategyAlertAction(window,request){
  if(request.action!=='delete'){const result=await readStrategyAlert(window,request);return {...result,desired_state_verified:result.success&&result.active===(request.action==='resume')};}
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED'};
  const userId=toolkit.getAlertSession().user.value()?.id;if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  let raw;try{raw=await toolkit.getAlertsRestApi().getAlerts({alert_ids:[request.alert_id]});}catch(error){return {success:false,code:'STRATEGY_ALERT_READBACK_FAILED',native_error_code:typeof error.code==='string'||typeof error.code==='number'?error.code:null,desired_state_verified:false};}
  if(toolkit.getAlertSession().user.value()?.id!==userId||!Array.isArray(raw))return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED'};
  if(raw.length===0)return {success:true,alert_id:request.alert_id,deleted:true,desired_state_verified:true,readback:'fresh_native_rest'};
  return {success:false,code:'STRATEGY_ALERT_ACTION_UNCONFIRMED',alert_id:request.alert_id,desired_state_verified:false};
}

export async function compareStrategyAlertSnapshot(window,document,request){
  const report=readStrategyReport(window,{});if(!report.success)return {snapshot_stale:null,current_snapshot:{verified:false,code:report.code}};
  const proof=await verifyDeepSource(window,document,report.strategy_id);if(!proof.verified)return {snapshot_stale:null,current_snapshot:{verified:false,code:'STRATEGY_ALERT_CURRENT_SOURCE_UNVERIFIED'}};
  const old=request.source_proof,changes={document:proof.document_id!==old.document_id||proof.document_version!==old.document_version,source:proof.source_hash!==old.source_hash,inputs:proof.inputs_fingerprint!==old.inputs_fingerprint,properties:proof.properties_fingerprint!==old.properties_fingerprint,context:JSON.stringify(proof.semantic_context)!==JSON.stringify(old.semantic_context)};
  return {snapshot_stale:Object.values(changes).some(Boolean),current_snapshot:{verified:true,changes,source_hash:proof.source_hash,document_version:proof.document_version},snapshot_automatically_updated:false};
}

export async function mutateStrategyAlert(window,request){
  if(!['pause','resume','delete'].includes(request.action)||!request.alert_id)return {success:false,code:'INVALID_STRATEGY_ALERT_ACTION',mutation_dispatched:false};
  const before=await readStrategyAlert(window,request);if(!before.success)return {...before,mutation_dispatched:false};
  if(request.action!=='delete'&&before.active===(request.action==='resume'))return {...before,success:true,desired_state_verified:true,performed:false,mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window),rest=toolkit.getAlertsRestApi(),method={pause:'stopAlerts',resume:'restartAlerts',delete:'deleteAlerts'}[request.action],path={pause:'/stop_alerts',resume:'/restart_alerts',delete:'/delete_alerts'}[request.action];
  if(typeof rest[method]!=='function'||typeof rest._fetch!=='function')return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const original=rest._fetch,userId=toolkit.getAlertSession().user.value()?.id,target=new window.URL(rest._options.baseRestUrl+path,rest._options.originUrl);let attempted=false,knownRejected=false,rejectionCode=null;
  if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash||toolkit.getAlertSession().user.value()?.id!==userId)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED',mutation_dispatched:false};
  const transport=async(url,options)=>{
    const actual=new window.URL(url),expected={payload:{alert_ids:[request.alert_id]}};let body;try{body=JSON.parse(options.body);}catch{throw Error('STRATEGY_ALERT_REQUEST_CHANGED');}
    if(actual.origin!==target.origin||actual.pathname!==target.pathname||attempted||options.method!=='POST'||options.credentials!=='include'||options.headers!==undefined||toolkit.getAlertSession().user.value()?.id!==userId||!strategyAlertFieldsMatch(body,expected)||!strategyAlertFieldsMatch(expected,body))throw Error('STRATEGY_ALERT_REQUEST_CHANGED');
    attempted=true;const start=Date.now(),send=toolkit.native_fetch,response=await send(url,options,{logBodyOnError:false});
    try{const value=await response.clone().json();if(value.err){knownRejected=true;rejectionCode=value.err.code??null;}}catch{/* An invalid response preserves uncertainty. */}
    return {response,metrics:{delay:Date.now()-start,statusCode:response.status}};
  };
  rest._fetch=transport;
  try{try{await rest[method]({alert_ids:[request.alert_id]});}catch{return {success:false,code:!attempted?'STRATEGY_ALERT_NOT_DISPATCHED':knownRejected?'STRATEGY_ALERT_SERVER_REJECTED':'STRATEGY_ALERT_ACTION_UNKNOWN',native_error_code:rejectionCode,mutation_dispatched:attempted,known_no_mutation:!attempted||knownRejected,replay_safe:false};}}
  finally{if(rest._fetch===transport)rest._fetch=original;}
  if(!attempted)return {success:false,code:'STRATEGY_ALERT_ACTION_UNKNOWN',mutation_dispatched:true,replay_safe:false};
  const after=await observeStrategyAlertAction(window,request);return {...after,success:after.success&&after.desired_state_verified===true,code:after.desired_state_verified?undefined:after.code||'STRATEGY_ALERT_ACTION_UNCONFIRMED',performed:true,mutation_dispatched:true};
}

export async function readStrategyAlertFires(window,request){
  const toolkit=strategyAlertToolkit(window);if(!toolkit||typeof toolkit.getAlertsRestApi().listFires!=='function')return {success:false,code:'STRATEGY_ALERT_LOG_UNSUPPORTED'};
  const userId=toolkit.getAlertSession().user.value()?.id;if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  let rows;try{rows=await toolkit.getAlertsRestApi().listFires({alert_ids:[request.alert_id],limit:request.limit,...(request.before!==undefined?{before:request.before}:{})});}catch(error){return {success:false,code:'STRATEGY_ALERT_LOG_FAILED',native_error_code:typeof error.code==='string'||typeof error.code==='number'?error.code:null};}
  if(!Array.isArray(rows)||rows.length>request.limit)return {success:false,code:'STRATEGY_ALERT_LOG_UNVERIFIED'};
  const data=[],seen=new Set();let previousId=request.before??Infinity;for(const row of rows){
    const id=Number(row.fire_id),time=typeof row.fire_time==='number'?row.fire_time:typeof row.fire_time==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(row.fire_time)?Date.parse(row.fire_time):NaN;
    if(typeof row.fire_time==='string'){const match=row.fire_time.match(/^(\d{4})-(\d\d)-(\d\d)T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/);if(!match||Number(match[2])<1||Number(match[2])>12||Number(match[3])<1||Number(match[3])>new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate())return {success:false,code:'STRATEGY_ALERT_LOG_UNVERIFIED'};}
    if(String(row.alert_id)!==String(request.alert_id)||!['number','string'].includes(typeof row.fire_id)||typeof row.fire_id==='string'&&!/^\d+$/.test(row.fire_id)||!Number.isSafeInteger(id)||id<0||id>=previousId||seen.has(id)||!Number.isSafeInteger(time)||!Number.isFinite(new Date(time).getTime())||typeof row.message!=='string')return {success:false,code:'STRATEGY_ALERT_LOG_UNVERIFIED'};
    previousId=id;
    seen.add(id);
    data.push({fire_id:String(row.fire_id),alert_id:row.alert_id,event_time:new Date(time).toISOString(),event_time_ms:time,message_hash:await strategyAlertHash(window,row.message),message_body:'omitted',record_kind:'tv_internal_alert_fire',broker_execution_verified:false});
  }
  if(toolkit.getAlertSession().user.value()?.id!==userId)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  const full=rows.length===request.limit,times=data.map(row=>row.event_time_ms);
  return {success:true,alert_id:request.alert_id,data,count:data.length,limit:request.limit,before:request.before??null,next_before:full?Number(rows.at(-1).fire_id):null,page_full:full,end_of_observed_log:!full,coverage_completeness:full?'unknown':'server_returned_short_page',observed_window:times.length?{from:new Date(Math.min(...times)).toISOString(),to:new Date(Math.max(...times)).toISOString()}:null,observed_at:new Date().toISOString(),truncated:false,source:'native_rest_list_fires',external_delivery:'out_of_scope',timestamp_contract:'native alert-log Date(value): numeric milliseconds or explicit-offset ISO strings'};
}

export async function prepareStrategyAlertUpdate(window,request){
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const rest=toolkit.getAlertsRestApi(),session=toolkit.getAlertSession();
  let rows;try{rows=await rest.getAlerts({alert_ids:[request.alert_id]});}catch{return {success:false,code:'STRATEGY_ALERT_READBACK_FAILED',mutation_dispatched:false};}
  if(!Array.isArray(rows)||rows.length!==1||String(rows[0].alert_id)!==String(request.alert_id))return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',mutation_dispatched:false};
  const before=await readStrategyAlert(window,request,rows);if(!before.success)return {...before,mutation_dispatched:false};
  const dto=toolkit.convertApiAlert(rows[0]),changes=request.changes;
  if(changes.name!==undefined)dto.name=changes.name+' [tv:'+request.run_id+']';
  if(changes.message!==undefined)dto.message=changes.message;
  if(changes.expiration!==undefined)dto.expirationPolicy={policy:'fixed_date',time:new Date(changes.expiration)};
  const wire=JSON.parse(JSON.stringify(toolkit.convertEditableAlertState(dto,session.sendLegacyExpiration)));
  const unchanged={...request.wire};delete unchanged.name;delete unchanged.message;delete unchanged.expiration;delete unchanged.expiration_policy;delete unchanged.symbol;
  if(!strategyAlertFieldsMatch(wire,unchanged)||!strategyAlertFieldsMatch(dto.symbol,toolkit.decodeExtendedSymbol(request.wire.symbol))||wire.web_hook!==null)return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',mutation_dispatched:false};
  return {success:true,wire,dto};
}

export async function updateStrategyAlert(window,request){
  const prepared=await prepareStrategyAlertUpdate(window,request);if(!prepared.success)return prepared;
  const exact=(a,b)=>strategyAlertFieldsMatch(a,b)&&strategyAlertFieldsMatch(b,a);
  if(!exact(prepared.wire,request.update_wire))return {success:false,code:'STRATEGY_ALERT_UPDATE_CHANGED',mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window),collection=toolkit.getAlertsCollection(),rest=toolkit.getAlertsRestApi(),handler=collection._restRequestsHandler;
  if(handler?._restApi!==rest||typeof handler._buildModifyRestartParams!=='function'||typeof collection.modifyRestartAlert!=='function'||typeof rest._fetch!=='function'||rest._options?.backendOverride!==undefined)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  await collection.ensureLoadedAlerts('editor');await collection.requestAlert(request.alert_id);
  const userId=toolkit.getAlertSession().user.value()?.id;
  if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED',mutation_dispatched:false};
  const target=new window.URL(rest._options.baseRestUrl+'/modify_restart_alert',rest._options.originUrl),original=rest._fetch,builder=handler._buildModifyRestartParams;
  let expected=null,attempted=false,knownRejected=false,diagnostic=null;
  handler._buildModifyRestartParams=function(dto,id){const built=builder.call(this,dto,id),base=JSON.parse(JSON.stringify({...prepared.wire,active:true,ignore_warnings:true,alert_id:request.alert_id,symbol_style:toolkit.deriveSymbolStyle(dto.conditions)})),withoutClient={...built};delete withoutClient.client_id;
    const checks={alert_id:id===request.alert_id,wire:exact(JSON.parse(JSON.stringify(withoutClient)),base),client_id:['string','number'].includes(typeof built.client_id)&&!!String(built.client_id)};
    if(Object.values(checks).some(value=>!value)){diagnostic={stage:'native_builder',checks,changed_fields:[...new Set([...Object.keys(base),...Object.keys(withoutClient)])].filter(key=>!exact(withoutClient[key],base[key]))};throw Error('STRATEGY_ALERT_UPDATE_CHANGED');}expected=JSON.parse(JSON.stringify({payload:built}));return built;};
  rest._fetch=async(url,options)=>{
    let body;try{body=JSON.parse(options.body);}catch{throw Error('STRATEGY_ALERT_UPDATE_CHANGED');}
    const actual=new window.URL(url);
    if(!expected||!exact(body,expected)||attempted||actual.origin!==target.origin||actual.pathname!==target.pathname||actual.search||options.method!=='POST'||options.credentials!=='include'||options.headers!==undefined||toolkit.getAlertSession().user.value()?.id!==userId)throw Error('STRATEGY_ALERT_UPDATE_CHANGED');
    attempted=true;const start=Date.now(),response=await toolkit.native_fetch(url,options,{logBodyOnError:false});try{const value=await response.clone().json();knownRejected=value.s==='error'||!!value.err;}catch{/* Unknown response remains unknown. */}
    return {response,metrics:{delay:Date.now()-start,statusCode:response.status}};
  };
  try{await collection.modifyRestartAlert(request.alert_id,prepared.dto,{checkSecurityIssues:true});}
  catch(error){return {success:false,code:!attempted?'STRATEGY_ALERT_NOT_DISPATCHED':knownRejected?'STRATEGY_ALERT_SERVER_REJECTED':'STRATEGY_ALERT_UPDATE_UNKNOWN',native_error_code:typeof error.code==='string'||typeof error.code==='number'?error.code:null,_private_diagnostic:diagnostic||{stage:'native_call',code:error.code??null,error_class:error.name},mutation_dispatched:attempted,known_no_mutation:!attempted||knownRejected,replay_safe:false};}
  finally{rest._fetch=original;handler._buildModifyRestartParams=builder;}
  if(!attempted)return {success:false,code:'STRATEGY_ALERT_UPDATE_UNKNOWN',mutation_dispatched:false};
  const after=await readStrategyAlert(window,{...request,wire:request.update_wire,active:true});return {...after,success:after.success&&after.active===true,code:after.success&&after.active===true?undefined:after.code||'STRATEGY_ALERT_UPDATE_UNVERIFIED',mutation_dispatched:true,restarted:true,snapshot_automatically_updated:false};
}

export const STRATEGY_ALERT_PAGE_CODE=DEEP_PAGE_CODE+'\n'+[strategyAlertToolkit,strategyAlertDto,ownedStrategyAlertTarget,prepareStrategyAlert,strategyAlertHash,strategyAlertFieldsMatch,readStrategyAlert,createStrategyAlert,observeStrategyAlertAction,compareStrategyAlertSnapshot,mutateStrategyAlert,readStrategyAlertFires,prepareStrategyAlertUpdate,updateStrategyAlert].map(fn=>fn.toString()).join('\n');

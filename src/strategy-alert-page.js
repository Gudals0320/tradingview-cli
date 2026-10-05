import {DEEP_PAGE_CODE,verifyDeepSource,deepCurrentIdentity} from './deep-backtest-page.js';
import {pageStrategies,readStrategyReport} from './strategy-state.js';

/** Discover already loaded native exports; unsupported shapes fail closed. */
export function strategyAlertToolkit(window){
  const wanted=['getAlertsCollection','getEditorStateForAlertFromStudy','getAlertsRestApi','getAlertSession','convertEditableAlertState','convertApiAlert'],ids={};
  for(const chunk of window.webpackChunktradingview||[])for(const [id,factory]of Object.entries(chunk[1]||{})){const text=String(factory);for(const name of wanted)if(text.includes(name+':()=>'))(ids[name]??=new Set()).add(id);}
  if(wanted.some(name=>!ids[name]))return null;let runtime;window.webpackChunktradingview.push([['tv-cli-alert-read-'+Date.now()],{},r=>{runtime=r;}]);
  const exports={};for(const name of wanted){for(const id of ids[name]){const candidate=runtime(id)[name];if(typeof candidate!=='function')continue;if(exports[name]&&exports[name]!==candidate)return null;exports[name]=candidate;}}
  return wanted.every(name=>typeof exports[name]==='function')?exports:null;
}

export function strategyAlertDto(state,request,resolution){
  const modes={fills:'strategy',alerts:'alerts',both:'strategy_and_alerts'};
  if(!modes[request.mode]||!state||state.type!=='strategy'||!state.pineId||!state.pineVersion||!state.studyId)return null;
  if(!state.inputs||typeof state.inputs!=='object'||Array.isArray(state.inputs)||!/^\d+(?:S|D|W|M)?$/.test(resolution))return null;
  if(request.mode!=='fills'&&!state.hasAlertFunction)return null;
  if(Object.values(state.inputs).some(value=>value&&typeof value==='object'))return null;
  return {symbol:state.symbol,resolution,name:request.server_name,message:request.message,conditions:[{type:'strategy',strategyMode:modes[request.mode],resolution,series:[{type:'study',study:state.studyId,inputs:state.inputs,pineId:state.pineId,pineVersion:state.pineVersion}]}],expirationPolicy:{policy:'fixed_date',time:new Date(request.expiration)},autoDeactivate:false,popup:false,email:false,smsOverEmail:false,mobilePush:false,soundFile:null,soundDuration:0,webhook:null,notificationSchedule:null};
}

export async function prepareStrategyAlert(window,document,request){
  const summary=readStrategyReport(window,{strategy_id:request.strategy_id});if(!summary.success)return {...summary,mutation_dispatched:false};
  const sourceProof=await verifyDeepSource(window,document,summary.strategy_id);if(!sourceProof.verified)return {success:false,code:'STRATEGY_ALERT_SOURCE_UNVERIFIED',mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const collection=toolkit.getAlertsCollection();await collection.ensureLoadedAlerts('editor');
  if(collection.readyState?.().value?.()?.status!=='ready')return {success:false,code:'STRATEGY_ALERT_SESSION_UNREADY',mutation_dispatched:false};
  const item=pageStrategies(window).find(s=>s.id===summary.strategy_id),state=toolkit.getEditorStateForAlertFromStudy(item.source),dto=strategyAlertDto(state,request,summary.context.resolution);
  if(!dto)return {success:false,code:'STRATEGY_ALERT_SNAPSHOT_UNSUPPORTED',error:'Exact native strategy, alert() capability or simple input mapping is unavailable.',mutation_dispatched:false};
  if(state.pineId!==sourceProof.document_id||String(state.pineVersion)!==sourceProof.document_version||Object.keys(state.inputs).length!==item.inputs.length||item.inputs.some(input=>JSON.stringify(state.inputs[input.id])!==JSON.stringify(input.value)))return {success:false,code:'STRATEGY_ALERT_SNAPSHOT_UNVERIFIED',mutation_dispatched:false};
  const user=toolkit.getAlertSession().user.value();if(!user||!['string','number'].includes(typeof user.id)||!String(user.id))return {success:false,code:'STRATEGY_ALERT_ACCOUNT_UNAVAILABLE',mutation_dispatched:false};
  const account_hash=Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(user.id)))),b=>b.toString(16).padStart(2,'0')).join('');
  const afterProof=await verifyDeepSource(window,document,summary.strategy_id);if(JSON.stringify(afterProof)!==JSON.stringify(sourceProof)||toolkit.getAlertSession().user.value()?.id!==user.id)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
  const wire=toolkit.convertEditableAlertState(dto,toolkit.getAlertSession().sendLegacyExpiration);
  if(wire.web_hook!==null||wire.email!==false||wire.sms_over_email!==false||wire.mobile_push!==false||wire.popup!==false||wire.sound_file!==null)return {success:false,code:'STRATEGY_ALERT_NOTIFICATION_UNVERIFIED',mutation_dispatched:false};
  return {success:true,strategy_id:summary.strategy_id,source_proof:sourceProof,identity:deepCurrentIdentity(window,document,summary.strategy_id),account_hash,dto,wire};
}

export async function strategyAlertHash(window,value){return Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}

export function strategyAlertFieldsMatch(actual,expected){
  if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((value,i)=>strategyAlertFieldsMatch(actual[i],value));
  if(expected&&typeof expected==='object')return actual&&typeof actual==='object'&&Object.keys(expected).every(key=>Object.hasOwn(actual,key)&&strategyAlertFieldsMatch(actual[key],expected[key]));
  return actual===expected;
}

/** Always use fresh native REST readback, never the collection's cached requestAlert. */
export async function readStrategyAlert(window,request){
  const toolkit=strategyAlertToolkit(window);if(!toolkit)return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED'};
  const session=toolkit.getAlertSession(),userId=session.user.value()?.id;
  if(userId===undefined||await strategyAlertHash(window,String(userId))!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  let raw;try{raw=await (request.alert_id?toolkit.getAlertsRestApi().getAlerts({alert_ids:[request.alert_id]}):toolkit.getAlertsRestApi().listAlerts());}catch(error){return {success:false,code:'STRATEGY_ALERT_READBACK_FAILED',native_error_code:typeof error.code==='string'||typeof error.code==='number'?error.code:null};}
  if(!Array.isArray(raw))return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED'};
  const candidates=raw.filter(alert=>request.alert_id?String(alert.alert_id)===String(request.alert_id):alert.name===request.wire.name);
  if(candidates.length!==1)return {success:false,code:candidates.length?'STRATEGY_ALERT_AMBIGUOUS':'STRATEGY_ALERT_OUTCOME_UNKNOWN',replay_safe:false,mutation_dispatched:false};
  let actual,wire;try{actual=toolkit.convertApiAlert(candidates[0]);wire=toolkit.convertEditableAlertState(actual,session.sendLegacyExpiration);}catch{return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED'};}
  if(actual.type!=='strategy'||!strategyAlertFieldsMatch(wire,request.wire)||typeof actual.active!=='boolean')return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',alert_id:actual.alertId,result_adopted:false};
  const expectedInputs=request.wire.conditions[0].series[0].inputs,actualInputs=wire.conditions?.[0]?.series?.[0]?.inputs;
  if(!actualInputs||Object.keys(actualInputs).length!==Object.keys(expectedInputs).length)return {success:false,code:'STRATEGY_ALERT_READBACK_UNVERIFIED',result_adopted:false};
  const message_hash=await strategyAlertHash(window,actual.message);
  if(session.user.value()?.id!==userId)return {success:false,code:'STRATEGY_ALERT_ACCOUNT_CHANGED'};
  return {success:true,alert_id:actual.alertId,active:actual.active,server_state_changed:actual.active!==request.active,type:actual.type,mode:request.mode,name:actual.name,expiration:wire.expiration??wire.expiration_policy?.time??null,message_hash,message_body:'omitted',readback:'fresh_native_rest',settings_verified:true,webhook:null,external_notifications:false,snapshot_automatically_updated:false,server_event_observed:false};
}

/** Intercept the native request builder, preserve security checks, send once. */
export async function createStrategyAlert(window,document,request){
  const prepared=await prepareStrategyAlert(window,document,request);if(!prepared.success)return prepared;
  if(JSON.stringify(prepared.source_proof)!==JSON.stringify(request.source_proof)||!strategyAlertFieldsMatch(prepared.wire,request.wire)||prepared.account_hash!==request.account_hash)return {success:false,code:'STRATEGY_ALERT_SOURCE_CHANGED',mutation_dispatched:false};
  const toolkit=strategyAlertToolkit(window),rest=toolkit.getAlertsRestApi(),collection=toolkit.getAlertsCollection(),userId=toolkit.getAlertSession().user.value()?.id;
  if(typeof rest._fetch!=='function'||typeof window.fetch!=='function')return {success:false,code:'STRATEGY_ALERT_NATIVE_UNSUPPORTED',mutation_dispatched:false};
  const original=rest._fetch,identity=prepared.identity;let attempted=false,knownRejected=false,rejectionCode=null;
  const transport=async(url,options)=>{
    if(new window.URL(url).pathname!=='/create_alert')return original.call(rest,url,options);
    let payload;try{payload=JSON.parse(options.body).payload;}catch{throw Error('STRATEGY_ALERT_REQUEST_CHANGED');}
    if(payload?.name!==request.server_name||options.method!=='POST'||attempted||deepCurrentIdentity(window,document,prepared.strategy_id)!==identity||toolkit.getAlertSession().user.value()?.id!==userId||!strategyAlertFieldsMatch(payload,prepared.wire))throw Error('STRATEGY_ALERT_REQUEST_CHANGED');
    const body=JSON.stringify({payload:{...payload,active:request.active}});attempted=true;
    // The native SDK normally retries its _fetch. Its observed request builder
    // still supplies URL/auth/session/body; this one-attempt transport avoids
    // duplicate creates after an uncertain HTTP response.
    const started=Date.now(),response=await window.fetch(url,{...options,body,headers:{...options.headers,'Content-Type':'text/plain;charset=UTF-8'}});
    try{const result=await response.clone().json();if(result.s==='error'||result.err){knownRejected=true;rejectionCode=result.err?.code??null;}}catch{/* Invalid/lost response remains unknown. */}
    return {response,metrics:{delay:Date.now()-started,statusCode:response.status}};
  };
  rest._fetch=transport;
  try{
    return await (async()=>{
      let created;try{created=await collection.createAlert(prepared.dto,{checkSecurityIssues:true});}
      catch{return {success:false,code:!attempted?'STRATEGY_ALERT_NOT_DISPATCHED':knownRejected?'STRATEGY_ALERT_SERVER_REJECTED':'STRATEGY_ALERT_OUTCOME_UNKNOWN',native_error_code:rejectionCode,mutation_dispatched:attempted,known_no_create:!attempted||knownRejected,replay_safe:false};}
      if(!attempted||!created?.alertId)return {success:false,code:'STRATEGY_ALERT_OUTCOME_UNKNOWN',mutation_dispatched:true,replay_safe:false};
      const read=await readStrategyAlert(window,{...request,alert_id:created.alertId});
      if(!read.success||read.active!==request.active)return {...read,success:false,code:read.code||'STRATEGY_ALERT_ACTIVE_UNVERIFIED',alert_id:created.alertId,mutation_dispatched:true,replay_safe:false};
      return {...read,created:true,mutation_dispatched:true,snapshot_stale:deepCurrentIdentity(window,document,prepared.strategy_id)!==identity};
    })();
  }finally{if(rest._fetch===transport)rest._fetch=original;}
}

export const STRATEGY_ALERT_PAGE_CODE=DEEP_PAGE_CODE+'\n'+[strategyAlertToolkit,strategyAlertDto,prepareStrategyAlert,strategyAlertHash,strategyAlertFieldsMatch,readStrategyAlert,createStrategyAlert].map(fn=>fn.toString()).join('\n');

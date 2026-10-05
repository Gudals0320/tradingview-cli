import {equityPage} from './equity-page.mjs';

export function strategyAlertPage(){
  const p=equityPage(),server=new Map([[7,{alert_id:7,type:'price',name:'user alert',message:'private user message'}]]),user={id:123};
  p.window.URL=URL;
  let serial=100,posts=0,reads=0,securityChecks=0,lost=false,beforeSend=null,afterSend=null,rejection=null;
  const scalarInputs=()=>Object.fromEntries(p.chart.getStudyById('owned-study').getInputValues().map(i=>[i.id,i.value]));
  const session={user:{value:()=>user},sendLegacyExpiration:true};
  const convertEditableAlertState=dto=>({conditions:dto.conditions.map(c=>({type:c.type,strategy_mode:c.strategyMode,resolution:c.resolution,series:c.series.map(s=>({type:s.type,study:s.study,inputs:s.inputs,pine_id:s.pineId,pine_version:s.pineVersion}))})),symbol:'='+JSON.stringify(dto.symbol),resolution:dto.resolution,name:dto.name,message:dto.message,expiration:dto.expirationPolicy.time.toISOString(),auto_deactivate:dto.autoDeactivate,popup:dto.popup,email:dto.email,sms_over_email:dto.smsOverEmail,mobile_push:dto.mobilePush,sound_file:dto.soundFile,sound_duration:dto.soundDuration,web_hook:dto.webhook});
  const convertApiAlert=raw=>({...raw,alertId:raw.alert_id,symbol:JSON.parse(raw.symbol.slice(1)),conditions:raw.conditions.map(c=>({type:c.type,strategyMode:c.strategy_mode,resolution:c.resolution,series:c.series.map(s=>({type:s.type,study:s.study,inputs:s.inputs,pineId:s.pine_id,pineVersion:s.pine_version}))})),expirationPolicy:{policy:'fixed_date',time:new Date(raw.expiration)},autoDeactivate:raw.auto_deactivate,smsOverEmail:raw.sms_over_email,mobilePush:raw.mobile_push,soundFile:raw.sound_file,soundDuration:raw.sound_duration,webhook:raw.web_hook});
  p.window.fetch=async(url,options)=>{
    const path=new URL(url).pathname,payload=options?.body&&JSON.parse(options.body).payload;
    let result;
    if(path==='/create_alert'){posts++;if(rejection!==null)result={s:'error',err:{code:rejection},errmsg:'private server rejection details'};else{const id=++serial;server.set(id,structuredClone({...payload,alert_id:id,type:'strategy'}));afterSend?.();if(lost)throw Error('private response details must not escape');result={s:'ok',r:server.get(id)};}}
    else{reads++;result={s:'ok',r:path==='/get_alerts'?payload.alert_ids.map(id=>server.get(Number(id))).filter(Boolean):[...server.values()]};}
    const json=async()=>structuredClone(result);return {status:200,json,clone:()=>({json})};
  };
  const rest={_fetch:async(...args)=>{let last;for(let i=0;i<3;i++){try{const response=await p.window.fetch(...args);return {response,metrics:{statusCode:response.status,delay:0}};}catch(error){last=error;}}throw last;},async request(path,payload){const {response}=await this._fetch('https://pricealerts.tradingview.com/'+path,{method:payload?'POST':'GET',...(payload?{body:JSON.stringify({payload})}:{})});return (await response.json()).r;},createAlert(payload){return this.request('create_alert',payload);},getAlerts(payload){return this.request('get_alerts',payload);},listAlerts(){return this.request('list_alerts');}};
  const collection={readyState:()=>({value:()=>({status:'ready'})}),ensureLoadedAlerts:async()=>{},async createAlert(dto,options){if(options.checkSecurityIssues!==true)throw Error('security required');securityChecks++;await beforeSend?.();return convertApiAlert(await rest.createAlert({...convertEditableAlertState(dto),active:true,ignore_warnings:true,symbol_style:{style:1}}));}};
  const exports={getAlertsCollection:()=>collection,getAlertSession:()=>session,getAlertsRestApi:()=>rest,convertApiAlert,convertEditableAlertState,getEditorStateForAlertFromStudy:()=>({type:'strategy',pineId:'owned-document',pineVersion:'1',studyId:'StrategyScript@fixture',hasAlertFunction:true,symbol:{symbol:'FIXTURE:OWNED'},inputs:scalarInputs()})};
  const factory=Function('return function(e,t,n){n.d(t,{getAlertsCollection:()=>a,getAlertSession:()=>b,getAlertsRestApi:()=>c,convertApiAlert:()=>d,convertEditableAlertState:()=>f,getEditorStateForAlertFromStudy:()=>g});}')();
  const chunks=p.window.webpackChunktradingview||[];chunks.push([['alerts'],{alerts:factory}]);const originalPush=chunks.push;
  chunks.push=function(chunk){if(typeof chunk[2]==='function')chunk[2](id=>{if(id==='alerts')return exports;throw Error('unobserved native export');});return Array.prototype.push.call(this,chunk);};
  p.window.webpackChunktradingview=chunks;
  return {...p,server,user,rest,collection,counts:()=>({posts,reads,securityChecks}),loseResponse:()=>{lost=true;},rejectCreate:code=>{rejection=code;},beforeSend:fn=>{beforeSend=fn;},afterSend:fn=>{afterSend=fn;},originalPush};
}

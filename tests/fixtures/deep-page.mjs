import { propertiesPage } from './properties-page.mjs';
import { webcrypto } from 'node:crypto';
import { compilationState } from '../../src/strategy-state.js';
import { setImmediate } from 'node:timers';
export function deepPage(){
  const page=propertiesPage(),chart=page.chart;page.window.TradingViewApi.activeChart=()=>chart;chart.getTimezone=()=> 'UTC';chart.symbolExt=()=>({symbol:'FIXTURE:OWNED',session:'regular'});page.window.crypto=webcrypto;
  page.bind({id:'props-workspace',token:'props-token',layout:'fixture-layout',pine:'owned-document'});page.compile('compiled-deep-new');compilationState(page.window);
  const originalStudy=chart.getStudyById;chart.getStudyById=id=>{const study=originalStudy(id);return {...study,getInputValues:()=>study.getInputValues().map(i=>i.id==='pineVersion'?{...i,value:String(i.value)}:i)};};
  const originalMeta=page.source.metaInfo;
  const type=value=>typeof value==='boolean'?'bool':typeof value==='string'?'text':Number.isInteger(value)?'integer':'float';
  page.source.metaInfo=()=>({...originalMeta(),id:'FixtureStudy',inputs:chart.getStudyById('owned-study').getInputValues().map(i=>({...originalMeta().inputs.find(m=>m.id===i.id),id:i.id,type:type(i.value)}))});
  page.source._getStudyIdWithLatestVersion=()=> 'FixtureStudy';
  const series=chart._chartWidget.model().mainSeries();series.getSymbolString=()=> 'FIXTURE:OWNED';series.interval=()=> '60';
  page.bind({id:'props-workspace',token:'props-token',layout:'fixture-layout',pine:'owned-document'});page.compile();compilationState(page.window);
  const signal=value=>{let current=value;const listeners=[];return {value:()=>current,set:value=>{if(value===current)return;current=value;listeners.slice().forEach(fn=>fn(value));},subscribe:fn=>listeners.push(fn),unsubscribe:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}};};
  class Connection{constructor(){this.listeners=new Map();this._socket={};this.connected=true;this.frames=[];}getSessionId(){return JSON.stringify({session_id:'fixture-native-session'});}send(raw){if(!this.isConnected())return false;this.frames.push(raw);return true;}isConnected(){return Boolean(this._socket)&&this.connected;}isConnecting(){return false;}on(name,fn){if(!this._socket)return false;const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);return true;}emit(name,value){for(const fn of this.listeners.get(name)||[])fn(value);}}
  const unpack=async text=>JSON.parse(text);
  const data=signal(null),status=signal(null);let dispatches=0;
  const manager={_requestId:0,_sessionid:'fixture-native-session',_wsConnection:null,_activeStrategyInputs:{value:()=>({studyName:'FixtureStudy',inputs:Object.fromEntries(chart.getStudyById('owned-study').getInputValues().map(i=>[i.id,['text','pineId','pineVersion'].includes(i.id)?i.value:{v:i.value,f:true,t:type(i.value)}])),dependencies:[]})},_resolution:{value:()=>({value:()=> '60',isTicks:()=>false,isRange:()=>false})},_symbolString:{value:()=> 'FIXTURE:OWNED'},activeStrategyReportData:data,activeStrategyStatus:status,
    _sendRequest(method,args){if(this._wsConnection)this._wsConnection.send(JSON.stringify({m:method,p:args}));},_setData:report=>data.set(report),_bindListeners(){this._wsConnection.on('message',this._onMessage);},
    _onMessage:async raw=>{const message=JSON.parse(raw);if(message.m==='request_data'){const decoded=await unpack(message.p[2].ns.d);manager._setData(decoded.data.report);status.set({type:2});}else if(message.m.includes('error')){status.set({type:3,errorDescription:{error:'native rejection'}});manager._setData(null);}},
    requestData(from,to){this._fromDate=from;this._toDate=to;status.set({type:1});if(!this._wsConnection){this._wsConnection=new Connection();this._bindListeners();}else if(!this._wsConnection._socket){this._wsConnection._socket={};this._wsConnection.listeners.clear();this._bindListeners();}this._wsConnection.connected=true;const input=this._activeStrategyInputs.value();this._sendRequest('history_create_session',[this._sessionid]);this._sendRequest('request_history_data',[this._sessionid,this._requestId++,this._symbolString.value(),this._resolution.value().value(),0,{from_to:{from:Math.floor(from/1000),to:Math.floor(to/1000)}},input.studyName,input.inputs,input.dependencies]);dispatches++;},
  };
  const facade={_deepBacktestingManager:manager,_activeStrategy:{value:()=>({id:'owned-study'})},_isDeepBacktesting:false,setReportDataSource:value=>{facade._isDeepBacktesting=value;},resetDeepBacktestingReportData:()=>{data.set(null);status.set(null);if(manager._wsConnection){manager._wsConnection.connected=false;manager._wsConnection._socket=null;}},requestDeepBacktestingData:(from,to)=>manager.requestData(from,to)};
  const history={handleSetIsDeepHistoryMode:value=>facade.setReportDataSource(value),setDeepHistoryDateRange(){}};
  const root={__reactFiber$deep:{memoizedProps:{value:facade},return:{memoizedProps:{value:history}}}};
  // The ordinary editor lookup still uses the original fixture DOM; report
  // provider discovery is added only for its explicit report selectors.
  page.evaluate(`window.__deepFixtureRoot=null`);
  const oldEvaluate=page.evaluate;
  // Put provider root into the document through a function reference so the
  // production page code runs without command-specific result mirroring.
  oldEvaluate(`document.__originalQuery=document.querySelectorAll;document.querySelectorAll=function(selector){return selector.includes('reportContainer')?[document.__deepRoot]:this.__originalQuery(selector);}`);
  oldEvaluate(`document.__deepRoot={__reactFiber$deep:{memoizedProps:{value:null},return:{memoizedProps:{value:null}}}}`);
  // The closure above is shared with the VM; expose objects via the fixture's
  // existing window object and install them with a real evaluated expression.
  page.window.__deepFacade=facade;page.window.__deepHistory=history;
  oldEvaluate(`document.__deepRoot.__reactFiber$deep.memoizedProps.value=window.__deepFacade;document.__deepRoot.__reactFiber$deep.return.memoizedProps.value=window.__deepHistory;`);
  const consumer=Function('return function(e,t,n){n.d(t,{BacktestingStrategyFacade:()=>C});var g=n(2),y=n(3);g.unpackNonSeriesDataCompressed;new y.WSBackendConnection;}')();
  const chunks=[[['fixture'],{'1':consumer}]];chunks.push=function(chunk){if(typeof chunk[2]==='function')chunk[2](id=>String(id)==='2'?{unpackNonSeriesDataCompressed:unpack}:{WSBackendConnection:Connection});return Array.prototype.push.call(this,chunk);};page.window.webpackChunktradingview=chunks;
  const complete=async(value=10,id=0,session=manager._sessionid,transform)=>{const report={currency:'USD',settings:{dateRange:{backtest:{from:manager._fromDate,to:manager._toDate}}},performance:{all:{netProfit:value,totalTrades:1}},trades:[{entry:{time:manager._fromDate+1000},exit:{time:manager._toDate-1000},profit:{value}}]};transform?.(report);manager._wsConnection.emit('message',JSON.stringify({m:'request_data',p:[session,id,{ns:{d:JSON.stringify({data:{report}})}}]}));await new Promise(resolve=>setImmediate(resolve));manager._wsConnection.connected=false;};
  const error=async()=>{manager._wsConnection.emit('message',JSON.stringify({m:'request_error',p:[manager._sessionid,0,'not_allowed']}));await new Promise(resolve=>setImmediate(resolve));manager._wsConnection.connected=false;};
  return {...page,root,facade,history,manager,dispatches:()=>dispatches,complete,error};
}




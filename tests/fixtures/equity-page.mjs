import {propertiesPage} from './properties-page.mjs';
import {webcrypto} from 'node:crypto';
import {compilationState} from '../../src/strategy-state.js';
export function equityPage(expression='strategy.equity'){
  const p=propertiesPage(),chart=p.chart,base=1704067200000,times=[base,base+3600000,base+7200000],values=[1010,1030,1035];
  p.window.crypto=webcrypto;p.externalFee(0);
  let report={currency:'USD',settings:{dateRange:{backtest:{from:base-3600000,to:base+7200000}}},performance:{all:{netProfit:30,totalTrades:2,numberOfWiningTrades:2,numberOfLosingTrades:0},openPL:5},trades:[
    {e:{tm:base-3600000,p:100,tp:'le'},x:{tm:base,p:110,c:'exit',tp:'lx'},q:1,v:100,cm:0,cp:{v:10}},
    {e:{tm:base+1800000,p:100,tp:'le'},x:{tm:base+3600000,p:120,c:'exit',tp:'lx'},q:1,v:100,cm:0,cp:{v:30}},
    {e:{tm:base+5400000,p:100,tp:'le'},x:{tm:base+7200000,p:105,c:'',tp:'lx'},q:1,v:100,cm:0},
  ]};
  p.source.reportData=()=>({value:()=>report});
  const meta=p.source.metaInfo;p.source.metaInfo=()=>({...meta(),plots:[{id:'plot_0',type:'line'}],inputs:[...meta().inputs,{id:'prop_cap',groupId:'strategy_props',internalID:'initial_capital',type:'float'}]});
  const study=chart.getStudyById;chart.getStudyById=id=>{const existing=study(id);return {...existing,getInputValues:()=>[...existing.getInputValues(),{id:'prop_cap',value:1000}]};};
  const bars={firstIndex:()=>0,lastIndex:()=>2,valueAt:i=>[times[i]/1000,100,110,90,100,1],rangeIterator:()=>times.map((t,index)=>({index,value:[t/1000,100,110,90,100,1]}))[Symbol.iterator]()};
  const series=chart._chartWidget.model().mainSeries();series.bars=()=>bars;series.symbolInfo=()=>({full_name:'FIXTURE:OWNED',currency_code:'USD',pointvalue:1});
  chart.getTimezone=()=> 'UTC';p.source.data=()=>({valueAt:i=>[times[i]/1000,values[i]]});p.source.offset=()=>0;
  p.setEditorSource('//@version=6\nstrategy("QA")\nplot('+expression+')',false);p.bind({id:'props-workspace',token:'props-token',layout:'fixture-layout',pine:'owned-document'});p.compile('equity-compiled');
  report={...report};p.completeInputs();compilationState(p.window);
  return {...p,values,times,report:()=>report,refreshReport:()=>{report={...report};},changeReport:()=>{report={...report,performance:{...report.performance,openPL:99}};}};
}


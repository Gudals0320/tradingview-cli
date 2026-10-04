import { reportPage } from './report-page.mjs';
export function propertiesPage(){
  const page=reportPage(),chart=page.window.TradingViewApi._activeChartWidgetWV.value();
  const source=chart._chartWidget.model().model().dataSources()[0],oldMeta=source.metaInfo,oldStudy=chart.getStudyById;
  const metadata=[{id:'prop_fee',groupId:'strategy_props',internalID:'commission_value',type:'float',minval:0},{id:'prop_fee_type',groupId:'strategy_props',internalID:'commission_type',options:['percent','cash_per_order','cash_per_contract']},{id:'prop_qty',groupId:'strategy_props',internalID:'default_qty_value',type:'float',minval:0},{id:'prop_qty_type',groupId:'strategy_props',internalID:'default_qty_type',options:['fixed','cash_per_order','percent_of_equity']},{id:'prop_currency',groupId:'strategy_props',internalID:'currency',options:['NONE','USD','USDT']}];
  let properties=[{id:'prop_fee',value:0.05},{id:'prop_fee_type',value:'percent'},{id:'prop_qty',value:1},{id:'prop_qty_type',value:'fixed'},{id:'prop_currency',value:'NONE'}],mutations=0,extra=false,versionChanged=false;
  source.metaInfo=()=>({...oldMeta(),inputs:metadata});
  chart.getStudyById=id=>({getInputValues:()=>[...oldStudy(id).getInputValues(),...properties],setInputValues:values=>{mutations++;page.pending();properties=values.filter(i=>i.id.startsWith('prop_'));if(extra)properties=properties.map(i=>i.id==='prop_qty'?{...i,value:999}:i);if(versionChanged)page.setDocumentVersion(2);page.completeInputs();}});
  page.bind({id:'props-workspace',token:'props-token',layout:'fixture-layout',pine:'owned-document'});
  return {...page,chart,source,mutations:()=>mutations,externalFee:value=>{properties=properties.map(i=>i.id==='prop_fee'?{...i,value}:i);},extraChange:()=>{extra=true;},changeVersionDuringSetter:()=>{versionChanged=true;}};
}

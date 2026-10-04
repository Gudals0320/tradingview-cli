import { evaluate } from '../connection.js';
import { STRATEGY_PAGE_CODE } from '../strategy-state.js';
import { validateStrategyProperties,projectStrategyProperties } from '../strategy-properties.js';

const publicProperties=projectStrategyProperties;

export async function getProperties({strategy_id,_deps}={}){
  const inspect=_deps?.evaluate||evaluate;
  const result=await inspect(`(()=>{${STRATEGY_PAGE_CODE};const report=readStrategyReport(window,${JSON.stringify({strategy_id})});if(!report.success)return report;return {success:true,strategy_id:report.strategy_id,effective_properties:effectiveStrategyProperties(window,report.strategy_id),report_verified:true};})()`);
  if(result.effective_properties)result.effective_properties=publicProperties(result.effective_properties);
  return result;
}

export async function setProperties({values,strategy_id,timeout=30000,_deps}={}){
  if(!Number.isInteger(timeout)||timeout<1||timeout>300000)throw Object.assign(new Error('timeout must be 1..300000 ms.'),{code:'INVALID_STRATEGY_PROPERTIES',details:{mutation_dispatched:false}});
  const patch=validateStrategyProperties(typeof values==='string'?JSON.parse(values):values);
  const inspect=_deps?.evaluate||evaluate,sleep=_deps?.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=_deps?.now||Date.now,start=now();
  const result=await inspect(`(()=>{${STRATEGY_PAGE_CODE};
    const report=readStrategyReport(window,${JSON.stringify({strategy_id})});if(!report.success)return {...report,mutation_dispatched:false};
    const id=report.strategy_id,chart=window.TradingViewApi._activeChartWidgetWV.value(),study=chart.getStudyById(id),patch=${JSON.stringify(patch)};
    let mapping;try{mapping=strategyPropertyInputPatch(window,id,patch);}catch(error){return {success:false,code:error.code||'STRATEGY_PROPERTY_UNSUPPORTED',error:error.message,details:error.details,mutation_dispatched:false};}
    const current=study.getInputValues();
    const expected={...mapping.properties.values,...patch},changed=Object.entries(patch).some(([key,value])=>mapping.properties.values[key]!==value);
    if(!changed)return {success:true,changed:false,strategy_id:id,requested:patch,effective_properties:mapping.properties,report_ready:true};
    prepareInputChange(window,id);
    const next=current.map(input=>Object.hasOwn(mapping.inputs,input.id)?{...input,value:mapping.inputs[input.id]}:input);
    try{study.setInputValues(next);}catch(error){return {success:false,code:'STRATEGY_PROPERTIES_APPLY_FAILED',error:error.message,strategy_id:id,requested:patch,actual:effectiveStrategyProperties(window,id),mutation_dispatched:true,applied_confirmed:false};}
    const actual=effectiveStrategyProperties(window,id);
    return {success:true,changed:true,strategy_id:id,requested:patch,expected_fingerprint:JSON.stringify(expected),actual,mutation_dispatched:true};
  })()`,{mutation:true});
  if(!result.success||!result.changed){if(result.actual)result.actual=publicProperties(result.actual);if(result.effective_properties)result.effective_properties=publicProperties(result.effective_properties);return result;}
  let actual=result.actual;
  do{
    const observation=await inspect(`(()=>{${STRATEGY_PAGE_CODE};const properties=effectiveStrategyProperties(window,${JSON.stringify(result.strategy_id)}),state=compilationState(window);return {properties,state};})()`);
    actual=observation.properties;
    if(actual?.fingerprint!==result.expected_fingerprint)return {success:false,code:'STRATEGY_PROPERTIES_CHANGED',error:'Actual native Properties differ from the full requested state; inspect without replay.',strategy_id:result.strategy_id,requested:patch,actual:publicProperties(actual),mutation_dispatched:true,report_ready:false};
    if(now()-start>=timeout)break;
    if(observation.state.phase==='ready')return {success:true,changed:true,strategy_id:result.strategy_id,requested:patch,effective_properties:publicProperties(actual),report_ready:true,mutation_dispatched:true};
    if(['failed','invalidated'].includes(observation.state.phase))return {success:false,code:observation.state.code||'STRATEGY_PROPERTIES_REPORT_FAILED',error:observation.state.error,strategy_id:result.strategy_id,requested:patch,actual:publicProperties(actual),mutation_dispatched:true,report_ready:false};
    await sleep(Math.min(100,Math.max(1,timeout-(now()-start))));
  }while(now()-start<timeout);
  return {success:false,code:'STRATEGY_PROPERTIES_TIMEOUT',error:'Properties were dispatched but recalculation was not verified within the finite deadline; timeout is not cancellation.',strategy_id:result.strategy_id,requested:patch,actual:publicProperties(actual),mutation_dispatched:true,report_ready:false};
}

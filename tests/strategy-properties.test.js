import { it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStrategyProperties,validateStrategyProperties,effectiveStrategyProperties } from '../src/strategy-properties.js';
import { calculationKey,beginCompilation,compilationState } from '../src/strategy-state.js';
import { propertiesPage } from './fixtures/properties-page.mjs';
import { setInputs } from '../src/core/indicators.js';
import { getProperties,setProperties } from '../src/core/strategy-properties.js';

function fixture(){
  return propertiesPage();
}
it('typed Properties validate all fields before any Desktop call',async()=>{
  let calls=0;
  for(const patch of [{commission_value:0.1,slippage:-1},{commission_value:0.1,unknown:true},{calc_on_every_tick:'true'},{default_qty_type:'cash'},{slippage:0.1},{margin_long:101}]){
    await assert.rejects(()=>setProperties({values:patch,_deps:{evaluate:()=>{calls++;}}}),e=>e.code==='INVALID_STRATEGY_PROPERTIES');
  }
  assert.equal(calls,0);assert.doesNotThrow(()=>validateStrategyProperties({commission_type:'cash_per_order',default_qty_type:'percent_of_equity',calc_on_every_tick:true}));
});
it('raw currency NONE, resolved report currency and native units remain distinct',()=>{
  const page=fixture();const properties=effectiveStrategyProperties(page.window,'owned-study');assert.equal(properties.values.currency,'NONE');assert.equal(properties.effective_currency,'USD');assert.equal(properties.fields.commission_value.unit,'percent');assert.equal(properties.fields.default_qty_value.unit,'contracts_shares_lots');assert.equal(properties.fields.slippage.status,'unsupported');
  const meta=[{id:'q',groupId:'strategy_props',internalID:'default_qty_type'},{id:'v',groupId:'strategy_props',internalID:'default_qty_value'}];const normalized=normalizeStrategyProperties(meta,[{id:'q',value:'cash_per_order'},{id:'v',value:200}],'USD');assert.equal(normalized.values.default_qty_value,200);assert.equal(normalized.fields.default_qty_value.unit,'currency');
});
it('native Properties are already in current inputs and their derived view changes calculation identity',()=>{
  const p=fixture();p.compile();assert.equal(compilationState(p.window).phase,'ready');const before=p.chart.getStudyById('owned-study').getInputValues(),props=effectiveStrategyProperties(p.window,'owned-study').fingerprint;
  p.externalFee(0.2);const after=p.chart.getStudyById('owned-study').getInputValues();assert.notDeepEqual(after,before);assert.notEqual(calculationKey(before,{symbol:'same'}),calculationKey(after,{symbol:'same'}));assert.notEqual(effectiveStrategyProperties(p.window,'owned-study').fingerprint,props);
  assert.equal(compilationState(p.window).phase,'pending');
});
it('ordinary indicator input setter cannot bypass typed strategy Properties validation',async()=>{
  const p=fixture();p.compile();await assert.rejects(()=>setInputs({entity_id:'owned-study',inputs:{prop_fee:0.5},_deps:{evaluate:p.evaluate}}),e=>e.code==='STRATEGY_PROPERTY_COMMAND_REQUIRED');assert.equal(p.mutations(),0);
});
it('typed update waits for its native cycle and preserves complete readback',async()=>{
  const p=fixture();p.compile();const result=await setProperties({values:{commission_value:0.2,default_qty_value:2},_deps:{evaluate:p.evaluate}});assert.equal(result.success,true);assert.equal(result.report_ready,true);assert.equal(result.effective_properties.values.commission_value,0.2);assert.equal(result.effective_properties.values.default_qty_value,2);assert.equal(p.mutations(),1);assert.equal(result.effective_properties.fingerprint.length,64);
  const read=await getProperties({_deps:{evaluate:p.evaluate}});assert.equal(read.effective_properties.fingerprint,result.effective_properties.fingerprint);
});
it('unsupported field and wrong native enum reject before the setter, while unrequested changes are not adopted',async()=>{
  const p=fixture();p.compile();assert.equal((await setProperties({values:{slippage:1},_deps:{evaluate:p.evaluate}})).code,'STRATEGY_PROPERTY_UNSUPPORTED');assert.equal((await setProperties({values:{currency:'EUR'},_deps:{evaluate:p.evaluate}})).code,'INVALID_STRATEGY_PROPERTIES');assert.equal(p.mutations(),0);
  p.extraChange();const result=await setProperties({values:{commission_value:0.2},_deps:{evaluate:p.evaluate}});assert.equal(result.success,false);assert.equal(result.code,'STRATEGY_PROPERTIES_CHANGED');assert.equal(result.actual.values.default_qty_value,999);
});
it('GUI commission ABA before completion is pending rather than the earlier accepted report',()=>{
  const p=fixture();p.compile();assert.equal(compilationState(p.window).phase,'ready');p.externalFee(0.2);p.pending();p.externalFee(0.05);assert.equal(compilationState(p.window).phase,'pending');
  beginCompilation(p.window,'next','source',true,null,'owned-document','owned-study');assert.equal(compilationState(p.window).phase,'pending');
});

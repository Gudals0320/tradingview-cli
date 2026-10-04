import { createHash } from 'node:crypto';
export function projectStrategyProperties(value){return value?{...value,fingerprint:createHash('sha256').update(value.fingerprint).digest('hex')}:null;}
/** Shared page/Node schema: values come from native current inputs, never source defaults. */
export function strategyPropertySchema(){return {
  initial_capital:{type:'number',unit:'currency',min:0},currency:{type:'currency',unit:'currency_code'},
  default_qty_value:{type:'number',unit:'order_size',min:0},default_qty_type:{type:'enum',unit:'order_size_mode',values:['fixed','cash_per_order','percent_of_equity']},
  pyramiding:{type:'integer',unit:'entries',min:0},commission_type:{type:'enum',unit:'commission_mode',values:['percent','cash_per_contract','cash_per_order']},commission_value:{type:'number',unit:'commission',min:0},
  slippage:{type:'integer',unit:'ticks',min:0},backtest_fill_limits_assumption:{type:'integer',unit:'ticks',min:0},margin_long:{type:'number',unit:'percent',min:0,max:100},margin_short:{type:'number',unit:'percent',min:0,max:100},
  calc_on_order_fills:{type:'boolean',unit:'flag'},calc_on_every_tick:{type:'boolean',unit:'flag'},process_orders_on_close:{type:'boolean',unit:'flag'},use_bar_magnifier:{type:'boolean',unit:'flag'},fill_orders_on_standard_ohlc:{type:'boolean',unit:'flag'},
};}

export function validateStrategyProperties(patch){
  const schema=strategyPropertySchema();
  const reject=message=>{throw Object.assign(new Error(message),{code:'INVALID_STRATEGY_PROPERTIES',details:{mutation_dispatched:false}});};
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)reject('Properties must be a nonempty JSON object.');
  for(const [name,value] of Object.entries(patch)){
    const field=schema[name];if(!field)reject(`Unknown strategy property: ${name}`);
    if(field.type==='boolean'&&typeof value!=='boolean')reject(`${name} must be boolean.`);
    if(['number','integer'].includes(field.type)&&(typeof value!=='number'||!Number.isFinite(value)||field.type==='integer'&&!Number.isSafeInteger(value)||value<field.min||field.max!==undefined&&value>field.max))reject(`${name} must be a finite ${field.type} within its supported range.`);
    if(field.type==='enum'&&!field.values.includes(value))reject(`${name} must be one of ${field.values.join(', ')}.`);
    if(field.type==='currency'&&(typeof value!=='string'||!/^[A-Z0-9]{3,8}$/.test(value)))reject('currency must be an exact native currency code or NONE.');
  }
  return patch;
}

export function normalizeStrategyProperties(metadata,inputs,reportCurrency){
  const schema=strategyPropertySchema(),fields={},values={};
  for(const [name,field] of Object.entries(schema)){
    const matches=(metadata||[]).filter(input=>input.groupId==='strategy_props'&&input.internalID===name);
    const meta=matches.length===1?matches[0]:null;
    const current=meta?(inputs||[]).filter(input=>input.id===meta.id):[];
    if(!meta||current.length!==1){fields[name]={status:matches.length>1||current.length>1?'unknown':'unsupported',type:field.type,unit:field.unit,mutation_supported:false};continue;}
    const value=current[0].value;
    let valid=true;try{validateStrategyProperties({[name]:value});}catch{valid=false;}
    fields[name]={status:valid?'supported':'unknown',type:field.type,unit:field.unit,value,input_id:meta.id,mutation_supported:valid,native_options:meta.options||null,native_min:meta.minval??null,native_max:meta.maxval??null};
    if(valid)values[name]=value;
  }
  const qty=values.default_qty_type,commission=values.commission_type;
  if(fields.default_qty_value)fields.default_qty_value.unit=qty==='fixed'?'contracts_shares_lots':qty==='cash_per_order'?'currency':qty==='percent_of_equity'?'percent_of_equity':'unknown';
  if(fields.commission_value)fields.commission_value.unit=commission==='percent'?'percent':commission==='cash_per_order'?'currency_per_order':commission==='cash_per_contract'?'currency_per_contract':'unknown';
  return {fields,values,fingerprint:JSON.stringify(values),effective_currency:typeof reportCurrency==='string'?reportCurrency:null,source:'native_study_inputs',report_settings_properties:'not_exposed',bar_magnifier:{requested:values.use_bar_magnifier??null,applied_input:values.use_bar_magnifier??null,lower_timeframe_coverage:'unknown'},calculation_notes:{calc_on_every_tick:'realtime_only',fill_orders_on_standard_ohlc:'effective_for_heikin_ashi'}};
}

export function strategyPropertyInputPatch(window,strategyId,patch){
  validateStrategyProperties(patch);
  const properties=effectiveStrategyProperties(window,strategyId),inputs={};
  for(const [name,value] of Object.entries(patch)){
    const field=properties?.fields[name];
    if(!field?.mutation_supported)throw Object.assign(new Error(`STRATEGY_PROPERTY_UNSUPPORTED: ${name} has no verified native typed setter; set it explicitly in Pine strategy() source.`),{code:'STRATEGY_PROPERTY_UNSUPPORTED',details:{field:name,mutation_dispatched:false}});
    if(field.native_options&&!field.native_options.includes(value)||field.native_min!==null&&typeof value==='number'&&value<field.native_min||field.native_max!==null&&typeof value==='number'&&value>field.native_max)throw Object.assign(new Error(`INVALID_STRATEGY_PROPERTIES: ${name} is outside native options/bounds.`),{code:'INVALID_STRATEGY_PROPERTIES',details:{field:name,mutation_dispatched:false}});
    inputs[field.input_id]=value;
  }
  return {inputs,properties};
}

export function effectiveStrategyProperties(window,strategyId){
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
  const source=chart?._chartWidget?.model?.().model?.().dataSources?.().find(source=>source.id?.()===strategyId);
  const meta=source?.metaInfo?.();if(!meta?.isTVScriptStrategy&&!meta?.is_strategy)return null;
  let report=source.reportData?.();if(typeof report?.value==='function')report=report.value();
  const inputs=chart.getStudyById(strategyId).getInputValues();
  return normalizeStrategyProperties(meta.inputs,inputs,report?.currency);
}

export const PROPERTIES_PAGE_CODE=[strategyPropertySchema,validateStrategyProperties,normalizeStrategyProperties,effectiveStrategyProperties,strategyPropertyInputPatch].map(fn=>fn.toString()).join('\n');

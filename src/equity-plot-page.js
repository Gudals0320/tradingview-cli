import {DEEP_PAGE_CODE,verifyDeepSource} from './deep-backtest-page.js';
import {readStrategyReport,pageStrategies} from './strategy-state.js';
import {findPineEditor} from './core/desktop-dom.js';
import {attestEquityPlot} from './equity-plot-source.js';

export function equityPlotRows(window,item,attestation){
  const chart=window.TradingViewApi._activeChartWidgetWV.value(),bars=chart._chartWidget.model().mainSeries().bars(),data=item.source.data?.();
  if(!data||typeof bars.rangeIterator!=='function'||typeof data.valueAt!=='function')return null;
  const first=bars.firstIndex(),last=bars.lastIndex();if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last))return null;
  const iterator=bars.rangeIterator(first,last),rows=[];
  for(let next=iterator.next();!next.done;next=iterator.next()){
    if(rows.length>=100000)return null;
    const bar=next.value,plot=data.valueAt(bar.index),time=bar.value?.[0],value=plot?.[attestation.slot];
    if(!Number.isFinite(time)||plot?.[0]!==time||!Number.isFinite(value))return null;
    rows.push({bar_index:bar.index,time_ms:time*1000,equity:value,render_offset:attestation.offset});
  }
  return rows;
}

export function equitySemanticProof(report,rows,initialCapital,pointValue,feePolicy){
  const all=report.performance?.all,openPL=report.performance?.openPL;
  const denied=reason=>({verified:false,reason,closed_checkpoints:0});
  if(!Number.isFinite(initialCapital)||!Number.isFinite(pointValue)||pointValue<=0||!Number.isFinite(all?.netProfit)||!Number.isFinite(openPL)||!Array.isArray(report.trades)||!rows.length)return denied('Native capital/point value/net/open PnL/ledger evidence is incomplete');
  if(!['percent','cash_per_order','cash_per_contract'].includes(feePolicy?.commission_type)||!Number.isFinite(feePolicy.commission_value))return denied('Native commission policy is incomplete');
  const points=new Map(rows.map(row=>[row.time_ms,row.equity])),closed=[],tolerance=value=>Math.max(1e-7,Math.abs(value)*1e-10),events=new Map(),entries=new Set();
  if(points.size!==rows.length)return denied('Duplicate native bar timestamps need an independently verified bar mapping');
  const addEvent=(time,delta)=>{const actions=events.get(time)||[];actions.push(delta);events.set(time,actions);};
  for(const trade of report.trades){
    if(!['le','se'].includes(trade.e?.tp)||!Number.isFinite(trade.e.tm)||!Number.isFinite(trade.e.p)||!Number.isFinite(trade.q)||trade.q<=0||!Number.isFinite(trade.v)||!Number.isFinite(trade.cm))return denied('Native ledger entry direction/time/price/quantity/value/commission is incomplete');
    if(!trade.x||!Object.hasOwn(trade.x,'c')||typeof trade.x.c!=='string'||trade.x.tp!==(trade.e.tp==='le'?'lx':'sx')||!Number.isFinite(trade.x.tm)||!Number.isFinite(trade.x.p))return denied('Native closed/open exit schema is unknown');
    if(trade.x.tm<trade.e.tm)return denied('Native exit/mark timestamp precedes its own entry');
    const isOpen=trade.x.c==='';if(Object.hasOwn(trade,'isOpen')&&trade.isOpen!==isOpen)return denied('Native open marker conflicts with exit schema');
    const entry=JSON.stringify([trade.e.tm,trade.e.c,trade.e.tp]);if(entries.has(entry))return denied('Partial exits/reused entry quantity are not independently verified');entries.add(entry);addEvent(trade.e.tm,1);
    if(!isOpen){closed.push(trade);addEvent(trade.x.tm,-1);}
  }
  if(!Number.isSafeInteger(all.totalTrades)||all.totalTrades<0||closed.length!==all.totalTrades)return denied('Native closed ledger count differs from totalTrades');
  const active=new Map();let positions=0;for(const [time,actions]of [...events].sort((a,b)=>a[0]-b[0])){if(actions.length!==1)return denied('Same-bar entry/exit ordering and reentry are not independently verified');positions+=actions[0];if(positions>1||positions<0)return denied('Overlapping/pyramided ledger quantity allocation is not independently verified');active.set(time,positions);}
  const checkpoints=[];let cumulative=0,absoluteFlow=0,maxBudget=0,maxError=0;
  const ordered=closed.slice().sort((a,b)=>a.x.tm-b.x.tm);
  for(let index=0;index<ordered.length;index++){
    const trade=ordered[index],time=trade.x.tm,side=trade.e.tp==='le'?1:trade.e.tp==='se'?-1:null;
    if(side===null||!Number.isFinite(trade.e.p)||!Number.isFinite(trade.x.p)||!Number.isFinite(trade.q)||trade.q<=0||!Number.isFinite(trade.cm)||!Number.isFinite(trade.v))return denied('Native fill direction/prices/matched quantity/entry value/commission are incomplete');
    const entryValue=Math.abs(trade.e.p*trade.q*pointValue),commission=feePolicy.commission_type==='percent'?(Math.abs(trade.e.p)+Math.abs(trade.x.p))*trade.q*pointValue*feePolicy.commission_value/100:feePolicy.commission_type==='cash_per_contract'?2*trade.q*feePolicy.commission_value:2*feePolicy.commission_value;
    if(Math.abs(trade.v-entryValue)>tolerance(entryValue)||Math.abs(trade.cm-commission)>tolerance(commission))return denied('Native quantity valuation or whole-entry/exit commission allocation is not independently matched');
    const gross=(trade.x.p-trade.e.p)*trade.q*pointValue*side;cumulative+=gross-trade.cm;absoluteFlow+=Math.abs(gross)+Math.abs(trade.cm);
    if(time<rows[0].time_ms||time>rows.at(-1).time_ms)continue;
    if(ordered[index+1]?.x.tm===time)continue;
    if(active.get(time)!==0)return denied('A loaded liquidation bar still has an open/reentered position; closed PnL cannot verify that bar');
    const equity=points.get(time);if(!Number.isFinite(equity))return denied('A loaded flat-close checkpoint has no exact native bar timestamp');
    const expected=initialCapital+cumulative,operations=6*(index+1)+4,gamma=operations*Number.EPSILON/(1-operations*Number.EPSILON),budget=gamma*(Math.abs(initialCapital)+absoluteFlow);maxBudget=Math.max(maxBudget,budget);
    if(budget>tolerance(expected))return denied('Arithmetic operation budget exceeds the fixed equity tolerance');
    const error=Math.abs(equity-expected);maxError=Math.max(maxError,error);if(error>tolerance(expected))return {...denied('Closed flat-bar equity disagrees with fill PnL after native commissions'),failed_time_ms:time,actual:equity,expected};
    checkpoints.push({time_ms:time,actual:equity,expected,native_cumulative_reference:trade.cp?.v??null});
  }
  const unique=new Map(checkpoints.map(p=>[p.time_ms,p]));
  if(unique.size<2)return denied('At least two distinct closed flat-bar checkpoints are required');
  const final=rows.at(-1),expectedFinal=initialCapital+all.netProfit+openPL;
  if(Math.abs(final.equity-expectedFinal)>tolerance(expectedFinal))return {...denied('Final equity disagrees with native capital plus net and open PnL'),actual:final.equity,expected:expectedFinal};
  return {verified:true,closed_checkpoints:unique.size,closed_samples:[...unique.values()].slice(0,3),max_observed_error:Math.max(maxError,Math.abs(final.equity-expectedFinal)),checkpoint_coverage:'all applicable flat-close timestamps in the loaded window',final:{time_ms:final.time_ms,actual:final.equity,expected:expectedFinal},tolerance:'max(1e-7 currency units, abs(expected)*1e-10); frozen before clean validation',arithmetic_budget:{model:'gamma_(6*closed_records+4) * (abs(capital)+absolute gross/fee flow)',max_reference_error_bound:maxBudget,native_rounding:'not used to widen tolerance'},quantity_scope:'distinct whole-entry/exit records; no overlapping, pyramided or partial-exit allocation',closed_reference:'native fill prices * matched quantity * owned point value minus matched native commission; same currency',native_cumulative_reference:'retained as a rounded auxiliary field',fees:'native commissions deducted once',zero_trade:'insufficient semantic evidence'};
}

export async function readEquityPlot(window,document,request){
  const summary=readStrategyReport(window,{strategy_id:request.strategy_id});if(!summary.success)return summary;
  if(!request.plot_id&&!request.list_plots)return {success:false,code:'EQUITY_UNAVAILABLE',error:'Select an explicit native plot of strategy.equity; cumulative closed PnL and buy-and-hold are not per-bar equity.',data:[],data_points:0};
  const proof=await verifyDeepSource(window,document,summary.strategy_id);
  if(!proof.verified||summary.source_hash!==proof.source_hash||summary.effective_properties?.fingerprint!==proof.properties_fingerprint)return {success:false,code:'EQUITY_SOURCE_UNVERIFIED',error:'Saved/applied source and current full inputs/Properties are not verified.'};
  const item=pageStrategies(window).find(s=>s.id===summary.strategy_id),controller=findPineEditor(document),metadata=item.source.metaInfo();
  if(request.list_plots)return {success:true,strategy_id:item.id,source_hash:proof.source_hash,source:'native_plot_metadata',record_kind:'plot_catalog',plot_values_verified:false,plots:(metadata.plots||[]).map(plot=>({plot_id:plot.id,type:plot.type,title:metadata.styles?.[plot.id]?.title??null,offset:item.source.offset?.(plot.id)??null,source_attestation:attestEquityPlot(controller.editor.getValue(),plot.id,metadata)}))};
  const attestation=attestEquityPlot(controller.editor.getValue(),request.plot_id,metadata);
  if(!attestation.verified||item.source.offset?.(request.plot_id)!==attestation.offset)return {success:false,code:'EQUITY_PLOT_UNVERIFIED',error:attestation.reason||'Native plot offset differs from the attested source.'};
  const rows=equityPlotRows(window,item,attestation);if(!rows)return {success:false,code:'EQUITY_DATA_INCOMPLETE',error:'Loaded bars do not map one-to-one to finite native equity values; no interpolation or truncation.'};
  const instrument=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbolInfo?.();
  if(instrument?.currency_code!==summary.currency)return {success:false,code:'EQUITY_SEMANTICS_UNVERIFIED',error:'Fill PnL currency conversion is not independently verified.'};
  const semantic=equitySemanticProof(item.report,rows,summary.effective_properties?.values.initial_capital,instrument.pointvalue,summary.effective_properties.values);
  if(!semantic.verified)return {success:false,code:'EQUITY_SEMANTICS_UNVERIFIED',error:semantic.reason,semantic_proof:semantic};
  const identity=JSON.stringify({proof,plot_id:request.plot_id,attestation,rows,performance:item.report.performance,settings:item.report.settings,trades:item.report.trades});
  const digest=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  const after=await verifyDeepSource(window,document,summary.strategy_id),current=pageStrategies(window).find(s=>s.id===summary.strategy_id),afterRows=current&&equityPlotRows(window,current,attestation);
  const afterInstrument=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbolInfo?.();
  if(current?.source.offset?.(request.plot_id)!==attestation.offset||afterInstrument?.currency_code!==instrument.currency_code||afterInstrument?.pointvalue!==instrument.pointvalue||JSON.stringify(after)!==JSON.stringify(proof)||JSON.stringify({proof:after,plot_id:request.plot_id,attestation,rows:afterRows,performance:current?.report.performance,settings:current?.report.settings,trades:current?.report.trades})!==identity)return {success:false,code:'REPORT_CHANGED',error:'Equity/source/report changed during collection; restart at offset 0.'};
  const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(request.report_revision&&request.report_revision!==revision)return {success:false,code:'REPORT_CHANGED',error:'Equity snapshot revision changed; restart at offset 0.',report_revision:revision};
  const data=rows.slice(request.offset,request.offset+request.limit).map(row=>({...row,time:new Date(row.time_ms).toISOString()}));
  return {success:true,strategy_id:summary.strategy_id,source_hash:proof.source_hash,source:'native_strategy_equity_plot',plot_id:request.plot_id,currency:summary.currency,record_kind:'per_bar_equity',report_revision:revision,...(request.export_all?{_export_rows:rows.map(row=>({...row,time:new Date(row.time_ms).toISOString()}))}:{}),
    data,data_points:data.length,total_points:rows.length,offset:request.offset,limit:request.limit,has_more:request.offset+data.length<rows.length,next_offset:request.offset+data.length<rows.length?request.offset+data.length:null,
    downsampled:false,truncated:false,interpolated:false,source_attestation:attestation,semantic_proof:semantic,effective_properties:summary.effective_properties,
    loaded_window:{from:new Date(rows[0].time_ms).toISOString(),to:new Date(rows.at(-1).time_ms).toISOString()},backtest_window:summary.backtest_window,coverage:'loaded_chart_bars',coverage_completeness:'partial',units:{equity:'account currency including open PnL',native_bar_time:'seconds',ledger_time:'milliseconds',render_offset:'bars; raw timestamps retained'},
    collection_cost:'full loaded plot and ledger are verified for each request; finite page transmission'};
}

export const EQUITY_PAGE_CODE=DEEP_PAGE_CODE+'\n'+[attestEquityPlot,equityPlotRows,equitySemanticProof,readEquityPlot].map(fn=>fn.toString()).join('\n');


import {it} from 'node:test';
import assert from 'node:assert/strict';
import {attestEquityPlot} from '../src/equity-plot-source.js';
import {equitySemanticProof} from '../src/equity-plot-page.js';
import {getEquity} from '../src/core/data.js';
import {equityPage} from './fixtures/equity-page.mjs';
const metadata={plots:[{id:'plot_0',type:'line'},{id:'plot_1',type:'line'}]};
it('equity source attestation matches compiled plot order and does not trust comments, labels, aliases or scaled expressions',()=>{
  const source='plot(ta.sma(close,10))\nplot(strategy.equity, title="Equity", offset=0)';
  assert.equal(attestEquityPlot(source,'plot_1',metadata).verified,true);
  for(const fake of ['close','strategy.netprofit','strategy.equity * 2','e','strategy.equity + 0'])assert.equal(attestEquityPlot(source.replace('strategy.equity',fake),'plot_1',metadata).verified,false,fake);
  assert.equal(attestEquityPlot('// plot(strategy.equity)\nplot(close,title="strategy.equity")','plot_0',{plots:[metadata.plots[0]]}).verified,false);
  assert.equal(attestEquityPlot(source.replace('offset=0','offset=bar_index'),'plot_1',metadata).verified,false);
  assert.equal(attestEquityPlot(source,'plot_0',metadata).verified,false);
  assert.equal(attestEquityPlot(source,'plot_1',{plots:[...metadata.plots,{id:'hidden',type:'line'}]}).verified,false);
});
it('serialized equity collection verifies native fills/costs/final PnL, preserves finite pages and rejects changed revisions',async()=>{
  const p=equityPage(),opts={plot_id:'plot_0',limit:1,_deps:{evaluateAsync:p.evaluate}};
  const first=await getEquity(opts);assert.equal(first.success,true);assert.equal(first.total_points,3);assert.equal(first.data.length,1);assert.equal(first.data[0].equity,1010);assert.equal(first.semantic_proof.closed_checkpoints,2);assert.equal(first.downsampled,false);
  const next=await getEquity({...opts,offset:1,report_revision:first.report_revision});assert.equal(next.success,true);assert.equal(next.report_revision,first.report_revision);assert.equal(next.data[0].equity,1030);
  p.values[1]=1030.1;assert.equal((await getEquity({...opts,offset:1,report_revision:first.report_revision})).success,false);
});
it('equity rejects ambiguous/scaled/realized source, missing values and unsupported currency before publishing points',async()=>{
  for(const expression of ['close','close, title="Equity"','strategy.equity * 2','strategy.netprofit']){const p=equityPage(expression);assert.equal((await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:p.evaluate}})).code,'EQUITY_PLOT_UNVERIFIED');}
  const missing=equityPage();missing.values[1]=NaN;assert.equal((await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:missing.evaluate}})).code,'EQUITY_DATA_INCOMPLETE');
  const currency=equityPage();currency.chart._chartWidget.model().mainSeries().symbolInfo=()=>({currency_code:'JPY',pointvalue:1});assert.equal((await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:currency.evaluate}})).code,'EQUITY_SEMANTICS_UNVERIFIED');
  let reads=0;assert.equal((await getEquity({mode:'deep',_deps:{evaluateAsync:()=>{reads++;}}})).code,'EQUITY_DEEP_UNSUPPORTED');assert.equal(reads,0);
});
it('equity never adopts another study, a pending calculation, or reloaded bars as the owned curve',async()=>{
  const foreign=equityPage();foreign.foreign();const other=await getEquity({strategy_id:'foreign-chart-study',plot_id:'plot_0',_deps:{evaluateAsync:foreign.evaluate}});assert.equal(other.success,false);assert.equal(other.data,undefined);
  const pending=equityPage();pending.pending();assert.equal((await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:pending.evaluate}})).code,'REPORT_PENDING');
  const reload=equityPage(),crypto=reload.window.crypto;let calls=0;reload.window.crypto={subtle:{digest:async(...args)=>{if(calls++===3)reload.times[0]+=60000;return crypto.subtle.digest(...args);}}};
  assert.equal((await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:reload.evaluate}})).code,'REPORT_CHANGED');
  const names={plots:[{id:'plot_0',type:'line'},{id:'plot_1',type:'line'}],styles:{plot_0:{title:'Equity'},plot_1:{title:'Equity'}}},source='plot(strategy.equity,title="Equity")\nplot(close,title="Equity")';
  assert.equal(attestEquityPlot(source,'plot_0',names).verified,true);assert.equal(attestEquityPlot(source,'plot_1',names).verified,false);
});
it('plot/report changes during asynchronous snapshot verification cannot publish a mixed equity curve',async()=>{
  for(const change of [p=>{p.values[2]+=1;},p=>p.changeReport()]){const p=equityPage(),crypto=p.window.crypto;let calls=0;
    p.window.crypto={subtle:{digest:async(...args)=>{if(calls++===3)change(p);return crypto.subtle.digest(...args);}}};
    const result=await getEquity({plot_id:'plot_0',_deps:{evaluateAsync:p.evaluate}});assert.equal(result.success,false);assert.equal(result.code,'REPORT_CHANGED');assert.equal(result.data,undefined);
  }
});
it('equity semantic proof requires distinct native closed flat checkpoints and final capital plus net/open PnL',()=>{
  const rows=[{time_ms:1000,equity:1010},{time_ms:2000,equity:1030},{time_ms:4000,equity:1035}];
  const report={performance:{all:{netProfit:30},openPL:5},trades:[{e:{tm:0,p:100,tp:'le'},x:{tm:1000,c:'exit',p:110},q:1,v:100,cm:0,cp:{v:10}},{e:{tm:1500,p:100,tp:'le'},x:{tm:2000,c:'exit',p:120},q:1,v:100,cm:0,cp:{v:30}},{e:{tm:3000},x:{tm:4000,c:''}}]};
  assert.equal(equitySemanticProof(report,rows,1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,true);
  assert.equal(equitySemanticProof(report,rows.map(r=>({...r,equity:r.equity*2})),1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,false);
  assert.equal(equitySemanticProof(report,rows.map(r=>({...r,equity:r.equity-1000})),1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,false);
  assert.equal(equitySemanticProof({...report,trades:[]},rows,1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,false);
  assert.equal(equitySemanticProof({...report,performance:{all:{netProfit:30}}},rows,1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,false);
  for(const change of [r=>{r.trades[1].e.tm=500;},r=>{r.trades.push({...r.trades[0],x:{...r.trades[0].x,tm:500}});},r=>{r.trades[0].cm=1;},r=>{r.trades[0].v=999;},r=>{r.trades[1].x.tm=2500;},r=>{r.trades.push({e:{tm:2000,p:100,tp:'le'},x:{tm:4000,c:''},q:1});}]){
    const altered=structuredClone(report);change(altered);assert.equal(equitySemanticProof(altered,rows,1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,false);
  }
  const short=structuredClone(report);for(const trade of short.trades.slice(0,2)){trade.e.tp='se';trade.x.p=200-trade.x.p;}assert.equal(equitySemanticProof(short,rows,1000,1,{commission_type:'cash_per_order',commission_value:0}).verified,true);
});



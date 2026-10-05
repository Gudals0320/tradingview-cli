import {performance} from 'node:perf_hooks';
import {DEEP_PAGE_CODE} from '../src/deep-backtest-page.js';
import {deepResults} from '../src/core/deep-backtest.js';
import {deepPage} from '../tests/fixtures/deep-page.mjs';
const call=(p,name,...args)=>p.evaluate(`(async()=>{${DEEP_PAGE_CODE};return ${name}(window,document,${args.map(a=>JSON.stringify(a)).join(',')});})()`);
const sizes=[1000,10000,25000,25000,10000,10000,25000],measurements=[];
for(const count of sizes){
  const p=deepPage(),proof=await call(p,'verifyDeepSource','owned-study'),from=1704067200000,to=1704153600000;
  await call(p,'startDeepRun',{run_id:'benchmark',request_id:'benchmark',fingerprint:'benchmark',strategy_id:'owned-study',source_proof:proof,from_ms:from,to_ms:to,period:{from:new Date(from).toISOString(),to:new Date(to).toISOString(),timezone:'UTC'}});
  const creation=performance.now();await p.complete(10,0,p.manager._sessionid,r=>{r.performance.all.totalTrades=count;r.trades=Array.from({length:count},(_,i)=>({tradeNumber:i+1,entry:{time:from+1000+i},exit:{time:to-1000},profit:{value:1}}));});
  const creation_ms=performance.now()-creation;
  const start=performance.now(),first=await deepResults({run_id:'benchmark',limit:10,_deps:{evaluateAsync:p.evaluate}}),first_snapshot_ms=performance.now()-start;
  if(!first.success||first.ledger.total!==count||first.ledger.rows.length!==10)throw Error('Benchmark correctness failed');
  const snapshot=p.window.__tvCliDeepRun.snapshot,pageTimes=[];
  for(let page=1;page<=20;page++){const begin=performance.now(),result=await deepResults({run_id:'benchmark',offset:page*10,limit:10,report_revision:first.report_revision,_deps:{evaluateAsync:p.evaluate}});pageTimes.push(performance.now()-begin);if(!result.success||result.report_revision!==first.report_revision||result.ledger.rows[0].tradeNumber!==page*10+1||p.window.__tvCliDeepRun.snapshot!==snapshot)throw Error('Cached page correctness/reference failed');}
  measurements.push({rows:count,warmup:count===1000,native_fixture_creation_ms:creation_ms,first_snapshot_ms,cached_pages:pageTimes.length,cached_page_mean_ms:pageTimes.reduce((a,b)=>a+b,0)/pageTimes.length,cached_page_max_ms:Math.max(...pageTimes),full_snapshot_reference_unchanged:true,returned_rows_per_page:10,period_validation_rows:snapshot.period_proof.checked_rows});
}
console.log(JSON.stringify({kind:'offline_fixture_benchmark',environment:{node:process.version,platform:process.platform,arch:process.arch},conditions:{warmup_rows:1000,size_order:sizes,measured_trials_per_size:3,page_size:10,cached_pages_per_trial:20,creation_cost:'reported separately; includes exact fake native decode/copy',first_snapshot_cost:'full copy/hash/period validation',cached_pages:'same immutable snapshot/revision; no mutation between pages',exclusions:'no discarded failed trial; correctness failure aborts',live_network_or_account_maximum_verified:false},measurements},null,2));

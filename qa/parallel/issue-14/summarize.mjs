import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeEvidence, hash } from './live-utils.mjs';
const evidence=JSON.parse(readFileSync(new URL('live/benchmark.json',import.meta.url)));
assert.equal(evidence.success,true);assert.equal(evidence.trials.length,8);
const baseline=new Map(),profits=new Map();
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[1]+sorted[2])/2;};
const overlaps=(a,b)=>a.flatMap(x=>b.map(y=>Math.max(0,Math.min(x.native_end,y.native_end)-Math.max(x.native_start,y.native_start)))).reduce((sum,value)=>sum+value,0);
let failures=0,retries=0,jobs=0;
const bars=new Set(),openPl=new Set(),openTrades=new Set();
const trials=evidence.trials.map(trial=>{
  assert.equal(trial.planned_jobs,8);assert.equal(trial.completed,8);assert.equal(trial.jobs.length,8);
  for(const job of trial.jobs){
    const artifact=JSON.parse(gunzipSync(readFileSync(new URL(`live/${job.reference}`,import.meta.url))));
    assert.ok(job.success&&job.cycle_increased&&job.native_transition&&job.inputs_verified&&job.resources_verified);
    assert.equal(artifact.before,job.before_cycle);assert.equal(artifact.input.result.provenance.calculation.completed.cycle,job.completed_cycle);
    assert.equal(artifact.report.result.strategy_inputs.find(i=>i.id==='in_0').value,job.length);
    const metrics=Object.fromEntries(Object.entries(artifact.report.result.metrics).filter(([key])=>!key.startsWith('buy_hold_return')));
    const ledger=artifact.pages.flatMap(page=>page.result.trades).map(({entry_time,exit_time,entry_bar,exit_bar,raw})=>({entry_time,exit_time,entry_bar,exit_bar,raw}));
    bars.add(artifact.report.result.context.last_bar_time);openPl.add(artifact.report.result.metrics.open_pl);openTrades.add(ledger.filter(trade=>!trade.exit_time).length);
    assert.equal(hash(metrics),job.metrics_hash);assert.equal(hash(ledger),job.ledger_hash);
    const key=String(job.length),value=JSON.stringify([job.metrics_hash,job.ledger_hash]);
    if(baseline.has(key))assert.equal(value,baseline.get(key),`Result mismatch ${job.worker}:${job.length} trial${trial.index}`);
    else baseline.set(key,value);
    const set=profits.get(job.worker)||new Set();set.add(job.net_profit);profits.set(job.worker,set);
    const complete=job.events.findLast(event=>event.event==='report'&&event.status===2);
    assert.equal(complete.inputs.find(input=>input.id==='in_0').value,job.length);
    failures+=job.failures;retries+=job.retries;jobs++;
  }
  const a=trial.jobs.filter(job=>job.worker==='a'),b=trial.jobs.filter(job=>job.worker==='b');
  const overlap=overlaps(a,b),min=Math.min(...[a,b].map(items=>items.reduce((sum,job)=>sum+job.native_end-job.native_start,0)));
  if(trial.workers===2)assert.ok(overlap>0,'No observed native calculation overlap');
  else assert.equal(overlap,0);
  return {index:trial.index,workers:trial.workers,ms:trial.ms,completed:trial.completed,overlap_ms:overlap,overlap_fraction_of_shorter_worker:min?overlap/min:0};
});
assert.equal(jobs,64);assert.equal(failures,0);assert.equal(retries,0);assert.ok([...profits.values()].every(set=>set.size>=4));
assert.deepEqual(evidence.active_before,evidence.active_after);
assert.equal(bars.size,1,'Last bar changed: full-equivalence benchmark must be rerun');assert.deepEqual([...openPl],[0]);assert.deepEqual([...openTrades],[0]);
const one=trials.filter(trial=>trial.workers===1).map(trial=>trial.ms),two=trials.filter(trial=>trial.workers===2).map(trial=>trial.ms);
const summary={revision:evidence.revision,planned_trials:8,observed_trials:8,planned_jobs:64,completed_jobs:jobs,failures,retries,
  warmup_ms:evidence.warmup.ms,warmup_excluded:true,one_worker:{times_ms:one,mean_ms:mean(one),median_ms:median(one)},
  two_workers:{times_ms:two,mean_ms:mean(two),median_ms:median(two)},throughput_ratio:mean(one)/mean(two),
  throughput_increase_percent:(mean(one)/mean(two)-1)*100,result_equivalence:true,full_ledger_equivalence:true,
  excluded_metrics:['buy_hold_return','buy_hold_return_percent'],input_report_variation:[...profits].map(([worker,set])=>({worker,distinct_net_profits:set.size})),
  last_bar_times:[...bars],open_pnl_values:[...openPl],open_trade_counts:[...openTrades],no_additional_exclusions:true,
  trials,active_tab_unchanged:true,wall_clock:evidence.timer,assignment:evidence.assignment,emulation:evidence.emulation};
assert.ok(summary.throughput_ratio>1);
writeEvidence('benchmark-summary.json',summary);console.log(JSON.stringify(summary,null,2));

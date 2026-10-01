import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeEvidence, hash } from './live-utils.mjs';
const evidence=JSON.parse(readFileSync(new URL('live/heavy-balanced-benchmark.json',import.meta.url)));
assert.equal(evidence.success,true);assert.equal(evidence.trials.length,8);
const baseline=new Map(),coldByJob=new Map(),ratios=[];let completed=0,failures=0,retries=0;const bars=new Set();
const trials=evidence.trials.map(trial=>{
  assert.equal(trial.jobs.length,4);let native=0,jobTime=0;
  for(const job of trial.jobs){
    const raw=JSON.parse(gunzipSync(readFileSync(new URL(`live/${job.reference}`,import.meta.url))));
    assert.ok(job.success&&job.cycle_increased&&job.native_transition&&job.inputs_verified&&job.resources_verified);
    const metrics=Object.fromEntries(Object.entries(raw.report.result.metrics).filter(([key])=>!key.startsWith('buy_hold_return')));
    const ledger=raw.pages.flatMap(page=>page.result.trades).map(({entry_time,exit_time,entry_bar,exit_bar,raw})=>({entry_time,exit_time,entry_bar,exit_bar,raw}));
    assert.equal(hash(metrics),job.metrics_hash);assert.equal(hash(ledger),job.ledger_hash);assert.equal(metrics.open_pl,0);assert.equal(ledger.filter(trade=>!trade.exit_time).length,0);
    bars.add(raw.report.result.context.last_bar_time);
    const key=`${job.worker}:${job.length}`,result=JSON.stringify([job.metrics_hash,job.ledger_hash]);
    if(baseline.has(key))assert.equal(result,baseline.get(key));else baseline.set(key,result);
    const duration=job.native_end-job.native_start;
    if(trial.cache_condition==='first request')coldByJob.set(key,duration);
    else{const ratio=coldByJob.get(key)/duration;ratios.push({key,ratio});assert.ok(ratio>=5,'First-request label did not match observed native duration');}
    native+=duration;jobTime+=job.ms;completed++;failures+=job.failures;retries+=job.retries;
  }
  const a=trial.jobs.filter(job=>job.worker==='a'),b=trial.jobs.filter(job=>job.worker==='b');
  const overlap=a.reduce((sum,x)=>sum+b.reduce((sum,y)=>sum+Math.max(0,Math.min(x.native_end,y.native_end)-Math.max(x.native_start,y.native_start)),0),0);
  if(trial.workers===2&&trial.cache_condition==='first request')assert.ok(overlap>0);
  if(trial.workers===1)assert.equal(overlap,0);
  return {index:trial.index,workers:trial.workers,cache_condition:trial.cache_condition,ms:trial.ms,native_ms:native,job_ms:jobTime,native_share:native/jobTime,overlap_ms:overlap};
});
assert.equal(completed,32);assert.equal(failures,0);assert.equal(retries,0);assert.deepEqual(evidence.active_before,evidence.active_after);
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const category=condition=>{const a=trials.filter(t=>t.workers===1&&(!condition||t.cache_condition===condition)),b=trials.filter(t=>t.workers===2&&(!condition||t.cache_condition===condition));return {one_ms:a.map(t=>t.ms),two_ms:b.map(t=>t.ms),one_mean_ms:mean(a.map(t=>t.ms)),two_mean_ms:mean(b.map(t=>t.ms)),throughput_ratio:mean(a.map(t=>t.ms))/mean(b.map(t=>t.ms))};};
const first=trials.filter(t=>t.cache_condition==='first request');assert.ok(first.every(t=>t.native_share>0.5),'First-request workload was not native dominant');
const summary={revision:evidence.revision,dirty_at_start:evidence.dirty_at_start,source_dirty_at_start:evidence.source_dirty_at_start,source_diff_hash:evidence.source_diff_hash,
  completed_jobs:completed,failures,retries,warmup_ms:evidence.warmup.ms,warmup_excluded:true,primary_first_request:category('first request'),secondary_repeated:category('repeated request'),all_requests:category(),
  first_native_share:first.reduce((sum,t)=>sum+t.native_ms,0)/first.reduce((sum,t)=>sum+t.job_ms,0),trials,first_vs_repeated_native_ratios:ratios,
  result_equivalence:true,ledger_equivalence:true,excluded_metrics:['buy_hold_return','buy_hold_return_percent'],additional_exclusions:false,last_bar_times:[...bars],open_positions:0,
  active_tab_unchanged:true,iterations:1500,disjoint_inputs:{a:[100,101,102,103,104,105,106,107],b:[120,121,122,123,124,125,126,127]},
  interpretation:'Native lifecycle includes server/network response time, not CPU-only execution. Cache position is not established. First-request labels are checked against observed durations.'};
assert.ok(summary.primary_first_request.throughput_ratio>1);writeEvidence('heavy-balanced-summary.json',summary);console.log(JSON.stringify(summary,null,2));

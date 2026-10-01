import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { writeEvidence, raw, activeTabs } from './live-utils.mjs';
import { createHash } from 'node:crypto';
import CDP from 'chrome-remote-interface';
const exec=promisify(execFile), hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const workers=[{name:'a',study:'DGZDCG'},{name:'b',study:'WbFocA'}];
const file=name=>`qa/parallel/issue-14/live/worker-${name}.json`;
const evidence={started_at:new Date().toISOString(),revision:process.env.QA_REVISION||null,workload:[22,23,24,25],mode_order:[1,2,2,1,1,2,2,1],trials:[],
  assignment:'static four jobs per workspace; one sequential workflow or two concurrent workflows',
  timer:'Date.now millisecond resolution; before first CLI spawn through last ledger child exit (result committed)',
  comparison:'Full ledger and all strategy metrics except live buy_hold_return / buy_hold_return_percent',
  emulation:{width:1280,height:800,focus:true,fixed:true,tab_switching:false},active_before:await activeTabs()};
let label='warmup';
async function cli(worker,args) {
  const started=Date.now();
  try {
    const result=await exec(process.execPath,['src/cli/index.js','--workspace',file(worker),...args],{timeout:60000,maxBuffer:8*1024*1024});
    return {started_at:started,finished_at:Date.now(),ms:Date.now()-started,result:JSON.parse(result.stdout),stderr:result.stderr};
  }catch(error){return {started_at:started,finished_at:Date.now(),ms:Date.now()-started,exit:error.code,error:error.message,stdout:error.stdout,stderr:error.stderr};}
}
async function bundle(worker,length) {
  const resource=JSON.parse(readFileSync(file(worker.name)));
  const before=await raw(resource.target,'window.__tvCliCompilation?.calculation?.completed?.cycle||0');
  const started=Date.now(),input=await cli(worker.name,['indicator','set',worker.study,'--inputs',JSON.stringify({in_0:length})]);
  if(!input.result?.success)return {worker:worker.name,length,started_at:started,finished_at:Date.now(),success:false,input};
  const report=await cli(worker.name,['data','strategy']);
  if(report.result)report.result.strategy_inputs=report.result.strategy_inputs?.filter(i=>i.id!=='text');
  const pages=[];let trades=[];
  for(let offset=0;;offset+=500){
    const page=await cli(worker.name,['data','ledger','--offset',String(offset),'--limit','500']);
    pages.push(page); if(!page.result?.success)break; trades.push(...page.result.trades);
    if(!page.result.has_more)break;
  }
  const normalized=trades.map(({entry_time,exit_time,entry_bar,exit_bar,raw})=>({entry_time,exit_time,entry_bar,exit_bar,raw}));
  const events=input.result?.provenance?.native_events||[],begin=events.find(e=>e.event==='status'&&e.status===1),end=events.findLast(e=>e.event==='report'&&e.status===2);
  const cycle=input.result?.provenance?.calculation?.completed?.cycle;
  const metrics=Object.fromEntries(Object.entries(report.result?.metrics||{}).filter(([key])=>!key.startsWith('buy_hold_return')));
  const reference=writeEvidence(`benchmark-${label}-${worker.name}-${length}.json.gz`,{worker:worker.name,length,before,input,report,pages},{compressed:true});
  const summary={worker:worker.name,length,started_at:started,finished_at:Date.now(),ms:Date.now()-started,
    success:report.result?.success&&pages.every(page=>page.result?.success)&&trades.length===pages[0].result.total_trades,
    reference,planned_jobs:1,failures:[input,report,...pages].filter(r=>r.exit).length,retries:0,trade_count:trades.length,
    before_cycle:before,completed_cycle:cycle,cycle_increased:Number.isInteger(cycle)&&cycle>before,
    native_start:begin?.at,native_end:end?.at,native_transition:Boolean(begin&&end&&end.at>=begin.at),events,
    inputs_verified:report.result?.strategy_inputs?.find(i=>i.id==='in_0')?.value===length,
    resources_verified:[input,report,...pages].every(r=>r.result?.provenance?.workspace_id===resource.id&&r.result.provenance.target===resource.target&&r.result.provenance.layout===resource.layout&&r.result.provenance.pine===resource.pine),
    net_profit:metrics.net_profit,total_trades:metrics.total_trades,source_hash:input.result?.provenance?.source_hash,
    metrics_hash:hash(metrics),ledger_hash:hash(normalized),result_hash:hash({metrics,trades:normalized})};
  assert.ok(summary.success&&summary.cycle_increased&&summary.native_transition&&summary.inputs_verified&&summary.resources_verified,JSON.stringify(summary));
  return summary;
}
try {
  const version=await CDP.Version({port:9222});evidence.desktop={browser:version.Browser,protocol:version['Protocol-Version']};
  evidence.resources=workers.map(worker=>{const w=JSON.parse(readFileSync(file(worker.name)));return {worker:worker.name,target:w.target,layout:w.layout,pine:w.pine,viewport:w.binding.snapshot.viewport,visibility:w.binding.snapshot.visibility};});
  const warmupStart=Date.now();evidence.warmup={excluded:true,jobs:await Promise.all(workers.map(worker=>bundle(worker,21))),ms:Date.now()-warmupStart};
  for(const [index,mode] of evidence.mode_order.entries()){
    label=`t${index}`;const start=Date.now(),trial={index,workers:mode,planned_jobs:8,started_at:start,jobs:[]};
    if(mode===1){for(const worker of workers)for(const length of evidence.workload)trial.jobs.push(await bundle(worker,length));}
    else {
      const results=await Promise.all(workers.map(async worker=>{const jobs=[];for(const length of evidence.workload)jobs.push(await bundle(worker,length));return jobs;}));
      trial.jobs=results.flat();
    }
    trial.finished_at=Date.now();trial.ms=Date.now()-start;trial.completed=trial.jobs.filter(job=>job.success).length;
    evidence.trials.push(trial);writeEvidence('benchmark.json',evidence);
    console.log(JSON.stringify({index,workers:mode,ms:trial.ms,completed:trial.completed,errors:trial.jobs.filter(j=>!j.success)}));
    if(trial.completed!==8)throw new Error('Incomplete trial; stopping further mutations for diagnosis.');
  }
  evidence.active_after=await activeTabs();assert.deepEqual(evidence.active_after,evidence.active_before);evidence.success=true;
}catch(error){evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence('benchmark.json',evidence);}

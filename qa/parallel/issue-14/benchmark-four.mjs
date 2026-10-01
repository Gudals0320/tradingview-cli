import assert from 'node:assert/strict';
import { cli, manifest, raw, activeTabs, writeEvidence, hash } from './live-utils.mjs';
import { execFileSync } from 'node:child_process';
const names=['a','b','c','d'],resources=Object.fromEntries(names.map(name=>[name,manifest(name)]));
const workloads={a:[22,23],b:[24,25],c:[22,23],d:[24,25]},evidence={started_at:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  mode_order:[1,4,4,1],workloads,active_before:await activeTabs(),trials:[]};
const diff=execFileSync('git',['diff','--binary','HEAD','--','src','package.json'],{encoding:'utf8'});evidence.source_dirty_at_start=Boolean(diff.trim());evidence.source_diff_hash=hash(diff);
async function job(name,length,label){
  const before=await raw(resources[name].target,'window.__tvCliCompilation?.calculation?.completed?.cycle||0'),start=Date.now();
  const input=await cli(['indicator','set',resources[name].binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:length})],{workspace:name});
  const report=await cli(['data','strategy'],{workspace:name}),pages=[];let trades=[];
  if(input.result?.success&&report.result?.success)for(let offset=0;;offset+=500){const page=await cli(['data','ledger','--offset',String(offset),'--limit','500'],{workspace:name});pages.push(page);if(!page.result?.success)break;trades.push(...page.result.trades);if(!page.result.has_more)break;}
  const end=Date.now(),events=input.result?.provenance?.native_events||[],begin=events.find(e=>e.event==='status'&&e.status===1),finish=events.findLast(e=>e.event==='report'&&e.status===2);
  const metrics=Object.fromEntries(Object.entries(report.result?.metrics||{}).filter(([key])=>!key.startsWith('buy_hold_return')));
  const artifact={input,report,pages};const reference=writeEvidence(`four-${label}-${name}-${length}.json.gz`,artifact,{compressed:true});
  const summary={name,length,ms:end-start,started_at:start,finished_at:end,reference,success:input.result?.success&&report.result?.success&&pages.length>0&&pages.every(p=>p.result?.success),failures:[input,report,...pages].filter(r=>r.exit!==0).length,
    before_cycle:before,completed_cycle:input.result?.provenance?.calculation?.completed?.cycle,native_start:begin?.at,native_end:finish?.at,
    result_hash:hash({metrics,trades}),net_profit:metrics.net_profit,total_trades:metrics.total_trades,open_pl:metrics.open_pl};
  assert.ok(summary.success&&summary.completed_cycle>before&&begin&&finish&&finish.at>=begin.at,JSON.stringify(summary));
  assert.equal(report.result.strategy_inputs.find(i=>i.id==='in_0').value,length);
  for(const r of [input,report,...pages]){assert.equal(r.result.provenance.workspace_id,resources[name].id);assert.equal(r.result.provenance.target,resources[name].target);}
  return summary;
}
try {
  const warm=Date.now();evidence.warmup={excluded:true,jobs:await Promise.all(names.map(name=>job(name,21,'warmup'))),ms:Date.now()-warm};
  for(const [index,workers] of evidence.mode_order.entries()){
    const start=Date.now(),trial={index,workers,planned_jobs:8,jobs:[]};
    if(workers===1)for(const name of names)for(const length of workloads[name])trial.jobs.push(await job(name,length,`t${index}`));
    else trial.jobs=(await Promise.all(names.map(async name=>{const jobs=[];for(const length of workloads[name])jobs.push(await job(name,length,`t${index}`));return jobs;}))).flat();
    trial.ms=Date.now()-start;trial.completed=trial.jobs.filter(job=>job.success).length;assert.equal(trial.completed,8);evidence.trials.push(trial);writeEvidence('four-benchmark.json',evidence);
    console.log(JSON.stringify({index,workers,ms:trial.ms,completed:trial.completed}));
  }
  evidence.active_after=await activeTabs();assert.deepEqual(evidence.active_before,evidence.active_after);
  const byLength=new Map();for(const t of evidence.trials)for(const j of t.jobs){if(byLength.has(j.length))assert.equal(j.result_hash,byLength.get(j.length));else byLength.set(j.length,j.result_hash);assert.equal(j.failures,0);assert.equal(j.open_pl,0);}
  evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence('four-benchmark.json',evidence);}

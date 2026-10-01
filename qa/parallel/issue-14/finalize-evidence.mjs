import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeEvidence, hash } from './live-utils.mjs';
const dir=new URL('./live/',import.meta.url),mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
function read(name){return JSON.parse(readFileSync(new URL(name,dir),'utf8'));}
function summarizeFour(name){
  const data=read(name);assert.equal(data.success,true);assert.equal(data.trials.length,4);
  const baseline=new Map();let failures=0,completed=0;const native=[];
  for(const trial of data.trials){let duration=0,jobTime=0;
    for(const job of trial.jobs){
      const raw=JSON.parse(gunzipSync(readFileSync(new URL(job.reference,dir))));
      assert.equal(raw.input.result.success,true);assert.equal(raw.report.result.success,true);assert.ok(job.completed_cycle>job.before_cycle);
      assert.equal(raw.report.result.strategy_inputs.find(i=>i.id==='in_0').value,job.length);
      const metrics=Object.fromEntries(Object.entries(raw.report.result.metrics).filter(([k])=>!k.startsWith('buy_hold_return'))),trades=raw.pages.flatMap(p=>p.result.trades);
      assert.equal(hash({metrics,trades}),job.result_hash);assert.equal(metrics.open_pl,0);assert.equal(trades.filter(t=>!t.exit_time).length,0);
      const key=String(job.length);if(baseline.has(key))assert.equal(job.result_hash,baseline.get(key));else baseline.set(key,job.result_hash);
      completed++;failures+=job.failures;duration+=job.native_end-job.native_start;jobTime+=job.ms;
    }
    native.push({index:trial.index,workers:trial.workers,cache:trial.cache_condition,ms:trial.ms,native_share:duration/jobTime,
      individual_native_ms:trial.jobs.map(job=>job.native_end-job.native_start)});
  }
  assert.equal(completed,32);assert.equal(failures,0);assert.deepEqual(data.active_before,data.active_after);
  const one=data.trials.filter(t=>t.workers===1).map(t=>t.ms),four=data.trials.filter(t=>t.workers===4).map(t=>t.ms);
  const cold1=data.trials.find(t=>t.workers===1&&t.cache_condition==='first request'),cold4=data.trials.find(t=>t.workers===4&&t.cache_condition==='first request');
  return {revision:data.revision,source_dirty_at_start:data.source_dirty_at_start,source_diff_hash:data.source_diff_hash,completed_jobs:completed,failures,retries:0,
    one_ms:one,four_ms:four,ratio:mean(one)/mean(four),cold_ratio:cold1&&cold4?cold1.ms/cold4.ms:null,
    cold_samples_per_mode:cold1?1:null,exploratory:Boolean(cold1),native,result_equivalence:true,ledger_equivalence:true,active_tab_unchanged:true,warmup_ms:data.warmup.ms};
}
writeEvidence('four-summary.json',summarizeFour('four-benchmark.json'));
writeEvidence('native-four-summary.json',summarizeFour('native-four-benchmark.json'));
const faults=read('faults.json');assert.equal(faults.success,true);
for(const item of faults.cases){
  const stable=value=>({...value,studies:value.studies.map(study=>({...study,compiled_hash:undefined,inputs:study.inputs.filter(input=>input.id!=='in_0')}))});
  assert.deepEqual(stable(item.before_b),stable(item.after_b));
  assert.equal(item.after_b.studies[0].inputs.find(i=>i.id==='in_0').value,item.other_report.result.strategy_inputs.find(i=>i.id==='in_0').value);
}
faults.b_only_requested_input_changed=true;faults.measurement_revision='682ba7e';faults.revision_recorded_after_run=true;
faults.dirty_at_start=true;faults.actual_head_at_start='246888d';faults.source_at_start='Uncommitted changes subsequently recorded in 682ba7e; no source edits during the successful fault run. Diff hash was not captured.';
writeEvidence('faults.json',faults);
const light=read('benchmark.json');light.dirty_at_start=true;light.source_dirty_at_start=false;light.dirty_reason='Untracked evidence files; source revision recorded after the run, not automatically captured at its start.';writeEvidence('benchmark.json',light);
const validation=read('validation.json');validation.measurement_revision='3dadaae + verified-failure WIP subsequently committed in 246888d';validation.revision_recorded_after_run=true;writeEvidence('validation.json',validation);
const cleanup=read('cleanup.json');assert.equal(cleanup.success,true);cleanup.measurement_revision='ce31a91';cleanup.dirty_at_start=true;cleanup.source_at_start='Alias hardening and cleanup script WIP subsequently committed in ce31a91; no production source edits during cleanup.';writeEvidence('cleanup.json',cleanup);
const ownerTokens=[];
for(const file of readdirSync(dir).filter(name=>/^worker-.*\.json$/.test(name))){try{const w=read(file);if(w.token)ownerTokens.push(w.token);}catch{}}
const artifacts=[];
for(const file of readdirSync(dir).filter(name=>name!=='artifact-manifest.json'&&!/^worker-.*\.json$/.test(name)&&!name.endsWith('.tmp'))){
  const path=new URL(file,dir);if(!statSync(path).isFile())continue;
  const data=readFileSync(path),plain=file.endsWith('.gz')?gunzipSync(data).toString('utf8'):data.toString('utf8');
  for(const token of ownerTokens)assert.equal(plain.includes(token),false,`Owner token found in ${file}`);
  assert.equal(/(?:Authorization\s*:\s*Bearer|Cookie\s*:|"(?:sessionid|auth_token|password)"\s*:\s*"[^"]+")/i.test(plain),false,`Credential pattern found in ${file}`);
  artifacts.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),hash_encoding:'sha256(file_bytes)'});
}
writeEvidence('artifact-manifest.json',{artifacts,owner_token_scan_count:ownerTokens.length,owner_token_leaks:0,credential_pattern_matches:0,
  provenance:'Dedicated generated Pine fixtures only; no pre-existing user Pine source was recorded. Workspace handles and private .tv-workspaces artifacts stay ignored.'});
console.log({artifacts:artifacts.length,owner_tokens_checked:ownerTokens.length,privacy_pass:true,four:read('four-summary.json').ratio,cold_four:read('native-four-summary.json').cold_ratio});

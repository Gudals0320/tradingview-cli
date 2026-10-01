import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const target=process.argv[2],name='CLI-QA Strategy Reopen 20261001';
assert.ok(target);
const records=[];
function run(label,args,code=0){const r=spawnSync(process.execPath,['src/cli/index.js','--target',target,...args],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
const out=JSON.parse(r.stdout||r.stderr);assert.equal(r.status,code,r.stderr||r.stdout);
writeFileSync(`results/pine-qa/large-edit/guard-${label}.json`,JSON.stringify({args,exit_code:r.status,stdout:r.stdout,stderr:r.stderr},null,2));
const {tabs,studies,strategy_id,strategy_inputs,script_id,compilation_token,entity_id,...safe}=out;
records.push({label,args:args[0]==='indicator'?['indicator','remove','QA-study-id']:args,exit_code:r.status,
output:tabs?{success:out.success}:studies?{matching_study_count:studies.filter(s=>s.name===name).length}:safe});
console.log(JSON.stringify(records.at(-1)));return out;}
const tabs=run('guard',['tab','list']);assert.equal(tabs.tabs.find(t=>t.id===target)?.chart_id,'kdn7wAFi');
run('open',['pine','open',name]);const original=run('before',['state']).studies.filter(s=>s.name===name);assert.equal(original.length,2);
for(const [label,args] of [['compile',['pine','compile']],['raw',['pine','raw-compile']],['save-compile',['pine','compile','--save']]]){
assert.equal(run(label,args,1).code,'AMBIGUOUS_TARGET');assert.equal(run(label+'-state',['state']).studies.filter(s=>s.name===name).length,2);}
// Explicit setup cleanup, before the independent regression. Never auto-repair a
// failed compiler action. These are exactly the two named QA assets from Lead.
for(let index=0;index<original.length;index++)run('cleanup-'+index,['indicator','remove',original[index].id]);
assert.equal(run('after-cleanup',['state']).studies.filter(s=>s.name===name).length,0);
writeFileSync('qa/pine/large-edit/executor-guard-evidence.json',JSON.stringify({name,setup_cleanup_only:true,records},null,2)+'\n');

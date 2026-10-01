// Isolate the new failure using a tiny script; run only on the QA layout.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const target=process.argv[2];
assert.ok(target,'Supply explicit QA target');
const name='CLI-QA Strategy Reopen 20261001';
const errorCycle=process.argv[3]==='error-cycle';
const records=errorCycle?JSON.parse(readFileSync('qa/pine/large-edit/minimal-evidence.json','utf8')).records:[];
mkdirSync('results/pine-qa/large-edit',{recursive:true});
function run(label,args,input) {
  const start=Date.now();
  const r=spawnSync(process.execPath,['src/cli/index.js','--target',target,...args],{encoding:'utf8',input,timeout:65000,maxBuffer:4*1024*1024});
  const out=JSON.parse(r.stdout||r.stderr);
  writeFileSync(`results/pine-qa/large-edit/minimal-${label}.json`,JSON.stringify({args,exit_code:r.status,stdout:r.stdout,stderr:r.stderr},null,2));
  const {strategy_inputs,strategy_id,script_id,compilation_token,tabs,studies,...safe}=out;
  records.push({label,args,exit_code:r.status,elapsed_ms:Date.now()-start,output:studies?{...safe,matching_study_count:studies.filter(s=>s.name===name).length}:tabs?{success:out.success}:safe});
  writeFileSync('qa/pine/large-edit/minimal-evidence.json',JSON.stringify({name,records},null,2)+'\n');
  console.log(JSON.stringify(records.at(-1)));
  return out;
}
const tabs=run('guard',['tab','list']);
assert.equal(tabs.tabs.find(t=>t.id===target)?.chart_id,'kdn7wAFi');
const source=`//@version=6\nstrategy("${name}")\nfast = ta.sma(close, 5)\nslow = ta.sma(close, 20)\nif ta.crossover(fast, slow)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(fast, slow)\n    strategy.close("L")\nplot(fast)\n`;
if (!errorCycle) {
assert.equal(run('before',['state']).studies.filter(s=>s.name===name).length,0,'Use a clean QA study name');
run('new',['pine','new','strategy']);
run('set',['pine','set'],source);
run('save',['pine','save']);
assert.equal(run('first-compile',['pine','compile']).report_ready,true);
assert.equal(run('after-first',['state']).studies.filter(s=>s.name===name).length,1);
run('reopen',['pine','open',name]);
run('edit',['pine','set'],source.replace('close, 5','close, 7'));
run('update',['pine','compile','--save']);
run('after-update',['state']);
run('errors',['pine','errors']);
} else {
  run('error-cycle-open',['pine','open',name]);
  run('error-cycle-broken-set',['pine','set'],source.replace('ta.sma(close, 5)','qa_missing_sma(close, 9)'));
  assert.equal(run('error-cycle-broken-compile',['pine','compile','--save']).has_errors,true);
  run('after-error',['state']);
  run('error-cycle-corrected-set',['pine','set'],source.replace('close, 5','close, 9'));
  run('error-cycle-corrected-compile',['pine','compile','--save']);
  run('after-error-correction',['state']);
  run('error-cycle-errors',['pine','errors']);
}

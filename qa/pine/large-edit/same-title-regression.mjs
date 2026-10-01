import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {configureTarget,evaluate,disconnect} from '../../../src/connection.js';
import {pineStudySnapshot} from '../../../src/core/pine-state.js';
const target=process.argv[2],primary='CLI-QA Strategy Reopen 20261001',other='CLI-QA Recovery Same Title Document 20261001';
assert.ok(target);configureTarget(target);const records=[];
function run(label,args,{input}={}){const r=spawnSync(process.execPath,['src/cli/index.js','--target',target,...args],{encoding:'utf8',input,timeout:45000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr||r.stdout);const out=JSON.parse(r.stdout);
writeFileSync(`results/pine-qa/large-edit/same-title-${label}.json`,JSON.stringify({args,stdout:r.stdout,stderr:r.stderr},null,2));
const safe={...out};for(const key of ['script_id','strategy_id','compilation_token','strategy_inputs','source','scripts','tabs'])delete safe[key];records.push({label,args,output:safe});console.log(JSON.stringify(records.at(-1)));return out;}
const code=name=>`//@version=6\nstrategy("${name}")\nfast = ta.sma(close, 11)\nslow = ta.sma(close, 20)\nif ta.crossover(fast, slow)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(fast, slow)\n    strategy.close("L")\nplot(fast)\n`;
try{
assert.equal(run('guard',['tab','list']).tabs.find(t=>t.id===target)?.chart_id,'kdn7wAFi');
let q;
if(process.argv[3]==='reuse') q=run('reuse-other',['pine','open',other]).script_id;
else {
assert.equal(run('list-guard',['pine','list']).scripts.filter(s=>s.name===other).length,0);
run('new',['pine','new','strategy']);run('set-other',['pine','set'],{input:code(other)});q=run('save-other',['pine','save']).script_id;
assert.equal(run('compile-other',['pine','compile']).report_ready,true);
run('rename-declaration-only',['pine','set'],{input:code(primary)});assert.equal(run('compile-same-title',['pine','compile','--save']).report_ready,true);
}
const p=run('open-primary',['pine','open',primary]).script_id;assert.notEqual(p,q);
await evaluate(`(() => {window.__qaSameTitleOther=(${pineStudySnapshot.toString()})(window).filter(s=>s.pine_id===${JSON.stringify(q)});return true;})()`);
run('edit-primary',['pine','set'],{input:code(primary).replace('close, 11','close, 13')});
assert.equal(run('compile-primary',['pine','compile','--save']).report_ready,true);
const isolated=await evaluate(`(() => {const all=(${pineStudySnapshot.toString()})(window),other=all.filter(s=>s.pine_id===${JSON.stringify(q)});
return {primary_count:all.filter(s=>s.pine_id===${JSON.stringify(p)}).length,other_count:other.length,
other_unchanged:JSON.stringify(other)===JSON.stringify(window.__qaSameTitleOther)};})()`);
assert.deepEqual(isolated,{primary_count:1,other_count:1,other_unchanged:true});
run('final-open-large',['pine','open','CLI-QA Large Edit 20261001']);
writeFileSync('qa/pine/large-edit/executor-same-title-evidence.json',JSON.stringify({primary,other,records,assertions:isolated},null,2)+'\n');
console.log(JSON.stringify(isolated));
}finally{await disconnect();}

// No duplicate-removal workaround. Fresh saved document for minimal regression,
// or replay the existing, explicitly named large QA document through baseline/edit.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {configureTarget,evaluate,disconnect} from '../../../src/connection.js';
import {findPineController} from '../../../src/core/desktop-dom.js';
const [target,mode='fixed',name='CLI-QA Recovery Executor 20261001'] = process.argv.slice(2);
const resume=process.argv[5]==='resume';
const reuse=process.argv[5]==='reuse';
const indicator=process.argv[6]==='indicator';
assert.ok(target && ['repro','fixed','large'].includes(mode));
assert.ok(name.startsWith('CLI-QA'),'Use a disposable QA name');
configureTarget(target);
const root='results/pine-qa/large-edit';mkdirSync(root,{recursive:true});
 const records=[],assertions=[];
const normalize=s=>s.replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(normalize(s)).digest('hex');
const path=`qa/pine/large-edit/executor-${mode}${indicator?'-indicator':''}-evidence.json`;
const assertCompiled=output=>assert.equal(indicator?output.compiled:output.report_ready,true);
const persist=()=>writeFileSync(path,JSON.stringify({mode,name,records,assertions},null,2)+'\n');
function run(label,args,{input,code=0}={}) {
 const started=Date.now();const r=spawnSync(process.execPath,['src/cli/index.js','--target',target,...args],{encoding:'utf8',input,timeout:45000,maxBuffer:8*1024*1024});
 const output=JSON.parse(r.stdout||r.stderr);
 writeFileSync(`${root}/executor-${mode}-${label}.json`,JSON.stringify({args,code:r.status,stdout:r.stdout,stderr:r.stderr},null,2));
 const summary={...output};for(const k of ['strategy_inputs','strategy_id','script_id','compilation_token','tabs','scripts','source','studies','entries'])delete summary[k];
 records.push({label,args,exit_code:r.status,elapsed_ms:Date.now()-started,output:summary});persist();console.log(JSON.stringify(records.at(-1)));
 assert.equal(r.status,code,`${label}: ${r.stderr||r.stdout}`);return output;
}
let scriptId;
async function snapshot(label) {
 const state=await evaluate(`(() => {const c=(${findPineController.toString()})(document), chart=window.TradingViewApi._activeChartWidgetWV.value();
 const button=[...document.querySelectorAll('[data-qa-id="add-script-to-chart"],[data-qa-id="update-script-on-chart"]')].find(e=>e.offsetParent!==null);
 const key=button&&Object.keys(button).find(k=>k.startsWith('__reactProps$'));
 const studies=chart._chartWidget.model().model().dataSources().flatMap(s=>{try{const inputs=chart.getStudyById(s.id()).getInputValues();
 if(inputs.find(i=>i.id==='pineId')?.value!==${JSON.stringify(scriptId)})return [];
 let report=s.reportData?.();if(report?.value)report=report.value();
 return [{name:s.metaInfo().description,status:s.status()?.type,version:inputs.find(i=>i.id==='pineVersion')?.value,
 complete:Boolean(report?.performance?.all)}];}catch{return []}});
 return {handler:String(button?.[key]?.onClick),ui_is_script_on_chart:c._editorStore.getStore().getState().ui.isScriptOnChart,
 modified:c.isModified(),draft:c.isDraft(),version:c.getScriptIdVersion()?.version,study_count:studies.length,studies};})()`);
 assertions.push({label,...state});persist();console.log(JSON.stringify({snapshot:label,...state}));return state;
}
function sourceEqual(label,expected) {const actual=run(label,['pine','get']).source;assert.equal(normalize(actual),expected);assertions.push({label,equal:true,sha256_lf:hash(actual),lines:expected.split('\n').length});persist();}
try {
 const tabs=run('guard',['tab','list']);assert.equal(tabs.tabs.find(t=>t.id===target)?.chart_id,'kdn7wAFi');
 const base=mode==='large'?normalize(readFileSync('qa/pine/large-edit/baseline.pine','utf8')):indicator
 ?`//@version=6\nindicator("${name}")\nfast = ta.sma(close, 5)\nplot(fast)\n`
 :`//@version=6\nstrategy("${name}")\nfast = ta.sma(close, 5)\nslow = ta.sma(close, 20)\nif ta.crossover(fast, slow)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(fast, slow)\n    strategy.close("L")\nplot(fast)\n`;
 if(resume||reuse) {scriptId=run('reuse',['pine','open',name]).script_id;}
 else if(mode==='large') {const opened=run('open-large',['pine','open',name]);scriptId=opened.script_id;assert.equal((await snapshot('initial-large')).study_count,1);}
 else {assert.equal(run('list-guard',['pine','list']).scripts.filter(s=>s.name===name).length,0);run('new',['pine','new','strategy']);}
 if(!resume){
 run('set-baseline',['pine','set'],{input:base});sourceEqual('get-baseline',base);
 let first;
 if(mode==='large') first=run('compile-baseline',['pine','compile','--save']);
 else {const saved=run('save-baseline',['pine','save']);scriptId=saved.script_id;first=run('compile-baseline',['pine','compile']);}
 assertCompiled(first);assert.equal((await snapshot('applied-baseline')).study_count,1);
 const normal=mode==='large'?base+'// QA normal edit\n':base.replace('close, 5','close, 7');
 run('normal-set',['pine','set'],{input:normal});assertCompiled(run('normal-compile',['pine','compile','--save']));assert.equal((await snapshot('normal-applied')).study_count,1);
 }
 const corrected=mode==='large'?normalize(readFileSync('qa/pine/large-edit/edited.pine','utf8')):base.replace('close, 5','close, 9');
 const broken=mode==='large'?normalize(readFileSync('qa/pine/large-edit/broken.pine','utf8')):base.replace('ta.sma(close, 5)','qa_missing_sma(close, 9)');
 run('broken-set',['pine','set'],{input:broken});sourceEqual('get-broken',broken);
 assert.equal(run('broken-check',['pine','check'],{input:broken,code:1}).compiled,false);
 assert.equal(run('broken-compile',['pine','compile','--save'],{code:1}).has_errors,true);assert.equal((await snapshot('after-error')).study_count,1);
 run('corrected-set',['pine','set'],{input:corrected});sourceEqual('get-corrected',corrected);await snapshot('before-recovery');
 const recovered=run('corrected-compile',['pine','compile','--save'],{code:mode==='repro'?1:0});
 const final=await snapshot('after-recovery');
 if(mode==='repro'){assert.equal(recovered.report_ready,false);assert.equal(final.study_count,2);}
 else {
  assertCompiled(recovered);assert.equal(final.study_count,1);
  const retry=run('retry',['pine','compile']);assert.equal(retry.unchanged,true);
  const alias=run('raw-alias',['pine','raw-compile']);assert.equal(alias.unchanged,true);
  assert.equal((await snapshot('after-retry')).study_count,1);
  run('save-final',['pine','save']);
  run('open-sentinel',['pine','open','CLI-QA Large Edit Sentinel 20261001']);
  sourceEqual('sentinel-source',normalize(readFileSync('qa/pine/large-edit/sentinel.pine','utf8')));
  const reopened=run('reopen',['pine','open',name]);assert.equal(reopened.script_id,scriptId);sourceEqual('persisted-source',corrected);
  assert.equal(run('list-final',['pine','list']).scripts.filter(s=>s.id===scriptId&&s.name===name).length,1);
 }
 persist();
}finally{await disconnect();}

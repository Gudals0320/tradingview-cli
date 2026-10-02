import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadWorkspace} from '../src/workspace-store.js';
import {resolveWorkspace} from '../src/workspace-registry.js';
import {getDesktopInventory} from '../src/desktop.js';
import {withSharedSession} from '../src/session.js';
import {switchTab} from '../src/core/tab.js';
import {disconnect} from '../src/connection.js';
import {acquireResources} from '../src/resource-lock.js';

const {values}=parseArgs({options:{'workspace-a':{type:'string'},'workspace-b':{type:'string'},'input-id':{type:'string',default:'in_0'},'observe-from':{type:'string'},out:{type:'string',default:'results/workspace-smoke.json'}}});
const a=values['workspace-a']||process.env.TV_SMOKE_WORKSPACE_A,b=values['workspace-b']||process.env.TV_SMOKE_WORKSPACE_B;
if(!a||!b)throw Object.assign(new Error('Provide two explicit dedicated --workspace-a/--workspace-b names (or TV_SMOKE_WORKSPACE_A/B).'),{code:'WORKSPACE_REQUIRED'});
const wa=loadWorkspace(resolveWorkspace(a)),wb=loadWorkspace(resolveWorkspace(b));
assert.notEqual(wa.id,wb.id);assert.notEqual(wa.layout,wb.layout);assert.ok(wa.pine&&wb.pine);assert.notEqual(wa.pine,wb.pine);
const evidence={at:new Date().toISOString(),sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),resources:[{name:a,id:wa.id,target:wa.target,layout:wa.layout,pine:wa.pine},{name:b,id:wb.id,target:wb.target,layout:wb.layout,pine:wb.pine}],runs:[]};
const output=resolve(values.out);mkdirSync(dirname(output),{recursive:true});
function sanitize(value) {
  if(Array.isArray(value))return value.map(sanitize);
  if(value&&typeof value==='object') {
    if(value.id==='text')return {id:'text',value_hash:createHash('sha256').update(String(value.value)).digest('hex')};
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)]));
  }
  return value;
}
function run(workspace,args,{stream=false,env={}}={}) {
  const started=Date.now(),child=spawn(process.execPath,['src/cli/index.js','--workspace',workspace,...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,...env}});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setTimeout(()=>child.kill(),stream?8000:60000);
  return new Promise(resolve=>child.once('exit',(exit,signal)=>{
    clearTimeout(timer);let value;
    try{value=JSON.parse(stdout);}catch{/* JSONL streams are retained as samples. */}
    const result={workspace,args,started,ended:Date.now(),exit,signal,value:sanitize(value),samples:stream?stdout.trim().split('\n').filter(Boolean).map(line=>sanitize(JSON.parse(line))):undefined,stderr};evidence.runs.push(result);writeFileSync(output,JSON.stringify(evidence,null,2));resolve(result);
  }));
}
const baseline=await withSharedSession(()=>getDesktopInventory());
evidence.before_tabs=baseline.tabs;evidence.previous_target=baseline.tabs.find(tab=>tab.active)?.id;
try {
  if(values['observe-from']) {
    const lock=await acquireResources(['app'],{command:'smoke select observer'});
    try{await withSharedSession(()=>switchTab({target_id:values['observe-from']}));}finally{await disconnect();lock.release();}
  }
  const foreground=await withSharedSession(()=>getDesktopInventory());evidence.foreground_at_start=foreground.tabs.find(tab=>tab.active)?.id;
  evidence.parallel_compile=await Promise.all([run(a,['pine','compile']),run(b,['pine','compile'])]);
  evidence.parallel_compile.forEach(result=>assert.equal(result.exit,0,result.stderr));
  const studyA=evidence.parallel_compile[0].value.provenance.study.id,studyB=evidence.parallel_compile[1].value.provenance.study.id;
  const inputs=await Promise.all([run(a,['indicator','get',studyA]),run(b,['indicator','get',studyB])]);
  const next=inputs.map(result=>Number(result.value.inputs.find(input=>input.id===values['input-id']).value)+1);
  evidence.parallel_calculation=await Promise.all([
    run(a,['indicator','set',studyA,'--inputs',JSON.stringify({[values['input-id']]:next[0]})]),
    run(b,['indicator','set',studyB,'--inputs',JSON.stringify({[values['input-id']]:next[1]})]),
    new Promise(resolve=>setTimeout(resolve,150)).then(()=>run(b,['workspace','wait','--timeout','10000'])),
    run(b,['workspace','show',b]),
  ]);
  evidence.parallel_calculation.forEach(result=>assert.equal(result.exit,0,result.stderr));
  evidence.stream_coexistence=await Promise.all([run(a,['stream','quote','--interval','100'],{stream:true}),run(b,['timeframe','4H'])]);
  assert.equal(evidence.stream_coexistence[1].exit,0,evidence.stream_coexistence[1].stderr);assert.ok(evidence.stream_coexistence[0].samples.length);
  evidence.same_resource_queue=await Promise.all([run(b,['timeframe','1H']),run(b,['timeframe','4H']),run(b,['workspace','wait','--timeout','10000']),run(b,['state'])]);
  evidence.same_resource_queue.forEach(result=>assert.equal(result.exit,0,result.stderr));
  assert.ok(evidence.same_resource_queue.slice(0,2).some(result=>result.value.provenance.locks.waited_for.length));
  evidence.reports=await Promise.all([run(a,['data','strategy']),run(b,['data','strategy'])]);
  evidence.reports.forEach(result=>{assert.equal(result.exit,0,result.stderr);assert.equal(result.value.calculation_pending,false);assert.ok(result.value.report_revision);});
  if(values['observe-from']&&![wa.target,wb.target].includes(evidence.foreground_at_start)) {
    evidence.hidden_screenshot=await run(a,['screenshot','--output','workspace-hidden-smoke']);assert.equal(evidence.hidden_screenshot.exit,1);assert.equal(JSON.parse(evidence.hidden_screenshot.stderr).code,'FOREGROUND_REQUIRED');
    evidence.hidden_ui=await run(a,['ui','find','chart']);assert.equal(evidence.hidden_ui.exit,1);assert.equal(JSON.parse(evidence.hidden_ui.stderr).code,'FOREGROUND_REQUIRED');
  }
  evidence.success=true;
}finally{
  if(evidence.previous_target){const lock=await acquireResources(['app'],{command:'smoke restore selected tab'});try{await withSharedSession(()=>switchTab({target_id:evidence.previous_target}));}finally{await disconnect();lock.release();}}
  evidence.after_tabs=(await withSharedSession(()=>getDesktopInventory())).tabs;writeFileSync(output,JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({success:evidence.success,sha:evidence.sha,dirty:evidence.dirty,output,runs:evidence.runs.length}));

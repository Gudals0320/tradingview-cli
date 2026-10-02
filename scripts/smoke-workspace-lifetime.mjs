import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {getDesktopInventory} from '../src/desktop.js';
import {withSharedSession} from '../src/session.js';
import {switchTab} from '../src/core/tab.js';
import {disconnect} from '../src/connection.js';
import {acquireResources} from '../src/resource-lock.js';
const {values}=parseArgs({options:{name:{type:'string',default:`lifetime-${Date.now()}`},'connection-workspace':{type:'string'},out:{type:'string',default:'results/workspace-lifetime.json'}}});
const output=resolve(values.out);mkdirSync(dirname(output),{recursive:true});
const evidence={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),at:new Date().toISOString(),runs:[]};
function call(args,expected=0,env={}) {
  const started=Date.now(),result=spawnSync(process.execPath,['src/cli/index.js',...args],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});
  const value=JSON.parse(result.stdout.trim()||result.stderr);evidence.runs.push({args,started,ended:Date.now(),exit:result.status,value});writeFileSync(output,JSON.stringify(evidence,null,2));assert.equal(result.status,expected,result.stderr);return value;
}
function stream(name) {
  const child=spawn(process.execPath,['src/cli/index.js','--workspace',name,'stream','quote','--interval','100'],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Stream produced no sample'));},10000);child.stdout.on('data',()=>{if(stdout.includes('\n')){clearTimeout(timer);resolve();}});});
  const stopped=new Promise(resolve=>child.once('close',(exit,signal)=>resolve({exit,signal,stdout,stderr})));
  return {child,ready,stopped};
}
const before=await withSharedSession(()=>getDesktopInventory()),previous=before.tabs.find(tab=>tab.active)?.id;evidence.before_tabs=before.tabs;
let activeStream;
try {
  call(['status']);
  const created=call(['layout','create',`CLI-Lifetime-${values.name}`]);evidence.created_layout=created;
  const workspace=call(['workspace','create',values.name,'--layout',created.chart_id]);evidence.workspace=workspace;
  const initial=call(['workspace','show',values.name]);
  activeStream=stream(values.name);await activeStream.ready;
  evidence.reconnect=call(['workspace','reconnect',values.name,'--generation',initial.generation]);
  evidence.generation_stream=await activeStream.stopped;activeStream=null;assert.equal(evidence.generation_stream.exit,1);assert.match(evidence.generation_stream.stderr,/WORKSPACE_GENERATION_CHANGED/);
  activeStream=stream(values.name);await activeStream.ready;
  evidence.close=call(['--workspace',values.name,'tab','close']);
  evidence.lost_stream=await activeStream.stopped;activeStream=null;assert.equal(evidence.lost_stream.exit,1);assert.match(evidence.lost_stream.stderr,/TARGET_NOT_FOUND|WORKSPACE_TARGET_LOST/);
  evidence.lost_state=call(['--workspace',values.name,'state'],1);assert.equal(evidence.lost_state.code,'WORKSPACE_TARGET_LOST');
  if(values['connection-workspace']) {
    evidence.disconnected=call(['--workspace',values['connection-workspace'],'state'],2,{TV_CDP_HOST:'127.0.0.2',TV_CDP_TIMEOUT_MS:'1000'});assert.equal(evidence.disconnected.code,'WORKSPACE_DISCONNECTED');
    evidence.connected=call(['--workspace',values['connection-workspace'],'state']);
  }
  evidence.success=true;
}finally {
  activeStream?.child.kill();
  if(previous){const lock=await acquireResources(['app'],{command:'lifetime smoke restore selection'});try{await withSharedSession(()=>switchTab({target_id:previous}));}finally{await disconnect();lock.release();}}
  evidence.after_tabs=(await withSharedSession(()=>getDesktopInventory())).tabs;writeFileSync(output,JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({success:evidence.success,sha:evidence.sha,dirty:evidence.dirty,output,retained_layout:evidence.created_layout?.chart_id,closed_target:evidence.created_layout?.target}));

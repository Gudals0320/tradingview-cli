import CDP from '../src/cdp.js';
import {CDP_HOST,CDP_PORT} from '../src/config.js';
import {findPineController,findPineEditor} from '../src/core/desktop-dom.js';
import {loadWorkspace,workspaceStatus} from '../src/workspace-store.js';
import {resolveWorkspace} from '../src/workspace-registry.js';
import {resourceLockStatus,acquireResources} from '../src/resource-lock.js';
import {withSharedSession} from '../src/session.js';
import {configureTarget,disconnect} from '../src/connection.js';
import * as pine from '../src/core/pine.js';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {values}=parseArgs({options:{workspace:{type:'string'},'draft-name':{type:'string',default:`draft-${Date.now()}`},out:{type:'string',default:'results/workspace-protection.json'}}});
if(!values.workspace)throw new Error('Pass --workspace for an explicitly dedicated saved test strategy.');
const workspace=loadWorkspace(resolveWorkspace(values.workspace));
assert.ok(workspace.binding.snapshot.source.includes('CLI-I29-'),'Only the newly created issue29 test documents are permitted.');
const output=resolve(values.out);mkdirSync(dirname(output),{recursive:true});
const evidence={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),target:workspace.target,checks:[],runs:[]};
const helpers=`const controller=(${findPineController.toString()})(document),editor=(${findPineEditor.toString()})(document);`;
const client=await CDP({host:CDP_HOST,port:CDP_PORT,target:workspace.target});
async function ev(expression,c=client){const result=await c.Runtime.evaluate({expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function state(){return ev(`(()=>{${helpers}const c=window.TradingViewApi._activeChartWidgetWV.value();return {source:editor.editor.getValue(),identity:controller.getScriptIdVersion(),draft:controller.isDraft(),modified:controller.isModified(),studies:c.getAllStudies().map(s=>({id:s.id,visible:c.getStudyById(s.id).isVisible(),inputs:c.getStudyById(s.id).getInputValues().filter(i=>i.id!=='text')}))};})()`);}
function cli(args,exit=0,name=values.workspace){const raw=spawnSync(process.execPath,['src/cli/index.js',...(name?['--workspace',name]:[]),...args],{encoding:'utf8',timeout:60000});const value=JSON.parse(raw.stdout.trim()||raw.stderr);evidence.runs.push({args,exit:raw.status,code:value.code,success:value.success,source_hash:value.source_hash,provenance:value.provenance?{workspace_id:value.provenance.workspace_id,page_generation:value.provenance.page_generation}:null});assert.ok((Array.isArray(exit)?exit:[exit]).includes(raw.status),raw.stderr||JSON.stringify({code:value.code,error:value.error}));return value;}
function record(name,detail={}){evidence.checks.push({name,passed:true,...detail});writeFileSync(output,JSON.stringify(evidence,null,2));}
let fault=false,child;
try{
  cli(['pine','compile']);const before=await state();assert.equal(before.modified,false);assert.equal(before.draft,false);
  const mismatch=cli(['pine','save','--expect-script-id','not-the-owned-document'],1);assert.equal(mismatch.code,'PINE_DOCUMENT_MISMATCH');assert.equal(hash(await state()),hash(before));record('document mismatch dispatches no native save');
  const study=before.studies.find(s=>s.inputs.some(i=>i.id==='pineId'&&i.value===workspace.pine)),input=study.inputs.find(i=>/^in_/.test(i.id)&&Number.isFinite(Number(i.value)));
  assert.ok(input);
  const invalid=cli(['indicator','set',study.id,'--inputs',JSON.stringify({[input.id]:123456,unknownSmoke:7})],1);assert.equal(invalid.code,'UNKNOWN_INPUT');assert.equal(hash((await state()).studies),hash(before.studies));record('unknown inputs fail atomically');
  const typed=String(Number(input.value)+2);cli(['indicator','set',study.id,'--inputs',JSON.stringify({[input.id]:typed})]);assert.equal((await state()).studies.find(s=>s.id===study.id).inputs.find(i=>i.id===input.id).value,typed);cli(['indicator','set',study.id,'--inputs',JSON.stringify({[input.id]:input.value})]);record('numeric-string native type preserved');
  cli(['indicator','toggle',study.id,'--hidden']);const hiddenReport=cli(['data','strategy'],[0,1]);assert.equal((await state()).studies.find(s=>s.id===study.id).visible,false);cli(['indicator','toggle',study.id,study.visible?'--visible':'--hidden']);record('report reads preserve hidden strategy',{read_code:hiddenReport.code||null});
  await ev(`(()=>{${helpers}if(controller.isModified()||controller.isDraft())throw new Error('Foreign draft');window.__workspaceSmokeFault={controller,translate:controller._editorStore.translateScript};window.__tvCliCompilation=null;window.__tvCliVerifiedStrategies=new Map();controller._editorStore.translateScript=function(){const f=window.__workspaceSmokeFault;f.dispatched=true;return new Promise((_,reject)=>{f.reject=reject;});};return true;})()`);fault=true;
  child=spawn(process.execPath,['src/cli/index.js','--workspace',values.workspace,'pine','compile'],{stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
  const deadline=Date.now()+15000;while(!await ev('Boolean(window.__workspaceSmokeFault?.dispatched&&window.__tvCliPineCompile&&!window.__tvCliPineCompile.actionDone)')){if(Date.now()>deadline)throw new Error('Held native translation was not dispatched');await new Promise(resolve=>setTimeout(resolve,20));}
  const operation=workspaceStatus(workspace.file).operation;assert.ok(operation);const stopped=new Promise(resolve=>child.once('close',resolve));child.kill('SIGKILL');await stopped;child=null;
  const holder=resourceLockStatus().holders.find(h=>h.workspace_id===workspace.id);assert.ok(holder);
  const fenced=cli(['timeframe','60'],1);assert.equal(fenced.code,'LOCK_HOLDER_DEAD');cli(['workspace','interrupt','--operation',operation.id]);const pending=cli(['workspace','recover','--operation',operation.id],1);assert.equal(pending.code,'WORKSPACE_NATIVE_BUSY');
  await ev(`(async()=>{const f=window.__workspaceSmokeFault;f.controller._editorStore.translateScript=f.translate;f.reject(new Error('Owned smoke cleanup'));await window.__tvCliPineCompile?.promise;return true;})()`);fault=false;
  cli(['workspace','recover','--operation',operation.id]);cli(['workspace','lock-clear','--token',holder.token]);await ev('delete window.__workspaceSmokeFault;true');cli(['pine','compile']);record('killed native operation fences mutations; explicit recover and exact dead-token clear succeed without reload',{operation_id:operation.id});
  const cliUrl=new URL('../src/cli/index.js',import.meta.url).href;
  const signal=spawnSync(process.execPath,['--input-type=module','-e',`process.argv=['node','tv','--workspace',${JSON.stringify(values.workspace)},'stream','quote','--interval','100'];setTimeout(()=>process.emit('SIGINT'),1200);await import(${JSON.stringify(cliUrl)});`],{encoding:'utf8',timeout:15000});assert.equal(signal.status,0,signal.stderr);signal.stdout.trim().split('\n').filter(Boolean).forEach(line=>JSON.parse(line));assert.equal(workspaceStatus(workspace.file).operation,null);record('live CLI SIGINT handler emits only JSONL and releases observation',{signal:'process.emit(SIGINT), same registered handler; no OS console event injected'});
  const created=cli(['layout','create',`CLI-I29-Protection-${values['draft-name']}`],0,null),registered=cli(['workspace','create',values['draft-name'],'--layout',created.chart_id],0,null);evidence.draft_resource={...created,workspace_id:registered.workspace_id,name:values['draft-name']};
  const draftWorkspace=loadWorkspace(resolveWorkspace(values['draft-name'])),lock=await acquireResources(['app',`layout:${draftWorkspace.layout}`,`workspace:${draftWorkspace.id}`],{command:'owned draft smoke setup'});
  try{await withSharedSession(async()=>{configureTarget(draftWorkspace.target);await pine.ensurePineEditorOpen();await pine.newScript({type:'indicator'});await pine.setSource({source:readFileSync(new URL('./fixtures/smoke-indicator.pine',import.meta.url),'utf8')});const compiled=await pine.smartCompile();assert.equal(compiled.success,true);const saved=await pine.save();assert.equal(saved.success,false);assert.equal(saved.saved,false);assert.equal(saved.persistence_kind,'draft');evidence.draft_save={saved:saved.saved,persistence_kind:saved.persistence_kind};});}finally{await disconnect();lock.release();}
  const noSave=cli(['pine','save'],1,values['draft-name']);assert.equal(noSave.code,'WORKSPACE_PINE_REQUIRED');record('unmodified draft cannot claim saved-document persistence; named chart-only save rejects before editor mutation');
  assert.equal((await state()).source,before.source);assert.equal((await state()).modified,before.modified);evidence.success=true;
}finally{
  child?.kill();
  if(fault){await ev(`(async()=>{const f=window.__workspaceSmokeFault;if(f){f.controller._editorStore.translateScript=f.translate;f.reject?.(new Error('Owned smoke cleanup'));await window.__tvCliPineCompile?.promise;}return true;})()`);}
  await client.close();writeFileSync(output,JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({success:evidence.success,sha:evidence.sha,dirty:evidence.dirty,checks:evidence.checks.length,output,draft_resource:evidence.draft_resource}));

import CDP from '../src/cdp.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withReadOnlySession, sessionStatus, sourceHash } from '../src/session.js';
import { findPineController, findPineEditor } from '../src/core/desktop-dom.js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('results/pr23-review');mkdirSync(root,{recursive:true});
const evidenceRoot=join(root,`executor-native-fault-${Date.now()}`);mkdirSync(evidenceRoot);
const inventory=await withReadOnlySession(()=>getDesktopInventory());
const qa=[];
for(const tab of inventory.tabs.filter(t=>t.id&&t.is_chart)) {
  if(await withReadOnlySession(()=>inspectTarget(tab,`document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]==='CLI-QA-I22-A'`)))qa.push(tab);
}
assert.equal(qa.length,1);assert.equal(sessionStatus().locked,false);assert.equal(sessionStatus().recovery_required,false);
const helpers=`const c=(${findPineController.toString()})(document),e=(${findPineEditor.toString()})(document);`;
const snapshot=`(()=>{${helpers}const chart=window.TradingViewApi._activeChartWidgetWV.value();return JSON.stringify({source:e?.editor.getValue(),identity:c?.getScriptIdVersion(),modified:c?.isModified(),symbol:chart.symbol(),resolution:chart.resolution(),studies:chart.getAllStudies().map(s=>({id:s.id,inputs:chart.getStudyById(s.id).getInputValues()}))});})()`;
const protectedTabs=inventory.tabs.filter(tab=>tab.is_chart&&tab.id!==qa[0].id);
const protectedHashes=()=>withReadOnlySession(()=>Promise.all(protectedTabs.map(async tab=>sourceHash(await inspectTarget(tab,snapshot)))));
const protectedBefore=await protectedHashes();
const client=await CDP({target:qa[0].id});
const ev=async expression=>{const r=await client.Runtime.evaluate({expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
const before=sourceHash(await ev(snapshot));let installed=false,output;
function cli(args,label) {
  const raw=spawnSync(process.execPath,['src/cli/index.js','--target',qa[0].id,...args],{encoding:'utf8',timeout:40000});
  writeFileSync(join(evidenceRoot,`${label}-private.json`),JSON.stringify(raw));
  const json=raw.stdout.trim()||raw.stderr.trim();
  return {exit:raw.status,value:json.startsWith('{')?JSON.parse(json):null};
}
try {
  assert.equal(await ev(`(()=>{${helpers}if(!e.editor.getValue().includes('CLI-QA-I22-Strategy')||c.isModified()||c.isDraft())return false;
    if(window.__tvCliSave?.pending||(window.__tvCliPineCompile&&!window.__tvCliPineCompile.actionDone))return false;
    window.__qaI23Fault={c,translate:c._editorStore.translateScript,modified:c.isModified,compile:window.__tvCliPineCompile,epoch:window.__tvCliCompilation,cache:window.__tvCliVerifiedStrategies};
    window.__tvCliCompilation=null;window.__tvCliVerifiedStrategies=new Map();
    c._editorStore.translateScript=function(){const f=window.__qaI23Fault;f.dispatched=true;
      c.isModified=()=>{throw new Error('CLI-QA-I23 injected observation failure');};
      return f.promise=new Promise((_,reject)=>{f.reject=reject;});};return true;})()`),true);
  installed=true;
  const result=cli(['pine','compile'],'compile');
  const nativePending=await ev('Boolean(window.__tvCliPineCompile?.dispatched&&!window.__tvCliPineCompile?.actionDone)');
  assert.equal(result.exit,1);assert.equal(nativePending,true);assert.equal(result.value.recovery_required,true);
  assert.equal(sessionStatus().recovery_required,true);
  const next=cli(['ui','eval','1'],'blocked');assert.equal(next.exit,1);assert.equal(next.value.code,'RECOVERY_REQUIRED');
  const state=sessionStatus();
  const recovery=cli(['session','recover','--run-id',state.recovery_run_id],'pending-recovery');
  assert.equal(recovery.exit,1);assert.equal(recovery.value.code,'NATIVE_BUSY');assert.equal(sessionStatus().recovery_required,true);
  output={evidence:'live injected QA translate promise and getter error; no actual translation/source write',compile_exit:1,
    native_pending:true,fence_retained:true,follow_up_mutation_blocked:true,pending_recovery_refused:true};
} finally {
  if(installed) {
    // End the held native fixture before recovery. Never remove a journal file.
    await ev(`(async()=>{const f=window.__qaI23Fault;f.c.isModified=f.modified;f.c._editorStore.translateScript=f.translate;
      f.reject?.(new Error('CLI-QA-I23 cleanup'));await window.__tvCliPineCompile?.promise;return true;})()`);
    const state=sessionStatus();
    if(state.recovery_required)assert.equal(cli(['session','recover','--run-id',state.recovery_run_id],'settled-recovery').exit,0);
    await ev(`(()=>{const f=window.__qaI23Fault;window.__tvCliCompilation?.dispose?.();window.__tvCliPineCompile=f.compile;
      window.__tvCliCompilation=f.epoch;window.__tvCliVerifiedStrategies=f.cache;delete window.__qaI23Fault;return true;})()`);
  }
  if(output) {
    output.explicit_settled_recovery=true;output.qa_state_unchanged=sourceHash(await ev(snapshot))===before;
    output.protected_tabs_unchanged=JSON.stringify(await protectedHashes())===JSON.stringify(protectedBefore);
    output.locked=sessionStatus().locked;output.recovery_required=sessionStatus().recovery_required;
    assert.equal(output.qa_state_unchanged,true);assert.equal(output.protected_tabs_unchanged,true);
    assert.equal(output.locked,false);assert.equal(output.recovery_required,false);
    writeFileSync(join(root,'executor-native-fault-summary.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
  }
  await client.close();
}

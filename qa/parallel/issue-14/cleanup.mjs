import assert from 'node:assert/strict';
import CDP from 'chrome-remote-interface';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { cli, identity, manifest, raw, activeTabs, writeEvidence } from './live-utils.mjs';
import { readReservations, sessionPaths } from '../../../src/session.js';
import { WORKSPACE_PAGE_CODE } from '../../../src/workspace-page.js';
const resources=Object.fromEntries(['a','b','c','d'].map(name=>[name,manifest(name)]));
const evidence={started_at:new Date().toISOString(),active_before:await activeTabs(),steps:[],saved_test_fixtures_retained:true};
const file=name=>`qa/parallel/issue-14/live/worker-${name}.json`,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function step(args,workspace,allowFailure=false){const r=await cli(args,{workspace});evidence.steps.push({workspace,...r});if(!allowFailure)assert.equal(r.result?.success,true,r.stderr||JSON.stringify(r.result));return r;}
try {
  const d=resources.d,b=resources.b,before=await identity('b');
  const length=before.studies[0].inputs.find(input=>input.id==='in_0').value+1;
  const other=step(['indicator','set',b.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:length})],'b');
  const browser=await CDP({target:(await CDP.Version({port:9222})).webSocketDebuggerUrl});
  evidence.target_closed=await browser.Target.closeTarget({targetId:d.target});await browser.close();assert.equal(evidence.target_closed.success,true);
  evidence.b_after_target_loss=await other;evidence.b_report=await step(['data','strategy'],'b');
  assert.equal(evidence.b_report.result.strategy_inputs.find(input=>input.id==='in_0').value,length);
  const lost=await step(['state'],'d',true);assert.match(lost.stderr,/WORKSPACE_TARGET_LOST/);evidence.target_loss=lost;
  await step(['workspace','abandon','--file',file('d'),'--id',d.id]);
  const bypass=await step(['--target',b.target,'state'],null,true);assert.match(bypass.stderr,/WORKSPACE_RESERVED/);evidence.other_reservations_preserved=bypass;
  // Simulate a dead metadata transaction while B runs, then explicitly repair it.
  const next=step(['indicator','set',b.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:length+1})],'b');
  let pending=false;for(let i=0;i<150;i++){const snapshot=await raw(b.target,`(()=>{${WORKSPACE_PAGE_CODE};return readWorkspacePage(window,document);})()`);if(snapshot.calculating){pending=true;break;}await sleep(10);}
  assert.ok(pending);const paths=sessionPaths(),token=randomUUID();assert.equal(existsSync(paths.gate),false);
  writeFileSync(paths.gate,JSON.stringify({pid:99999999,token,created_at:new Date().toISOString(),fixture:true}),{flag:'wx',mode:0o600});
  for(let i=0;i<200;i++){if(await raw(b.target,'window.__tvCliWorkspace?.operation')===null)break;await sleep(25);}
  evidence.gate_status=await step(['workspace','gate-status']);assert.equal(evidence.gate_status.result.owner_alive,false);
  evidence.gate_clear=await step(['workspace','gate-clear','--token',token]);evidence.b_after_gate_repair=await next;
  evidence.gate_repair_report=await step(['data','strategy'],'b');
  // Drop each remaining reservation, preserving per-workspace private artifacts.
  for(const name of ['a','b','c'])await step(['workspace','release','--file',file(name)]);
  assert.equal(readReservations().length,0);evidence.reservations_remaining=0;
  // Close only the dedicated test tabs. Original tab/content are not manipulated.
  for(const name of ['c','b','a']){
    const list=await cli(['tab','list']);assert.equal(list.result?.success,true);
    const tab=list.result.tabs.find(tab=>tab.id===resources[name].target);if(!tab)continue;
    await step(['tab','switch',String(tab.index)]);await step(['tab','close']);
  }
  let list=await cli(['tab','list']);assert.equal(list.result?.success,true);
  const preparation=JSON.parse(readFileSync(new URL('live/prepare-four.json',import.meta.url)));
  const recordedD=preparation.steps.flatMap(step=>step.result?.tabs||[]).find(tab=>tab.id===resources.d.target);
  const ghost=recordedD&&list.result.tabs.find(tab=>tab.shell_tab_id===recordedD.shell_tab_id&&tab.id===null);
  if(ghost){
    await step(['--target',ghost.shell_target_id,'ui','eval',`(()=>{const tab=document.getElementById(${JSON.stringify(ghost.shell_tab_id)});if(!tab)throw new Error('Owned ghost tab missing');const button=tab.querySelector('[class*="close"] button');if(!button)throw new Error('Owned ghost close missing');button.click();return {closed_owned_ghost:true};})()`]);
    await sleep(500);list=await cli(['tab','list']);assert.equal(list.result?.success,true);
  }
  evidence.remaining_tabs=list.result.tabs.map(tab=>({id:tab.id,chart_id:tab.chart_id,active:tab.active}));
  assert.equal(evidence.remaining_tabs.length,1);assert.equal(evidence.remaining_tabs[0].chart_id,'KHbeIfLo');assert.equal(evidence.remaining_tabs[0].active,true);
  const state=await cli(['state']);assert.equal(state.result?.success,true);evidence.legacy_restored={success:true};evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();evidence.ms=Date.parse(evidence.finished_at)-Date.parse(evidence.started_at);writeEvidence('cleanup.json',evidence);console.log({success:evidence.success,ms:evidence.ms,error:evidence.error});}

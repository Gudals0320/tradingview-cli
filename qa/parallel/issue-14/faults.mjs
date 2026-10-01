import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import CDP from 'chrome-remote-interface';
import { cli, identity, manifest, raw, activeTabs, writeEvidence } from './live-utils.mjs';
import { readReservations } from '../../../src/session.js';
import { WORKSPACE_PAGE_CODE } from '../../../src/workspace-page.js';
const a=manifest('a'),b=manifest('b'),file=name=>`qa/parallel/issue-14/live/worker-${name}.json`;
const evidence={started_at:new Date().toISOString(),active_before:await activeTabs(),cases:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function step(args,workspace,allowFailure=false){const r=await cli(args,{workspace});if(!allowFailure)assert.equal(r.result?.success,true,r.stderr||JSON.stringify(r.result));return r;}
async function waitIdle(){for(let i=0;i<150;i++){try{if(!(await identity('a')).pending)return;}catch{}await sleep(100);}throw new Error('A did not quiesce.');}
async function recover(operation,rebind=false){await waitIdle();return step(['workspace','recover','--file',file('a'),'--operation',operation,...(rebind?['--rebind']:[])],null);}
async function killCase(kind,index){
  const beforeB=await identity('b'),test={kind,before_b:beforeB,steps:[]};
  const currentA=(await identity('a')).studies[0].inputs.find(input=>input.id==='in_0').value;
  const nextB=beforeB.studies[0].inputs.find(input=>input.id==='in_0').value+3+index;
  if(kind!=='calculation'){
    writeFileSync(new URL(`live/fixture-${kind}.pine`,import.meta.url),readFileSync(new URL('fixture-a.pine',import.meta.url),'utf8')+`// ${kind} interruption test ${index}\n`);
    test.steps.push(await step(['pine','set','--file',`qa/parallel/issue-14/live/fixture-${kind}.pine`],'a'));
  }
  const args=kind==='calculation'?['indicator','set',a.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:currentA+7})]
    :kind==='save'?['pine','save']:['pine','compile','--save'];
  const actor=spawn(process.execPath,['src/cli/index.js','--workspace',file('a'),...args],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',exited=false;actor.stdout.on('data',data=>stdout+=data);actor.stderr.on('data',data=>stderr+=data);
  const exit=new Promise(resolve=>actor.on('exit',code=>{exited=true;resolve(code);}));
  const other=step(['indicator','set',b.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:nextB})],'b');
  let operation,observed;
  for(let attempt=0;attempt<300&&!exited;attempt++){
    const row=readReservations().find(row=>row.id===a.id);operation=row?.operation?.id;
    if(operation){
      observed=await raw(a.target,`(()=>{${WORKSPACE_PAGE_CODE};const state=readWorkspacePage(window,document);return {pending:state.pending,pending_action:state.pending_action,calculating:state.calculating,
        save:window.__tvCliSave?.pending,compile:window.__tvCliPineCompile?{actionDone:window.__tvCliPineCompile.actionDone,started:window.__tvCliPineCompile.started}:null,events:window.__tvCliWorkspace?.events};})()`);
      const match=kind==='calculation'?observed.calculating:kind==='save'?observed.save:observed.compile?.actionDone===false;
      if(match){test.kill_at=Date.now();test.observed_at_kill=observed;actor.kill('SIGKILL');break;}
    }
    await sleep(5);
  }
  test.exit=await exit;test.stdout=stdout;test.stderr=stderr;assert.ok(test.kill_at,'Could not observe native operation before process exit.');
  test.other_input=await other;test.other_report=await step(['data','strategy'],'b');
  const afterB=await identity('b');assert.equal(afterB.source_hash,beforeB.source_hash);assert.equal(afterB.pine,beforeB.pine);assert.deepEqual(afterB.context,beforeB.context);test.after_b=afterB;
  test.steps.push(await step(['workspace','interrupt','--file',file('a'),'--operation',operation],null));
  const wrong=await step(['workspace','recover','--file',file('a'),'--operation','wrong'],null,true);assert.match(wrong.stderr,/WORKSPACE_OPERATION_MISMATCH/);test.wrong_recovery=wrong;
  test.recovery=await recover(operation);test.steps.push(await step(['pine','set','--file','qa/parallel/issue-14/fixture-a.pine'],'a'));
  test.steps.push(await step(['pine','compile','--save'],'a'));test.final_report=await step(['data','strategy'],'a');
  evidence.cases.push(test);writeEvidence('faults.json',evidence);console.log(kind,'killed during native operation; B complete; A recovered');
}
try{
  const bad=await cli(['workspace','init','--file','qa/parallel/issue-14/live/worker-invalid.json','--target','missing','--layout','missing','--pine','missing']);
  assert.match(bad.stderr,/WORKSPACE_TARGET_LOST/);evidence.invalid_init=bad;
  const same=await cli(['workspace','rebind','--file',file('a'),'--id',a.id]);assert.match(same.stderr,/WORKSPACE_GENERATION_UNCHANGED/);evidence.same_generation_rebind=same;
  const beforeB=await identity('b');
  await raw(a.target,`(()=>{${WORKSPACE_PAGE_CODE};findPineEditor(document).editor.setValue(findPineEditor(document).editor.getValue()+'// external fixture change\\n');return true;})()`);
  const changed=await cli(['pine','get'],{workspace:'a'});assert.match(changed.stderr,/WORKSPACE_EXTERNAL_CHANGE/);evidence.external_change=changed;
  const state=await step(['workspace','status','--file',file('a')],null);assert.ok(state.result.interrupted);
  await step(['workspace','recover','--file',file('a'),'--operation',state.result.interrupted.operation_id,'--rebind'],null);
  await step(['pine','set','--file','qa/parallel/issue-14/fixture-a.pine'],'a');assert.deepEqual(await identity('b'),beforeB);
  for(const [index,kind] of ['calculation','save','compile'].entries())await killCase(kind,index);
  // Reload A during a different workspace's input calculation; never activate tabs.
  const other=step(['indicator','set',b.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:45})],'b');
  const client=await CDP({port:9222,target:a.target});await client.Page.reload({ignoreCache:true});await client.close();
  evidence.reload_b=await other;
  const lostGeneration=await cli(['state'],{workspace:'a'});assert.match(lostGeneration.stderr,/WORKSPACE_GENERATION_CHANGED/);evidence.reload_error=lostGeneration;
  await waitIdle();evidence.rebind=await step(['workspace','rebind','--file',file('a'),'--id',a.id],null);
  evidence.fresh_input=await step(['indicator','set',a.binding.snapshot.studies[0].id,'--inputs',JSON.stringify({in_0:46})],'a');
  evidence.fresh_report=await step(['data','strategy'],'a');
  assert.equal(evidence.fresh_report.result.strategy_inputs.find(i=>i.id==='in_0').value,46);
  evidence.active_after=await activeTabs();assert.deepEqual(evidence.active_before,evidence.active_after);evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence('faults.json',evidence);console.log({success:evidence.success,cases:evidence.cases.length,error:evidence.error});}

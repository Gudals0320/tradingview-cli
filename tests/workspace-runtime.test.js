import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
process.env.TV_CDP_HOST = `runtime-fixture-${randomUUID()}`;
process.env.TV_CDP_PORT = '1';
const { reserveWorkspace, acquireWorkspace, workspaceStatus, abandonWorkspace } = await import('../src/workspace-store.js');
const { runWorkspace, rebindWorkspace } = await import('../src/workspace.js');
const { sourceHash } = await import('../src/session.js');
function fixture() {
  const suffix=randomUUID(), directory=mkdtempSync(join(tmpdir(),'tv-runtime-'));
  const workspace=reserveWorkspace({file:join(directory,'worker.json'),target:`target-${suffix}`,layout:`layout-${suffix}`,pine:`pine-${suffix}`});
  const snapshot={source:'strategy("fixture")',version:1,modified:false,context:{symbol:'BTCUSD',resolution:'60'},
    studies:[{id:'study',status:2,inputs:[{id:'pineId',value:workspace.pine},{id:'pineVersion',value:1},{id:'text',value:'compiled'},{id:'in_0',value:20}]}]};
  const lease=acquireWorkspace(workspace.file);lease.saveBinding({nonce:'generation',browser:'browser',snapshot});lease.finish({success:true});
  const calculation={phase:'ready',source_hash:sourceHash(snapshot.source),report_verified:true,inputs_fingerprint:JSON.stringify(snapshot.studies[0].inputs)};
  const deps={checkLayout:async()=>{},browserIdentity:async()=>'browser',getClient:async()=>({}),raw:async(_,expression)=>{
    if(expression.startsWith('startWorkspacePage'))return snapshot;
    if(expression.startsWith('finishWorkspacePage'))return {snapshot,calculation};
    if(expression==='window.__tvCliWorkspace?.nonce')return 'generation';
    throw new Error('Unexpected page operation '+expression);
  }};
  return {workspace,snapshot,calculation,deps,cleanup:()=>abandonWorkspace(workspace.file,{workspaceId:workspace.id})};
}
it('an unverified report is a clean failure and the next verified read can continue', async()=>{
  const f=fixture();try {
    f.calculation.report_verified=false;
    await assert.rejects(()=>runWorkspace(f.workspace.file,'data strategy',{},[],async()=>({success:true,strategy_id:'study'}),{_deps:f.deps}),{code:'REPORT_UNVERIFIED'});
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
    f.calculation.report_verified=true;
    const result=await runWorkspace(f.workspace.file,'data strategy',{},[],async()=>({success:true,strategy_id:'study'}),{_deps:f.deps});
    assert.equal(result.success,true);
  }finally{f.cleanup();}
});
it('a handler exception is clean when final resource state can be verified', async()=>{
  const f=fixture();try {
    await assert.rejects(()=>runWorkspace(f.workspace.file,'state',{},[],async()=>{throw new Error('read failed');},{_deps:f.deps}),/read failed/);
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});
it('rejects rebind on the same page generation without adopting external state', async()=>{
  const f=fixture();try {
    await assert.rejects(()=>rebindWorkspace(f.workspace.file,f.workspace.id,{_deps:f.deps}),{code:'WORKSPACE_GENERATION_UNCHANGED'});
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});
it('binds fresh input-only reports to a separately verified applied saved version', async()=>{
  const f=fixture();try {
    f.snapshot.version=9;f.snapshot.studies[0].inputs.find(input=>input.id==='pineVersion').value=3;
    const lease=acquireWorkspace(f.workspace.file);lease.saveBinding({nonce:'generation',browser:'browser',snapshot:f.snapshot,
      source_proof:{hash:sourceHash(f.snapshot.source),version:'9',applied_version:'3'}});lease.finish({success:true});
    f.calculation.source_hash=null;f.calculation.inputs_fingerprint=JSON.stringify(f.snapshot.studies[0].inputs);
    const result=await runWorkspace(f.workspace.file,'data strategy',{},[],async()=>({success:true,strategy_id:'study'}),{_deps:f.deps});
    assert.equal(result.success,true);
    f.snapshot.studies[0].inputs.find(input=>input.id==='pineVersion').value=4;
    f.calculation.inputs_fingerprint=JSON.stringify(f.snapshot.studies[0].inputs);
    await assert.rejects(()=>runWorkspace(f.workspace.file,'data strategy',{},[],async()=>({success:true,strategy_id:'study'}),{_deps:f.deps}),{code:'REPORT_UNVERIFIED'});
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});

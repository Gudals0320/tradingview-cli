import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
// Each test worker uses its own session root; production private ACLs must not
// be shared with a differently sandboxed OS account.
const runtimeSessionRoot = mkdtempSync(join(tmpdir(), 'tv-runtime-session-'));
process.env.TEMP = runtimeSessionRoot;
process.env.TMP = runtimeSessionRoot;
process.env.TV_STATE_DIR = join(runtimeSessionRoot, 'tradingview-cli-sessions');
process.env.TV_CDP_HOST = `runtime-fixture-${randomUUID()}`;
process.env.TV_CDP_PORT = '1';
const { reserveWorkspace, acquireWorkspace, workspaceStatus, abandonWorkspace, assertObservationAdmission } = await import('../src/workspace-store.js');
const { ownerAlive } = await import('../src/process-identity.js');
const { runWorkspace, rebindWorkspace, closeWorkspace } = await import('../src/workspace.js');
const { sourceHash } = await import('../src/session.js');
function fixture() {
  const suffix=randomUUID(), directory=mkdtempSync(join(tmpdir(),'tv-runtime-'));
  const workspace=reserveWorkspace({file:join(directory,'worker.json'),target:`target-${suffix}`,layout:`layout-${suffix}`,pine:`pine-${suffix}`});
  const snapshot={source:'strategy("fixture")',version:1,modified:false,context:{symbol:'BTCUSD',resolution:'60'},
    studies:[{id:'study',status:2,inputs:[{id:'pineId',value:workspace.pine},{id:'pineVersion',value:1},{id:'text',value:'compiled'},{id:'in_0',value:20}]}]};
  const lease=acquireWorkspace(workspace.file);lease.saveBinding({nonce:'generation',browser:'browser',snapshot});lease.finish({success:true});
  const calculation={phase:'ready',source_hash:sourceHash(snapshot.source),report_verified:true,inputs_fingerprint:JSON.stringify(snapshot.studies[0].inputs)};
  const deps={checkLayout:async()=>{},browserIdentity:async()=>'browser',getClient:async()=>({}),raw:async(_,expression)=>{
    if(expression.startsWith('startWorkspacePage') || expression.startsWith('guardWorkspacePage'))return snapshot;
    if(expression.startsWith('finishWorkspacePage'))return {snapshot,calculation};
    if(expression==='window.__tvCliWorkspace?.nonce')return 'generation';
    if(expression.startsWith('window.__tvCliCompilation'))return calculation;
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

it('unknown PID/identity stays protected and generation/operation/recovery races prevent result adoption', async () => {
  assert.equal(ownerAlive({ pid: null }), true); assert.equal(ownerAlive({ pid: process.pid, process_started_at: 'unverifiable' }), true);
  const f = fixture();
  try {
    const baseline = workspaceStatus(f.workspace.file);
    for (const patch of [{ generation: 'changed' }, { operation: { id: 'new-operation' }, owner_alive: true }, { interrupted: { operation_id: 'interrupted' } }]) {
      let reads = 0;
      f.deps.workspaceStatus = () => ++reads === 1 ? baseline : { ...baseline, ...patch };
      await assert.rejects(runWorkspace(f.workspace.file, 'data strategy', {}, [], async () => ({ success: true, strategy_id: 'study' }), { _deps: f.deps }), e => e.code === (patch.interrupted ? 'WORKSPACE_RECOVERY_REQUIRED' : 'WORKSPACE_OBSERVATION_CHANGED'));
    }
    assert.doesNotThrow(() => assertObservationAdmission({ ...baseline, operation: { id: 'unknown-owner', pid: null }, owner_alive: true }, 'worker'));
    const pinned = { ...baseline, operation: { id: 'same-id', pid: 123, command: 'pine compile', process_started_at: 'old-start' }, owner_alive: true };
    assert.throws(() => assertObservationAdmission({ ...pinned, operation: { ...pinned.operation, pid: 456 } }, 'worker', pinned), { code: 'WORKSPACE_OBSERVATION_CHANGED' });
    assert.equal(workspaceStatus(f.workspace.file).interrupted, null);
  } finally { f.cleanup(); }
});

it('wait outer publication retries cannot extend the original deadline under a perpetual admitted queue', async () => {
  const f = fixture(); let calls = 0;
  try {
    f.deps.resourceLockStatus = () => ({ holders: [], queue: [{ workspace_id: f.workspace.id }] });
    const values = { timeout: '10' };
    const start = Date.now();
    const result = await runWorkspace(f.workspace.file, 'workspace wait', values, [], async opts => {
      opts.workspaceWaitStartedAt ??= Date.now(); calls++;
      await new Promise(resolve => setTimeout(resolve, 4)); return { success: true, phase: 'ready' };
    }, { _deps: f.deps });
    assert.equal(result.code, 'REPORT_TIMEOUT'); assert.equal(result.calculation_pending, true);
    assert.ok(calls > 0 && calls < 10); assert.ok(Date.now() - start < 1000);
    assert.equal(workspaceStatus(f.workspace.file).interrupted, null);
  } finally { f.cleanup(); }
});

it('queued quote builds its restore permission after admission from the latest page context', async () => {
  const f = fixture(); let releaseWait, waiting;
  const admitted = new Promise(resolve => { waiting = resolve; });
  const gate = new Promise(resolve => { releaseWait = resolve; });
  let observedPermit;
  const raw = f.deps.raw;
  f.deps.raw = async (client, expression) => {
    if (expression.startsWith('startWorkspacePage')) {
      observedPermit = JSON.parse(expression.slice(expression.lastIndexOf(',') + 1, -1));
      assert.equal(observedPermit.quote_symbol, 'BITSTAMP:BTCUSD');
    }
    return raw(client, expression);
  };
  f.deps.acquireResources = async () => { waiting(); await gate; return { waited_ms: 10, waited_for: [{ command: 'symbol' }], resources: ['layout:test'], release() {} }; };
  try {
    f.snapshot.context.symbol = 'BINANCE:ETHUSDT';
    const resultPromise = runWorkspace(f.workspace.file, 'quote', {}, ['BITSTAMP:BTCUSD'], async () => ({ success: true, symbol: 'BITSTAMP:BTCUSD', restored: true }), { _deps: f.deps });
    await admitted;
    f.snapshot.context.symbol = 'BINANCE:SOLUSDT';
    const updater = acquireWorkspace(f.workspace.file); updater.saveBinding({ ...updater.workspace.binding, snapshot: f.snapshot }); updater.finish({ success: true });
    releaseWait();
    const result = await resultPromise;
    assert.ok(result.provenance.locks.waited_ms > 0);
    assert.equal(result.provenance.context.symbol, 'BINANCE:SOLUSDT');
    assert.equal(workspaceStatus(f.workspace.file).interrupted, null);
    assert.equal((await runWorkspace(f.workspace.file, 'state', {}, [], async () => ({ success: true }), { _deps: f.deps })).success, true);
    assert.equal(observedPermit.symbols, undefined);
  } finally { releaseWait(); f.cleanup(); }
});

it('release preflight failures stay clean but a page timeout or native pending remains protected', async () => {
  for (const code of ['WORKSPACE_TARGET_LOST', 'WORKSPACE_DISCONNECTED', 'WORKSPACE_IDENTITY_MISMATCH', 'WORKSPACE_LAYOUT_SHARED', 'CDP_TIMEOUT', 'WORKSPACE_NATIVE_BUSY']) {
    const f = fixture();
    try {
      const error = Object.assign(new Error(code), { code });
      const preflight = !['CDP_TIMEOUT', 'WORKSPACE_NATIVE_BUSY'].includes(code);
      const deps = { checkLayout: async () => { if (preflight) throw error; }, getClient: async () => ({}), raw: async () => { throw error; } };
      await assert.rejects(closeWorkspace(f.workspace.file, { _deps: deps }), { code });
      assert.equal(Boolean(workspaceStatus(f.workspace.file).interrupted), code === 'CDP_TIMEOUT');
    } finally {
      const state = workspaceStatus(f.workspace.file);
      abandonWorkspace(f.workspace.file, { workspaceId: f.workspace.id, operationId: state.interrupted?.operation_id });
    }
  }
});
it('a handler exception is clean when final resource state can be verified', async()=>{
  const f=fixture();try {
    await assert.rejects(()=>runWorkspace(f.workspace.file,'state',{},[],async()=>{throw new Error('read failed');},{_deps:f.deps}),/read failed/);
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});
it('pure workspace observation can run during an active operation without consuming its lease', async()=>{
  const f=fixture();try {
    const active=acquireWorkspace(f.workspace.file);
    const result=await runWorkspace(f.workspace.file,'ohlcv',{},[],async()=>({success:true,bars:[],context:f.snapshot.context}),{_deps:f.deps});
    assert.equal(result.provenance.observation,true);
    assert.equal(workspaceStatus(f.workspace.file).operation.id,active.operation);
    active.finish({success:true});
  }finally{f.cleanup();}
});
it('a pre-start CDP timeout retains an interrupted operation even before its page acknowledgment', async()=>{
  const f=fixture();try {
    f.deps.raw=async()=>{throw Object.assign(new Error('unknown page dispatch'),{code:'CDP_TIMEOUT'});};
    await assert.rejects(()=>runWorkspace(f.workspace.file,'pine compile',{},[],async()=>({success:true}),{_deps:f.deps}),{code:'CDP_TIMEOUT'});
    assert.ok(workspaceStatus(f.workspace.file).interrupted?.operation_id);
  }finally{
    const status=workspaceStatus(f.workspace.file);
    abandonWorkspace(f.workspace.file,{workspaceId:f.workspace.id,operationId:status.interrupted?.operation_id});
  }
});
it('TTY pine set without a file refuses before operation admission or stdin consumption', async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(process.stdin,'isTTY');
  Object.defineProperty(process.stdin,'isTTY',{configurable:true,value:true});
  let calls=0;
  const f=fixture();
  try {await assert.rejects(()=>runWorkspace(f.workspace.file,'pine set',{},[],async()=>{calls++;}),{code:'PINE_SOURCE_REQUIRED'});assert.equal(calls,0);}
  finally {f.cleanup();if(descriptor)Object.defineProperty(process.stdin,'isTTY',descriptor);else delete process.stdin.isTTY;}
});
it('rejects rebind on the same page generation without adopting external state', async()=>{
  const f=fixture();try {
    await assert.rejects(()=>rebindWorkspace(f.workspace.file,f.workspace.id,{_deps:f.deps}),{code:'WORKSPACE_GENERATION_UNCHANGED'});
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});
it('a resource release failure includes the completed committed native result instead of suggesting replay',async()=>{
  const f=fixture();try {
    f.deps.acquireResources=async()=>({resources:['workspace:fixture'],waited_ms:0,release(){throw Object.assign(new Error('simulated cleanup failure'),{code:'LOCK_RELEASE_FAILED',details:{token:'exact-dead-token'}});}});
    await assert.rejects(runWorkspace(f.workspace.file,'timeframe',{},['60'],async()=>({success:true,resolution:'60'}),{_deps:f.deps}),error=>error.code==='LOCK_RELEASE_FAILED'&&error.details.completed_result.success===true&&error.details.result_committed===true&&error.details.token==='exact-dead-token');
    assert.equal(workspaceStatus(f.workspace.file).interrupted,null);
  }finally{f.cleanup();}
});
it('a metadata finish failure preserves the verified native result and marks its commit unconfirmed',async()=>{
  const f=fixture();try {
    f.deps.acquireWorkspace=(file,options)=>{const lease=acquireWorkspace(file,options),finish=lease.finish;let first=true;lease.finish=value=>{if(first){first=false;throw Object.assign(new Error('metadata write failed'),{code:'RESULT_COMMIT_FAILED'});}return finish(value);};return lease;};
    await assert.rejects(runWorkspace(f.workspace.file,'timeframe',{},['60'],async()=>({success:true,resolution:'60'}),{_deps:f.deps}),error=>error.code==='RESULT_COMMIT_FAILED'&&error.details.completed_result.success===true&&error.details.result_committed===false);
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

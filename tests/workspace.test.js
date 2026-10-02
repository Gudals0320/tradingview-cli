import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { reserveWorkspace, acquireWorkspace, workspaceStatus, markInterrupted, loadWorkspace, abandonWorkspace, workspaceArtifactDirectory } from '../src/workspace-store.js';
import { unlinkSync } from 'node:fs';
import { acquireSession, sessionPaths, assertSessionAccess, clearAdmissionGate, admissionGateStatus } from '../src/session.js';

const moduleUrl = new URL('../src/workspace-store.js', import.meta.url).href;
function fixture() { const directory = mkdtempSync(join(tmpdir(), 'tv-workspace-')); return { directory, host: 'fixture', port: 1 }; }
function reserve(options, suffix) {
  return reserveWorkspace({ file: join(options.directory, `${suffix}.json`), target: `target-${suffix}`, layout: `layout-${suffix}`, pine: `pine-${suffix}` }, options);
}
function child(code) {
  const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  const ready = new Promise((resolve, reject) => {
    process.stdout.on('data', data => { output += data; if (output.includes('\n')) resolve(output.trim()); });
    process.stderr.on('data', data => { errors += data; });
    process.on('exit', code => { if (code) reject(new Error(errors)); });
  });
  const exited = new Promise(resolve => process.on('exit', resolve));
  return { process, ready, exited, errors: () => errors };
}
describe('persistent independent workspaces', () => {
  it('abandons a lost handle/target offline without releasing another worker', () => {
    const options = fixture(), a = reserve(options, 'a'), b = reserve(options, 'b');
    const operation = acquireWorkspace(a.file, options); operation.checkpoint({ phase: 'running' }); operation.finish({ success: false });
    unlinkSync(a.file);
    assert.throws(() => abandonWorkspace(a.file, { workspaceId: a.id, operationId: 'wrong' }, options), { code: 'WORKSPACE_OPERATION_MISMATCH' });
    const result = abandonWorkspace(a.file, { workspaceId: a.id, operationId: operation.operation }, options);
    assert.equal(result.desktop_changed, false); assert.equal(result.incomplete, true);
    const other = acquireWorkspace(b.file, options); other.finish({ success: true });
    assert.throws(() => acquireSession(options), { code: 'WORKSPACE_RESERVED' });
    abandonWorkspace(b.file, { workspaceId: b.id }, options);
    const legacy = acquireSession(options); legacy.release();
  });
  it('cannot abandon a live workspace operation even with its exact IDs', () => {
    const options = fixture(), a = reserve(options, 'a'), operation = acquireWorkspace(a.file, options);
    assert.throws(() => abandonWorkspace(a.file, { workspaceId: a.id, operationId: operation.operation }, options), { code: 'WORKSPACE_BUSY' });
    operation.finish({ success: true });
  });
  it('admits six independent process loops without metadata false conflicts', async () => {
    const options = fixture(), resources = Array.from({ length: 6 }, (_, i) => reserve(options, String(i)));
    const workers = resources.map(resource => child(`import {acquireWorkspace} from ${JSON.stringify(moduleUrl)};
      console.log('ready');process.stdin.once('data',()=>{for(let i=0;i<15;i++){const lease=acquireWorkspace(${JSON.stringify(resource.file)},${JSON.stringify(options)});lease.finish({success:true});}process.stdin.pause();});`));
    await Promise.all(workers.map(worker => worker.ready));
    workers.forEach(worker => worker.process.stdin.end('start'));
    assert.deepEqual(await Promise.all(workers.map(worker => worker.exited)), [0,0,0,0,0,0], workers.map(worker => worker.errors()).join('\n'));
    resources.forEach(resource => assert.equal(workspaceStatus(resource.file, options).operation, null));
  });
  it('preserves clean failure continuity and requires verified recovery acknowledgement', () => {
    const options = fixture(), a = reserve(options, 'a');
    const clean = acquireWorkspace(a.file, options); clean.finish({ success: false, interrupted: false, result: { compiled: false } });
    const lease = acquireWorkspace(a.file, options); lease.finish({ success: false });
    assert.throws(() => acquireWorkspace(a.file, { ...options, recover: true }), { code: 'WORKSPACE_OPERATION_MISMATCH' });
    const recovery = acquireWorkspace(a.file, { ...options, recover: true, recoveryOperation: lease.operation });
    recovery.finish({ success: false, error: 'identity still mismatches' });
    assert.equal(workspaceStatus(a.file, options).interrupted.operation_id, lease.operation);
  });
  it('clears only an exact dead gate token while preserving all reservations', () => {
    const options = fixture(), a = reserve(options, 'a'), path = sessionPaths(options).gate;
    writeFileSync(path, JSON.stringify({ pid: process.pid, token: 'live' }));
    assert.throws(() => clearAdmissionGate('live', options), { code: 'SESSION_BUSY' });
    writeFileSync(path, JSON.stringify({ pid: 99999999, token: 'dead', process_started_at: 'fixture' }));
    assert.equal(admissionGateStatus(options).owner_alive, false);
    assert.throws(() => clearAdmissionGate('wrong', options), { code: 'GATE_TOKEN_MISMATCH' });
    clearAdmissionGate('dead', options);
    const lease = acquireWorkspace(a.file, options); lease.finish({ success: true });
  });
  it('rejects duplicate target, layout and document reservations', () => {
    const options = fixture(), a = reserve(options, 'a');
    for (const kind of ['target', 'layout', 'pine']) {
      const resources = { file: join(options.directory, `${kind}.json`), target: 'other-t', layout: 'other-l', pine: 'other-p', [kind]: a[kind] };
      assert.throws(() => reserveWorkspace(resources, options), { code: 'WORKSPACE_CONFLICT' });
    }
    assert.throws(() => acquireSession(options), { code: 'WORKSPACE_RESERVED' });
    assert.throws(() => assertSessionAccess(options), { code: 'WORKSPACE_RESERVED' });
  });
  it('blocks hostname-alias legacy admission and shares its short port gate', () => {
    const options=fixture(), local={...options,host:'127.0.0.1'}, a=reserve(local,'a');
    assert.equal(sessionPaths(local).gate,sessionPaths({...local,host:'desktop-alias'}).gate);
    assert.throws(()=>acquireSession({...local,host:'desktop-alias'}),{code:'WORKSPACE_RESERVED'});
    abandonWorkspace(a.file,{workspaceId:a.id},local);
    const alias=acquireSession({...local,host:'desktop-alias'});
    assert.throws(()=>reserve(local,'b'),{code:'SESSION_BUSY'});alias.release();
    const next=reserve(local,'b');abandonWorkspace(next.file,{workspaceId:next.id},local);
  });
  it('atomically excludes Desktop-wide launch leases even with a different port', () => {
    const options=fixture(), local={...options,host:'127.0.0.1'}, other={...local,port:2,desktopWide:true};
    assert.equal(sessionPaths(local).gate,sessionPaths(other).gate);
    const resource=reserve(local,'a');assert.throws(()=>acquireSession(other),{code:'WORKSPACE_RESERVED'});
    abandonWorkspace(resource.file,{workspaceId:resource.id},local);
    const launching=acquireSession(other);assert.throws(()=>reserve(local,'b'),{code:'SESSION_BUSY'});launching.release();
    const b=reserve(local,'b');abandonWorkspace(b.file,{workspaceId:b.id},local);
  });
  it('rejects registration during a legacy endpoint lease and pending recovery', () => {
    const options = fixture(), lease = acquireSession(options);
    assert.throws(() => reserve(options, 'a'), { code: 'SESSION_BUSY' });
    lease.checkpoint({ phase: 'failed' }); lease.release();
    assert.ok(reserve(options, 'a'), 'Unscoped legacy journal fences shared app operations, not unrelated workspace resources.');
  });
  it('keeps separate workspace commands running in two actual OS processes', async () => {
    const options = fixture(), a = reserve(options, 'a'), b = reserve(options, 'b');
    const code = file => `import {acquireWorkspace} from ${JSON.stringify(moduleUrl)};
      const lease=acquireWorkspace(${JSON.stringify(file)},${JSON.stringify(options)});
      lease.checkpoint({phase:'running'});console.log(lease.operation);
      process.stdin.once('data',()=>{lease.finish({success:true,result:{owner:lease.workspace.id}});process.stdin.pause();});`;
    const first = child(code(a.file)); await first.ready;
    const second = child(code(b.file)); await second.ready;
    try {
      assert.ok(workspaceStatus(a.file, options).operation);
      assert.ok(workspaceStatus(b.file, options).operation);
      assert.throws(() => acquireWorkspace(a.file, options), { code: 'WORKSPACE_BUSY' });
    } finally {
      first.process.stdin.end('finish'); await first.exited;
      second.process.stdin.end('finish'); await second.exited;
    }
    assert.equal(JSON.parse(readFileSync(join(workspaceArtifactDirectory(a, options), 'result.json'))).result.owner, a.id);
    assert.equal(JSON.parse(readFileSync(join(workspaceArtifactDirectory(b, options), 'result.json'))).result.owner, b.id);
  });
  it('retains killed owner resources while another workspace completes', async () => {
    const options = fixture(), a = reserve(options, 'a'), b = reserve(options, 'b');
    const worker = child(`import {acquireWorkspace} from ${JSON.stringify(moduleUrl)};
      const lease=acquireWorkspace(${JSON.stringify(a.file)},${JSON.stringify(options)});
      lease.checkpoint({phase:'calculating'});console.log(lease.operation);setInterval(()=>{},1000);`);
    const operation = await worker.ready;
    assert.throws(() => markInterrupted(a.file, operation, options), { code: 'WORKSPACE_BUSY' });
    worker.process.kill('SIGKILL'); await worker.exited;
    assert.throws(() => acquireWorkspace(a.file, options), { code: 'WORKSPACE_BUSY' });
    assert.throws(() => markInterrupted(a.file, 'wrong', options), { code: 'WORKSPACE_OPERATION_MISMATCH' });
    markInterrupted(a.file, operation, options);
    assert.throws(() => acquireWorkspace(a.file, options), { code: 'WORKSPACE_RECOVERY_REQUIRED' });
    const other = acquireWorkspace(b.file, options); other.finish({ success: true });
    const recovery = acquireWorkspace(a.file, { ...options, recover: true, recoveryOperation: operation });
    assert.equal(recovery.pending().phase, 'calculating');
    assert.throws(() => recovery.finish({ success: true }), { code: 'WORKSPACE_RECOVERY_REQUIRED' });
    recovery.acknowledgeRecovery(operation); recovery.finish({ success: true });
    const continued = acquireWorkspace(a.file, options); continued.finish({ success: true });
  });
  it('refuses copied/tampered tokens and never removes another operation', () => {
    const options = fixture(), a = reserve(options, 'a'), lease = acquireWorkspace(a.file, options);
    const data = JSON.parse(readFileSync(a.file)); data.token = 'forged'; writeFileSync(a.file, JSON.stringify(data));
    assert.throws(() => loadWorkspace(a.file, options), { code: 'WORKSPACE_OWNERSHIP_LOST' });
    const registry = sessionPaths(options).reservations;
    const rows = JSON.parse(readFileSync(registry)); rows[0].operation.id = 'other'; writeFileSync(registry, JSON.stringify(rows));
    assert.throws(() => lease.finish({ success: true }), { code: 'WORKSPACE_OWNERSHIP_LOST' });
    assert.equal(JSON.parse(readFileSync(registry))[0].operation.id, 'other');
  });
  it('refuses a reservation held in another process between invocations', () => {
    const options = fixture(), a = reserve(options, 'a');
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {acquireSession} from ${JSON.stringify(new URL('../src/session.js', import.meta.url).href)};
      try{acquireSession(${JSON.stringify(options)});}catch(e){console.log(e.code);}`], { encoding: 'utf8' });
    assert.equal(output.trim(), 'WORKSPACE_RESERVED');
    const lease = acquireWorkspace(a.file, options); lease.finish({ success: true });
    assert.equal(workspaceStatus(a.file, options).operation, null);
    assert.throws(() => acquireSession(options), { code: 'WORKSPACE_RESERVED' });
  });
});

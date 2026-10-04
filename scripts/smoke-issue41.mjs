import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import CDP from '../src/cdp.js';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { workspaceStatus } from '../src/workspace-store.js';
import { WORKSPACE_PAGE_CODE } from '../src/workspace-page.js';
const name = process.argv[2];
const control = process.argv[3];
if (!['executor-220a', 'executor-220b'].includes(name)) throw new Error('Pass an authorized dedicated 2.2 QA workspace.');
if (control && (!['executor-220a', 'executor-220b'].includes(control) || control === name)) throw new Error('Use only a separate dedicated control workspace.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const runs = [];
function call(args, expected = 0, input) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', input, timeout: 30000 });
  const value = JSON.parse(r.stdout || r.stderr); runs.push({ command: args.filter(arg => !/^[a-f0-9-]{32,64}$/i.test(arg)).join(' '), exit: r.status, success: value.success, code: value.code });
  assert.equal(r.status, expected, value.error); return value;
}
call(['status']);
call(['--workspace', name, 'pine', 'compile', '--save']);
const source = call(['--workspace', name, 'pine', 'get']).source;
call(['--workspace', name, 'pine', 'set'], 0, source + `\n// own CLI termination probe ${Date.now()}\n`);
const file = resolveWorkspace(name), baseline = workspaceStatus(file);
assert.equal(baseline.operation, null); assert.equal(baseline.interrupted, null);
const c = await CDP({ host: '127.0.0.1', port: 9222, target: baseline.target });
const read = async () => {
  const r = await c.Runtime.evaluate({ returnByValue: true, expression: `(() => {${WORKSPACE_PAGE_CODE};const s=readWorkspacePage(window,document),p=window.__tvCliPineCompile;return {native:p?{token:p.token,dispatched:p.dispatched,actionDone:p.actionDone}:null,version:s.version,modified:s.modified,pending:s.pending,status:s.studies[0]?.status};})()` });
  if (r.exceptionDetails) throw new Error('Native observation is unreadable; preserve the run.'); return r.result.value;
};
const original = await read();
const child = spawn(process.execPath, ['src/cli/index.js', '--workspace', name, 'pine', 'compile', '--save'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.resume(); child.stderr.resume(); let ended = false;
const stopped = new Promise(resolve => child.once('close', (exit, signal) => { ended = true; resolve({ exit, signal }); }));
let operation, settled, observation;
try {
  for (let i = 0; i < 1500 && !ended; i++) {
    const state = await read();
    if (state.native?.token !== original.native?.token && state.native?.dispatched && !state.native.actionDone) {
      const owned = workspaceStatus(file);
      assert.equal(owned.workspace_id, baseline.workspace_id); assert.equal(owned.operation?.command, 'pine compile');
      assert.equal(owned.operation.pid, child.pid); assert.equal(owned.owner_alive, true);
      operation = owned.operation; observation = state.native;
      child.kill('SIGKILL'); break;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(operation, 'Actual native dispatch window not captured; do not claim a reproduction.');
  await stopped;
  for (let i = 0; i < 150; i++) { settled = await read(); if (settled.native?.actionDone && !settled.pending && settled.status === 2) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal(settled.native.actionDone, true); assert.equal(settled.pending, false); assert.equal(settled.status, 2);
  const dead = workspaceStatus(file); assert.equal(dead.owner_alive, false); assert.equal(dead.operation.id, operation.id); assert.equal(dead.interrupted, null);
  const reports = [['workspace', 'wait', '--timeout', '1000'], ...['strategy', 'trades', 'ledger', 'equity'].map(endpoint => ['data', endpoint])];
  for (const args of reports) { const result = call(['--workspace', name, ...args], 1); assert.equal(result.code, 'WORKSPACE_OWNER_DEAD'); assert.equal(result.details.result_adopted, false); }
  if (control) { call(['--workspace', control, 'state']); call(['--workspace', control, 'timeframe', '60']); }
  call(['--workspace', name, 'workspace', 'interrupt', '--operation', operation.id]);
  for (const args of reports) assert.equal(call(['--workspace', name, ...args], 1).code, 'WORKSPACE_RECOVERY_REQUIRED');
  const recovered = call(['--workspace', name, 'workspace', 'recover', '--operation', operation.id]); assert.equal(recovered.recovered, true);
  const locks = call(['workspace', 'locks']);
  const holders = locks.holders.filter(row => row.workspace_id === baseline.workspace_id && row.pid === child.pid && row.command === 'pine compile');
  assert.equal(holders.length, 1); call(['workspace', 'lock-clear', '--token', holders[0].token]);
  call(['--workspace', name, 'pine', 'compile', '--save']);
  assert.equal(call(['--workspace', name, 'data', 'strategy']).success, true);
  assert.equal(call(['--workspace', name, 'data', 'ledger', '--limit', '1']).success, true);
  const final = workspaceStatus(file); assert.equal(final.operation, null); assert.equal(final.interrupted, null);
  console.log(JSON.stringify({ success: true, sha, dirty, dispatch_observed: observation.dispatched, action_done_at_observation: observation.actionDone,
    own_spawned_cli_only_terminated: true, native_completed_after_termination: true, saved_version_before: original.version, saved_version_after: settled.version,
    modified_after: settled.modified, policy_codes_before_recovery: ['WORKSPACE_OWNER_DEAD'], after_interrupt: ['WORKSPACE_RECOVERY_REQUIRED'], exact_recovery: true, exact_dead_holder_repaired: true,
    subsequent_compile_and_report: true, final_state: final.state, runs }));
} finally { await c.close(); }

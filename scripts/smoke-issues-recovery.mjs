import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const name = process.argv[2] || 'executor-feeds';
function call(args, expected = 0, env = {}) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } });
  assert.equal(r.status, expected, r.stderr || r.stdout); return JSON.parse(r.stdout || r.stderr);
}
call(['status']);
call(['--workspace', name, 'tab', 'switch']);
const timed = call(['--workspace', name, 'ui', 'eval', 'new Promise(resolve => setTimeout(() => resolve(true), 3000))'], 1, { TV_CDP_TIMEOUT_MS: '500' });
assert.equal(timed.code, 'CDP_TIMEOUT');
const interrupted = call(['workspace', 'show', name]);
assert.ok(interrupted.interrupted?.operation_id);
const busy = call(['--workspace', name, 'workspace', 'recover', '--operation', interrupted.interrupted.operation_id], 1);
assert.ok(['WORKSPACE_NATIVE_BUSY', 'WORKSPACE_PAGE_BUSY'].includes(busy.code));
await new Promise(resolve => setTimeout(resolve, 3200));
const recovered = call(['--workspace', name, 'workspace', 'recover', '--operation', interrupted.interrupted.operation_id]);
const state = call(['--workspace', name, 'state']), final = call(['workspace', 'show', name]);
assert.equal(recovered.success, true); assert.equal(final.interrupted, null);
console.log(JSON.stringify({ success: true, timeout_code: timed.code, interruption_recorded: true, pending_recovery_code: busy.code, recovered: recovered.success, final_state: final.state, subsequent_read: state.success,
  note: 'Actual page-local delayed native eval; no chart/source mutation; 3s settlement observed before exact recovery.' }));

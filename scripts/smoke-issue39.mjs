import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const name = process.argv[2];
if (!['executor-indicator', 'executor-feeds', 'executor-issues'].includes(name)) throw new Error('Pass an authorized dedicated issue workspace.');
function call(args, expected = 0) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, expected, r.stderr || r.stdout); return JSON.parse(r.stdout || r.stderr);
}
call(['status']);
const initial = call(['workspace', 'show', name]);
call(['--workspace', name, 'tab', 'switch']);
const closed = call(['--workspace', name, 'tab', 'close']);
assert.equal(closed.action, 'tab_closed');
const before = call(['workspace', 'show', name]);
assert.equal(before.state, 'target_lost'); assert.equal(before.interrupted, null);
const failed = call(['--workspace', name, 'workspace', 'release'], 1);
assert.equal(failed.code, 'WORKSPACE_TARGET_LOST');
const after = call(['workspace', 'show', name]);
assert.equal(after.state, 'target_lost'); assert.equal(after.interrupted, null);
const command = after.next_commands.find(command => command.startsWith('tv workspace reset'));
assert.ok(command);
const args = command.slice(3).match(/'[^']*'|\S+/g).map(arg => arg.replace(/^'|'$/g, ''));
const reset = call(args);
assert.equal(reset.artifacts_preserved, true); assert.equal(reset.desktop_changed, false);
assert.equal(existsSync(after.result_path), true);
assert.equal(call(['workspace', 'show', name], 1).code, 'WORKSPACE_NOT_FOUND');
assert.ok(call(['layout', 'list']).layouts.some(layout => layout.id === initial.layout));
console.log(JSON.stringify({ success: true, pine: Boolean(initial.pine), close_exit: 0, release_exit: 1,
  release_code: failed.code, before_state: before.state, after_state: after.state, interrupted: after.interrupted,
  suggested_reset_exit: 0, artifacts_preserved: reset.artifacts_preserved, saved_layout_preserved: true, final_name_released: true }));

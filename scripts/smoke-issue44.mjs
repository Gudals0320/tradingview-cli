import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace, workspaceArtifactDirectory } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { acquireResources } from '../src/resource-lock.js';
import { configureTarget, disconnect } from '../src/connection.js';
import { newTab } from '../src/core/tab.js';
const name = process.argv[2];
if (!['executor-220a', 'executor-220b', 'executor-220c'].includes(name)) throw new Error('Use a dedicated 2.2 QA workspace only.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
function call(args, expected = 0) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  const value = JSON.parse(r.stdout || r.stderr); assert.equal(r.status, expected, value.error); return value;
}
const initialInventory = call(['workspace', 'inventory']);
const anchor = initialInventory.targets.find(row => row.layout !== loadWorkspace(resolveWorkspace(name)).layout)?.target;
assert.ok(anchor, 'An explicit preparation anchor is required while a landing page is active.');
call(['--target', anchor, 'status']);
const owned = loadWorkspace(resolveWorkspace(name)), initial = call(['workspace', 'show', name]);
assert.equal(owned.owned_target, owned.target);
let existingCommittedClose = false;
if (initial.state === 'target_lost') {
  const directory = workspaceArtifactDirectory(owned);
  const record = readdirSync(directory).filter(file => file.startsWith('result-')).map(file => JSON.parse(readFileSync(join(directory, file), 'utf8')))
    .find(record => record.committed === true && record.workspace_id === owned.id && record.result?.action === 'tab_closed' && record.result.target === owned.target);
  assert.ok(record, 'Exact committed close receipt must exist; a later preflight failure cannot prove close.');
  assert.equal(record.committed, true); assert.equal(record.result.action, 'tab_closed'); assert.equal(record.result.target, owned.target);
  existingCommittedClose = true;
} else {
  assert.equal(owned.pine, null, 'Keep lifecycle control chart-only; mounted-editor generation is tested separately.');
  call(['--workspace', name, 'tab', 'switch']);
  const r = spawnSync(process.execPath, ['src/cli/index.js', '--workspace', name, 'ui', 'click', '--by', 'aria-label', '--value', '귀하의 레이아웃에 있는 모든 심볼 차트 및 인터벌 저장'], { encoding: 'utf8' });
  if (r.status === 0) await new Promise(resolve => setTimeout(resolve, 1000));
  call(['--workspace', name, 'tab', 'close']);
}
const lost = call(['workspace', 'show', name]); assert.equal(lost.state, 'target_lost'); assert.equal(lost.interrupted, null);
assert.equal(call(['--workspace', name, 'workspace', 'release'], 1).code, 'WORKSPACE_TARGET_LOST');
let inventory = call(['workspace', 'inventory']); assert.ok(!inventory.targets.some(row => row.target === owned.target));
const lock = await acquireResources(['app'], { command: 'prepare dedicated reused landing control' });
try { await withSharedSession(async () => { configureTarget(''); const landing = await newTab(); assert.equal(landing.success, true); }); }
finally { await disconnect(); lock.release(); }
const opened = call(['--target', anchor, 'layout', 'open', owned.layout]);
assert.equal(opened.chart_id, owned.layout); assert.equal(opened.tab_ownership.owned, false); assert.equal(opened.tab_ownership.reason, 'reused_landing');
// Explicit chart-only conversion never replaces the editor/draft on the new control.
const rebound = call(['workspace', 'detach', name, '--generation', lost.generation]); assert.equal(rebound.target, opened.target);
const detached = call(['workspace', 'show', name]); assert.equal(detached.owned_target, null);
call(['workspace', 'reconnect', name, '--target', opened.target, '--generation', detached.generation]);
const show = call(['workspace', 'show', name]); assert.equal(show.owned_target, null);
assert.equal(call(['--workspace', name, 'tab', 'close'], 1).code, 'WORKSPACE_TAB_NOT_OWNED');
inventory = call(['workspace', 'inventory']); assert.ok(inventory.targets.some(row => row.target === opened.target));
call(['--workspace', name, 'workspace', 'release']); call(['workspace', 'reset', name, '--id', show.workspace_id]);
console.log(JSON.stringify({ success: true, sha, dirty, source_owned_origin: owned.tab_ownership.origin, owned_exact_target_closed: true,
  existing_committed_close_continuation: existingCommittedClose, target_lost_release_clean_failure: true,
  reused_landing_owned: false, reconnect_drops_old_tab_proof: true, close_control_code: 'WORKSPACE_TAB_NOT_OWNED',
  preserved_control_layout: owned.layout, control_tabs_remaining: 1, reservation_released: true,
  unsaved_dialog_branch: 'existing production fixtures; no live confirmation was displayed in this run',
  note: 'Unproven control tab remains; human may close it or retain it, choosing any save/discard dialog themselves. Private source snapshots are preserved.' }));

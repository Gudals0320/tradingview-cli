import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { acquireResources } from '../src/resource-lock.js';
import { configureTarget, evaluateAsync, disconnect } from '../src/connection.js';
import { newTab } from '../src/core/tab.js';
import { ensurePineEditorOpen } from '../src/core/pine.js';
import { findPineController } from '../src/core/desktop-dom.js';
const name = process.argv[2];
if (name !== 'executor-220a') throw new Error('Use the dedicated 2.2 A workspace only.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
function call(args, expected = 0, input) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', input, timeout: 30000 });
  const value = JSON.parse(r.stdout || r.stderr); assert.equal(r.status, expected, value.error); return value;
}
call(['status']);
const owned = loadWorkspace(resolveWorkspace(name));
assert.equal(owned.owned_target, owned.target); assert.equal(owned.tab_ownership.origin, 'open');
call(['--workspace', name, 'tab', 'switch']);
const source = call(['--workspace', name, 'pine', 'get']).source;
call(['--workspace', name, 'pine', 'set'], 0, source + '\n// preserve unsaved close control\n');
const pending = call(['--workspace', name, 'tab', 'close'], 1);
assert.equal(pending.action, 'tab_close_pending'); assert.equal(pending.confirmation_required, true); assert.equal(pending.dialog_dismissed, true);
assert.equal(call(['--workspace', name, 'pine', 'get']).source, source + '\n// preserve unsaved close control\n');
call(['--workspace', name, 'pine', 'set'], 0, source); call(['--workspace', name, 'pine', 'compile', '--save']);
const save = spawnSync(process.execPath, ['src/cli/index.js', '--workspace', name, 'ui', 'click', '--by', 'aria-label', '--value', '귀하의 레이아웃에 있는 모든 심볼 차트 및 인터벌 저장'], { encoding: 'utf8' });
if (save.status !== 0) throw new Error('Dedicated layout Save did not complete; preserve it.');
await new Promise(resolve => setTimeout(resolve, 1000));
call(['--workspace', name, 'tab', 'close']);
const lost = call(['workspace', 'show', name]); assert.equal(lost.state, 'target_lost'); assert.equal(lost.interrupted, null);
assert.equal(call(['--workspace', name, 'workspace', 'release'], 1).code, 'WORKSPACE_TARGET_LOST');
let inventory = call(['workspace', 'inventory']); assert.ok(!inventory.targets.some(row => row.target === owned.target));
const lock = await acquireResources(['app'], { command: 'prepare dedicated reused landing control' });
try { await withSharedSession(async () => { configureTarget(''); const landing = await newTab(); assert.equal(landing.success, true); }); }
finally { await disconnect(); lock.release(); }
const opened = call(['layout', 'open', owned.layout]);
assert.equal(opened.chart_id, owned.layout); assert.equal(opened.tab_ownership.owned, false); assert.equal(opened.tab_ownership.reason, 'reused_landing');
const mount = await acquireResources(['app', `layout:${owned.layout}`, `document:${owned.pine}`], { command: 'mount exact saved QA document for reconnect control' });
try { await withSharedSession(async () => {
  configureTarget(opened.target); await ensurePineEditorOpen();
  const ready = await evaluateAsync(`(async()=>{const c=(${findPineController.toString()})(document);if(c?.isModified?.()!==false)throw new Error('FOREIGN_DRAFT: preserve unknown or modified source');
    const expected=${JSON.stringify(owned.pine)};if(c.getScriptIdVersion()?.scriptIdPart!==expected)await c.openScript({scriptIdPart:expected,version:${JSON.stringify(owned.binding.snapshot.version)}});
    return c.getScriptIdVersion()?.scriptIdPart===expected;})()`, { mutation: true });
  assert.equal(ready, true);
}); } finally { await disconnect(); mount.release(); }
const rebound = call(['workspace', 'reconnect', name, '--target', opened.target, '--generation', lost.generation]); assert.equal(rebound.success, true);
const show = call(['workspace', 'show', name]); assert.equal(show.owned_target, null);
assert.equal(call(['--workspace', name, 'tab', 'close'], 1).code, 'WORKSPACE_TAB_NOT_OWNED');
inventory = call(['workspace', 'inventory']); assert.ok(inventory.targets.some(row => row.target === opened.target));
call(['--workspace', name, 'workspace', 'release']); call(['workspace', 'reset', name, '--id', show.workspace_id]);
console.log(JSON.stringify({ success: true, sha, dirty, open_owned_exact_target_closed: true, unsaved_dialog_preserved: true,
  original_target_absence_verified: true, target_lost_release_clean_failure: true, reused_landing_owned: false,
  reconnect_drops_old_tab_proof: true, close_control_code: 'WORKSPACE_TAB_NOT_OWNED', preserved_control_layout: owned.layout, control_tabs_remaining: 1,
  reservation_released: true, note: 'Unproven control tab remains; human may close it or retain it, choosing any save/discard dialog themselves.' }));

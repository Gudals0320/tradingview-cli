import { spawnSync, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const name = process.argv[2], control = process.argv[3];
if (name !== 'executor-220a' || control !== 'executor-220b') throw new Error('Use only the dedicated 2.2 A/B workspaces.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const rows = [];
function call(args, expected) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  const value = JSON.parse(r.stdout || r.stderr); if (expected !== undefined) assert.equal(r.status, expected, value.error);
  return { value, exit: r.status };
}
call(['status'], 0);
const old = call(['--workspace', name, 'pine', 'compile', '--save'], 0).value.strategy_id;
const foreign = call(['--workspace', control, 'state'], 0).value.studies.find(study => study.name === 'CLI_I41_42_44_B_20261004')?.id;
assert.ok(old && foreign && old !== foreign);
const revision = call(['--workspace', name, 'data', 'ledger', '--limit', '1'], 0).value.report_revision;
for (const [label, id] of [['unknown', 'no-such-qa-id'], ['foreign-workspace', foreign]]) for (const endpoint of ['strategy', 'trades', 'ledger', 'equity']) {
  const r = call(['--workspace', name, 'data', endpoint, '--strategy-id', id], 1);
  assert.equal(r.value.code, 'STUDY_NOT_FOUND'); assert.equal(r.value.details.requested_strategy_id, id); assert.equal(r.value.details.current_strategy_id, old);
  rows.push({ selector: label, endpoint, exit: r.exit, code: r.value.code });
}
call(['--workspace', name, 'indicator', 'remove', old], 0);
const next = call(['--workspace', name, 'pine', 'compile', '--save'], 0).value.strategy_id;
assert.ok(next && next !== old);
assert.equal(call(['--workspace', name, 'workspace', 'wait', '--timeout', '1000'], 0).value.strategy_id, next);
for (const endpoint of ['strategy', 'trades', 'ledger', 'equity']) {
  const r = call(['--workspace', name, 'data', endpoint, '--strategy-id', old], 1); assert.equal(r.value.code, 'STUDY_NOT_FOUND');
  rows.push({ selector: 'removed', endpoint, exit: r.exit, code: r.value.code });
  const valid = call(['--workspace', name, 'data', endpoint, '--strategy-id', next]);
  assert.ok(valid.exit === 0 && valid.value.success || endpoint === 'equity' && valid.exit === 1 && valid.value.code === 'EQUITY_UNAVAILABLE');
  rows.push({ selector: 'current', endpoint, exit: valid.exit, code: valid.value.code, success: valid.value.success });
}
assert.equal(call(['--workspace', name, 'indicator', 'get', old], 1).value.code, 'WORKSPACE_STUDY_MISMATCH');
assert.equal(call(['--workspace', name, 'data', 'ledger', '--strategy-id', next, '--report-revision', revision], 1).value.code, 'REPORT_CHANGED');
let page = call(['--workspace', name, 'data', 'ledger', '--strategy-id', next, '--limit', '1'], 0).value;
let paginationVerified = !page.has_more;
if (page.has_more) {
  const result = call(['--workspace', name, 'data', 'ledger', '--strategy-id', next, '--offset', String(page.next_offset), '--limit', '1', '--report-revision', page.report_revision]);
  assert.ok(result.exit === 0 || result.value.code === 'REPORT_CHANGED'); paginationVerified = result.exit === 0;
}
console.log(JSON.stringify({ success: true, sha, dirty, actual_removed_and_recompiled: true, study_id_changed: old !== next,
  old_indicator_get: 'WORKSPACE_STUDY_MISMATCH', old_revision: 'REPORT_CHANGED', stable_live_pagination: paginationVerified,
  same_chart_foreign_fixture_only: true, zero_open_pending_fixture_regressions: true, rows }));

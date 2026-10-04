import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
import { sessionPageQuiescence } from '../src/session-recovery.js';
import { LAYOUT_PAGE_CODE } from '../src/layout-state.js';
import { readChartContext } from '../src/chart-context.js';
import { findPineController } from '../src/core/desktop-dom.js';
const name = process.argv[2] || 'executor-indicator';
if (name !== 'executor-indicator') throw new Error('Only the dedicated issue indicator is authorized.');
function call(args, expected = 0, input = '') {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { input, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, expected, r.stderr || r.stdout); return JSON.parse(r.stdout || r.stderr);
}
call(['status']);
const original = call(['--workspace', name, 'pine', 'get']).source;
const workspace = loadWorkspace(resolveWorkspace(name));
let outcome, quiescence;
try {
  call(['--workspace', name, 'pine', 'set'], 0, '//@version=6\nindicator("CLI_I28_Runtime_20261004",overlay=true)\na=array.new_int(1)\nx=array.get(a,2)\nplot(x)\n');
  outcome = call(['--workspace', name, 'pine', 'compile', '--save'], 1);
  assert.notEqual(outcome.recovery_required, true, 'Uncertain native work must be reconciled before restoring source.');
  await withSharedSession(async () => {
    configureTarget(workspace.target);
    quiescence = await evaluate(`(() => {${LAYOUT_PAGE_CODE};${findPineController.toString()};${readChartContext.toString()};return (${sessionPageQuiescence.toString()})(window,document);})()`);
  });
  assert.ok(quiescence.source_states.some(source => source.kind === 'pine' && source.status_type === 3 && source.state === 'terminal_error'));
  assert.equal(quiescence.ready, true);
} finally {
  await disconnect();
  if (!outcome?.recovery_required) {
    call(['--workspace', name, 'pine', 'set'], 0, original);
    call(['--workspace', name, 'pine', 'compile', '--save']);
  }
}
console.log(JSON.stringify({ success: true, compile_exit: 1, code: outcome.code, has_errors: outcome.has_errors,
  native_ready: quiescence.ready, pine_states: quiescence.source_states.filter(source => source.kind === 'pine').map(({ state, status_type, loading }) => ({ state, status_type, loading })), restored_saved_indicator: true }));

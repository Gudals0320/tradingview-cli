import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { acquireResources } from '../src/resource-lock.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
import { findPineController } from '../src/core/desktop-dom.js';
import * as pine from '../src/core/pine.js';
const name = process.argv[2];
if (!['executor-220a', 'executor-220b'].includes(name)) throw new Error('Only explicit 2.2 issue test workspaces are authorized.');
const workspace = loadWorkspace(resolveWorkspace(name)), suffix = name.endsWith('a') ? 'A' : 'B';
if (workspace.owned_target !== workspace.target) throw new Error('An exact newly owned CLI tab is required.');
const lock = await acquireResources(['app', `layout:${workspace.layout}`, `workspace:${workspace.id}`], { command: '2.2 dedicated document setup' });
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  const title = await evaluate(`document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`);
  if (title !== `CLI-I41-42-44-${suffix}-20261004`) throw new Error('Unexpected saved layout; preserve it.');
  await pine.ensurePineEditorOpen();
  if (await evaluate(`(${findPineController.toString()})(document)?.isModified?.()`) === true) throw new Error('Foreign modified draft must be preserved.');
  const created = await pine.newScript({ type: 'strategy' });
  if (!created.success) throw new Error('Dedicated draft creation failed.');
  await pine.setSource({ source: `//@version=6\nstrategy("CLI_I41_42_44_${suffix}_20261004",overlay=true,initial_capital=10000)\nn=input.int(10,"Cycle",minval=2)\nif bar_index % n == 0\n    strategy.entry("L",strategy.long)\nif bar_index % n == 5\n    strategy.close("L")\nplot(ta.sma(close,n))\n` });
  const saved = await pine.save({ timeout: 30000 });
  if (!saved.success) throw new Error(saved.error || 'Save outcome is not verified; retain state.');
  const identity = await evaluate(`(${findPineController.toString()})(document).getScriptIdVersion()`);
  console.log(JSON.stringify({ success: true, saved: true, identity }));
}); } finally { await disconnect(); lock.release(); }

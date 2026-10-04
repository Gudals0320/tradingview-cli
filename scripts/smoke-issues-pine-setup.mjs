// Explicit setup only on the newly created issue test workspace.
import { readFileSync } from 'node:fs';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { acquireResources } from '../src/resource-lock.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
import * as pine from '../src/core/pine.js';
import { findPineController } from '../src/core/desktop-dom.js';
const name = process.argv[2], workspace = loadWorkspace(resolveWorkspace(name));
if (!['executor-issues', 'executor-indicator'].includes(name)) throw new Error('Only the explicit issue test workspaces are authorized.');
const lock = await acquireResources(['app', `layout:${workspace.layout}`, `workspace:${workspace.id}`], { command: 'issues document setup' });
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  const title = await evaluate(`document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`);
  if (title !== (name === 'executor-issues' ? 'CLI-I28-39-Executor-20261004' : 'CLI-I28-Indicator-20261004')) throw new Error('Unexpected layout; refusing document replacement.');
  await pine.ensurePineEditorOpen();
  const modified = await evaluate(`(${findPineController.toString()})(document)?.isModified?.()`);
  if (modified === true) throw new Error('Foreign draft modified; preserve it.');
  const created = await pine.newScript({ type: name === 'executor-issues' ? 'strategy' : 'indicator' });
  if (!created.success) throw new Error('New strategy setup failed.');
  await pine.setSource({ source: name === 'executor-issues' ? readFileSync(new URL('./fixtures/issue-strategy.pine', import.meta.url), 'utf8') : '//@version=6\nindicator("CLI_I28_Indicator_20261004",overlay=true)\nplot(ta.sma(close,10))\n' });
  const saved = await pine.save({ timeout: 30000 });
  if (!saved.success) throw new Error(saved.error || 'Save failed');
  const identity = await evaluate(`(${findPineController.toString()})(document).getScriptIdVersion()`);
  console.log(JSON.stringify({ success: true, saved: saved.saved, identity }));
}); } finally { await disconnect(); lock.release(); }

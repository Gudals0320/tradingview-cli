import CDP from 'chrome-remote-interface';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireWorkspace, reserveWorkspace, releaseWorkspace, workspaceError } from './workspace-store.js';
import { withWorkspaceSession, sourceHash } from './session.js';
import { configureTarget, getClient } from './connection.js';
import { WORKSPACE_PAGE_CODE } from './workspace-page.js';
import { normalizeTimeframe } from './chart-context.js';
import { WORKSPACE_COMMANDS } from './cli/policy.js';
export { WORKSPACE_COMMANDS } from './cli/policy.js';

async function raw(client, expression) {
  const value = await client.Runtime.evaluate({ expression: `(() => {${WORKSPACE_PAGE_CODE};return (${expression});})()`, returnByValue: true, awaitPromise: true });
  if (value.exceptionDetails) {
    const description = value.exceptionDetails.exception?.description || value.exceptionDetails.text;
    const code = description.match(/\b(WORKSPACE_[A-Z_]+):/)?.[1] || 'WORKSPACE_PAGE_ERROR';
    throw workspaceError(code, description);
  }
  return value.result?.value;
}
export async function workspaceInventory() {
  const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  return { success: true, targets: targets.filter(target => target.type === 'page' && /tradingview\.com\/chart\//.test(target.url))
    .map(target => ({ target: target.id, layout: target.url.match(/\/chart\/([^/?]+)/)?.[1] || null })) };
}
async function checkLayout(workspace) {
  const { targets } = await workspaceInventory();
  const exact = targets.find(target => target.target === workspace.target);
  if (!exact || exact.layout !== workspace.layout) throw workspaceError('WORKSPACE_TARGET_LOST', 'Exact target and saved layout must still be open.');
  if (targets.some(target => target.target !== workspace.target && target.layout === workspace.layout)) {
    throw workspaceError('WORKSPACE_LAYOUT_SHARED', 'The saved layout is also open in another target.');
  }
}
async function browserIdentity() {
  const version = await CDP.Version({ host: CDP_HOST, port: CDP_PORT });
  if (!version.webSocketDebuggerUrl) throw workspaceError('WORKSPACE_BROWSER_UNIDENTIFIED', 'Browser generation is unavailable.');
  return version.webSocketDebuggerUrl;
}
function owner(workspace) { return { id: workspace.id, token: workspace.token, nonce: workspace.binding?.nonce }; }
function pageCall(fn, ...args) { return `${fn}(window,document,${args.map(arg => JSON.stringify(arg)).join(',')})`; }

export async function initWorkspace(resources) {
  const workspace = reserveWorkspace(resources), lease = acquireWorkspace(workspace.file);
  return withWorkspaceSession(lease, async () => {
    try {
      await checkLayout(workspace);
      configureTarget(workspace.target);
      const client = await getClient(), browser = await browserIdentity();
      const binding = await raw(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
      lease.saveBinding({ ...binding, browser });
      lease.finish({ success: true, result: { registered: true } });
      return { success: true, workspace_id: workspace.id, file: workspace.file, target: workspace.target, layout: workspace.layout, pine: workspace.pine };
    } catch (error) { lease.finish({ success: false, error: error.message }); throw error; }
  });
}
async function permitFor(command, values, positionals) {
  if (command === 'pine set') {
    const source = values.file ? readFileSync(values.file, 'utf8') : await readInput();
    // Preserve the CLI adapter's stdin behavior without consuming it twice.
    values.workspaceSource = source;
    return { source: source.replace(/\r\n/g, '\n') };
  }
  if (command === 'symbol' && positionals[0]) return { symbol: positionals[0] };
  if (command === 'timeframe' && positionals[0]) return { resolution: normalizeTimeframe(positionals[0]) };
  if (command === 'type' && positionals[0]) {
    const names = ['Bars', 'Candles', 'Line', 'Area', 'Renko', 'Kagi', 'PointAndFigure', 'LineBreak', 'HeikinAshi', 'HollowCandles'];
    return { chart_type: names.includes(positionals[0]) ? names.indexOf(positionals[0]) : Number(positionals[0]) };
  }
  if (command === 'indicator set') {
    const inputs = JSON.parse(values.inputs || '{}');
    if (['pineId', 'pineVersion', 'text'].some(key => Object.hasOwn(inputs, key))) throw workspaceError('WORKSPACE_INPUT_FORBIDDEN', 'Compiled document identity inputs cannot be edited.');
    return { inputs };
  }
  if (['pine compile', 'pine raw-compile'].includes(command)) return { compile: true };
  if (command === 'pine save') return { save: true };
  return {};
}
async function readInput() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); }

export async function runWorkspace(file, command, values, positionals, handler) {
  if (!WORKSPACE_COMMANDS.has(command)) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', `Command ${command} cannot run independently in a workspace.`);
  const permit = await permitFor(command, values, positionals), lease = acquireWorkspace(file), workspace = lease.workspace;
  return withWorkspaceSession(lease, async () => {
    try {
      if (!workspace.binding) throw workspaceError('WORKSPACE_NOT_BOUND', 'Initialization did not finish; recover explicitly.');
      await checkLayout(workspace);
      if (await browserIdentity() !== workspace.binding.browser) throw workspaceError('WORKSPACE_GENERATION_CHANGED', 'Desktop browser generation changed.');
      configureTarget(workspace.target);
      const client = await getClient();
      const before = await raw(client, pageCall('startWorkspacePage', owner(workspace), lease.operation, permit));
      if (command.startsWith('indicator ') && before.studies[0]?.id !== positionals[0]) throw workspaceError('WORKSPACE_STUDY_MISMATCH', 'Indicator ID must identify the owned study.');
      lease.checkpoint({ phase: 'running', command, before, permit });
      const result = await handler(values, positionals);
      const after = await raw(client, pageCall('finishWorkspacePage', owner(workspace), lease.operation));
      const success = result?.success !== false && result?.compiled !== false && result?.has_errors !== true;
      lease.saveBinding({ ...workspace.binding, snapshot: after.snapshot });
      const study = after.snapshot.studies[0];
      const calculation = after.calculation ? { ...after.calculation,
        completed: after.calculation.completed ? { cycle: after.calculation.completed.cycle, key_hash: sourceHash(after.calculation.completed.key) } : null } : null;
      const provenance = { workspace_id: workspace.id, operation_id: lease.operation, target: workspace.target, layout: workspace.layout, pine: workspace.pine,
        page_generation: workspace.binding.nonce, source_hash: sourceHash(after.snapshot.source), context: after.snapshot.context,
        study: study ? { ...study, inputs: study.inputs.filter(input => input.id !== 'text'), compiled_hash: sourceHash(JSON.stringify(study.inputs)) } : null, calculation, native_events: after.events };
      const output = { ...result, provenance };
      lease.checkpoint({ phase: success ? 'complete' : 'failed', command, before, after: after.snapshot, provenance });
      lease.finish({ success, result: output, interrupted: false }); return output;
    } catch (error) { lease.finish({ success: false, error: error.message }); throw error; }
  });
}

export async function recoverWorkspace(file, { operationId, rebind = false } = {}) {
  const lease = acquireWorkspace(file, { recover: true, recoveryOperation: operationId }), workspace = lease.workspace;
  return withWorkspaceSession(lease, async () => {
    try {
      if (!lease.recoveredOperation || operationId !== lease.recoveredOperation) throw workspaceError('WORKSPACE_OPERATION_MISMATCH', 'Pass the exact interrupted operation ID.');
      await checkLayout(workspace); configureTarget(workspace.target);
      const client = await getClient(), browser = await browserIdentity();
      if (!rebind && workspace.binding?.browser !== browser) throw workspaceError('WORKSPACE_GENERATION_CHANGED', 'Use --rebind to acknowledge the new page generation.');
      if (!rebind) await raw(client, pageCall('guardWorkspacePage', owner(workspace)));
      // bind validates resource IDs and native quiescence before changing page state.
      const binding = await raw(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
      lease.checkpoint({ phase: 'reconciled', interrupted_operation: operationId, snapshot: binding.snapshot, rebind });
      lease.saveBinding({ ...binding, browser });
      lease.acknowledgeRecovery(operationId);
      lease.finish({ success: true, result: { recovered: true, interrupted_operation: operationId, incomplete: true } });
      return { success: true, recovered: true, incomplete: true, workspace_id: workspace.id, interrupted_operation: operationId };
    } catch (error) { lease.finish({ success: false, error: error.message }); throw error; }
  });
}

export async function closeWorkspace(file) {
  const lease = acquireWorkspace(file), workspace = lease.workspace;
  // No Desktop writes. Validate the page is idle, then drop only this reservation.
  return withWorkspaceSession(lease, async () => {
    try {
      await checkLayout(workspace); configureTarget(workspace.target);
      const snapshot = await raw(await getClient(), pageCall('guardWorkspacePage', owner(workspace)));
      if (snapshot.pending) throw workspaceError('WORKSPACE_NATIVE_BUSY', 'Cannot release a pending native action.');
      const result = { success: true, released: true, workspace_id: workspace.id };
      lease.checkpoint({ phase: 'released', result });
      return releaseWorkspace(lease);
    } catch (error) { try { lease.finish({ success: false, error: error.message }); } catch { /* Original failure wins. */ } throw error; }
  });
}

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
async function sourceProof(client, snapshot) {
  if (snapshot.modified !== false || !snapshot.version) return null;
  const appliedVersion = snapshot.studies[0]?.inputs.find(input => input.id === 'pineVersion')?.value;
  try {
    const verified = await raw(client, `(async () => {
      const response=await fetch('https://pine-facade.tradingview.com/pine-facade/get/'+encodeURIComponent(${JSON.stringify(snapshot.pine)})+'/'+encodeURIComponent(${JSON.stringify(snapshot.version)}),{credentials:'include'});
      if(!response.ok)return false;const data=await response.json();
      const appliedVersion=${JSON.stringify(appliedVersion || snapshot.version)};
      const applied=String(appliedVersion)===${JSON.stringify(String(snapshot.version))}?data:await fetch('https://pine-facade.tradingview.com/pine-facade/get/'+encodeURIComponent(${JSON.stringify(snapshot.pine)})+'/'+encodeURIComponent(appliedVersion),{credentials:'include'}).then(response=>response.ok?response.json():{});
      const current=readWorkspacePage(window,document);
      return data.source?.replace(/\\r\\n/g,'\\n')===${JSON.stringify(snapshot.source)}&&applied.source?.replace(/\\r\\n/g,'\\n')===${JSON.stringify(snapshot.source)}&&current.source===${JSON.stringify(snapshot.source)}&&current.pine===${JSON.stringify(snapshot.pine)}&&String(current.version)===${JSON.stringify(String(snapshot.version))}
        &&(!current.studies.length||String(current.studies[0].inputs.find(input=>input.id==='pineVersion')?.value)===String(appliedVersion));
    })()`);
    return verified ? { hash: sourceHash(snapshot.source), version: String(snapshot.version), applied_version: String(appliedVersion || snapshot.version) } : null;
  } catch { return null; } // Compilation can provide independent source verification later.
}

export async function initWorkspace(resources) {
  await checkLayout(resources);
  const workspace = reserveWorkspace(resources), lease = acquireWorkspace(workspace.file);
  return withWorkspaceSession(lease, async () => {
    try {
      await checkLayout(workspace);
      configureTarget(workspace.target);
      const client = await getClient(), browser = await browserIdentity();
      const binding = await raw(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
      const source_proof = await sourceProof(client, binding.snapshot);
      await raw(client, pageCall('guardWorkspacePage', { ...owner(workspace), nonce: binding.nonce }));
      lease.saveBinding({ ...binding, browser, source_proof });
      lease.finish({ success: true, result: { registered: true } });
      return { success: true, workspace_id: workspace.id, file: workspace.file, target: workspace.target, layout: workspace.layout, pine: workspace.pine };
    } catch (error) {
      // Binding only writes a page nonce, never chart/document state. Roll back admission.
      try { lease.finish({ success: false, interrupted: false, error: error.message }); const rollback = acquireWorkspace(workspace.file); releaseWorkspace(rollback); }
      catch (cleanup) { error.details = { cleanup_error: cleanup.message }; }
      throw error;
    }
  });
}
async function permitFor(command, values, positionals) {
  if (command === 'pine set') {
    const source = values.file ? readFileSync(values.file, 'utf8') : await readInput();
    if (!source) throw workspaceError('PINE_SOURCE_REQUIRED', 'A nonempty Pine source is required.');
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

export async function runWorkspace(file, command, values, positionals, handler, { _deps } = {}) {
  if (!WORKSPACE_COMMANDS.has(command)) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', `Command ${command} cannot run independently in a workspace.`);
  const permit = await permitFor(command, values, positionals), lease = acquireWorkspace(file), workspace = lease.workspace;
  let started = false;
  let handlerStarted = false, client, finalState;
  const inspect = _deps?.raw || raw;
  return withWorkspaceSession(lease, async () => {
    try {
      if (!workspace.binding) throw workspaceError('WORKSPACE_NOT_BOUND', 'Initialization did not finish; recover explicitly.');
      await (_deps?.checkLayout || checkLayout)(workspace);
      if (await (_deps?.browserIdentity || browserIdentity)() !== workspace.binding.browser) throw workspaceError('WORKSPACE_GENERATION_CHANGED', 'Desktop browser generation changed.');
      configureTarget(workspace.target);
      client = await (_deps?.getClient || getClient)();
      const before = await inspect(client, pageCall('startWorkspacePage', owner(workspace), lease.operation, permit));
      started = true;
      if (command.startsWith('indicator ') && before.studies[0]?.id !== positionals[0]) throw workspaceError('WORKSPACE_STUDY_MISMATCH', 'Indicator ID must identify the owned study.');
      const reportRead = ['data strategy', 'data trades', 'data ledger', 'data equity'].includes(command);
      if (reportRead && (before.calculating || before.studies[0]?.status !== 2)) throw workspaceError('REPORT_PENDING', 'Owned strategy calculation is not complete.');
      lease.checkpoint({ phase: 'running', command, before, permit });
      handlerStarted = true;
      const result = await handler(values, positionals);
      const after = await inspect(client, pageCall('finishWorkspacePage', owner(workspace), lease.operation));
      finalState = after.snapshot;
      const hash = sourceHash(after.snapshot.source);
      const persistedProof = workspace.binding.source_proof;
      const sourceVerified = after.calculation?.source_hash === hash || (persistedProof?.hash === hash && !after.snapshot.modified
        && persistedProof.version === String(after.snapshot.version)
        && (persistedProof.applied_version || persistedProof.version) === String(after.snapshot.studies[0]?.inputs.find(input => input.id === 'pineVersion')?.value));
      if (reportRead && result?.success && (after.snapshot.calculating || after.snapshot.studies[0]?.status !== 2
        || after.calculation?.report_verified !== true || after.calculation?.phase !== 'ready'
        || after.calculation?.inputs_fingerprint !== JSON.stringify(after.snapshot.studies[0]?.inputs)
        || !sourceVerified
        || result.strategy_id !== after.snapshot.studies[0]?.id)) throw workspaceError('REPORT_UNVERIFIED', 'Report does not match the current owned source, inputs and completed calculation.');
      const success = result?.success !== false && result?.compiled !== false && result?.has_errors !== true;
      const source_proof = command === 'pine save' && result?.saved ? { hash, version: String(after.snapshot.version) } : workspace.binding.source_proof;
      lease.saveBinding({ ...workspace.binding, snapshot: after.snapshot, source_proof });
      const study = after.snapshot.studies[0];
      const calculation = after.calculation ? { ...after.calculation, inputs_fingerprint: undefined,
        inputs_hash: after.calculation.inputs_fingerprint ? sourceHash(after.calculation.inputs_fingerprint) : null,
        completed: after.calculation.completed ? { cycle: after.calculation.completed.cycle, key_hash: sourceHash(after.calculation.completed.key) } : null } : null;
      const provenance = { workspace_id: workspace.id, operation_id: lease.operation, target: workspace.target, layout: workspace.layout, pine: workspace.pine,
        page_generation: workspace.binding.nonce, source_hash: sourceHash(after.snapshot.source), context: after.snapshot.context,
        study: study ? { ...study, inputs: study.inputs.filter(input => input.id !== 'text'), compiled_hash: sourceHash(JSON.stringify(study.inputs)) } : null, calculation, native_events: after.events };
      const output = { ...result, provenance };
      lease.checkpoint({ phase: success ? 'complete' : 'failed', command, before, after: after.snapshot, provenance });
      lease.finish({ success, result: output, interrupted: false }); return output;
    } catch (error) {
      let interrupted = error.code === 'WORKSPACE_EXTERNAL_CHANGE' || (handlerStarted && !finalState);
      if (started && !finalState) {
        try { const after = await inspect(client, pageCall('finishWorkspacePage', owner(workspace), lease.operation)); finalState = after.snapshot; interrupted = false; }
        catch { interrupted = true; }
      }
      if (finalState) try { lease.saveBinding({ ...workspace.binding, snapshot: finalState }); } catch { interrupted = true; }
      try { lease.finish({ success: false, interrupted, error: error.message }); } catch (cleanup) { error.details = { cleanup_error: cleanup.message }; }
      throw error;
    }
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
      if (!rebind) {
        const operation = await raw(client, 'window.__tvCliWorkspace?.operation');
        if (operation && operation !== operationId) throw workspaceError('WORKSPACE_OPERATION_MISMATCH', 'Page operation does not match the interrupted operation.');
      }
      // bind validates resource IDs and native quiescence before changing page state.
      const binding = await raw(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
      const source_proof = await sourceProof(client, binding.snapshot);
      const previous = workspace.binding?.snapshot;
      const adopted_changes = { source: previous ? previous.source !== binding.snapshot.source : true,
        context: JSON.stringify(previous?.context) !== JSON.stringify(binding.snapshot.context),
        inputs: JSON.stringify(previous?.studies) !== JSON.stringify(binding.snapshot.studies) };
      lease.checkpoint({ phase: 'reconciled', interrupted_operation: operationId, before: previous, snapshot: binding.snapshot, adopted_changes, rebind });
      lease.saveBinding({ ...binding, browser, source_proof });
      lease.acknowledgeRecovery(operationId);
      lease.finish({ success: true, result: { recovered: true, interrupted_operation: operationId, incomplete: true } });
      return { success: true, recovered: true, incomplete: true, workspace_id: workspace.id, interrupted_operation: operationId, adopted_changes };
    } catch (error) { try { lease.finish({ success: false, error: error.message }); } catch (cleanup) { error.details = { cleanup_error: cleanup.message }; } throw error; }
  });
}

export async function rebindWorkspace(file, workspaceId, { _deps } = {}) {
  const lease = acquireWorkspace(file), workspace = lease.workspace;
  return withWorkspaceSession(lease, async () => {
    try {
      if (workspace.id !== workspaceId) throw workspaceError('WORKSPACE_OWNERSHIP_LOST', 'Pass the exact workspace ID to acknowledge a changed generation.');
      await (_deps?.checkLayout || checkLayout)(workspace); configureTarget(workspace.target);
      const client = await (_deps?.getClient || getClient)(), browser = await (_deps?.browserIdentity || browserIdentity)();
      const nonce = await (_deps?.raw || raw)(client, 'window.__tvCliWorkspace?.nonce');
      if (workspace.binding?.browser === browser && workspace.binding?.nonce === nonce) {
        throw workspaceError('WORKSPACE_GENERATION_UNCHANGED', 'The bound page generation still exists. Inspect unexpected changes instead of rebinding it.');
      }
      const binding = await raw(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
      const source_proof = await sourceProof(client, binding.snapshot), previous = workspace.binding?.snapshot;
      const adopted_changes = { source: previous?.source !== binding.snapshot.source,
        context: JSON.stringify(previous?.context) !== JSON.stringify(binding.snapshot.context),
        inputs: JSON.stringify(previous?.studies) !== JSON.stringify(binding.snapshot.studies) };
      lease.checkpoint({ phase: 'rebound', before: previous, after: binding.snapshot, adopted_changes });
      lease.saveBinding({ ...binding, browser, source_proof }); lease.finish({ success: true, result: { rebound: true, adopted_changes } });
      return { success: true, rebound: true, workspace_id: workspace.id, adopted_changes };
    } catch (error) { try { lease.finish({ success: false, interrupted: false, error: error.message }); } catch (cleanup) { error.details = { cleanup_error: cleanup.message }; } throw error; }
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

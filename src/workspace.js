import CDP from './cdp.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireWorkspace, reserveWorkspace, releaseWorkspace, workspaceError, loadWorkspace } from './workspace-store.js';
import { withWorkspaceSession, sourceHash, canonicalSessionHost } from './session.js';
import { configureTarget, getClient } from './connection.js';
import { WORKSPACE_PAGE_CODE } from './workspace-page.js';
import { normalizeTimeframe } from './chart-context.js';
import { WORKSPACE_READS, pureRead, PINE_COMMANDS, FOREGROUND_COMMANDS, resourceKinds, workspaceRequired } from './cli/policy.js';
import { acquireResources } from './resource-lock.js';
import { getDesktopInventory } from './desktop.js';
import { withSharedSession } from './session.js';
import { sessionPaths } from './session.js';
import { registerWorkspaceName, resolveWorkspace, selectWorkspace } from './workspace-registry.js';
import { newTab } from './core/tab.js';
import { secureDirectory } from './private-store.js';
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
  let targets;
  try { targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT }); }
  catch (cause) { throw Object.assign(workspaceError('WORKSPACE_DISCONNECTED', 'Desktop CDP is unreachable; keep the saved workspace and reconnect after Desktop is available.'), { cause }); }
  return { success: true, targets: targets.filter(target => target.type === 'page' && /tradingview\.com\/chart\//.test(target.url))
    .map(target => ({ target: target.id, layout: target.url.match(/\/chart\/([^/?]+)/)?.[1] || null })), partial: false, errors: [] };
}
async function checkLayout(workspace) {
  const { targets } = await workspaceInventory();
  const exact = targets.find(target => target.target === workspace.target);
  if (!exact) throw workspaceError('WORKSPACE_TARGET_LOST', 'CDP is reachable but the exact workspace target is absent. Use explicit workspace reconnect.');
  if (exact.layout !== workspace.layout) throw workspaceError('WORKSPACE_IDENTITY_MISMATCH', 'Target shows a different saved layout.');
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
  if (canonicalSessionHost(CDP_HOST) !== '127.0.0.1') throw workspaceError('WORKSPACE_ENDPOINT_UNSUPPORTED', 'Independent workspaces currently require the local Desktop loopback endpoint.');
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
      if (error.code === 'CDP_TIMEOUT') {
        try { lease.finish({ success: false, interrupted: true, error: error.message }); } catch (cleanup) { error.details = { cleanup_error: cleanup.message }; }
        error.details = { ...error.details, workspace_id: workspace.id,
          next_command: `tv workspace recover --file '${workspace.file.replace(/'/g, "''")}' --operation ${lease.operation} --rebind` };
        throw error;
      }
      // Binding only writes a page nonce, never chart/document state. Roll back admission.
      try { lease.finish({ success: false, interrupted: false, error: error.message }); const rollback = acquireWorkspace(workspace.file); releaseWorkspace(rollback); }
      catch (cleanup) { error.details = { cleanup_error: cleanup.message }; }
      throw error;
    }
  });
}
export async function createWorkspace(name, { layout, target, pine } = {}) {
  if (!layout) throw workspaceError('WORKSPACE_RESOURCE_REQUIRED', 'Select or create a saved layout first; pass --layout ID.');
  const inventory = await workspaceInventory();
  const matches = inventory.targets.filter(item => item.layout === layout && (!target || item.target === target));
  if (matches.length !== 1) throw workspaceError('WORKSPACE_TARGET_REQUIRED', 'Open the dedicated saved layout in exactly one target using layout open, then create the workspace.');
  const directory = join(sessionPaths().directory, 'handles'); secureDirectory(directory);
  const file = join(directory, `${randomUUID()}.json`);
  await initWorkspace({ file, target: matches[0].target, layout, pine });
  return registerWorkspaceName(name, file);
}
export async function verifyWorkspaceSelection(name) {
  const file = resolveWorkspace(name), workspace = loadWorkspace(file);
  await checkLayout(workspace);
  return selectWorkspace(name);
}
export async function openLayout({ name, create = false } = {}) {
  const inventory = await getDesktopInventory();
  const previous_target = inventory.tabs.find(tab => tab.active)?.id || null;
  const result = await newTab({ layout: create ? 'new' : name, name: create ? name : undefined });
  return { ...result, previous_target, foreground_changed: true };
}
export async function reconnectWorkspace(name, { target, generation, pine, detach = false } = {}) {
  const file = resolveWorkspace(name), selected = loadWorkspace(file);
  if (!generation || generation !== selected.binding?.nonce) throw workspaceError('WORKSPACE_GENERATION_CHANGED', 'Pass --generation from workspace show to acknowledge exactly the recorded generation.');
  const resources = await acquireResources(['app', `layout:${selected.layout}`, `workspace:${selected.id}`, ...(pine || selected.pine ? [`document:${pine || selected.pine}`] : [])], { command: 'workspace reconnect', workspace_id: selected.id });
  let lease;
  try {
    lease = acquireWorkspace(file);
    const inventory = await workspaceInventory();
    if (!target) {
      const matches = inventory.targets.filter(item => item.layout === selected.layout);
      if (matches.length !== 1) throw workspaceError('WORKSPACE_TARGET_REQUIRED', 'Open the saved dedicated layout with layout open, then pass its exact --target. No automatic tab recreation occurs.');
      target = matches[0].target;
    }
    const prospective = { ...selected, target, pine: detach ? null : pine || selected.pine };
    await checkLayout(prospective);
    const browser = await browserIdentity();
    const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target });
    try {
      const snapshot = await raw(client, pageCall('readWorkspacePage', { pine: Boolean(prospective.pine) }));
      if (snapshot.layout !== prospective.layout || (prospective.pine && snapshot.pine !== prospective.pine)) throw workspaceError('WORKSPACE_IDENTITY_MISMATCH', 'New target must already display the owned saved layout and exact document.');
      if (snapshot.pending) throw workspaceError('WORKSPACE_NATIVE_BUSY', 'Wait for the target to settle before reconnecting.');
      lease.reassign({ target, pine: prospective.pine, expectedGeneration: generation });
      const binding = await raw(client, pageCall('bindWorkspacePage', lease.workspace, randomUUID()));
      // Old study IDs, report revisions and source proofs are never reused.
      await raw(client, 'delete window.__tvCliCompilation; delete window.__tvCliPineCompile');
      lease.saveBinding({ ...binding, browser, source_proof: null });
      lease.finish({ success: true, result: { rebound: true, results_invalidated: true } });
      return { success: true, workspace_id: selected.id, target, generation: binding.nonce, results_invalidated: true, foreground_changed: false };
    } finally { await client.close(); }
  } catch (error) { if (lease) lease.finish({ success: false, interrupted: false, error: error.message }); throw error; }
  finally { resources.release(); }
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
async function readInput() {
  if (process.stdin.isTTY) throw workspaceError('PINE_SOURCE_REQUIRED', 'Pipe Pine source through stdin or use --file.');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function runWorkspace(file, command, values, positionals, handler, { _deps } = {}) {
  if (!workspaceRequired(command)) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', `Command ${command} cannot run independently in a workspace.`);
  const selected = loadWorkspace(file);
  if (['pine new', 'pine open', 'stream ohlcv'].includes(command)) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', 'Use a dedicated saved document with workspace attach, or stream bars for the owned chart. Cross-target provisioning is unavailable in a workspace.');
  if (PINE_COMMANDS.has(command) && !selected.pine) throw workspaceError('WORKSPACE_PINE_REQUIRED', 'This chart-only workspace has no owned Pine document. Use workspace attach with a dedicated saved document.');
  if (FOREGROUND_COMMANDS.has(command) || (command === 'screenshot' && values.method !== 'api')) {
    const inventory = await withSharedSession(() => getDesktopInventory());
    if (!inventory.tabs.some(tab => tab.id === selected.target && tab.active)) throw workspaceError('FOREGROUND_REQUIRED', 'Select this workspace tab in Desktop before using shared UI commands.');
    if (['layout switch', 'tab close', 'tab switch'].includes(command)) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', 'Use workspace reconnect or explicit layout open; registered resources cannot be silently replaced.');
  }
  if (command === 'quote' && positionals.length) throw workspaceError('WORKSPACE_COMMAND_UNSUPPORTED', 'Workspace quote reads the owned chart only; a symbol switch is not a pure read.');
  if (WORKSPACE_READS.has(command) && pureRead(command, values, positionals)) {
    const workspace = loadWorkspace(file);
    const observer = { workspace, observe: true, endpoint_key: workspace.endpoint_key, assertOwner: () => loadWorkspace(file) };
    return withWorkspaceSession(observer, async () => {
      await (_deps?.checkLayout || checkLayout)(workspace);
      if (await (_deps?.browserIdentity || browserIdentity)() !== workspace.binding?.browser) throw workspaceError('WORKSPACE_GENERATION_CHANGED', 'Desktop browser generation changed.');
      configureTarget(workspace.target);
      const client = await (_deps?.getClient || getClient)(), inspect = _deps?.raw || raw;
      const before = await inspect(client, pageCall('guardWorkspacePage', owner(workspace), { observe: true }));
      if (command === 'indicator get' && positionals[0] !== before.studies[0]?.id) throw workspaceError('WORKSPACE_STUDY_MISMATCH', 'Read only the owned study.');
      const result = await handler(values, positionals);
      if (command.startsWith('stream ') && result === undefined) return;
      const after = await inspect(client, pageCall('guardWorkspacePage', owner(workspace), { observe: true }));
      const stable = sourceHash(before.source) === sourceHash(after.source)
        && JSON.stringify(before.context) === JSON.stringify(after.context)
        && JSON.stringify(before.studies.map(study => [study.id, study.inputs])) === JSON.stringify(after.studies.map(study => [study.id, study.inputs]));
      if (!stable) throw workspaceError('WORKSPACE_OBSERVATION_CHANGED', 'Source, inputs or chart context changed during this observation; retry after the active operation settles.');
      if (['data strategy', 'data trades', 'data ledger', 'data equity'].includes(command) && result?.success) {
        const epoch = await inspect(client, 'window.__tvCliCompilation && ({source_hash:window.__tvCliCompilation.source_hash,report_verified:window.__tvCliCompilation.report_verified,phase:window.__tvCliCompilation.phase,inputs_fingerprint:window.__tvCliCompilation.inputs_fingerprint})');
        const proof = workspace.binding.source_proof;
        const verified = epoch?.source_hash === sourceHash(after.source) || (proof?.hash === sourceHash(after.source) && after.modified === false
          && proof.version === String(after.version) && (proof.applied_version || proof.version) === String(after.studies[0]?.inputs.find(input => input.id === 'pineVersion')?.value));
        if (!verified || epoch?.report_verified !== true || epoch.phase !== 'ready' || after.calculating || after.studies[0]?.status !== 2
          || epoch.inputs_fingerprint !== JSON.stringify(after.studies[0]?.inputs) || result.strategy_id !== after.studies[0]?.id) throw workspaceError('REPORT_UNVERIFIED', 'Report does not match verified source, inputs and completed calculation.');
      }
      const study = after.studies[0], proof = workspace.binding.source_proof;
      const persistedApplied = Boolean(proof?.hash === sourceHash(after.source) && after.modified === false
        && proof.version === String(after.version)
        && (proof.applied_version || proof.version) === String(study?.inputs.find(input => input.id === 'pineVersion')?.value));
      if (result === undefined) return;
      return { ...result, provenance: { workspace_id: workspace.id, observation: true, target: workspace.target,
        source_hash: sourceHash(after.source), source_scope: 'editor', persisted_applied_source_verified: persistedApplied,
        study: study ? { id: study.id, status: study.status, compiled_hash: sourceHash(JSON.stringify(study.inputs)) } : null,
        context: after.context, page_generation: workspace.binding.nonce,
        changed_during_read: false } };
    });
  }
  const permit = await permitFor(command, values, positionals);
  const resourceLease = await acquireResources(resourceKinds(command, values, positionals).map(kind => kind === 'app' ? 'app' : `${kind}:${kind === 'layout' ? selected.layout : kind === 'document' ? selected.pine : selected.id}`), { command, workspace_id: selected.id, timeout: values['lock-timeout-ms'] });
  let lease;
  try { lease = acquireWorkspace(file); } catch (error) { resourceLease.release(); throw error; }
  const workspace = lease.workspace;
  let started = false;
  let handlerStarted = false, client, finalState;
  const inspect = _deps?.raw || raw;
  try { return await withWorkspaceSession(lease, async () => {
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
      let interrupted = ['WORKSPACE_EXTERNAL_CHANGE', 'WORKSPACE_PAGE_BUSY', 'CDP_TIMEOUT'].includes(error.code) || (handlerStarted && !finalState);
      if (started && !finalState) {
        try { const after = await inspect(client, pageCall('finishWorkspacePage', owner(workspace), lease.operation)); finalState = after.snapshot; interrupted = false; }
        catch { interrupted = true; }
      }
      if (finalState) try { lease.saveBinding({ ...workspace.binding, snapshot: finalState }); } catch { interrupted = true; }
      try { lease.finish({ success: false, interrupted, error: error.message }); } catch (cleanup) { error.details = { cleanup_error: cleanup.message }; }
      throw error;
    }
  }); } finally { resourceLease.release(); }
}

export async function recoverWorkspace(file, { operationId, rebind = false, restoreDocument = false } = {}) {
  if (restoreDocument && !rebind) throw workspaceError('WORKSPACE_REBIND_REQUIRED', '--restore-document requires explicit --rebind recovery.');
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
      if (restoreDocument) await raw(client, pageCall('restoreWorkspaceDocument', workspace));
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

export async function rebindWorkspace(file, workspaceId, { _deps, restoreDocument = false } = {}) {
  const lease = acquireWorkspace(file, _deps?.options || {}), workspace = lease.workspace;
  return withWorkspaceSession(lease, async () => {
    try {
      if (workspace.id !== workspaceId) throw workspaceError('WORKSPACE_OWNERSHIP_LOST', 'Pass the exact workspace ID to acknowledge a changed generation.');
      await (_deps?.checkLayout || checkLayout)(workspace); configureTarget(workspace.target);
      const client = await (_deps?.getClient || getClient)(), browser = await (_deps?.browserIdentity || browserIdentity)();
      const nonce = await (_deps?.raw || raw)(client, 'window.__tvCliWorkspace?.nonce');
      if (workspace.binding?.browser === browser && workspace.binding?.nonce === nonce) {
        throw workspaceError('WORKSPACE_GENERATION_UNCHANGED', 'The bound page generation still exists. Inspect unexpected changes instead of rebinding it.');
      }
      if (restoreDocument) await (_deps?.raw || raw)(client, pageCall('restoreWorkspaceDocument', workspace));
      const binding = await (_deps?.raw || raw)(client, pageCall('bindWorkspacePage', workspace, randomUUID()));
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

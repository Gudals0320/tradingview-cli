import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sessionPaths, sessionStatus, readReservations, withAdmissionGate, assertNoPortLease, canonicalSessionHost, reclaimDeadSession, assertLegacyCompatibility } from './session.js';
import { CDP_HOST } from './config.js';
import { secureDirectory } from './private-store.js';
import { tmpdir } from 'node:os';
import { ownerAlive } from './process-identity.js';
import {withLegacyNamespace,synchronizeLegacyNamespace} from './legacy-bridge.js';

export function workspaceError(code, message) { const error = new Error(message); error.code = code; return error; }
const fail = (code, message) => { throw workspaceError(code, message); };
function read(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function atomic(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  const started = Date.now();
  for (;;) {
    try { renameSync(temporary, path); break; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || Date.now() - started >= 250) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}
function match(rows, workspace) {
  const row = rows.find(item => item.id === workspace.id);
  if (!row || row.token !== workspace.token || row.file !== workspace.file
    || row.target !== workspace.target || row.layout !== workspace.layout || row.pine !== workspace.pine) {
    fail('WORKSPACE_OWNERSHIP_LOST', 'Workspace resources or owner token changed.');
  }
  return row;
}
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function available(options, workspace) {
  reclaimDeadSession(options);
  const state = sessionStatus({...options,fastIdentity:true});
  if (state.locked && state.owner_scope!=='app') fail('SESSION_BUSY', 'A legacy endpoint lease prevents workspace admission.');
  if (state.recovery_required && state.recovery_effect_scope!=='app' && state.recovery_targets.includes(workspace?.target)) fail('RECOVERY_REQUIRED', 'A legacy journal affects this workspace target. Reconcile its exact run ID.');
  if (canonicalSessionHost(options.host ?? CDP_HOST) === '127.0.0.1') assertNoPortLease(options);
}

function privatePath(workspace, options) {
  return join(sessionPaths(options).directory, 'private-workspaces', `${workspace.id}.json`);
}
export function workspaceArtifactDirectory(workspace, options = {}) {
  return join(sessionPaths(options).directory, 'private-workspaces', workspace.id);
}
function publicHandle(workspace) {
  return { schema: 2, id: workspace.id, file: workspace.file, endpoint_key: workspace.endpoint_key };
}
function savePrivate(workspace, options) {
  const paths = sessionPaths(options);
  secureDirectory(paths.directory);
  secureDirectory(join(paths.directory, 'private-workspaces'));
  atomic(privatePath(workspace, options), { ...workspace, schema: 2 });
}
function migrateWorkspace(workspace, options) {
  if (workspace.schema === 2) return;
  savePrivate(workspace, options); // Source and credential are retained before public replacement.
  const legacy = join(dirname(workspace.file), '.tv-workspaces', workspace.id);
  if (existsSync(legacy)) secureDirectory(legacy); // Keep interrupted journal paths valid, with private access.
  atomic(workspace.file, publicHandle(workspace));
  workspace.schema = 2;
}

export function loadWorkspace(file, options = {}) {
  let value = read(resolve(file));
  if (![1, 2].includes(value.schema) || !samePath(value.file, resolve(file)) || value.endpoint_key !== sessionPaths(options).key) {
    fail('WORKSPACE_ENDPOINT_MISMATCH', 'Workspace file, schema or endpoint does not match.');
  }
  if (!/^[a-f0-9-]{36}$/i.test(value.id)) fail('WORKSPACE_OWNERSHIP_LOST', 'Invalid workspace ID.');
  if (value.schema === 2) {
    if (Object.keys(value).some(key => !['schema', 'id', 'file', 'endpoint_key'].includes(key))) fail('WORKSPACE_OWNERSHIP_LOST', 'Public handle contains unexpected owner fields.');
    const stored = read(privatePath(value, options));
    if (stored.id !== value.id || stored.endpoint_key !== value.endpoint_key || !samePath(stored.file, value.file)) fail('WORKSPACE_OWNERSHIP_LOST', 'Private store identity differs from public handle.');
    value = stored;
  }
  match(readReservations(options), value);
  return value;
}

/** Import a released old handle without moving/removing the old private store. */
export function importLegacyWorkspace(file, {legacyDirectory=join(tmpdir(),'tradingview-cli-sessions'),...options}={}) {
  file=resolve(file);
  const handle=read(file),oldOptions={...options,directory:legacyDirectory};
  if(![1,2].includes(handle.schema)||handle.endpoint_key!==sessionPaths(options).key||!samePath(handle.file,file))fail('WORKSPACE_ENDPOINT_MISMATCH','Legacy handle endpoint or path differs.');
  const value=handle.schema===2?read(privatePath(handle,oldOptions)):handle;
  if(value.id!==handle.id||value.endpoint_key!==handle.endpoint_key||!samePath(value.file,file))fail('WORKSPACE_OWNERSHIP_LOST','Legacy private identity differs.');
  if(readReservations(oldOptions).some(row=>row.id===value.id))fail('LEGACY_WORKSPACE_RESERVED','Release this reservation with the old installed CLI before importing. Old metadata is preserved and cannot coordinate with the new registry.');
  assertLegacyCompatibility({...options,legacyDirectory,target:value.target});
  if(value.binding)value.binding={snapshot:value.binding.snapshot,nonce:null,browser:null,source_proof:null};
  secureDirectory(sessionPaths(options).directory);secureDirectory(join(sessionPaths(options).directory,'private-workspaces'));
  const oldArtifacts=value.schema===1?join(dirname(file),'.tv-workspaces',value.id):workspaceArtifactDirectory(value,oldOptions);
  const newArtifacts=workspaceArtifactDirectory(value,options);
  if(existsSync(oldArtifacts)){secureDirectory(newArtifacts);cpSync(oldArtifacts,newArtifacts,{recursive:true,errorOnExist:false});}
  return withAdmissionGate(options,paths=>{
    const rows=readReservations(options),existing=rows.find(row=>row.id===value.id);
    if(existing)return loadWorkspace(file,options);
    if(rows.some(row=>row.target===value.target||row.layout===value.layout||(value.pine&&row.pine===value.pine)))fail('WORKSPACE_CONFLICT','An imported resource is already reserved.');
    savePrivate(value,options);atomic(paths.reservations,[...rows,{...value,operation:null}]);atomic(file,publicHandle(value));
    return loadWorkspace(file,options);
  });
}

export function reserveWorkspace({ file, target, layout, pine = null, created_by_cli = false }, options = {}) {
  if (![file, target, layout].every(value => typeof value === 'string' && value.trim()) || (pine !== null && (typeof pine !== 'string' || !pine.trim()))) {
    fail('WORKSPACE_RESOURCE_REQUIRED', 'file, exact target and saved layout ID are required; Pine document is optional.');
  }
  file = resolve(file);
  assertLegacyCompatibility({...options,target});
  const ownerProof=sessionStatus(options);
  return withLegacyNamespace(options,()=>withAdmissionGate(options, paths => {
    available({...options,ownerProof}, { target });
    secureDirectory(paths.directory);
    const rows = readReservations(options);
    for (const kind of ['target', 'layout', 'pine']) {
      if ({ target, layout, pine }[kind] && rows.some(row => row[kind] === { target, layout, pine }[kind])) fail('WORKSPACE_CONFLICT', `The ${kind} resource is already reserved.`);
    }
    if (rows.some(row => samePath(row.file, file)) || existsSync(file)) fail('WORKSPACE_EXISTS', 'Workspace file already exists.');
    const workspace = { schema: 2, id: randomUUID(), token: randomUUID(), file,
      endpoint_key: paths.key, target, layout, pine, created_by_cli, created_at: new Date().toISOString() };
    // Reserve before creating the file: a crash leaves a fail-closed reservation.
    atomic(paths.reservations, [...rows, workspace]);
    try {
      savePrivate(workspace, options);
      const handle = openSync(file, 'wx', 0o600);
      try { writeFileSync(handle, JSON.stringify(publicHandle(workspace), null, 2)); } finally { closeSync(handle); }
    } catch (error) { atomic(paths.reservations, rows); throw error; }
    return workspace;
  }),{target,layout,pine});
}

export function acquireWorkspace(file, { recover = false, recoveryOperation, ...options } = {}) {
  synchronizeLegacyNamespace(options);
  const workspace = loadWorkspace(file, options), operation = randomUUID();
  assertLegacyCompatibility({...options,target:workspace.target});
  const ownerProof=sessionStatus(options);
  withAdmissionGate(options, paths => {
    available({...options,ownerProof}, workspace);
    const rows = readReservations(options), row = match(rows, workspace);
    if (row.operation) fail('WORKSPACE_BUSY', 'Another CLI invocation owns this workspace operation.');
    if (row.interrupted && !recover) fail('WORKSPACE_RECOVERY_REQUIRED', 'Inspect and recover the interrupted workspace operation.');
    if (recover && (!row.interrupted || row.interrupted.operation_id !== recoveryOperation)) fail('WORKSPACE_OPERATION_MISMATCH', 'Recovery requires the exact interrupted operation ID.');
    migrateWorkspace(workspace, options);
    row.operation = { id: operation, command:options.command||null,pid: process.pid, process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(), started_at: new Date().toISOString() };
    atomic(paths.reservations, rows);
  });
  const artifactDirectory = workspaceArtifactDirectory(workspace, options);
  let status;
  try {
    mkdirSync(artifactDirectory, { recursive: true });
    status = workspaceStatus(file, options);
  } catch (error) {
    try {
      withAdmissionGate(options, paths => {
        const rows = readReservations(options), row = match(rows, workspace);
        if (row.operation?.id === operation) { row.operation = null; atomic(paths.reservations, rows); }
      });
    } catch (cleanup) { error.details = { ...error.details, cleanup_error: cleanup.message }; }
    throw error;
  }
  const journal = join(artifactDirectory, `journal-${operation}.json`), history = join(artifactDirectory, 'history.jsonl');
  const interruptedJournal = status.interrupted?.journal;
  let finished = false;
  let reconciled = false;
  const lease = {
    workspace, operation, endpoint_key: workspace.endpoint_key, artifactDirectory,
    assertOwner() {
      const row = match(readReservations(options), workspace);
      if (row.operation?.id !== operation || row.operation.pid !== process.pid) fail('WORKSPACE_OWNERSHIP_LOST', 'Workspace operation owner changed.');
    },
    pending: () => interruptedJournal && existsSync(interruptedJournal) ? read(interruptedJournal) : existsSync(journal) ? read(journal) : null,
    checkpoint(value) {
      lease.assertOwner();
      atomic(journal, { ...value, workspace_id: workspace.id, operation_id: operation, updated_at: new Date().toISOString() });
    },
    saveBinding(binding) {
      lease.assertOwner(); workspace.binding = binding; savePrivate(workspace, options);
    },
    reassign({ target = workspace.target, pine = workspace.pine, expectedGeneration }) {
      lease.assertOwner();
      if (workspace.binding?.nonce !== expectedGeneration) fail('WORKSPACE_GENERATION_CHANGED', 'Workspace generation changed while reconnecting.');
      withLegacyNamespace(options,()=>withAdmissionGate(options, paths => {
        const rows = readReservations(options), row = match(rows, workspace);
        if (rows.some(other => other.id !== workspace.id && (other.target === target || (pine && other.pine === pine)))) fail('WORKSPACE_CONFLICT', 'Requested target or document belongs to another workspace.');
        row.target = target; row.pine = pine; workspace.target = target; workspace.pine = pine; workspace.binding = null;
        savePrivate(workspace, options); atomic(paths.reservations, rows);
      }),{target,layout:workspace.layout,pine});
    },
    recoveredOperation: status.interrupted?.operation_id || null,
    acknowledgeRecovery(operationId) {
      lease.assertOwner();
      if (!recover || lease.recoveredOperation !== operationId) fail('WORKSPACE_OPERATION_MISMATCH', 'Cannot acknowledge another interrupted operation.');
      reconciled = true;
    },
    finish({ success, result, error, interrupted = !success } = {}) {
      if (finished) return;
      if (recover && success && !reconciled) fail('WORKSPACE_RECOVERY_REQUIRED', 'Recovery has not been verified and acknowledged.');
      lease.assertOwner();
      const entry = { committed: false, workspace_id: workspace.id, operation_id: operation, target: workspace.target,
        layout: workspace.layout, pine: workspace.pine, finished_at: new Date().toISOString(), success: Boolean(success), result, error };
      const resultPath = join(artifactDirectory, `result-${operation}.json`);
      atomic(resultPath, entry);
      withAdmissionGate({ ...options, gateTimeout: 3000 }, paths => {
        lease.assertOwner();
        const rows = readReservations(options), row = match(rows, workspace);
        if (!recover || success) row.interrupted = interrupted ? { operation_id: operation, journal, error: error || result?.error || 'Command interrupted.' } : null;
        row.result_path = resultPath;
        row.operation = null; atomic(paths.reservations, rows); finished = true;
      });
      entry.committed = true; atomic(resultPath, entry);
      // Human-friendly latest result; authoritative status uses operation-specific path.
      atomic(join(artifactDirectory, 'result.json'), entry);
      writeFileSync(history, JSON.stringify(entry) + '\n', { flag: 'a', mode: 0o600 });
    },
  };
  return lease;
}

export function workspaceStatus(file, options = {}) {
  const workspace = loadWorkspace(file, options), row = match(readReservations(options), workspace);
  const quotedFile = `'${workspace.file.replace(/'/g, "''")}'`;
  let aliveOwner = false;
  if (row.operation) {
    aliveOwner = ownerAlive(row.operation);
  }
  const nextCommands = row.operation
    ? aliveOwner ? [] : [`tv workspace interrupt --file ${quotedFile} --operation ${row.operation.id}`]
    : row.interrupted ? [`tv workspace recover --file ${quotedFile} --operation ${row.interrupted.operation_id}${workspace.binding ? '' : ' --rebind'}`]
      : workspace.binding ? [`tv --workspace ${quotedFile} state`, `tv workspace release --file ${quotedFile}`]
        : [`tv workspace abandon --file ${quotedFile} --id ${workspace.id}`];
  return { success: true, workspace_id: workspace.id, target: workspace.target, layout: workspace.layout, pine: workspace.pine,
    generation: workspace.binding?.nonce || null, browser_generation: workspace.binding?.browser || null,
    state: row.interrupted ? 'interrupted' : row.operation ? 'running' : row.connection_state || 'idle',
    bound: Boolean(workspace.binding), operation: row.operation || null, interrupted: row.interrupted || null,
    owner_alive: aliveOwner, next_commands: nextCommands, handle_schema: workspace.schema,
    result_path: row.result_path || null, result_committed: row.result_path && existsSync(row.result_path) ? read(row.result_path).committed === true : false };
}

export function noteWorkspaceState(file, state, options = {}) {
  const workspace = loadWorkspace(file, options);
  return withAdmissionGate(options, paths => {
    const rows=readReservations(options),row=match(rows,workspace);
    row.connection_state=state;atomic(paths.reservations,rows);
  });
}

/** A killed PID releases only its operation, never its persistent resources. */
export function markInterrupted(file, operationId, options = {}) {
  const workspace = loadWorkspace(file, options);
  return withAdmissionGate(options, paths => {
    const rows = readReservations(options), row = match(rows, workspace), op = row.operation;
    if (!op || op.id !== operationId) fail('WORKSPACE_OPERATION_MISMATCH', 'Pass the exact recorded active operation ID.');
    try { process.kill(op.pid, 0); fail('WORKSPACE_BUSY', 'Workspace process is still alive.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    const directory = workspace.schema === 1 ? join(dirname(workspace.file), '.tv-workspaces', workspace.id) : workspaceArtifactDirectory(workspace, options);
    row.interrupted = { operation_id: op.id, journal: join(directory, `journal-${op.id}.json`), error: 'Owner process terminated.' };
    row.operation = null; atomic(paths.reservations, rows);
    return workspaceStatus(file, options);
  });
}

export function releaseWorkspace(lease, options = {}) {
  return withLegacyNamespace(options,()=>withAdmissionGate(options, paths => {
    lease.assertOwner();
    const rows = readReservations(options), row = match(rows, lease.workspace);
    if (row.interrupted) fail('WORKSPACE_RECOVERY_REQUIRED', 'Recover before releasing resources.');
    atomic(paths.reservations, rows.filter(item => item !== row));
    // Preserve artifacts and source for review. A released file cannot be reused.
    return { success: true, released: true, workspace_id: row.id };
  }));
}

/** Explicit offline abandonment, including deleted handles/targets. Never changes Desktop. */
export function abandonWorkspace(file, { workspaceId, operationId } = {}, options = {}) {
  if (!workspaceId || !file) fail('WORKSPACE_ID_REQUIRED', 'Pass the exact workspace ID and original handle path.');
  return withLegacyNamespace(options,()=>withAdmissionGate(options, paths => {
    const rows = readReservations(options), row = rows.find(item => item.id === workspaceId && samePath(item.file, resolve(file)));
    if (!row) fail('WORKSPACE_OWNERSHIP_LOST', 'Exact workspace reservation was not found.');
    const expected = row.operation?.id || row.interrupted?.operation_id;
    if (expected && operationId !== expected) fail('WORKSPACE_OPERATION_MISMATCH', 'Pass the exact active/interrupted operation ID.');
    if (row.operation) {
      try { process.kill(row.operation.pid, 0); fail('WORKSPACE_BUSY', 'Active PID still exists; cannot abandon.'); }
      catch (error) { if (error.code !== 'ESRCH') fail('WORKSPACE_BUSY', 'Active PID exists or cannot be verified; cannot abandon.'); }
    }
    const directory = workspaceArtifactDirectory(row, options);
    mkdirSync(directory, { recursive: true });
    atomic(join(directory, `abandoned-${randomUUID()}.json`), { workspace_id: row.id, operation_id: expected || null,
      success: false, incomplete: true, abandoned_at: new Date().toISOString(), target: row.target, layout: row.layout, pine: row.pine });
    atomic(paths.reservations, rows.filter(item => item !== row));
    return { success: true, released: true, abandoned: true, incomplete: true, workspace_id: row.id, desktop_changed: false };
  }));
}

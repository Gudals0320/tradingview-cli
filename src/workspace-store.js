import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sessionPaths, sessionStatus, readReservations, withAdmissionGate } from './session.js';

export function workspaceError(code, message) { const error = new Error(message); error.code = code; return error; }
const fail = (code, message) => { throw workspaceError(code, message); };
function read(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function atomic(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}
function match(rows, workspace) {
  const row = rows.find(item => item.id === workspace.id);
  if (!row || row.token !== workspace.token || row.file !== workspace.file
    || row.target !== workspace.target || row.layout !== workspace.layout || row.pine !== workspace.pine) {
    fail('WORKSPACE_OWNERSHIP_LOST', 'Workspace resources or owner token changed.');
  }
  return row;
}
function available(options) {
  const state = sessionStatus(options);
  if (state.locked || state.recovery_required) fail('SESSION_BUSY', 'An endpoint lease or recovery journal prevents workspace admission.');
}

export function loadWorkspace(file, options = {}) {
  const value = read(resolve(file));
  if (value.schema !== 1 || value.file !== resolve(file) || value.endpoint_key !== sessionPaths(options).key) {
    fail('WORKSPACE_ENDPOINT_MISMATCH', 'Workspace file, schema or endpoint does not match.');
  }
  match(readReservations(options), value);
  return value;
}

export function reserveWorkspace({ file, target, layout, pine }, options = {}) {
  if (![file, target, layout, pine].every(value => typeof value === 'string' && value.trim())) {
    fail('WORKSPACE_RESOURCE_REQUIRED', 'file, exact target, saved layout ID and saved Pine document ID are required.');
  }
  file = resolve(file);
  return withAdmissionGate(options, paths => {
    available(options);
    const rows = readReservations(options);
    for (const kind of ['target', 'layout', 'pine']) {
      if (rows.some(row => row[kind] === { target, layout, pine }[kind])) fail('WORKSPACE_CONFLICT', `The ${kind} resource is already reserved.`);
    }
    if (rows.some(row => row.file === file) || existsSync(file)) fail('WORKSPACE_EXISTS', 'Workspace file already exists.');
    const workspace = { schema: 1, id: randomUUID(), token: randomUUID(), file,
      endpoint_key: paths.key, target, layout, pine, created_at: new Date().toISOString() };
    // Reserve before creating the file: a crash leaves a fail-closed reservation.
    atomic(paths.reservations, [...rows, workspace]);
    const handle = openSync(file, 'wx', 0o600);
    try { writeFileSync(handle, JSON.stringify(workspace, null, 2)); } finally { closeSync(handle); }
    return workspace;
  });
}

export function acquireWorkspace(file, { recover = false, ...options } = {}) {
  const workspace = loadWorkspace(file, options), operation = randomUUID();
  withAdmissionGate(options, paths => {
    available(options);
    const rows = readReservations(options), row = match(rows, workspace);
    if (row.operation) fail('WORKSPACE_BUSY', 'Another CLI invocation owns this workspace operation.');
    if (row.interrupted && !recover) fail('WORKSPACE_RECOVERY_REQUIRED', 'Inspect and recover the interrupted workspace operation.');
    row.operation = { id: operation, pid: process.pid, started_at: new Date().toISOString() };
    atomic(paths.reservations, rows);
  });
  const journal = `${workspace.file}.journal.json`, history = `${workspace.file}.history.jsonl`;
  let finished = false;
  const lease = {
    workspace, operation, endpoint_key: workspace.endpoint_key,
    assertOwner() {
      const row = match(readReservations(options), workspace);
      if (row.operation?.id !== operation || row.operation.pid !== process.pid) fail('WORKSPACE_OWNERSHIP_LOST', 'Workspace operation owner changed.');
    },
    pending: () => existsSync(journal) ? read(journal) : null,
    checkpoint(value) {
      lease.assertOwner();
      atomic(journal, { ...value, workspace_id: workspace.id, operation_id: operation, updated_at: new Date().toISOString() });
    },
    saveBinding(binding) {
      lease.assertOwner(); workspace.binding = binding; atomic(workspace.file, workspace);
    },
    finish({ success, result, error } = {}) {
      if (finished) return;
      withAdmissionGate(options, paths => {
        lease.assertOwner();
        const rows = readReservations(options), row = match(rows, workspace);
        const entry = { workspace_id: workspace.id, operation_id: operation, target: workspace.target,
          layout: workspace.layout, pine: workspace.pine, finished_at: new Date().toISOString(), success: Boolean(success), result, error };
        // Keep the last result and an append-only per-workspace history.
        atomic(`${workspace.file}.result.json`, entry);
        writeFileSync(history, JSON.stringify(entry) + '\n', { flag: 'a', mode: 0o600 });
        row.interrupted = success ? null : { operation_id: operation, journal, error: error || result?.error || 'Command failed.' };
        row.operation = null; atomic(paths.reservations, rows); finished = true;
      });
    },
  };
  return lease;
}

export function workspaceStatus(file, options = {}) {
  const workspace = loadWorkspace(file, options), row = match(readReservations(options), workspace);
  return { success: true, workspace_id: workspace.id, target: workspace.target, layout: workspace.layout, pine: workspace.pine,
    bound: Boolean(workspace.binding), operation: row.operation || null, interrupted: row.interrupted || null };
}

/** A killed PID releases only its operation, never its persistent resources. */
export function markInterrupted(file, operationId, options = {}) {
  const workspace = loadWorkspace(file, options);
  return withAdmissionGate(options, paths => {
    const rows = readReservations(options), row = match(rows, workspace), op = row.operation;
    if (!op || op.id !== operationId) fail('WORKSPACE_OPERATION_MISMATCH', 'Pass the exact recorded active operation ID.');
    try { process.kill(op.pid, 0); fail('WORKSPACE_BUSY', 'Workspace process is still alive.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    row.interrupted = { operation_id: op.id, journal: `${workspace.file}.journal.json`, error: 'Owner process terminated.' };
    row.operation = null; atomic(paths.reservations, rows);
    return workspaceStatus(file, options);
  });
}

export function releaseWorkspace(lease, options = {}) {
  return withAdmissionGate(options, paths => {
    lease.assertOwner();
    const rows = readReservations(options), row = match(rows, lease.workspace);
    if (row.interrupted) fail('WORKSPACE_RECOVERY_REQUIRED', 'Recover before releasing resources.');
    atomic(paths.reservations, rows.filter(item => item !== row));
    // Preserve artifacts and source for review. A released file cannot be reused.
    return { success: true, released: true, workspace_id: row.id };
  });
}

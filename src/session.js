import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CDP_HOST, CDP_PORT } from './config.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const owned = new Map();
const access = new AsyncLocalStorage();
let admissionDepth = 0;
export function withReadOnlySession(action) { return access.run({ readOnly: true }, action); }
export function isReadOnlySession() { return access.getStore()?.readOnly === true; }
export function withWorkspaceSession(lease, action) { return access.run({ workspace: lease }, action); }
export function currentWorkspaceSession() { return access.getStore()?.workspace || null; }
export function withLegacySession(lease, action) { return access.run({ ...access.getStore(), legacy: lease }, action); }
export function nativeCheckpoint(command, targetId, details = {}) {
  const lease = access.getStore()?.legacy;
  if (!lease) return;
  const previous = lease.pending();
  lease.checkpoint({ ...previous, ...details, phase: 'running', command: command || lease.command,
    target_id: targetId, targets: [...new Set([...(previous?.targets || []), previous?.target_id, targetId].filter(Boolean))],
    native_quiescence_required: true });
}
export function nativeQuiescent() { access.getStore()?.legacy?.clearCheckpoint?.(); }
export function canonicalSessionHost(host) {
  const value = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (['localhost', '::1', '0:0:0:0:0:0:0:1', '0.0.0.0'].includes(value)
    || /^127\./.test(value) || /^::ffff:127\./.test(value)) return '127.0.0.1';
  return value;
}
export function sessionPaths({ host = CDP_HOST, port = CDP_PORT, directory = join(tmpdir(), 'tradingview-cli-sessions') } = {}) {
  const endpoint = `${canonicalSessionHost(host)}:${port}`;
  const key = createHash('sha256').update(endpoint).digest('hex');
  const gateKey = createHash('sha256').update('desktop-admission-metadata').digest('hex');
  return { key, directory, lock: join(directory, `${key}.lock`), journal: join(directory, `${key}.journal.json`), gate: join(directory, `${gateKey}.acquire`), reservations: join(directory, `${key}.workspaces.json`) };
}
function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true; // Do not remove unverifiable ownership.
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function read(path) { return JSON.parse(readFileSync(path, 'utf8')); }

function busyOwner(lock) {
  return failure('SESSION_BUSY', `TradingView CLI command ${lock.command || '<unknown>'} owns this Desktop session (pid ${lock.pid}, run_id ${lock.run_id || '<unknown>'}, started_at ${lock.created_at || '<unknown>'}).`);
}

function recoveryHint(state, paths) {
  if (state.native_quiescence_required) return `Recover the interrupted native command with tv session recover --run-id ${state.recovery_run_id}. The recorded target is used; no Desktop reload is required after quiescence. Journal: ${paths.journal}`;
  if (!state.recovery_run_id) return `Recovery journal is malformed or missing a run ID. Inspect tv session status and explicitly archive its exact hash with tv session discard --journal-hash HASH. Journal: ${paths.journal}`;
  return `Recover the interrupted batch with pine-batch --recover, or explicitly archive its restoration journal with tv session discard --run-id ${state.recovery_run_id}. Journal: ${paths.journal}`;
}

function removeOwnedFile(path) {
  for (let attempt = 0; ; attempt++) {
    try { unlinkSync(path); return; }
    catch (error) {
      if (error.code === 'ENOENT') return;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 10) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

export function reclaimDeadSession(options = {}) {
  if (!admissionDepth) throw failure('ADMISSION_REQUIRED', 'Dead lease reclamation requires the admission gate.');
  const paths = sessionPaths(options);
  if (!existsSync(paths.lock)) return;
  const lock = read(paths.lock);
  if (alive(lock.pid)) throw busyOwner(lock);
  removeOwnedFile(paths.lock); // Never remove its recovery journal.
}

export function readReservations(options = {}) {
  const paths = sessionPaths(options);
  if (!existsSync(paths.reservations)) return [];
  let value;
  try { value = read(paths.reservations); } catch { throw failure('OWNERSHIP_UNREADABLE', 'Workspace reservation registry is unreadable.'); }
  if (!Array.isArray(value)) throw failure('OWNERSHIP_UNREADABLE', 'Workspace reservation registry is malformed.');
  return value;
}
export function assertNoLocalWorkspace(options = {}) {
  if (readReservations(options).length || readReservations({ ...options, host: '127.0.0.1' }).length) {
    throw failure('WORKSPACE_RESERVED', 'Reserved local workspaces prevent legacy access on this port, including hostname aliases.');
  }
}
export function assertNoPortLease(options = {}) {
  const paths = sessionPaths(options), port = Number(options.port ?? CDP_PORT);
  if (!existsSync(paths.directory)) return;
  for (const file of readdirSync(paths.directory).filter(name => name.endsWith('.lock'))) {
    let lock; try { lock = read(join(paths.directory, file)); } catch { throw failure('OWNERSHIP_UNREADABLE', 'A legacy lease cannot be verified before workspace registration.'); }
    if (Number(lock.port) === port || lock.desktop_wide) {
      if (alive(lock.pid) || !admissionDepth) throw busyOwner(lock);
      removeOwnedFile(join(paths.directory, file));
      if (existsSync(join(paths.directory, file.replace(/\.lock$/, '.journal.json')))) {
        throw failure('RECOVERY_REQUIRED', 'Dead lease was reclaimed but its recovery journal must be reconciled first.');
      }
    }
  }
}
export function assertNoWorkspaceAnywhere(options = {}) {
  const paths = sessionPaths(options);
  if (!existsSync(paths.directory)) return;
  for (const file of readdirSync(paths.directory).filter(name => name.endsWith('.workspaces.json'))) {
    let rows;try{rows=read(join(paths.directory,file));}catch{throw failure('OWNERSHIP_UNREADABLE','Workspace registry cannot be verified before a Desktop-wide command.');}
    if (!Array.isArray(rows) || rows.length) throw failure('WORKSPACE_RESERVED', 'Registered workspaces prevent Desktop-wide launch/restart, regardless of configured port.');
  }
}

/** Metadata transaction only. Never hold this gate during Desktop operations. */
export function withAdmissionGate(options, action) {
  if (action.constructor.name === 'AsyncFunction') throw failure('ADMISSION_ASYNC', 'Admission actions must be synchronous metadata transactions.');
  const paths = sessionPaths(options);
  mkdirSync(paths.directory, { recursive: true });
  let gate;
  const started = Date.now();
  for (;;) {
    try { gate = openSync(paths.gate, 'wx', 0o600); break; }
    catch (error) {
      if (!['EEXIST', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      if (Date.now() - started >= (options.gateTimeout || 2000)) throw failure('ADMISSION_BUSY', `Admission metadata did not clear. Inspect ${paths.gate} if its process was killed.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + Math.floor(Math.random() * 10));
    }
  }
  let primaryError;
  try {
    writeFileSync(gate, JSON.stringify({ pid: process.pid, token: randomUUID(), process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(), created_at: new Date().toISOString() }));
    closeSync(gate); gate = null;
    admissionDepth++;
    const result = action(paths);
    if (result?.then) throw failure('ADMISSION_ASYNC', 'Admission actions must not return a Promise.');
    return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    admissionDepth = Math.max(0, admissionDepth - 1);
    try { if (gate !== null) closeSync(gate); removeOwnedFile(paths.gate); }
    catch (error) {
      if (primaryError) primaryError.details = { ...primaryError.details, cleanup_error: error.message };
      else process.emitWarning(`Admission gate cleanup failed; inspect workspace gate-status: ${error.message}`);
    }
  }
}

export function admissionGateStatus(options = {}) {
  const path = sessionPaths(options).gate;
  const repairPath = `${path}.repair`;
  let repair = null;
  if (existsSync(repairPath)) {
    try { repair = read(repairPath); repair.owner_alive = alive(repair.pid); }
    catch { repair = { malformed: true, owner_alive: true }; }
  }
  if (!existsSync(path)) return { success: true, busy: false, repair };
  let value;
  try { value = read(path); } catch { throw failure('OWNERSHIP_UNREADABLE', 'Admission gate is malformed; automatic removal is unsafe.'); }
  return { success: true, busy: true, path, ...value, owner_alive: alive(value.pid), repair };
}

/** Explicit dead-gate repair. PID reuse stays fail-closed while that PID exists. */
export function clearAdmissionGate(token, options = {}) {
  const paths = sessionPaths(options), repair = `${paths.gate}.repair`;
  if (options.repairToken) {
    const state = admissionGateStatus(options).repair;
    if (!state || state.token !== options.repairToken) throw failure('GATE_TOKEN_MISMATCH', 'Pass the exact dead repair token.');
    if (state.owner_alive) throw failure('SESSION_BUSY', 'Repair owner is alive or cannot be verified.');
    removeOwnedFile(repair);
    if (!token) return { success: true, repair_cleared: true };
  }
  let handle;
  try { handle = openSync(repair, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw failure('ADMISSION_BUSY', 'Another gate repair is in progress.'); throw error; }
  writeFileSync(handle, JSON.stringify({ pid: process.pid, token: randomUUID() })); closeSync(handle);
  let primaryError;
  try {
    const gate = admissionGateStatus(options);
    if (!token || !gate.busy || gate.token !== token) throw failure('GATE_TOKEN_MISMATCH', 'Pass the exact dead gate token from workspace gate-status.');
    if (gate.owner_alive) throw failure('SESSION_BUSY', 'Gate owner PID still exists; PID reuse or unverifiable ownership requires manual inspection.');
    removeOwnedFile(paths.gate);
    return { success: true, cleared: true, token };
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { removeOwnedFile(repair); }
    catch (error) {
      if (primaryError) primaryError.details = { ...primaryError.details, cleanup_error: error.message };
      else process.emitWarning(`Repair cleanup failed: ${error.message}`);
    }
  }
}

export function sessionStatus(options = {}) {
  const paths = sessionPaths(options);
  let lock = null;
  if (existsSync(paths.lock)) { try { lock = read(paths.lock); } catch { lock = { malformed: true }; } }
  let pending = null;
  if (existsSync(paths.journal)) { try { pending = read(paths.journal); } catch { /* report existence without exposing draft */ } }
  return { locked: Boolean(lock), owner_pid: lock?.pid || null, run_id: lock?.run_id || null,
    owner_command: lock?.command || null, process_started_at: lock?.process_started_at || null,
    owner_alive: lock ? alive(lock.pid) : false, recovery_required: existsSync(paths.journal), journal_path: paths.journal,
    recovery_run_id: pending?.run_id || pending?.snapshot?.run_id || null,
    native_quiescence_required: pending?.native_quiescence_required === true,
    recovery_journal_hash: existsSync(paths.journal) ? sourceHash(readFileSync(paths.journal)) : null,
    recovery_target: pending?.snapshot ? { target_id: pending.snapshot.target_id, chart_id: pending.snapshot.chart_id } : null,
    acquisition_in_progress: existsSync(paths.gate) };
}

/** All cooperating CLI processes share one lock, including different layouts. */
export function assertSessionAccess(options = {}) {
  const paths = sessionPaths(options);
  const workspace = currentWorkspaceSession();
  if (workspace) {
    if (workspace.endpoint_key !== paths.key) throw failure('WORKSPACE_ENDPOINT_MISMATCH', 'Workspace endpoint changed.');
    workspace.assertOwner(); return;
  }
  if (owned.has(paths.key)) return;
  assertNoLocalWorkspace(options);
  const state = sessionStatus(options);
  if (state.locked && state.owner_alive) throw failure('SESSION_BUSY', 'Another TradingView CLI process owns this Desktop session.');
  if (state.recovery_required && !(options.readOnly || isReadOnlySession())) throw failure('RECOVERY_REQUIRED',
    recoveryHint(state, paths));
}

export function acquireSession(options = {}) {
  const paths = sessionPaths(options);
  return withAdmissionGate(options, () => {
  if (options.desktopWide) assertNoWorkspaceAnywhere(options);
  assertNoLocalWorkspace(options);
  const status = sessionStatus(options);
  if (status.locked) {
    if (status.owner_alive) throw busyOwner(read(paths.lock));
    if (status.recovery_required && !options.recover && !options.readOnly) throw failure('RECOVERY_REQUIRED', recoveryHint(status, paths));
    unlinkSync(paths.lock);
  } else if (status.recovery_required && !options.recover && !options.readOnly) {
    throw failure('RECOVERY_REQUIRED', recoveryHint(status, paths));
  }
  const run_id = randomUUID();
  let handle;
  try { handle = openSync(paths.lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw failure('SESSION_BUSY', 'Another batch acquired this session.'); throw error; }
  writeFileSync(handle, JSON.stringify({ pid: process.pid, run_id, command: options.command || null,
    process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    port: Number(options.port ?? CDP_PORT), desktop_wide: Boolean(options.desktopWide), created_at: new Date().toISOString() }));
  closeSync(handle);
  owned.set(paths.key, run_id);
  let released = false;
  return {
    run_id, paths, command: options.command || null,
    clearCheckpoint: () => {
      if (existsSync(paths.journal)) {
        const value = read(paths.journal);
        if (value.run_id === run_id && value.native_quiescence_required) removeOwnedFile(paths.journal);
      }
    },
    pending: () => existsSync(paths.journal) ? read(paths.journal) : null,
    checkpoint: (value) => {
      const temporary = `${paths.journal}.${run_id}.tmp`;
      writeFileSync(temporary, JSON.stringify({ ...value, run_id, port: Number(options.port ?? CDP_PORT), updated_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
      renameSync(temporary, paths.journal);
    },
    release: ({ restored = false } = {}) => {
      if (released) return;
      const current = read(paths.lock);
      if (current.run_id !== run_id) throw failure('SESSION_OWNERSHIP_LOST', 'Session ownership changed; refusing to remove another owner lock.');
      if (restored && existsSync(paths.journal)) unlinkSync(paths.journal);
      unlinkSync(paths.lock); owned.delete(paths.key); released = true;
    },
  };
  });
}

/** Explicitly abandon restoration; archive the draft for manual recovery. */
export function discardSession({ runId, journalHash, ...options } = {}) {
  if (!runId && !journalHash) throw failure('RUN_ID_REQUIRED', 'Pass the exact recovery_run_id or, for a malformed journal, recovery_journal_hash.');
  const lease = acquireSession({ ...options, recover: true });
  try {
    let pending;
    try { pending = lease.pending(); }
    catch (error) { if (!journalHash) throw error; }
    if (journalHash) {
      const text = readFileSync(lease.paths.journal);
      if (sourceHash(text) !== journalHash) throw failure('JOURNAL_HASH_MISMATCH', 'Journal changed; nothing archived.');
      if (pending?.run_id || pending?.snapshot?.run_id) throw failure('RUN_ID_REQUIRED', 'A valid journal must use its exact run ID.');
      const backup = `${lease.paths.journal}.${randomUUID()}.discarded`;
      renameSync(lease.paths.journal, backup);
      return { success: true, discarded: true, restored: false, incomplete: true, backup_path: backup,
        warning: 'Malformed journal archived unchanged. Inspect Desktop manually before retrying.' };
    }
    if (!pending) throw failure('RECOVERY_NOT_FOUND', 'There is no recovery journal to discard.');
    if (pending.native_quiescence_required) throw failure('RECOVERY_REQUIRED', 'Use session recover to verify native quiescence before clearing this fence.');
    if (runId !== (pending.run_id || pending.snapshot?.run_id)) throw failure('RUN_ID_MISMATCH', 'The run ID does not match the saved recovery journal; nothing was discarded.');
    const backup = `${lease.paths.journal}.${randomUUID()}.discarded`;
    renameSync(lease.paths.journal, backup);
    return { success: true, discarded: true, restored: false, run_id: runId, backup_path: backup,
      warning: 'Desktop changes were left in place. The saved draft remains in the archived journal.' };
  } finally { lease.release(); }
}

export function sourceHash(source) { return createHash('sha256').update(source).digest('hex'); }

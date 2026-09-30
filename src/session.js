import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CDP_HOST, CDP_PORT } from './config.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const owned = new Map();
const access = new AsyncLocalStorage();
export function withReadOnlySession(action) { return access.run({ readOnly: true }, action); }
export function isReadOnlySession() { return access.getStore()?.readOnly === true; }
export function sessionPaths({ host = CDP_HOST, port = CDP_PORT, directory = join(tmpdir(), 'tradingview-cli-sessions') } = {}) {
  const endpoint = `${host === 'localhost' ? '127.0.0.1' : host}:${port}`;
  const key = createHash('sha256').update(endpoint).digest('hex');
  return { key, directory, lock: join(directory, `${key}.lock`), journal: join(directory, `${key}.journal.json`), gate: join(directory, `${key}.acquire`) };
}
function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true; // Do not remove unverifiable ownership.
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function read(path) { return JSON.parse(readFileSync(path, 'utf8')); }

export function sessionStatus(options = {}) {
  const paths = sessionPaths(options);
  let lock = null;
  if (existsSync(paths.lock)) { try { lock = read(paths.lock); } catch { lock = { malformed: true }; } }
  let pending = null;
  if (existsSync(paths.journal)) { try { pending = read(paths.journal); } catch { /* report existence without exposing draft */ } }
  return { locked: Boolean(lock), owner_pid: lock?.pid || null, run_id: lock?.run_id || null,
    owner_alive: lock ? alive(lock.pid) : false, recovery_required: existsSync(paths.journal), journal_path: paths.journal,
    recovery_run_id: pending?.run_id || pending?.snapshot?.run_id || null,
    recovery_target: pending?.snapshot ? { target_id: pending.snapshot.target_id, chart_id: pending.snapshot.chart_id } : null,
    acquisition_in_progress: existsSync(paths.gate) };
}

/** All cooperating CLI processes share one lock, including different layouts. */
export function assertSessionAccess(options = {}) {
  const paths = sessionPaths(options);
  if (owned.has(paths.key)) return;
  const state = sessionStatus(options);
  if (state.locked && state.owner_alive) throw failure('SESSION_BUSY', 'Another TradingView CLI process owns this Desktop session.');
  if (state.recovery_required && !(options.readOnly || isReadOnlySession())) throw failure('RECOVERY_REQUIRED',
    `An interrupted batch needs recovery. Inspect with tv session status, tv tab list or tv state. Recover with pine-batch --recover, or explicitly abandon restoration with tv session discard --run-id ${state.recovery_run_id || '<recorded-run-id>'}. Journal: ${paths.journal}`);
}

export function acquireSession(options = {}) {
  const paths = sessionPaths(options);
  mkdirSync(paths.directory, { recursive: true });
  let gate;
  try { gate = openSync(paths.gate, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw failure('SESSION_BUSY', `Session acquisition/recovery is already in progress. If its process was killed, inspect ${paths.gate} before removing it.`); throw error; }
  writeFileSync(gate, JSON.stringify({ pid: process.pid })); closeSync(gate);
  try {
  const status = sessionStatus(options);
  if (status.locked) {
    if (status.owner_alive) throw failure('SESSION_BUSY', 'Another batch owns this Desktop session.');
    if (status.recovery_required && !options.recover) throw failure('RECOVERY_REQUIRED', `Recover the interrupted batch before running another: ${paths.journal}`);
    unlinkSync(paths.lock);
  } else if (status.recovery_required && !options.recover) {
    throw failure('RECOVERY_REQUIRED', `Recover the interrupted batch before running another: ${paths.journal}`);
  }
  const run_id = randomUUID();
  let handle;
  try { handle = openSync(paths.lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw failure('SESSION_BUSY', 'Another batch acquired this session.'); throw error; }
  writeFileSync(handle, JSON.stringify({ pid: process.pid, run_id, created_at: new Date().toISOString() }));
  closeSync(handle);
  owned.set(paths.key, run_id);
  let released = false;
  return {
    run_id, paths,
    pending: () => existsSync(paths.journal) ? read(paths.journal) : null,
    checkpoint: (value) => {
      const temporary = `${paths.journal}.${run_id}.tmp`;
      writeFileSync(temporary, JSON.stringify({ ...value, run_id, updated_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
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
  } finally { unlinkSync(paths.gate); }
}

/** Explicitly abandon restoration; archive the draft for manual recovery. */
export function discardSession({ runId, ...options } = {}) {
  if (!runId) throw failure('RUN_ID_REQUIRED', 'Pass the exact recovery_run_id from tv session status with --run-id.');
  const lease = acquireSession({ ...options, recover: true });
  try {
    const pending = lease.pending();
    if (!pending) throw failure('RECOVERY_NOT_FOUND', 'There is no recovery journal to discard.');
    if (runId !== (pending.run_id || pending.snapshot?.run_id)) throw failure('RUN_ID_MISMATCH', 'The run ID does not match the saved recovery journal; nothing was discarded.');
    const backup = `${lease.paths.journal}.${randomUUID()}.discarded`;
    renameSync(lease.paths.journal, backup);
    return { success: true, discarded: true, restored: false, run_id: runId, backup_path: backup,
      warning: 'Desktop changes were left in place. The saved draft remains in the archived journal.' };
  } finally { lease.release(); }
}

export function sourceHash(source) { return createHash('sha256').update(source).digest('hex'); }

import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CDP_HOST, CDP_PORT } from './config.js';

const owned = new Map();
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
  return { locked: Boolean(lock), owner_pid: lock?.pid || null, run_id: lock?.run_id || null,
    owner_alive: lock ? alive(lock.pid) : false, recovery_required: existsSync(paths.journal), journal_path: paths.journal,
    acquisition_in_progress: existsSync(paths.gate) };
}

/** All cooperating CLI processes share one lock, including different layouts. */
export function assertSessionAccess(options = {}) {
  const paths = sessionPaths(options);
  if (owned.has(paths.key)) return;
  const state = sessionStatus(options);
  if (state.locked && state.owner_alive) throw failure('SESSION_BUSY', 'Another TradingView CLI process owns this Desktop session.');
  if (state.recovery_required) throw failure('RECOVERY_REQUIRED', `An interrupted batch needs explicit recovery: ${paths.journal}`);
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

export function sourceHash(source) { return createHash('sha256').update(source).digest('hex'); }

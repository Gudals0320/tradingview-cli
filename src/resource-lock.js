import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sessionPaths, withAdmissionGate } from './session.js';

const processStarted = new Date(Date.now() - process.uptime() * 1000).toISOString();
function error(code, message, details) { return Object.assign(new Error(message), { code, details }); }
export function ownerAlive(owner) {
  if (!Number.isInteger(owner?.pid) || owner.pid <= 0) return true;
  try { process.kill(owner.pid, 0); } catch (cause) { return cause.code !== 'ESRCH'; }
  if (!owner.process_started_at) return true;
  if (owner.pid === process.pid) return Math.abs(Date.parse(owner.process_started_at) - Date.parse(processStarted)) < 2000;
  try {
    let started;
    if (process.platform === 'win32') {
      started = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${owner.pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
    } else {
      started = execFileSync('ps', ['-p', String(owner.pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 3000 }).trim();
    }
    return Math.abs(Date.parse(started) - Date.parse(owner.process_started_at)) < 2000;
  } catch { return true; } // Unverifiable identity remains protected.
}
function read(path) { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { schema: 1, holders: [], queue: [] }; }
function save(path, value) { const temporary = `${path}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }); renameSync(temporary, path); }
const overlaps = (a, b) => a.some(resource => b.includes(resource));
export function resourceLockStatus(options = {}) {
  const paths = sessionPaths(options); return read(join(paths.directory, `${paths.key}.resources.json`));
}

/** Acquire the whole resource set atomically. No resource or gate is held while waiting. */
export async function acquireResources(resources, { timeout = 30000, signal, command, workspace_id, ...options } = {}) {
  timeout = Number(timeout);
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 300000) throw error('LOCK_TIMEOUT_INVALID', 'Lock timeout must be 0..300000 milliseconds.');
  resources = [...new Set(resources)].sort();
  const token = randomUUID(), started = Date.now(), paths = sessionPaths(options), path = join(paths.directory, `${paths.key}.resources.json`);
  const request = { token, resources, command, workspace_id, pid: process.pid, process_started_at: processStarted, started_at: new Date().toISOString() };
  let queued = false, acquired = false, cancelled = false, blockers = [];
  const cancel = () => { cancelled = true; };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try {
    for (;;) {
      if (cancelled || signal?.aborted) throw error('LOCK_CANCELLED', 'Resource wait cancelled.', { resources, owners: blockers });
      withAdmissionGate(options, () => {
        const value = read(path);
        // Never re-execute an unknown native action merely because its holder died.
        value.queue = value.queue.filter(row => ownerAlive(row));
        if (!queued) {
          if (value.queue.length >= 64) throw error('LOCK_QUEUE_FULL', 'Resource queue is limited to 64 requests.');
          value.queue.push(request); queued = true;
        }
        const index = value.queue.findIndex(row => row.token === token);
        blockers = [...value.holders.filter(row => overlaps(resources, row.resources)), ...value.queue.slice(0, index).filter(row => overlaps(resources, row.resources))];
        if (!blockers.length) {
          value.queue = value.queue.filter(row => row.token !== token); value.holders.push(request); acquired = true;
        }
        save(path, value);
      });
      if (acquired) break;
      if (Date.now() - started >= timeout) throw error('LOCK_TIMEOUT', 'Resource wait exceeded its limit.', { waited_ms: Date.now() - started, resources, owners: blockers });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (!acquired && queued) withAdmissionGate(options, () => { const value = read(path); value.queue = value.queue.filter(row => row.token !== token); save(path, value); });
  }
  let released = false;
  return { ...request, waited_ms: Date.now() - started, release() {
    if (released) return;
    withAdmissionGate(options, () => { const value = read(path); value.holders = value.holders.filter(row => row.token !== token); save(path, value); }); released = true;
  } };
}

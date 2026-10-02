import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { sessionPaths, withAdmissionGate } from './session.js';

import { ownerAlive,ownersAlive } from './process-identity.js';
export { ownerAlive } from './process-identity.js';
function error(code, message, details) { return Object.assign(new Error(message), { code, details }); }
function read(path) {
  const value=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{schema:1,holders:[],queue:[]};
  if(value.schema!==1||!Array.isArray(value.holders)||!Array.isArray(value.queue)||[...value.holders,...value.queue].some(row=>!row.token||!Array.isArray(row.resources)))throw error('OWNERSHIP_UNREADABLE','Resource ownership metadata is malformed.');
  return value;
}
function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  const started=Date.now();for(;;){try{renameSync(temporary,path);return;}catch(cause){if(!['EPERM','EBUSY','EACCES'].includes(cause.code)||Date.now()-started>1000)throw cause;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
}
const overlaps = (a, b) => a.some(resource => b.includes(resource));
function nativeFence(holder, paths) {
  if (!holder.workspace_id) return existsSync(paths.journal);
  if (!existsSync(paths.reservations)) return false;
  const row = JSON.parse(readFileSync(paths.reservations, 'utf8')).find(row => row.id === holder.workspace_id);
  return Boolean(row?.interrupted || row?.operation);
}
export function resourceLockStatus(options = {}) {
  const paths = sessionPaths(options); return read(join(paths.directory, `${paths.key}.resources.json`));
}

/** Acquire the whole resource set atomically. No resource or gate is held while waiting. */
export async function acquireResources(resources, { timeout = 30000, signal, command, workspace_id, ...options } = {}) {
  timeout = Number(timeout);
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 300000) throw error('LOCK_TIMEOUT_INVALID', 'Lock timeout must be 0..300000 milliseconds.');
  resources = [...new Set(resources)].sort();
  const token = randomUUID(), started = Date.now(), paths = sessionPaths(options), path = join(paths.directory, `${paths.key}.resources.json`);
  const request = { token, resources, command, workspace_id, pid: process.pid, process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(), started_at: new Date().toISOString() };
  let queued = false, acquired = false, cancelled = false, blockers = [], waitedFor = [];
  const cancel = () => { cancelled = true; };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try {
    let attempt = 0;
    for (;;) {
      if (cancelled || signal?.aborted) throw error('LOCK_CANCELLED', 'Resource wait cancelled.', { resources, owners: blockers });
      // OS identity checks may spawn a platform helper. Never do that under the gate.
      const observed = read(path),owners=[...observed.queue,...observed.holders],liveness=ownersAlive(owners);
      const dead = new Map(owners.filter(row => liveness.get(row.token)===false).map(row => [row.token,row]));
      const sameDead = row => {const prior=dead.get(row.token);return prior&&prior.pid===row.pid&&prior.process_started_at===row.process_started_at;};
      const fenced = observed.holders.filter(row => sameDead(row) && nativeFence(row, paths));
      try { withAdmissionGate(options, () => {
        const value = read(path);
        // Never re-execute an unknown native action merely because its holder died.
        value.queue = value.queue.filter(row => !sameDead(row));
        value.holders = value.holders.filter(row => !sameDead(row) || fenced.some(item => item.token === row.token));
        const abandoned = fenced.filter(row => overlaps(resources, row.resources));
        if (abandoned.length) throw error('LOCK_HOLDER_DEAD', 'A dead resource holder has an incomplete native operation. Recover its workspace before removing the exact resource token.', { owners: abandoned });
        if (!value.queue.some(row=>row.token===token)) {
          if (value.queue.length >= 64) throw error('LOCK_QUEUE_FULL', 'Resource queue is limited to 64 requests.');
          value.queue.push(request); queued = true;
        }
        const index = value.queue.findIndex(row => row.token === token);
        blockers = [...value.holders.filter(row => overlaps(resources, row.resources)), ...value.queue.slice(0, index).filter(row => overlaps(resources, row.resources))];
        if(blockers.length)waitedFor=blockers.map(({command,workspace_id,pid,process_started_at,started_at,token})=>({command,workspace_id,pid,process_started_at,started_at,token}));
        if (!blockers.length) {
          value.queue = value.queue.filter(row => row.token !== token); value.holders.push(request); acquired = true;
        }
        save(path, value);
      }); } catch (cause) { if (cause.code !== 'ADMISSION_BUSY') throw cause; }
      if (acquired) break;
      if (Date.now() - started >= timeout) throw error('LOCK_TIMEOUT', 'Resource wait exceeded its limit.', { waited_ms: Date.now() - started, resources, owners: blockers });
      const delay = Math.min(500, 25 * 2 ** Math.min(attempt++, 4)) + Math.floor(Math.random() * 40);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (!acquired && queued) withAdmissionGate(options, () => { const value = read(path); value.queue = value.queue.filter(row => row.token !== token); save(path, value); });
  }
  let released = false;
  return { ...request, waited_ms: Date.now() - started, waited_for:waitedFor, release() {
    if (released) return;
    const started = Date.now();
    for (;;) {
      try { withAdmissionGate({ ...options, gateTimeout: 3000 }, () => { const value = read(path);const row=value.holders.find(row=>row.token===token);if(row&&(row.pid!==request.pid||row.process_started_at!==request.process_started_at))throw error('LOCK_OWNERSHIP_LOST','Resource holder identity changed.',{token}); value.holders = value.holders.filter(row => row.token !== token); save(path, value); }); released = true; return; }
      catch (cause) { if (cause.code !== 'ADMISSION_BUSY' || Date.now() - started > 30000) throw error('LOCK_RELEASE_FAILED','Resource ownership release failed; inspect workspace locks and this exact token.',{token,resources,cause:cause.message}); }
    }
  } };
}

export function clearDeadResource(token, options = {}) {
  const paths=sessionPaths(options),path=join(paths.directory,`${paths.key}.resources.json`),owner=read(path).holders.find(row=>row.token===token);
  if (!owner || ownerAlive(owner)) throw error('LOCK_TOKEN_MISMATCH','Exact dead holder token required.');
  if (nativeFence(owner,paths)) throw error('LOCK_HOLDER_DEAD','Reconcile the recorded native operation before clearing its resource holder.',{owners:[owner]});
  return withAdmissionGate(options,()=>{const value=read(path),current=value.holders.find(row=>row.token===token);if(!current||current.pid!==owner.pid||current.process_started_at!==owner.process_started_at)throw error('LOCK_TOKEN_MISMATCH','Dead holder identity changed during verification.');value.holders=value.holders.filter(row=>row.token!==token);save(path,value);return {success:true,cleared:true,token};});
}

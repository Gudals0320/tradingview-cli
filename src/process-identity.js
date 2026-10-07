import { execFileSync } from 'node:child_process';
const processStarted = new Date(Date.now() - process.uptime() * 1000).toISOString();
const identityCache = new Map();
/** Public diagnostic state; unlike ownership gates, unknown is not called alive. */
export function ownerProcessState(owner, _deps = {}) {
  if (!Number.isInteger(owner?.pid) || owner.pid <= 0) return 'unknown';
  const kill = _deps.kill || process.kill;
  try { kill(owner.pid, 0); } catch (cause) { return cause.code === 'ESRCH' ? 'dead' : 'unknown'; }
  if (!Number.isFinite(Date.parse(owner.process_started_at))) return 'unknown';
  if (owner.pid === process.pid) return Math.abs(Date.parse(owner.process_started_at)-Date.parse(processStarted))<2000 ? 'live' : 'dead';
  try {
    const started = _deps.started ? _deps.started(owner.pid) : process.platform === 'win32'
      ? execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${owner.pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],{encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim()
      : execFileSync('ps',['-p',String(owner.pid),'-o','lstart='],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']}).trim();
    if (!Number.isFinite(Date.parse(started))) return 'unknown';
    return Math.abs(Date.parse(started)-Date.parse(owner.process_started_at))<2000 ? 'live' : 'dead';
  } catch { return 'unknown'; }
}
export function ownerAlive(owner) {
  if (!Number.isInteger(owner?.pid) || owner.pid <= 0) return true;
  try { process.kill(owner.pid, 0); } catch (cause) { return cause.code !== 'ESRCH'; }
  if (!owner.process_started_at) return true;
  if (!Number.isFinite(Date.parse(owner.process_started_at))) return true;
  if (owner.pid === process.pid) return Math.abs(Date.parse(owner.process_started_at) - Date.parse(processStarted)) < 2000;
  try {
    const key = `${owner.pid}:${owner.process_started_at}`, cached = identityCache.get(key);
    if (cached && Date.now() - cached.at < 1000) return cached.alive;
    let started;
    if (process.platform === 'win32') {
      started = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${owner.pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: 'utf8', timeout: 3000, windowsHide: true,stdio:['ignore','pipe','pipe'] }).trim();
    } else {
      started = execFileSync('ps', ['-p', String(owner.pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 3000,stdio:['ignore','pipe','pipe'] }).trim();
    }
    const alive = !Number.isFinite(Date.parse(started)) || Math.abs(Date.parse(started) - Date.parse(owner.process_started_at)) < 2000;
    identityCache.set(key, { at: Date.now(), alive }); return alive;
  } catch { try{process.kill(owner.pid,0);return true;}catch(cause){return cause.code!=='ESRCH';} } // Unverifiable identity remains protected.
}

/** One platform query per batch, outside admission gates; avoid N helper launches. */
export function ownersAlive(owners) {
  if(process.platform!=='win32')return new Map(owners.map(owner=>[owner.token,ownerAlive(owner)]));
  const result=new Map(),pending=[];
  for(const owner of owners) {
    const key=`${owner.pid}:${owner.process_started_at}`,cached=identityCache.get(key);
    if(owner.pid===process.pid||!Number.isInteger(owner.pid)||!Number.isFinite(Date.parse(owner.process_started_at)))result.set(owner.token,ownerAlive(owner));
    else if(cached&&Date.now()-cached.at<1000)result.set(owner.token,cached.alive);
    else {try{process.kill(owner.pid,0);pending.push(owner);}catch(cause){result.set(owner.token,cause.code!=='ESRCH');}}
  }
  if(!pending.length)return result;
  const ids=[...new Set(pending.map(owner=>owner.pid))];
  let states=[];
  try {
    const code=`@(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { $started=$null; try { $started=$_.StartTime.ToUniversalTime().ToString('o') } catch {}; @{pid=$_.Id;started=$started} }) | ConvertTo-Json -Compress`;
    const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
    if(output){const value=JSON.parse(output);states=Array.isArray(value)?value:[value];}
  }catch{/* Absence from an unreadable platform query is never death proof. */}
  for(const owner of pending) {
    const state=states.find(state=>state.pid===owner.pid);let alive=true;
    if(state&&Number.isFinite(Date.parse(state.started)))alive=Math.abs(Date.parse(state.started)-Date.parse(owner.process_started_at))<2000;
    else try{process.kill(owner.pid,0);}catch(cause){alive=cause.code!=='ESRCH';}
    identityCache.set(`${owner.pid}:${owner.process_started_at}`,{at:Date.now(),alive});result.set(owner.token,alive);
  }
  return result;
}


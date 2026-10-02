import {existsSync,writeFileSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sessionPaths,sessionStatus,readReservations,withAdmissionGate,reclaimDeadSession} from './session.js';
import {secureDirectory} from './private-store.js';

function legacyOptions(options) {
  if(options.directory&&!options.legacyDirectory)return null;
  const directory=options.legacyDirectory||join(tmpdir(),'tradingview-cli-sessions');
  return resolve(directory)===resolve(sessionPaths(options).directory)?null:{...options,directory};
}
function write(path,rows) {
  const temporary=`${path}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(rows),{mode:0o600});
  const started=Date.now();for(;;){try{renameSync(temporary,path);return;}catch(cause){if(!['EPERM','EBUSY','EACCES'].includes(cause.code)||Date.now()-started>1000)throw cause;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
}
/** The old gate is always outermost. Old CLI admission sees reservation-only
 * mirrors, never private source/token data. Original old rows are retained. */
export function withLegacyNamespace(options,action,proposed) {
  const legacy=legacyOptions(options);if(!legacy)return action();
  const root=resolve(sessionPaths(options).directory),proof=sessionStatus(legacy);
  secureDirectory(legacy.directory);
  return withAdmissionGate(legacy,oldPaths=>{
    reclaimDeadSession({...legacy,ownerProof:proof});
    const status=sessionStatus({...legacy,fastIdentity:true});
    if(status.locked&&status.owner_scope!=='app')throw Object.assign(new Error('An old installed CLI owns this endpoint. Wait and update that terminal.'),{code:'LEGACY_CLI_ACTIVE'});
    const oldRows=readReservations(legacy),foreign=oldRows.filter(row=>row.bridge_root!==root);
    if(proposed)for(const kind of ['target','layout','pine'])if(proposed[kind]&&foreign.some(row=>row[kind]===proposed[kind]))throw Object.assign(new Error(`Legacy or another state store already reserves this ${kind}.`),{code:'WORKSPACE_CONFLICT'});
    const result=action();
    const rows=readReservations(options);
    const mirrors=rows.map(row=>({schema:2,id:row.id,file:row.file,endpoint_key:row.endpoint_key,target:row.target,layout:row.layout,pine:row.pine,
      token:oldRows.find(old=>old.id===row.id&&old.bridge_root===root)?.token||randomUUID(),bridge_root:root,updated_at:new Date().toISOString()}));
    try{write(oldPaths.reservations,[...foreign,...mirrors]);}
    catch(cause){throw Object.assign(new Error('Persistent ownership committed but legacy reservation synchronization failed. Inspect the exact workspace before retrying.'),{code:'LEGACY_BRIDGE_WRITE_FAILED',recovery_required:true,details:{cause:cause.message}});}
    return result;
  });
}

export function synchronizeLegacyNamespace(options={}) {
  const legacy=legacyOptions(options);
  if(!legacy)return;
  const paths=sessionPaths(options);
  // A vanished persistent registry is not proof that existing mirrors are free.
  if(!existsSync(paths.reservations)&&readReservations(legacy).some(row=>row.bridge_root===resolve(paths.directory)))throw Object.assign(new Error('Persistent registry vanished; legacy reservations are retained.'),{code:'OWNERSHIP_UNREADABLE'});
  return withLegacyNamespace(options,()=>{});
}

export function legacyStateDirectory() {return join(tmpdir(),'tradingview-cli-sessions');}
export function legacyMetadata(options={}) {
  const directory=legacyStateDirectory();
  if(resolve(directory)===resolve(sessionPaths(options).directory))return null;
  return {...sessionStatus({...options,directory}),directory};
}

import { workspaceStatus, loadWorkspace, observationOperationMatches } from './workspace-store.js';
import { resourceLockStatus } from './resource-lock.js';
import { workspaceInventory } from './workspace.js';
import { ownerProcessState } from './process-identity.js';

/** HTTP-only observation: never calls checkLayout (which records connection state). */
export async function workspacePreflight(file, {name, _deps = {}, ...options} = {}) {
  const status = (_deps.status || workspaceStatus)(file,{...options,name});
  const workspace = (_deps.load || loadWorkspace)(file,options);
  let connection = {state:'unknown',generation_verified:false}, locks = null;
  try {
    const inventory = await (_deps.inventory || workspaceInventory)();
    const target = inventory.targets.find(row => row.target === status.target);
    connection = {state:!target ? 'target_lost' : target.layout !== status.layout ? 'identity_mismatch' : 'connected',
      generation_verified:false, duplicate_layout:inventory.targets.some(row=>row.target!==status.target && row.layout===status.layout)};
  } catch { /* Transport failure is not proof of target/process death. */ }
  try { locks = (_deps.locks || resourceLockStatus)(options); } catch { /* Unknown remains unknown. */ }
  const owner_state = status.operation ? (_deps.ownerState || ownerProcessState)(status.operation) : 'none';
  const after = (_deps.status || workspaceStatus)(file,{...options,name});
  if (status.generation !== after.generation || !observationOperationMatches(after,status) || status.state !== after.state) throw Object.assign(new Error('Workspace changed during preflight; repeat the read.'),{code:'WORKSPACE_OBSERVATION_CHANGED'});
  const lockRows = rows => rows?.filter(row=>row.workspace_id===status.workspace_id).map(row=>({command:row.command,resources:row.resources,pid:row.pid,started_at:row.started_at})) ?? null;
  const next_action = status.interrupted ? 'Inspect native outcome and explicitly recover the exact interrupted operation; remaining work needs resumption.'
    : status.operation && owner_state === 'dead' ? 'Interrupt the exact dead operation, reconcile native work, then explicitly recover; do not replay.'
      : status.operation ? 'Observe/wait; an unknown process identity stays protected.'
        : connection.state === 'connected' ? 'Inspect owned chart state; HTTP preflight does not verify page generation or adopt results.'
          : 'Restore connectivity or inspect the exact saved target; preserve records and do not replay.';
  return {success:true,read_only:true,...status,connection,owner_state,
    affected_context:workspace.binding?.snapshot?.context ?? null,
    resources:{holders:lockRows(locks?.holders),queue:lockRows(locks?.queue)},next_action};
}

export function recoverySummary({before, after, context, adopted_changes}) {
  return {generation_before:before ?? null,generation_after:after ?? null,adopted_context:context ?? null,
    adopted_changes,recovered:true,incomplete:true,next_action:'Recovery reconciled ownership/context; remaining original work needs resumption.'};
}

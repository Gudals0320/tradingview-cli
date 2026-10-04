import { register } from '../router.js';
import { initWorkspace, recoverWorkspace, closeWorkspace, workspaceInventory, rebindWorkspace, createWorkspace, verifyWorkspaceSelection, reconnectWorkspace,resetWorkspace } from '../../workspace.js';
import { listWorkspaceNames, registerWorkspaceName, resolveWorkspace } from '../../workspace-registry.js';
import { workspaceStatus, markInterrupted, abandonWorkspace, assertObservationAdmission, observationOperationMatches, workspaceWaitTimeout } from '../../workspace-store.js';
import { compilationState, STRATEGY_PAGE_CODE } from '../../strategy-state.js';
import { evaluate } from '../../connection.js';
import { admissionGateStatus, clearAdmissionGate,currentWorkspaceSession } from '../../session.js';
import { resourceLockStatus, clearDeadResource } from '../../resource-lock.js';

const file = { type: 'string', description: 'Persistent workspace file' };
const operation = { type: 'string', description: 'Exact interrupted operation ID' };
register('workspace', {
  description: 'Independent target/layout/Pine ownership',
  subcommands: new Map([
    ['reset',{description:'Explicitly release a quiescent/lost workspace and its name; preserve artifacts, never recreate or reset while disconnected',options:{id:{type:'string',description:'Exact workspace ID from list/show'},operation:{type:'string',description:'Exact dead/interrupted operation ID for a proven lost target'},'reservation-id':{type:'string',description:'Exact dead preparation reservation ID when no workspace exists'}},handler:(opts,args)=>resetWorkspace(args[0],{...opts,reservationId:opts['reservation-id']})}],
    ['locks', {description:'Inspect resource holders and bounded wait tickets without Desktop access',handler:()=>({success:true,...resourceLockStatus()})}],
    ['lock-clear', {description:'Clear an exact dead resource token only after its native journal is reconciled',options:{token:{type:'string',description:'Exact dead holder token from workspace locks'}},handler:opts=>clearDeadResource(opts.token)}],
    ['reconnect', { description: 'Explicitly bind the saved layout on an inspectable target; invalidate old results', options: {
      target: { type: 'string', description: 'Exact replacement CDP target already showing the dedicated layout' }, generation: { type: 'string', description: 'Exact recorded page generation from workspace show' },
    }, handler: (opts, args) => reconnectWorkspace(args[0], opts) }],
    ['attach', { description: 'Attach a dedicated Pine document already mounted in this chart-only workspace', options: {
      pine: { type: 'string', description: 'Exact dedicated saved document ID' }, generation: { type: 'string', description: 'Exact recorded page generation' },
    }, handler: (opts, args) => reconnectWorkspace(args[0], opts) }],
    ['detach', { description: 'Convert to chart-only without changing or closing the editor document', options: {
      generation: { type: 'string', description: 'Exact recorded page generation' },
    }, handler: (opts, args) => reconnectWorkspace(args[0], { ...opts, detach: true }) }],
    ['list', { description: 'List persistent workspace names (selection is terminal-local)', handler: () => listWorkspaceNames() }],
    ['import', { description: 'Import a released legacy schema 1/2 handle; preserve its old private artifacts', options: { file,'legacy-state':{type:'string',description:'Optional exact old private state directory (default old temporary store)'} }, handler: (opts, args) => registerWorkspaceName(args[0], opts.file,{...(opts['legacy-state']?{legacyDirectory:opts['legacy-state']}:{})}) }],
    ['create', { description: 'Create a named workspace for one open dedicated saved layout; Pine is optional', options: {
      layout: { type: 'string', description: 'Exact saved layout ID (first use layout create/open)' },
      target: { type: 'string', description: 'Optional exact CDP target for migration' }, pine: { type: 'string', description: 'Optional dedicated saved Pine document ID' },
    }, handler: (opts, args) => createWorkspace(args[0], opts) }],
    ['select', { description: 'Verify workspace/layout selection; PowerShell module applies it to the calling terminal', handler: (_, args) => verifyWorkspaceSelection(args[0]) }],
    ['show', { description: 'Inspect a named workspace without changing terminal selection', handler: (_, args) => workspaceStatus(resolveWorkspace(args[0]), { name: args[0] }) }],
    ['inventory', { description: 'HTTP-only target/layout inventory (no page execution)', handler: workspaceInventory }],
    ['gate-status', { description: 'Inspect admission metadata ownership', handler: () => admissionGateStatus() }],
    ['gate-clear', { description: 'Clear an exact dead admission gate; retain all reservations', options: { token: { type: 'string', description: 'Exact dead admission gate token from gate-status' }, 'repair-token': { type: 'string', description: 'Exact dead repair token from gate-status' } }, handler: opts => clearAdmissionGate(opts.token, { repairToken: opts['repair-token'] }) }],
    ['init', { description: 'Reserve pre-provisioned independent saved resources', options: {
      file, target: { type: 'string', description: 'CDP target to reserve (see workspace inventory)' },
      layout: { type: 'string', description: 'Saved layout open in that target' },
      pine: { type: 'string', description: "Saved Pine document as 'USER;DOCUMENT'" },
    }, handler: opts => initWorkspace(opts) }],
    ['status', { description: 'Inspect filesystem ownership without touching Desktop', options: { file }, handler: opts => workspaceStatus(opts.file) }],
    ['rebind', { description: 'Acknowledge a new generation of the same idle resources', options: { file, id: { type: 'string', description: 'Exact workspace ID' }, 'restore-document': { type: 'boolean', description: 'Reopen the exact recorded document after reload; reject foreign drafts' } }, handler: opts => rebindWorkspace(opts.file, opts.id, { restoreDocument: opts['restore-document'] }) }],
    ['interrupt', { description: 'Mark an exact operation interrupted after its PID has died', options: { file, operation }, handler: opts => markInterrupted(opts.file, opts.operation) }],
    ['recover', { description: 'Reconcile current isolated state after an interrupted operation', options: { file, operation,
      rebind: { type: 'boolean', description: 'Acknowledge a new generation of the same resources' },
      'restore-document': { type: 'boolean', description: 'Reopen the recorded owned document during explicit rebind' },
    }, handler: opts => recoverWorkspace(opts.file, { operationId: opts.operation, rebind: opts.rebind, restoreDocument: opts['restore-document'] }) }],
    ['release', { description: 'Release idle resources; preserve artifacts', options: { file }, handler: opts => closeWorkspace(opts.file) }],
    ['abandon', { description: 'Explicit offline release after target/handle loss; preserve incomplete artifacts', options: { file, operation, id: { type: 'string', description: 'Exact workspace ID' } },
      handler: opts => abandonWorkspace(opts.file, { workspaceId: opts.id, operationId: opts.operation }) }],
    ['wait', { description: 'Observe admitted/queued work and wait; dead owner is WORKSPACE_OWNER_DEAD with exact interrupt/recover hints, never implicit adoption', options: { timeout: { type: 'string', description: 'Milliseconds to wait (default 30000, max 300000)' } }, handler: async opts => {
      opts.workspaceWaitStartedAt ??= Date.now();
      const timeout = Number(opts.timeout || 30000), start = opts.workspaceWaitStartedAt;
      const inspect=opts._deps?.evaluate||evaluate,getStatus=opts._deps?.status||workspaceStatus,getLocks=opts._deps?.locks||resourceLockStatus;
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('timeout must be 1..300000 ms.');
      do {
        const owned=currentWorkspaceSession()?.workspace;
        const status=owned?getStatus(owned.file):null;
        if(status)assertObservationAdmission(status,opts.workspaceReference||owned.file);
        if(Date.now()-start>=timeout)return workspaceWaitTimeout();
        const locks=owned?getLocks():null;
        const admitted=owned?[...(locks?.holders||[]),...(locks?.queue||[])].filter(row=>row.workspace_id===owned.id):[];
        const state = await inspect(`(() => {${STRATEGY_PAGE_CODE};return (${compilationState.toString()})(window);})()`);
        const afterStatus=owned?getStatus(owned.file):null;
        if(afterStatus) {
          assertObservationAdmission(afterStatus,opts.workspaceReference||owned.file,status,{followOperations:true});
          if(Date.now()-start>=timeout)return workspaceWaitTimeout();
          if(!observationOperationMatches(afterStatus,status)) { await (opts._deps?.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(100); continue; }
        }
        if(Date.now()-start>=timeout)return workspaceWaitTimeout();
        if(!status?.operation&&!admitted.length) {
          if (state.phase === 'ready') return { success: true, ...state };
          if (['failed', 'invalidated', 'not-strategy', 'unverified'].includes(state.phase)) return { success: false, ...state };
        }
        await (opts._deps?.sleep|| (ms=>new Promise(resolve=>setTimeout(resolve,ms))))(100);
      } while (Date.now() - start < timeout);
      return workspaceWaitTimeout();
    } }],
  ]),
});

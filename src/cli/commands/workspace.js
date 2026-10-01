import { register } from '../router.js';
import { initWorkspace, recoverWorkspace, closeWorkspace, workspaceInventory } from '../../workspace.js';
import { workspaceStatus, markInterrupted } from '../../workspace-store.js';
import { compilationState, STRATEGY_PAGE_CODE } from '../../strategy-state.js';
import { evaluate } from '../../connection.js';
import { admissionGateStatus, clearAdmissionGate } from '../../session.js';

const file = { type: 'string', description: 'Persistent workspace file' };
const operation = { type: 'string', description: 'Exact interrupted operation ID' };
register('workspace', {
  description: 'Independent target/layout/Pine ownership',
  subcommands: new Map([
    ['inventory', { description: 'HTTP-only target/layout inventory (no page execution)', handler: workspaceInventory }],
    ['gate-status', { description: 'Inspect admission metadata ownership', handler: () => admissionGateStatus() }],
    ['gate-clear', { description: 'Clear an exact dead admission gate; retain all reservations', options: { token: { type: 'string' } }, handler: opts => clearAdmissionGate(opts.token) }],
    ['init', { description: 'Reserve pre-provisioned independent saved resources', options: {
      file, target: { type: 'string' }, layout: { type: 'string' }, pine: { type: 'string' },
    }, handler: opts => initWorkspace(opts) }],
    ['status', { description: 'Inspect filesystem ownership without touching Desktop', options: { file }, handler: opts => workspaceStatus(opts.file) }],
    ['interrupt', { description: 'Mark an exact operation interrupted after its PID has died', options: { file, operation }, handler: opts => markInterrupted(opts.file, opts.operation) }],
    ['recover', { description: 'Reconcile current isolated state after an interrupted operation', options: { file, operation,
      rebind: { type: 'boolean', description: 'Acknowledge a new generation of the same resources' },
    }, handler: opts => recoverWorkspace(opts.file, { operationId: opts.operation, rebind: opts.rebind }) }],
    ['release', { description: 'Release idle resources; preserve artifacts', options: { file }, handler: opts => closeWorkspace(opts.file) }],
    ['wait', { description: 'Wait for this workspace strategy calculation (use --workspace FILE)', options: { timeout: { type: 'string' } }, handler: async opts => {
      const timeout = Number(opts.timeout || 30000), start = Date.now();
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('timeout must be 1..300000 ms.');
      do {
        const state = await evaluate(`(() => {${STRATEGY_PAGE_CODE};return (${compilationState.toString()})(window);})()`);
        if (state.phase === 'ready') return { success: true, ...state };
        if (['failed', 'invalidated', 'not-strategy', 'unverified'].includes(state.phase)) return { success: false, ...state };
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() - start < timeout);
      return { success: false, code: 'REPORT_TIMEOUT', error: 'Workspace calculation did not complete.' };
    } }],
  ]),
});

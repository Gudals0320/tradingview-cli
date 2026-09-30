import { register } from '../router.js';
import { sessionStatus, discardSession } from '../../session.js';
register('session', { description: 'Desktop batch ownership and recovery status', subcommands: new Map([
  ['status', { description: 'Inspect ownership without touching Desktop or exposing the saved draft', handler: () => ({ success: true, ...sessionStatus() }) }],
  ['discard', { description: 'Abandon restoration and archive the saved journal; Desktop remains as it is',
    options: { 'run-id': { type: 'string', description: 'Exact recovery_run_id from session status (required)' } },
    handler: opts => discardSession({ runId: opts['run-id'] }) }],
]) });

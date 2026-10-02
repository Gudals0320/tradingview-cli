import { register } from '../router.js';
import { sessionStatus, discardSession } from '../../session.js';
import { recoverSession } from '../../session-recovery.js';
register('session', { description: 'Desktop batch ownership and recovery status', subcommands: new Map([
  ['status', { description: 'Inspect ownership without touching Desktop or exposing the saved draft', handler: () => ({ success: true, ...sessionStatus() }) }],
  ['recover', { description: 'Verify native quiescence and reconcile an interrupted CLI command without reload',
    options: { 'run-id': { type: 'string', description: 'Exact native recovery run ID from session status' },
      'target-id': { type: 'string', description: 'CDP target to verify when the journal did not record one' } },
    handler: opts => recoverSession({ runId: opts['run-id'], targetId: opts['target-id'] }) }],
  ['discard', { description: 'Abandon restoration and archive the saved journal; Desktop remains as it is',
    options: { 'run-id': { type: 'string', description: 'Exact recovery_run_id from session status' },
      'journal-hash': { type: 'string', description: 'Exact recovery_journal_hash to archive a malformed journal' } },
    handler: opts => discardSession({ runId: opts['run-id'], journalHash: opts['journal-hash'] }) }],
]) });

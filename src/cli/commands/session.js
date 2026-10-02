import { register } from '../router.js';
import { sessionStatus, discardSession } from '../../session.js';
import { recoverSession } from '../../session-recovery.js';
import CDP from '../../cdp.js';
import { CDP_HOST, CDP_PORT } from '../../config.js';
import {legacyMetadata} from '../../legacy-bridge.js';
const legacyState={type:'string',description:'Exact old private state directory to inspect/recover/archive during migration; original artifacts are retained'};
register('session', { description: 'Desktop batch ownership and recovery status', subcommands: new Map([
  ['status', { description: 'Inspect current/legacy ownership without touching Desktop or exposing drafts',options:{'legacy-state':legacyState}, handler: opts => ({ success: true, ...sessionStatus(opts['legacy-state']?{directory:opts['legacy-state']}:{}),...(!opts['legacy-state']?{legacy:legacyMetadata()}:{} ) }) }],
  ['recover', { description: 'Verify native quiescence and reconcile an interrupted CLI command without reload',
    options: { 'run-id': { type: 'string', description: 'Exact native recovery run ID from session status' },
      'target-id': { type: 'string', description: 'CDP target to verify when the journal did not record one' },'legacy-state':legacyState },
    handler: opts => recoverSession({ runId: opts['run-id'], targetId: opts['target-id'],directory:opts['legacy-state'] }) }],
  ['discard', { description: 'Abandon restoration and archive the saved journal; Desktop remains as it is',
    options: { 'run-id': { type: 'string', description: 'Exact recovery_run_id from session status' },
      'journal-hash': { type: 'string', description: 'Exact recovery_journal_hash to archive a malformed journal' },
      'target-lost': { type: 'boolean', description: 'Verify recorded targets are absent on reachable CDP before archiving an incomplete native journal' },'legacy-state':legacyState },
    handler: async opts => {
      let targets=[];
      if(opts['target-lost'])targets=await CDP.List({host:CDP_HOST,port:CDP_PORT});
      return discardSession({ runId: opts['run-id'], journalHash: opts['journal-hash'], lostTargetInventory:opts['target-lost']?targets:undefined,...(opts['legacy-state']?{directory:opts['legacy-state']}:{}) });
    } }],
]) });

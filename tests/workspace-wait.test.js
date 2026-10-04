import {it} from 'node:test';
import assert from 'node:assert/strict';
import {registeredCommands} from '../src/cli/router.js';
import {withWorkspaceSession} from '../src/session.js';
await import('../src/cli/commands/workspace.js');
const wait=registeredCommands().get('workspace').subcommands.get('wait').handler;
it('wait cannot return an old ready report between resource admission and operation registration',async()=>{
  let probes=0,locks=0;
  const result=await withWorkspaceSession({workspace:{id:'worker',file:'mock'}},()=>wait({_deps:{
    status:()=>({operation:null}),locks:()=>({holders:locks++===0?[{workspace_id:'worker'}]:[],queue:[]}),
    evaluate:async()=>({phase:'ready',token:++probes===1?'old':'new'}),sleep:async()=>{},
  }}));
  assert.equal(result.token,'new');assert.equal(probes,2);
});
it('wait discards a ready sample across healthy FIFO A-to-B transition and accepts final completion', async () => {
  let reads = 0, samples = 0;
  const identity = { workspace_id: 'worker', target: 'target', layout: 'layout', pine: 'pine', generation: 'G', browser_generation: 'B', owner_alive: true };
  const result = await withWorkspaceSession({ workspace: { id: 'worker', file: 'mock' } }, () => wait({ _deps: {
    status: () => ({ ...identity, operation: ++reads === 1 ? { id: 'A' } : reads === 2 ? { id: 'B' } : null, result_committed: reads > 2, result_operation_id: 'B' }),
    locks: () => ({ holders: [], queue: [] }), evaluate: async () => ({ phase: 'ready', token: ++samples === 1 ? 'discard-A' : 'final-B' }), sleep: async () => {},
  } }));
  assert.equal(result.token, 'final-B'); assert.equal(samples, 2);
});

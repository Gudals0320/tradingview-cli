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

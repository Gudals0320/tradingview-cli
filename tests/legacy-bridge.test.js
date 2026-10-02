import {it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reserveWorkspace,acquireWorkspace,releaseWorkspace,loadWorkspace} from '../src/workspace-store.js';
import {readReservations,acquireSession} from '../src/session.js';

it('legacy admission is fenced by mirrors without exposing modern credentials, and release retains original rows',()=>{
  const legacyDirectory=mkdtempSync(join(tmpdir(),'tv-bridge-old-'));
  const options={host:'fixture',port:1,directory:mkdtempSync(join(tmpdir(),'tv-bridge-new-')),legacyDirectory},old={...options,directory:legacyDirectory,legacyDirectory:undefined};
  const modern=reserveWorkspace({file:join(options.directory,'modern.json'),target:'modern-target',layout:'modern-layout',pine:'modern-pine'},options);
  const mirror=readReservations(old)[0];assert.equal(mirror.id,modern.id);assert.notEqual(mirror.token,modern.token);assert.equal(mirror.source,undefined);
  assert.throws(()=>acquireSession(old),{code:'WORKSPACE_RESERVED'});
  const original=reserveWorkspace({file:join(legacyDirectory,'original.json'),target:'old-target',layout:'old-layout',pine:'old-pine'},old);
  const lease=acquireWorkspace(modern.file,options);lease.saveBinding({nonce:'generation'});
  assert.throws(()=>lease.reassign({pine:original.pine,expectedGeneration:'generation'}),{code:'WORKSPACE_CONFLICT'});
  assert.equal(loadWorkspace(modern.file,options).pine,'modern-pine');
  releaseWorkspace(lease,options);
  assert.equal(readReservations(old).some(row=>row.id===modern.id),false);assert.equal(readReservations(old).find(row=>row.id===original.id).token,original.token);
});

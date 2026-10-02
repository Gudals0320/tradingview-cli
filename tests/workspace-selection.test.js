import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reserveWorkspace,acquireWorkspace,releaseWorkspace } from '../src/workspace-store.js';
import { registerWorkspaceName, resolveWorkspace, selectWorkspace } from '../src/workspace-registry.js';
import { acquireResources, resourceLockStatus, ownerAlive } from '../src/resource-lock.js';

function fixture() { return { directory: mkdtempSync(join(tmpdir(), 'tv-selection-')), host: 'fixture', port: 1 }; }
it('names resolve persistently without storing terminal selection; file/name ambiguity fails closed', () => {
  const options = fixture();
  const workspace = reserveWorkspace({file:join(options.directory,'worker.json'),target:'target',layout:'layout'},options);
  registerWorkspaceName('worker',workspace.file,options);
  assert.equal(resolveWorkspace('worker',options),workspace.file);
  assert.equal(selectWorkspace('worker',options).layout,'layout');
  assert.equal(workspace.pine,null);
  assert.throws(()=>resolveWorkspace(null,options),{code:'WORKSPACE_REQUIRED'});
  assert.throws(()=>resolveWorkspace('missing',options),{code:'WORKSPACE_NOT_FOUND'});
  const name = `ambiguous-${Date.now()}`;
  registerWorkspaceName(name,workspace.file,options);
  // Ambiguity is deliberately checked against the actual invocation directory.
  writeFileSync(join(process.cwd(),name),'{}');
  try { assert.throws(()=>resolveWorkspace(name,options),{code:'WORKSPACE_REFERENCE_AMBIGUOUS'}); }
  finally { unlinkSync(join(process.cwd(),name)); }
});
it('conflicting writers queue FIFO while disjoint work and observation remain available', async () => {
  const options=fixture();
  const first=await acquireResources(['layout:a','workspace:a'],{...options,command:'first'});
  const order=[];
  const second=acquireResources(['layout:a'],{...options,command:'second'}).then(lease=>{order.push('second');lease.release();});
  const third=acquireResources(['layout:a'],{...options,command:'third'}).then(lease=>{order.push('third');lease.release();});
  const independent=await acquireResources(['layout:b'],{...options,command:'independent'});
  assert.equal(resourceLockStatus(options).queue.length,2);
  assert.equal(resourceLockStatus(options).holders.length,2);
  independent.release(); first.release(); await Promise.all([second,third]);
  assert.deepEqual(order,['second','third']);
  assert.equal(resourceLockStatus(options).queue.length,0);
});
it('bounded waits return owner details and cancellation removes only the waiting ticket',async()=>{
  const options=fixture(),first=await acquireResources(['app'],{...options,command:'shared owner'});
  await assert.rejects(acquireResources(['app'],{...options,timeout:0}),error=>error.code==='LOCK_TIMEOUT'&&error.details.owners[0].command==='shared owner');
  const controller=new AbortController();
  const pending=acquireResources(['app'],{...options,signal:controller.signal});controller.abort();
  await assert.rejects(pending,{code:'LOCK_CANCELLED'});
  assert.equal(resourceLockStatus(options).queue.length,0);assert.equal(resourceLockStatus(options).holders.length,1);first.release();
  assert.equal(ownerAlive({pid:process.pid,process_started_at:'2000-01-01T00:00:00Z'}),false);
});
it('released schema-2 handles migrate idempotently from the old private store without deleting it',()=>{
  const old=fixture(),next={...old,directory:mkdtempSync(join(tmpdir(),'tv-next-state-')),legacyDirectory:old.directory};
  const workspace=reserveWorkspace({file:join(old.directory,'legacy.json'),target:'legacy-target',layout:'legacy-layout'},old);
  const lease=acquireWorkspace(workspace.file,old);releaseWorkspace(lease,old);
  const first=registerWorkspaceName('migrated',workspace.file,next);
  const again=registerWorkspaceName('migrated',workspace.file,next);
  assert.equal(first.workspace_id,again.workspace_id);assert.equal(resolveWorkspace('migrated',next),workspace.file);
  assert.throws(()=>resolveWorkspace('constructor',next),{code:'WORKSPACE_NOT_FOUND'});
});

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync,writeFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireResources,resourceLockStatus,clearDeadResource } from '../src/resource-lock.js';
import { sessionPaths,assertLegacyCompatibility,discardSession,acquireSession } from '../src/session.js';
const moduleUrl=new URL('../src/resource-lock.js',import.meta.url).href;
function fixture(){return {directory:mkdtempSync(join(tmpdir(),'tv-res-life-')),host:'fixture',port:1};}
function worker(options,command='holder') {
  const child=spawn(process.execPath,['--input-type=module','-e',`import {acquireResources} from ${JSON.stringify(moduleUrl)};const lock=await acquireResources(['app'],${JSON.stringify({...options,command})});console.log(lock.token);setInterval(()=>{},1000);`],{stdio:['ignore','pipe','pipe']});
  return child;
}
it('a killed holder is reclaimed without a journal, but an unknown native outcome is fenced with its exact token',async()=>{
  for(const journal of [false,true]){
    const options=fixture(),child=worker(options);const [output]=await once(child.stdout,'data');
    const token=output.toString().trim();child.kill();await once(child,'exit');
    if(journal){writeFileSync(sessionPaths(options).journal,JSON.stringify({native_quiescence_required:true,target_id:'gone'}));
      await assert.rejects(acquireResources(['app'],options),error=>error.code==='LOCK_HOLDER_DEAD'&&error.details.owners[0].token===token);
      assert.throws(()=>clearDeadResource(token,options),{code:'LOCK_HOLDER_DEAD'});unlinkSync(sessionPaths(options).journal);clearDeadResource(token,options);
    }
    const next=await acquireResources(['app'],options);next.release();assert.equal(resourceLockStatus(options).holders.length,0);
  }
});
it('a killed waiter does not occupy FIFO capacity or block a later request',async()=>{
  const options=fixture(),holder=await acquireResources(['app'],options),child=worker(options,'waiter');
  const deadline=Date.now()+10000;while(!resourceLockStatus(options).queue.length){if(Date.now()>deadline)throw new Error('Waiter did not register');await new Promise(resolve=>setTimeout(resolve,20));}
  child.kill();await once(child,'exit');holder.release();
  const next=await acquireResources(['app'],options);assert.equal(resourceLockStatus(options).queue.length,0);next.release();
});
it('old journals fence only their recorded targets and shared app actions; unreachable targets cannot authorize discard',()=>{
  const options=fixture(),legacyDirectory=mkdtempSync(join(tmpdir(),'tv-old-store-'));
  const legacy=sessionPaths({...options,directory:legacyDirectory});
  writeFileSync(legacy.journal,JSON.stringify({target_id:'a',run_id:'old-run'}));
  assert.doesNotThrow(()=>assertLegacyCompatibility({...options,legacyDirectory,target:'b'}));
  assert.throws(()=>assertLegacyCompatibility({...options,legacyDirectory,target:'a'}),{code:'LEGACY_RECOVERY_REQUIRED'});
  assert.throws(()=>assertLegacyCompatibility({...options,legacyDirectory,shared:true}),{code:'LEGACY_RECOVERY_REQUIRED'});
  const lease=acquireSession(options);lease.checkpoint({native_quiescence_required:true,target_id:'a'});lease.release();
  assert.throws(()=>discardSession({...options,runId:lease.run_id}),{code:'RECOVERY_REQUIRED'});
  assert.throws(()=>discardSession({...options,runId:lease.run_id,lostTargetInventory:[{id:'a',type:'page',url:'https://www.tradingview.com/chart/a/'}]}),{code:'RECOVERY_REQUIRED'});
  assert.throws(()=>discardSession({...options,runId:lease.run_id,lostTargetInventory:[]}),{code:'RECOVERY_TARGET_UNCONFIRMED'});
  assert.equal(discardSession({...options,runId:lease.run_id,lostTargetInventory:[{id:'other',type:'page',url:'https://www.tradingview.com/chart/other/'}]}).incomplete,true);
});

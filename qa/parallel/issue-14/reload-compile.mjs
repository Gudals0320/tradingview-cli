import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import CDP from 'chrome-remote-interface';
import { cli, identity, manifest, writeEvidence } from './live-utils.mjs';
const a=manifest('a'),evidence={started_at:new Date().toISOString(),before_b:await identity('b')};
try {
  const client=await CDP({port:9222,target:a.target});await client.Page.reload({ignoreCache:true});await client.close();
  for(let attempt=0;attempt<100;attempt++){try{if(!(await identity('a')).pending)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  evidence.rebind=await cli(['workspace','rebind','--file','qa/parallel/issue-14/live/worker-a.json','--id',a.id,'--restore-document']);assert.equal(evidence.rebind.result?.success,true,evidence.rebind.stderr);
  writeFileSync(new URL('live/heavy-a-edited.pine',import.meta.url),readFileSync(new URL('live/heavy-a.pine',import.meta.url),'utf8')+'// Version reconciliation after reload\n');
  evidence.set=await cli(['pine','set','--file','qa/parallel/issue-14/live/heavy-a-edited.pine'],{workspace:'a'});
  evidence.compile=await cli(['pine','compile','--save'],{workspace:'a'});assert.equal(evidence.compile.result?.success,true,evidence.compile.stderr||JSON.stringify(evidence.compile.result));
  assert.equal(evidence.compile.result.button_clicked,'saveThenRefreshOnChart');
  evidence.report=await cli(['data','strategy'],{workspace:'a'});assert.equal(evidence.report.result?.success,true);
  evidence.after_b=await identity('b');assert.deepEqual(evidence.after_b,evidence.before_b);evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence('reload-compile.json',evidence);console.log({success:evidence.success,error:evidence.error,compile_ms:evidence.compile?.ms});}

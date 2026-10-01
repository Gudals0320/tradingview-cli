import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
const exec=promisify(execFile);
const start=Date.now();
const results=await Promise.allSettled(['a','b'].map(async worker=>{
  const result=await exec(process.execPath,['src/cli/index.js','--workspace',`qa/parallel/issue-14/live/worker-${worker}.json`,'pine','compile'],{timeout:60000});
  return {worker,ms:Date.now()-start,result:JSON.parse(result.stdout),stderr:result.stderr};
}));
const output=results.map((r,i)=>r.status==='fulfilled'?r.value:{worker:['a','b'][i],error:{message:r.reason.message,stdout:r.reason.stdout,stderr:r.reason.stderr}});
writeFileSync(new URL('live/smoke.json',import.meta.url),JSON.stringify({ms:Date.now()-start,output},null,2));
console.log(output.map(r=>({worker:r.worker,ms:r.ms,success:r.result?.success,error:r.error?.stderr}))); 

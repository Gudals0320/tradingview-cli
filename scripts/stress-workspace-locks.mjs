import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=mkdtempSync(join(tmpdir(),'tv-lock-stress-')),results=[];
const moduleUrl=new URL('../src/resource-lock.js',import.meta.url).href;
async function scenario(count,hold) {
  const directory=join(root,`${count}-${hold}`);
  const jobs=Array.from({length:count},(_,index)=>new Promise(resolve=>{
    const child=spawn(process.execPath,['--input-type=module','-e',`import {acquireResources} from ${JSON.stringify(moduleUrl)};const lock=await acquireResources(['app'],${JSON.stringify({directory,host:'fixture',port:1,command:`worker-${index}`,timeout:60000})});await new Promise(resolve=>setTimeout(resolve,${hold}));lock.release();`],{stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',data=>stderr+=data);child.once('exit',exit=>resolve({index,exit,stderr}));
  }));
  const started=Date.now(),workers=await Promise.all(jobs);results.push({count,hold,elapsed_ms:Date.now()-started,workers});
  console.log(JSON.stringify(results.at(-1)));if(workers.some(worker=>worker.exit!==0))process.exitCode=1;
}
await scenario(8,1000);await scenario(16,200);
const rounds=Number(process.argv[2]||20);
for(let round=0;round<rounds;round++) {
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,['--test','--test-name-pattern=admits six independent process loops','tests/workspace.test.js'],{stdio:['ignore','pipe','pipe'],env:{...process.env,TV_STATE_DIR:join(root,`round-${round}`)}});
    let stderr='';child.stderr.on('data',data=>stderr+=data);child.once('exit',exit=>resolve({round,exit,stderr}));
  });
  if(result.exit!==0){process.exitCode=1;console.log(JSON.stringify(result));}
}
console.log(JSON.stringify({success:!process.exitCode,rounds,root}));

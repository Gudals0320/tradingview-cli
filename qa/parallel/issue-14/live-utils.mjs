import CDP from 'chrome-remote-interface';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { randomUUID, createHash } from 'node:crypto';
import { WORKSPACE_PAGE_CODE } from '../../../src/workspace-page.js';
const exec=promisify(execFile);
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const directory=new URL('./live/',import.meta.url);
export function writeEvidence(name,value,{compressed=false}={}) {
  mkdirSync(directory,{recursive:true});const target=new URL(name,directory),temporary=new URL(`${name}.${randomUUID()}.tmp`,directory);
  const data=Buffer.from(JSON.stringify(value));writeFileSync(temporary,compressed?gzipSync(data):data);
  for(let attempt=0;;attempt++)try{renameSync(temporary,target);break;}catch(error){if(attempt>=30)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
  return name;
}
export function manifest(name) { return JSON.parse(readFileSync(new URL(`worker-${name}.json`,directory),'utf8')); }
export async function cli(args,{workspace,timeout=60000}={}) {
  const started_at=Date.now(),argv=['src/cli/index.js',...(workspace?['--workspace',`qa/parallel/issue-14/live/worker-${workspace}.json`]:[]),...args];
  try {
    const value=await exec(process.execPath,argv,{timeout,maxBuffer:8*1024*1024});const result=JSON.parse(value.stdout);
    if(result.strategy_inputs)result.strategy_inputs=result.strategy_inputs.filter(input=>input.id!=='text');
    if(result.source)result.source_hash=hash(result.source); // Test fixture source only.
    return {args,started_at,finished_at:Date.now(),ms:Date.now()-started_at,result,stderr:value.stderr,exit:0};
  }catch(error){let result;try{result=JSON.parse(error.stdout);}catch{}return {args,started_at,finished_at:Date.now(),ms:Date.now()-started_at,exit:error.code,result,stdout:error.stdout,stderr:error.stderr};}
}
export async function raw(target,expression) {
  const client=await CDP({port:9222,target});
  try {const result=await client.Runtime.evaluate({expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}finally{await client.close();}
}
export async function identity(name) {
  const data=await raw(manifest(name).target,`(()=>{${WORKSPACE_PAGE_CODE};return readWorkspacePage(window,document);})()`);
  return {layout:data.layout,pine:data.pine,version:data.version,source_hash:hash(data.source),context:data.context,
    studies:data.studies.map(study=>({...study,inputs:study.inputs.filter(input=>input.id!=='text'),compiled_hash:hash(study.inputs)})),pending:data.pending,visibility:data.visibility,viewport:data.viewport};
}
export async function activeTabs() {
  const targets=await CDP.List({port:9222});const shell=targets.find(t=>/\/window\/index\.html/.test(t.url));
  return shell?raw(shell.id,'[...document.querySelectorAll(".tabs-container .tab")].map(tab=>({id:tab.id,active:tab.classList.contains("active")}))'):[];
}

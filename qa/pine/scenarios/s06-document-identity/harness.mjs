import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import CDP from 'chrome-remote-interface';
import {findPineController,findPineEditor} from '../../../../src/core/desktop-dom.js';
import {pineStudySnapshot} from '../../../../src/core/pine-state.js';
export const OUT='results/pine-scenarios/s06-document-identity';
export const QA='qa/pine/scenarios/s06-document-identity';
fs.mkdirSync(OUT+'/raw',{recursive:true});
export const sha=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
export const readState=()=>fs.existsSync(OUT+'/state.json')?JSON.parse(fs.readFileSync(OUT+'/state.json','utf8')):{};
export const writeState=s=>fs.writeFileSync(OUT+'/state.json',JSON.stringify(s,null,2));
export async function inspect(s,expected='any'){
 const c=await CDP({host:'127.0.0.1',port:9222,target:s.target});
 try{
  const expression=`(()=>{const c=(${findPineController})(document),e=(${findPineEditor})(document);const iv=c?.getScriptIdVersion?.();return {url:location.href,id:iv?.scriptIdPart||null,version:iv?.version||null,modified:c?.isModified?.()??null,source:e?.editor?.getValue?.()??null,studies:(${pineStudySnapshot})(window),dialogs:Array.from(document.querySelectorAll('[role="dialog"]')).filter(e=>e.offsetParent!==null).map(e=>e.innerText.slice(0,600))};})()`;
  const {result,exceptionDetails}=await c.Runtime.evaluate({expression,returnByValue:true});
  if(exceptionDetails||!result.value) throw Error('snapshot failed '+JSON.stringify(exceptionDetails));
  const v=result.value;
  if(v.url!==s.url)throw Error('URL FENCE '+v.url+' expected '+s.url);
  if(expected==='none'?v.id!==null:expected!=='any'&&v.id!==expected)throw Error('ID FENCE '+v.id+' expected '+expected);
  v.source_sha256=v.source===null?null:sha(v.source);v.source_chars=v.source?.length??0;
  return v;
 }finally{await c.close();}
}
export async function cli(tag,args,{pre='any',post=pre,exit=0,input,noTarget=false}={}){
 const s=readState(),file=OUT+'/raw/'+tag+'.json';if(fs.existsSync(file))throw Error('duplicate tag '+tag);
 const before=noTarget?null:await inspect(s,pre);
 const actual=noTarget?args:['--target',s.target,...args];const start=Date.now();
 const r=spawnSync(process.execPath,['src/cli/index.js',...actual],{encoding:'utf8',input,timeout:65000,maxBuffer:8*1024*1024});
 let json=null,json_channel='stdout';try{json=JSON.parse(r.stdout)}catch{if(exit!==0){try{json=JSON.parse(r.stderr);json_channel='stderr'}catch{}}}
 let after=null,postError=null;try{after=noTarget?null:await inspect(s,post)}catch(e){postError=e.message}
 const rec={tag,at:new Date(start).toISOString(),command:['node','src/cli/index.js',...actual],expect_exit:exit,exit_code:r.status,signal:r.signal,spawn_error:r.error?.message??null,elapsed_ms:Date.now()-start,stdin_sha256:input===undefined?null:sha(input),stdout:r.stdout,stderr:r.stderr,json,json_channel,before,after,postError};
 fs.writeFileSync(file,JSON.stringify(rec,null,2));
 const summary=JSON.stringify(rec,(k,v)=>k==='source'&&typeof v==='string'?{sha256:sha(v),chars:v.length}:k==='stdout'?undefined:k==='scripts'&&Array.isArray(v)?v.filter(x=>(x.name||'').startsWith('CLI-QA-S06')):k==='compiled_identity'?{sha256:sha(v)}:k==='strategy_inputs'&&Array.isArray(v)?v.filter(x=>x.id!=='text'):v);
 console.log(JSON.stringify({tag,exit:r.status,ms:rec.elapsed_ms,json:JSON.parse(summary).json,before:before&&{id:before.id,version:before.version,hash:before.source_sha256,count:before.studies.length},after:after&&{id:after.id,version:after.version,hash:after.source_sha256,count:after.studies.length},postError}));
 if(r.status!==exit||!json||(exit===0&&json.success!==true)||postError)throw Error('CLI STOP '+tag+': '+JSON.stringify({exit:r.status,expected:exit,json,postError}));
 if(exit!==0&&json.success===true)throw Error('Expected refusal reported success');
 if(args[0]==='pine'&&args[1]==='open'&&exit===0&&json.script_id!==after.id)throw Error('open identity mismatch');
 if(args[0]==='pine'&&args[1]==='save'&&exit===0&&json.script_id!==after.id)throw Error('save identity mismatch');
 return rec;
}
export function assert(test,message){if(!test)throw Error('ASSERT '+message);}
export function assertSource(rec,source){assert(rec.after?.source_sha256===sha(source),'full source hash '+rec.tag);}

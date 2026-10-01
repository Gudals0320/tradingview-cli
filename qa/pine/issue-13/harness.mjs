import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import CDP from 'chrome-remote-interface';
import {findPineController,findPineEditor} from '../../../src/core/desktop-dom.js';
import {pineStudySnapshot} from '../../../src/core/pine-state.js';
export const OUT='results/pine-issue-13';mkdirSync(OUT,{recursive:true});
export const state=JSON.parse(readFileSync(`${OUT}/state.json`,'utf8'));
export const persist=()=>writeFileSync(`${OUT}/state.json`,JSON.stringify(state,null,2));
export const normalize=s=>s.replace(/\r\n/g,'\n');
export const hash=s=>createHash('sha256').update(normalize(s)).digest('hex');
export async function inspect(expected=state.activeId??'any'){
 const c=await CDP({host:'127.0.0.1',port:9222,target:state.target});
 try {const {result,exceptionDetails}=await c.Runtime.evaluate({expression:`(() => {
 const c=(${findPineController})(document),m=(${findPineEditor})(document),id=c?.getScriptIdVersion?.();
 const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
 let studies=[],studyStateError=null;try{studies=chart?(${pineStudySnapshot})(window).map(s=>{const native=chart._chartWidget.model().model().dataSources().find(n=>n.id()===s.id);let status=native.status?.();if(status?.value)status=status.value();return {...s,status};}):[];}catch(error){studyStateError=error.message;}
 return {url:location.href,viewport:{width:innerWidth,height:innerHeight},document_id:id?.scriptIdPart||null,version:id?.version||null,
 source:m?.editor.getValue()??null,modified:c?.isModified?.()??null,draft:c?.isDraft?.()??null,
 ui:c?._editorStore.getStore().getState().ui.isScriptOnChart??null,
 epoch:window.__tvCliCompilation?{phase:window.__tvCliCompilation.phase,source_hash:window.__tvCliCompilation.source_hash,token:window.__tvCliCompilation.token,error:window.__tvCliCompilation.error}:null,
 studies,study_state_error:studyStateError};})()`,returnByValue:true});
 if(exceptionDetails||!result.value)throw Error('Inspection failed');
 const v=result.value;if(v.url!==state.url)throw Error('URL FENCE violation');
 if(expected!=='any'&&v.document_id!==expected)throw Error('DOCUMENT FENCE violation: '+expected+' vs '+v.document_id);
 return v;
 }finally{await c.close();}
}
function sanitize(value,key=''){
 if(['document_id','script_id','strategy_id','compilation_token','token','target_id','entity_id','id','pine_id','url','tabs','scripts'].includes(key))return undefined;
 if(key==='source'&&typeof value==='string')return {sha256_lf:hash(value),chars:value.length,crlf:(value.match(/\r\n/g)||[]).length};
 if(key==='compiled_identity')return {sha256:hash(value)};
 if(key==='text'&&typeof value==='string'&&value.length>1000)return '[omitted compiled payload]';
 if(key==='strategy_inputs')return undefined;
 if(Array.isArray(value))return value.map(v=>sanitize(v)).filter(v=>v!==undefined);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,k)]).filter(([,v])=>v!==undefined));
 return value;
}
export async function cli(tag,args,{input,exit=0,pre=state.activeId??'any',post=pre}={}){
 const before=await inspect(pre),started=Date.now();
 if(before.study_state_error&&!['get','open','new','errors','console'].includes(args[1]))throw Error('STUDY READINESS FENCE: '+before.study_state_error);
 const r=spawnSync(process.execPath,['src/cli/index.js','--target',state.target,...args],{encoding:'utf8',input,timeout:65000,maxBuffer:8*1024*1024});
 let out;try{out=JSON.parse(r.stdout||r.stderr);}catch{throw Error('JSON fence: '+tag);}
 const expectedPost=post==='saved'?out.script_id:post;
 const after=await inspect(expectedPost);
 writeFileSync(`${OUT}/${tag}.json`,JSON.stringify({args,input_sha:input?hash(input):null,exit_code:r.status,stdout:r.stdout,stderr:r.stderr,before,after},null,2));
  const evidencePath='qa/pine/issue-13/evidence.json';const evidence=existsSync(evidencePath)?JSON.parse(readFileSync(evidencePath,'utf8')):{records:[]};
 evidence.records.push({tag,args,elapsed_ms:Date.now()-started,exit_code:r.status,output:sanitize(out),before:sanitize(before),after:sanitize(after)});
  for(let attempt=0;;attempt++){try{writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');break;}catch(error){if(attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
 console.log(JSON.stringify({tag,exit:r.status,ms:Date.now()-started,success:out.success,code:out.code,error:out.error,compiled:out.compiled,saved:out.saved,version:after.version,epoch:after.epoch?.phase,study_count:after.studies.length}));
 if(r.status!==exit||r.error||r.signal||(exit===0&&out.success!==true))throw Error('CHILD FENCE: '+tag+' '+(r.stderr||r.stdout));
 if(args[0]==='pine'&&args[1]==='open'&&exit===0&&out.script_id!==after.document_id)throw Error('OPEN FENCE');
 if(expectedPost!=='any')state.activeId=expectedPost;persist();
 return {out,before,after};
}
export async function create(name,kind,source){
 const n=await cli('new-'+name,['pine','new',kind],{post:null});
 if(n.after.document_id!==null||!n.after.source.includes(kind+'('))throw Error('NEW TEMPLATE FENCE');
 await cli('set-'+name,['pine','set'],{input:source,pre:null,post:null});
 const saved=await cli('save-'+name,['pine','save'],{pre:null,post:'saved'});
 state.documents[name]=saved.out.script_id;persist();return saved;
}
export async function open(name,tag='open-'+name){const id=state.documents[name];if(!id)throw Error('Unknown owned QA document');return cli(tag,['pine','open',name],{post:id});}
export async function evalPage(expression,{post='same'}={}){const c=await CDP({host:'127.0.0.1',port:9222,target:state.target});try{
 const before=await inspect(state.activeId??'any');const {result,exceptionDetails}=await c.Runtime.evaluate({expression,returnByValue:true,awaitPromise:true});if(exceptionDetails)throw Error('Page action failed');await inspect(post==='same'?before.document_id:post);return result.value;
}finally{await c.close();}}

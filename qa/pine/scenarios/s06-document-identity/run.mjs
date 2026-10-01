import fs from 'node:fs';
import {cli,readState,writeState,assert,assertSource,sha,QA,OUT} from './harness.mjs';
const phase=process.argv[2];const st=readState();
const file=name=>fs.readFileSync(QA+'/'+name,'utf8');
if(phase==='create'){
 const initial=await cli('004-initial-get',['pine','get']);
 st.initialDocument={id:initial.after.id,source_sha256:initial.after.source_sha256};writeState(st);
 for(const [key,type,name,fixture] of [['A','indicator','CLI-QA-S06-Collision-A','a-v1.pine'],['B','strategy','CLI-QA-S06-Collision-B','b-v1.pine'],['C','indicator','CLI-QA-S06-Sentinel-C','c-sentinel.pine'],['D','indicator','CLI-QA-S06-Collision-D','d-collision.pine']]){
  const n=await cli(`create-${key}-new`,['pine','new',type],{post:'none'});
  assert(n.after.source.startsWith('//@version=6\n'+type+'('),'new template');
  const source=file(fixture);const seed=['A','B'].includes(key)?source.replace('CLI-QA-S06-Shared',name):source;
  fs.writeFileSync(QA+'/'+key.toLowerCase()+'-seed.pine',seed);
  const set=await cli(`create-${key}-set`,['pine','set','--file',QA+'/'+key.toLowerCase()+'-seed.pine'],{pre:'none'});assertSource(set,seed);
  const save=await cli(`create-${key}-save`,['pine','save'],{pre:'none',post:'any'});
  const id=save.json.script_id;assert(id&&save.after.modified===false,'saved identity');assertSource(save,seed);
  const list=await cli(`create-${key}-list`,['pine','list'],{pre:id});
  const found=list.json.scripts.find(x=>x.id===id);assert(found?.name.startsWith('CLI-QA-S06'),'own saved name');
  st.docs[key]={id,name:found.name,version:found.version,fixture,hash:sha(source)};writeState(st);
  if(seed!==source){
   const set=await cli(`create-${key}-shared-set`,['pine','set','--file',QA+'/'+fixture],{pre:id});assertSource(set,source);
   const save=await cli(`create-${key}-shared-save`,['pine','save'],{pre:id});assertSource(save,source);
   st.docs[key].version=save.after.version;writeState(st);
  }
 }
 const list=await cli('create-final-list',['pine','list'],{pre:st.docs.D.id});
 for(const k of ['A','B']){
  const doc=list.json.scripts.find(x=>x.id===st.docs[k].id);
  assert(doc.title==='CLI-QA-S06-Shared'&&doc.name!=='CLI-QA-S06-Shared','true title ambiguity');
  assert(doc.name===st.docs[k].name,'saved name retained');
 }
 writeState(st);
}
if(phase==='edit'){
 const A=st.docs.A,B=st.docs.B,C=st.docs.C;
 const a2=file('a-v1.pine').replace('input.int(12,','input.int(17,').replace('"A-v1"','"A-v2"');
 const b2=file('b-v1.pine').replace('input.float(1.5,','input.float(2.0,').replace('"B-v1"','"B-v2"');
 fs.writeFileSync(QA+'/a-v2.pine',a2.replace(/\n/g,'\r\n'));fs.writeFileSync(QA+'/b-v2.pine',b2);
 const openA=await cli('edit-A-open',['pine','open',A.name],{pre:st.docs.D.id,post:A.id});assertSource(openA,file('a-v1.pine'));
 const baseline=await cli('edit-baseline-list',['pine','list'],{pre:A.id});
 const setA=await cli('edit-A-file-crlf',['pine','set','--file',QA+'/a-v2.pine'],{pre:A.id});assertSource(setA,a2);
 const refused=await cli('edit-A-save-required',['pine','compile'],{pre:A.id,exit:1});assert(refused.json.code==='SAVE_REQUIRED','save required diagnostic');
 const saveA=await cli('edit-A-save',['pine','save'],{pre:A.id});assertSource(saveA,a2);
 const list=await cli('edit-A-after-list',['pine','list'],{pre:A.id});
 for(const d of [B,C])assert(JSON.stringify(list.json.scripts.find(x=>x.id===d.id))===JSON.stringify(baseline.json.scripts.find(x=>x.id===d.id)),'B/C version/name/modified preserved');
 for(const d of [B,C]){
  const r=await cli(`edit-A-preserve-${d===B?'B':'C'}`,['pine','open',d.name],{pre:d===B?A.id:B.id,post:d.id});assertSource(r,file(d.fixture));assert(r.after.version===d.version,'B/C version preserved');
 }
 const ra=await cli('edit-A-reopen',['pine','open',A.name],{pre:C.id,post:A.id});assertSource(ra,a2);
 await cli('compile-A-v2',['pine','compile'],{pre:A.id});
 const aGet=await cli('compile-A-get',['pine','get'],{pre:A.id});assertSource(aGet,a2);assert(aGet.after.studies.filter(x=>x.pine_id===A.id).length===1,'one A study');
 st.aStudy=aGet.after.studies.find(x=>x.pine_id===A.id);writeState(st);
 const rb=await cli('edit-B-open',['pine','open',B.name],{pre:A.id,post:B.id});assertSource(rb,file('b-v1.pine'));
 const sb=await cli('edit-B-stdin',['pine','set'],{pre:B.id,input:b2});assertSource(sb,b2);
 const saveB=await cli('edit-B-save',['pine','save'],{pre:B.id});assertSource(saveB,b2);
 const bc=await cli('compile-B-v2',['pine','compile'],{pre:B.id});
 assert(JSON.stringify(bc.before.studies.find(x=>x.pine_id===A.id))===JSON.stringify(bc.after.studies.find(x=>x.pine_id===A.id)),'B compile preserves A compiled identity');
 assert(bc.after.studies.filter(x=>x.pine_id===A.id).length===1,'A count preserved');
 st.docs.A.finalFixture='a-v2.pine';st.docs.A.finalVersion=saveA.after.version;st.docs.B.finalFixture='b-v2.pine';st.docs.B.finalVersion=saveB.after.version;writeState(st);
 const again=await cli('compile-B-retry',['pine','compile'],{pre:B.id});assert(again.after.studies.length===bc.after.studies.length,'B retry no duplicate');
 await cli('compile-B-errors',['pine','errors'],{pre:B.id});
 let previous=B.id;
 for(const [k,d] of Object.entries(st.docs)){
  const r=await cli(`edit-final-open-${k}`,['pine','open',d.name],{pre:previous,post:d.id});assertSource(r,file(d.finalFixture||d.fixture));assert(r.after.version===(d.finalVersion||d.version),'final version '+k);previous=d.id;
  const g=await cli(`edit-final-get-${k}`,['pine','get'],{pre:d.id});assert(sha(g.json.source)===sha(file(d.finalFixture||d.fixture)),'CLI get full source '+k);
 }
}
if(phase==='contracts'){
 const {A,B,C,D}=st.docs;
 const stable=r=>{
  assert(r.before.id===r.after.id&&r.before.version===r.after.version&&r.before.source_sha256===r.after.source_sha256,'refusal preserves document');
  assert(JSON.stringify(r.before.studies)===JSON.stringify(r.after.studies),'refusal preserves chart');
 };
 for(const [tag,name] of [['ambiguous-title-retry','CLI-QA-S06-Shared'],['ambiguous-partial','CLI-QA-S06-Collision'],['missing-name','CLI-QA-S06-NONEXISTENT']]){
  const r=await cli(tag,['pine','open',name],{pre:D.id,exit:1});stable(r);
  assert(/Ambiguous/.test(r.json.error)||tag==='missing-name'&&/not found/.test(r.json.error),'expected open diagnostic');
 }
 const invalid=await cli('invalid-new-type',['pine','new','invalid-s06'],{pre:D.id,exit:1});stable(invalid);
 await cli('raw-B-open',['pine','open',B.name],{pre:D.id,post:B.id});
 const rb=await cli('raw-B-unchanged',['pine','raw-compile'],{pre:B.id});assert(rb.json.unchanged===true&&rb.json.compile_performed===false,'B raw smart alias');assert(rb.after.studies.length===2,'B raw no duplicate');
}
if(phase==='contracts-tail'){
 const {A,B,C,D}=st.docs;
 const stable=r=>{assert(r.before.id===r.after.id&&r.before.version===r.after.version&&r.before.source_sha256===r.after.source_sha256,'refusal preserves document');assert(JSON.stringify(r.before.studies)===JSON.stringify(r.after.studies),'refusal preserves chart');};
 await cli('raw-A-open',['pine','open',A.name],{pre:B.id,post:A.id});
 for(const command of ['compile','raw-compile','compile']){
  const r=await cli(`repeat-A-${command}-${command==='compile'?'n'+(fs.existsSync(OUT+'/raw/repeat-A-compile-n1.json')?'2':'1'):'alias'}`,['pine',command],{pre:A.id});
  assert(r.json.unchanged===true&&r.json.compile_performed===false,'A unchanged skip');
  assert(JSON.stringify(r.before.studies)===JSON.stringify(r.after.studies),'repeat no chart change');
 }
 const a2=file(A.finalFixture),b2=file(B.finalFixture);const unsaved=a2+'// 미저장 교체 확인 "따옴표" C:\\QA\\S06\n';
 fs.writeFileSync(QA+'/a-unsaved.pine',unsaved);
 const set=await cli('unsaved-open-set',['pine','set','--file',QA+'/a-unsaved.pine'],{pre:A.id});assertSource(set,unsaved);assert(set.after.modified===true,'modified before open');
 const ambiguous=await cli('unsaved-ambiguous-title',['pine','open','CLI-QA-S06-Shared'],{pre:A.id,exit:1});stable(ambiguous);assert(ambiguous.after.modified===true,'ambiguous keeps unsaved');
 const toB=await cli('unsaved-open-B',['pine','open',B.name],{pre:A.id,post:B.id});assertSource(toB,b2);assert(toB.after.modified===false,'open replaces unsaved');
 const reopen=await cli('unsaved-open-reopen-A',['pine','open',A.name],{pre:B.id,post:A.id});assertSource(reopen,a2);assert(reopen.after.version===A.finalVersion,'open did not autosave');
 const set2=await cli('unsaved-new-set',['pine','set'],{pre:A.id,input:unsaved});assertSource(set2,unsaved);
 const n=await cli('unsaved-new-strategy',['pine','new','strategy'],{pre:A.id,post:'none'});assert(n.after.source.replace(/\r\n/g,'\n')==='//@version=6\nstrategy("My strategy", overlay=true)\n','new template contract');
 const reopened=await cli('unsaved-new-reopen-A',['pine','open',A.name],{pre:'none',post:A.id});assertSource(reopened,a2);assert(reopened.after.version===A.finalVersion,'new did not autosave');
 const rc=await cli('contract-final-C',['pine','open',C.name],{pre:A.id,post:C.id});assertSource(rc,file(C.fixture));assert(rc.after.version===C.version,'C final immutable');
 await cli('contract-final-A',['pine','open',A.name],{pre:C.id,post:A.id});
 await cli('contract-final-errors',['pine','errors'],{pre:A.id});
 await cli('contract-final-list',['pine','list'],{pre:A.id});
 await cli('contract-final-state',['state'],{pre:A.id});
 await cli('contract-final-replay',['replay','status'],{pre:A.id});
 const final=await cli('contract-final-get',['pine','get'],{pre:A.id});assertSource(final,a2);assert(final.after.dialogs.length===0,'no pending dialogs');st.final=final.after;writeState(st);
}

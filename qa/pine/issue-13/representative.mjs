import {readFileSync,writeFileSync} from 'node:fs';
import {create,cli,open,state,normalize,hash} from './harness.mjs';
import assert from 'node:assert/strict';
await cli('S-representative-timeframe',['timeframe','5']);
const cases=[
 ['S01','s01-mtf-trend/v2-htf-filter.pine','indicator'],
 ['S02','s02-session-dashboard/v3-array-fixed.pine','indicator'],
 ['S03','s03-partial-exit/final.pine','strategy'],
 ['S04','s04-pivot-drawings/v4-delete-update.pine','indicator'],
 ['S05','s05-library-contracts/verifier-indicator.pine','indicator'],
 ['S06','s06-document-identity/b-v2.pine','strategy'],
];
const summary=[];
for(const [tag,file,kind] of cases){
 const name='CLI-QA-I13-'+tag;let code=normalize(readFileSync('qa/pine/scenarios/'+file,'utf8'));
 code=code.replace(/\b(indicator|strategy)\(\s*"[^"\n]*"/,(_,type)=>`${type}("${name}"`);
 if(!state.documents[name])await create(name,kind,code);else await open(name,tag+'-open');
 assert.equal((await cli(tag+'-source',['pine','get'])).after.source,code);
 await cli(tag+'-analyze',['pine','analyze'],{input:code});assert.equal((await cli(tag+'-check',['pine','check'],{input:code})).out.compiled,true);
 const compiled=await cli(tag+'-compile',['pine','compile']);assert.equal(compiled.out.compiled,true);if(kind==='strategy')assert.equal(compiled.out.report_ready,true);
 const id=state.documents[name];assert.equal(compiled.after.studies.filter(s=>s.pine_id===id).length,1);
 await open('CLI-QA-I13-Sentinel',tag+'-away');await open(name,tag+'-reopen');
 const reopened=await cli(tag+'-full-source',['pine','get']);assert.equal(normalize(reopened.after.source),code);
 const retry=await cli(tag+'-retry',['pine','raw-compile']);assert.equal(retry.out.unchanged,true);
 if(kind==='strategy')await cli(tag+'-data',['data','strategy']);
 let observed;
 if(['S02','S05'].includes(tag)){const tables=await cli(tag+'-tables',['data','tables','--filter',name]);observed=tables.out;assert.ok(observed.study_count>0);
  if(tag==='S05')assert.ok(JSON.stringify(observed).includes('mismatch=0'));}
 if(tag==='S04'){const boxes=await cli(tag+'-boxes',['data','boxes','--filter',name]);observed=boxes.out;}
 summary.push({tag,original_fixture:file,new_document:name,source_sha256_lf:hash(code),compiled:true,report_ready:compiled.out.report_ready||null,
   source_preserved:true,unchanged_after_reopen:retry.out.unchanged,study_count:1,observed_data:Boolean(observed),numeric_oracle_repeated:false});
 writeFileSync('qa/pine/issue-13/representative-evidence.json',JSON.stringify({scope:'representative compilation/application/document regression; original numerical oracle runs not repeated',cases:summary},null,2)+'\n');
}

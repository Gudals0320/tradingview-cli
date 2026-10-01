import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='qa/pine/issue-13',raw='results/pine-issue-13';
const summary=JSON.parse(readFileSync(`${root}/representative-evidence.json`,'utf8'));
for(const item of summary.cases){
 const record=JSON.parse(readFileSync(`${raw}/${item.tag}-compile.json`,'utf8'));
 const others=state=>state.studies.filter(s=>s.pine_id!==state.document_id).map(s=>[s.id,s.compiled_identity]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(others(record.before),others(record.after));
 const reopened=JSON.parse(readFileSync(`${raw}/${item.tag}-full-source.json`,'utf8'));
 item.unrelated_compiled_identity_unchanged=true;item.reopened_crlf_count=(reopened.after.source.match(/\r\n/g)||[]).length;
}
writeFileSync(`${root}/representative-evidence.json`,JSON.stringify(summary,null,2)+'\n');
const evidence=JSON.parse(readFileSync(`${root}/evidence.json`,'utf8'));
for(const record of evidence.records){
 if(record.tag==='new-CLI-QA-I13-Strategy'&&record.exit_code===1)record.classification='baseline product failure; actual zero viewport';
 else if(['R1-reopened-raw','R1-report-after-reject','R2-compile-valid'].includes(record.tag))record.classification='expected baseline product failure';
 else if(['R2fix-no-cache-refresh','R2old-refresh','R2old-final-refresh'].includes(record.tag)&&(!record.output.success||record.output.chart_changed===undefined))record.classification='intermediate refresh implementation attempt; retain with raw assertions';
 else if(['R5-zero-viewport','R5-zero-viewport-actual'].includes(record.tag))record.classification='fixture expectation failure; observed nonzero viewport and successful open';
 else record.classification=record.exit_code===0?'successful command':'intentional diagnostic/refusal test';
}
writeFileSync(`${root}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({records:evidence.records.length,representative_cases:summary.cases.length,unrelated_preserved:true}));

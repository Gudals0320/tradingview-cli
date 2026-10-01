// Explicit test setup: retire only disposable shared draft studies created by
// earlier QA runs. Keep saved documents and their studies. No automatic recovery.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {configureTarget,evaluate,disconnect} from '../../../src/connection.js';
const target=process.argv[2];assert.ok(target);configureTarget(target);
try {
 const studies=await evaluate(`(() => {if(!location.href.includes('/chart/kdn7wAFi/'))throw new Error('Wrong QA chart');
 const chart=window.TradingViewApi._activeChartWidgetWV.value();return chart._chartWidget.model().model().dataSources().flatMap(s=>{
 const name=s.metaInfo?.()?.description;if(!name?.startsWith('CLI-QA'))return [];
 try {const inputs=chart.getStudyById(s.id()).getInputValues();const version=inputs.find(i=>i.id==='pineVersion')?.value;
 return /^0\\./.test(String(version))?[{id:s.id(),name,version}]:[];}catch{return []}});})()`);
 for(const study of studies){const r=spawnSync(process.execPath,['src/cli/index.js','--target',target,'indicator','remove',study.id],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);}
 const evidence={purpose:'shared draft QA setup before independent 0-to-1 regression',removed_study_count:studies.length,
   removed_qa_names:[...new Set(studies.map(s=>s.name))],saved_studies_preserved:true,automatic_compile_repair:false};
 writeFileSync('qa/pine/large-edit/executor-draft-setup-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{await disconnect();}

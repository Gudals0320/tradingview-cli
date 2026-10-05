// Bounded, read-only Desktop acceptance scenarios. Raw receipts stay in ignored results/.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {spawnSync,execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {platform,release} from 'node:os';
import {performance} from 'node:perf_hooks';

const {values}=parseArgs({options:{workspace:{type:'string'},document:{type:'string'},scenario:{type:'string',default:'report'},out:{type:'string'},'plot-id':{type:'string'},'request-id':{type:'string'}}});
assert.ok(/^roadmap-46-[abc]$/.test(values.workspace||''),'Use an authorized roadmap QA workspace.');
assert.ok(/^USER;[a-f0-9]+$/.test(values.document||''),'Pass the exact saved QA document ID.');
assert.ok(['report','equity','alerts'].includes(values.scenario),'Choose report, equity or alerts.');
assert.ok(/^[a-zA-Z0-9_-]+\.private\.json$/.test(values.out||''),'Use a new private receipt filename in results/.');
const directory=resolve('results'),file=join(directory,values.out);mkdirSync(directory,{recursive:true});assert.equal(existsSync(file),false,'Preserve existing receipts.');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),calls=[];
function call(args){const started=performance.now(),result=spawnSync(process.execPath,['src/cli/index.js',...args],{encoding:'utf8',timeout:30000,maxBuffer:20*1024*1024});let value;try{value=JSON.parse(result.stdout||result.stderr);}catch{value={success:false,code:'SMOKE_INVALID_JSON'};}calls.push({args,exit:result.status,milliseconds:performance.now()-started,result:value});assert.equal(result.status,0,value.code||'CLI failed');assert.equal(value.success,true,value.code||'CLI observation unsuccessful');return value;}
let summary,success=false;
try{
  call(['status']);const workspace=call(['workspace','show',values.workspace]);assert.equal(workspace.pine,values.document,'Exact QA document changed.');assert.equal(workspace.state,'idle');
  const args=['--workspace',values.workspace],report=call([...args,'data','strategy']);
  if(values.scenario==='report'){
    const properties=call([...args,'strategy','properties']);assert.equal(properties.source_hash,report.source_hash);
    let offset=0,revision,count=0,hasMore=false;
    for(let page=0;page<10;page++){const ledger=call([...args,'data','ledger','--offset',String(offset),'--limit','500',...(revision?['--report-revision',revision]:[])]);revision??=ledger.report_revision;assert.equal(ledger.report_revision,revision);assert.equal(ledger.source_hash,report.source_hash);count+=ledger.trades.length;hasMore=ledger.has_more;if(!hasMore)break;assert.ok(ledger.next_offset>offset);offset=ledger.next_offset;}
    summary={metric_count:report.metric_count,ledger_rows:count,ledger_truncated:hasMore,ledger_snapshot_revision:revision,coverage_completeness:'unknown',currency:report.currency};
  }else if(values.scenario==='equity'){
    assert.ok(/^plot_\d+$/.test(values['plot-id']||''),'Pass the exact owned direct strategy.equity plot ID.');
    const csv=file.replace(/\.private\.json$/,'.private.csv');assert.equal(existsSync(csv),false);
    const equity=call([...args,'data','equity','--plot-id',values['plot-id'],'--limit','10','--export',csv]);assert.ok(existsSync(csv));
    assert.equal(equity.semantic_proof?.verified,true,'Curve arithmetic must be independently verified.');
    summary={preview_rows:equity.data?.length,csv_rows:readFileSync(csv,'utf8').trim().split(/\r?\n/).length-1,semantic_verification:{verified:equity.semantic_proof.verified,closed_checkpoints:equity.semantic_proof.closed_checkpoints,max_observed_error:equity.semantic_proof.max_observed_error,arithmetic_budget:equity.semantic_proof.arithmetic_budget},coverage_completeness:'loaded snapshot only'};
  }else{
    assert.ok(/^[-a-zA-Z0-9_]{1,100}$/.test(values['request-id']||''),'Pass the exact owned QA creation request ID.');
    const alert=call([...args,'alert','strategy-get','--request-id',values['request-id']]),fires=call([...args,'alert','strategy-fires','--request-id',values['request-id'],'--limit','50']);
    summary={settings_verified:alert.settings_verified,snapshot_stale:alert.snapshot_stale,active:alert.active,observed_fires:fires.count,page_full:fires.page_full,coverage_completeness:fires.coverage_completeness};
  }
  success=true;
}finally{writeFileSync(file,JSON.stringify({success,sha,dirty,at:new Date().toISOString(),environment:{node:process.version,os:platform(),release:release()},scenario:values.scenario,summary,calls},null,2),{flag:'wx',mode:0o600});}
console.log(JSON.stringify({success,sha,dirty,scenario:values.scenario,summary,private_receipt:file}));

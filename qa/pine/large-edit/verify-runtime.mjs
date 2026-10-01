// Final read-only checks in split-view Pine editor and the open Pine Logs panel.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const target=process.argv[2];
assert.ok(target,'Supply explicit QA target');
function read(args) {
  const result=spawnSync(process.execPath,['src/cli/index.js','--target',target,...args],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr||result.stdout);
  return JSON.parse(result.stdout);
}
const normalize=s=>s.replaceAll('\r\n','\n');
const local=normalize(readFileSync('qa/pine/large-edit/edited.pine','utf8'));
const actual=normalize(read(['pine','get']).source);
assert.equal(actual,local);
const errors=read(['pine','errors']);
assert.equal(errors.has_errors,false);
const logs=read(['pine','console']).entries.filter(e=>e.message.includes('QA-LARGE-'));
assert.ok(logs.some(e=>e.message.includes('QA-LARGE-EDITED revision=trailing-v2')));
const exitLog=logs.find(e=>e.message.includes('QA-LARGE-EXITS'));
assert.ok(exitLog);
const metrics=Object.fromEntries([...exitLog.message.matchAll(/(moves|breakEven|cooldownBlocks|timeExits|violations)=(\d+)/g)].map(m=>[m[1],Number(m[2])]));
assert.ok(metrics.moves>0 && metrics.breakEven>0 && metrics.cooldownBlocks>0);
assert.equal(metrics.violations,0);
const tables=read(['data','tables','--filter','CLI-QA Large Edit 20261001']);
assert.equal(tables.study_count,1);
const rows=tables.studies[0].tables[0].rows;
assert.equal(rows.length,21);
assert.ok(rows.includes('CLI-QA revision | trailing-v2'));
assert.ok(rows.includes('Ratchet violations | 0'));
const result={mode:'split-view',source_equal:true,sha256_lf:createHash('sha256').update(actual).digest('hex'),
  error_count:errors.error_count,warning_count:errors.warning_count,metrics,logs,table_rows:rows,
  limitation:'Counter instrumentation confirms exercised branches in this run; it is not a bar-by-bar independent oracle. Time-exit counter stayed zero.'};
writeFileSync('qa/pine/large-edit/runtime-evidence.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({source_equal:result.source_equal,sha256_lf:result.sha256_lf,metrics,table_rows:rows.length,log_entries:logs.length}));

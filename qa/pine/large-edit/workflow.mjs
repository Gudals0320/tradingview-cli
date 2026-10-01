// Run a real, sequential development workflow on the explicit disposable layout.
// Usage: node qa/pine/large-edit/workflow.mjs TARGET baseline|edit|finish
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [target, phase] = process.argv.slice(2);
assert.ok(target && ['baseline', 'edit', 'finish'].includes(phase), 'Supply target and phase');
const root = 'qa/pine/large-edit';
const raw = 'results/pine-qa/large-edit';
mkdirSync(raw, { recursive: true });
const evidencePath = `${root}/evidence.json`;
const report = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : {
  base_commit: '6e41546', layout: 'CLI-QA-Pine-20261001', date_kst: '2026-10-01', records: [], assertions: [],
};
const normalize = s => s.replaceAll('\r\n', '\n');
const hash = s => createHash('sha256').update(normalize(s)).digest('hex');
const source = file => normalize(readFileSync(`${root}/${file}.pine`, 'utf8'));
const persist = () => writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
const omit = new Set(['strategy_inputs', 'strategy_id', 'script_id', 'compilation_token', 'tabs', 'scripts']);
function clean(value, key = '') {
  if (key === 'source' && typeof value === 'string' && value.includes('\n')) return { sha256_lf:hash(value), chars:value.length, lines:value.split('\n').length };
  if (key === 'studies' && Array.isArray(value)) return value.some(x=>x.tables)
    ? value.map(x=>({name:x.name,tables:x.tables}))
    : { count:value.length, qa_names:value.filter(x=>x.name?.startsWith('CLI-QA')).map(x=>x.name) };
  if (Array.isArray(value)) return value.map(x=>clean(x));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([k])=>!omit.has(k)).map(([k,v])=>[k,clean(v,k)]));
  return value;
}
function run(label, args, { input, code = 0 } = {}) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ['src/cli/index.js', '--target', target, ...args], {
    encoding:'utf8', input, timeout:65000, maxBuffer:8*1024*1024,
  });
  const record = {label, args, elapsed_ms:Date.now()-started, exit_code:result.status,
    stdout:result.stdout, stderr:result.stderr, error:result.error?.message};
  writeFileSync(`${raw}/${phase}-${label}.json`, JSON.stringify(record,null,2));
  let output;
  try { output = JSON.parse(result.stdout || result.stderr); } catch { output = { parse_error:true }; }
  report.records.push({phase,label,args,elapsed_ms:record.elapsed_ms,exit_code:result.status,output:clean(output)});
  persist();
  console.log(JSON.stringify({phase,label,exit_code:result.status,elapsed_ms:record.elapsed_ms,
    compiled:output.compiled,saved:output.saved,has_errors:output.has_errors,code:output.code,
    error:output.error,error_count:output.error_count,warning_count:output.warning_count}));
  assert.equal(result.status,code,`${label}: ${result.stderr || result.stdout}`);
  return output;
}
function record(name, details) { report.assertions.push({phase,name,...details}); persist(); console.log(JSON.stringify({assertion:name,...details})); }
function assertSource(label, expected) {
  const actual = run(label,['pine','get']).source;
  assert.equal(normalize(actual),expected,`${label}: full source differs`);
  record(label,{equal:true,sha256_lf:hash(actual),lines:expected.split('\n').length,utf8_bytes:Buffer.byteLength(expected)});
}
const name = 'CLI-QA Large Edit 20261001';
const sentinelName = 'CLI-QA Large Edit Sentinel 20261001';
const tabs = run('guard',['tab','list']);
assert.equal(tabs.tabs.find(t=>t.id===target)?.chart_id,'kdn7wAFi');

if (phase === 'baseline') {
  run('new-sentinel',['pine','new','indicator']);
  run('set-sentinel',['pine','set','--file',`${root}/sentinel.pine`]);
  assertSource('get-sentinel',source('sentinel'));
  const sentinel = run('save-sentinel',['pine','save']);
  assert.equal(sentinel.saved,true);
  run('new-strategy',['pine','new','strategy']);
  run('set-baseline',['pine','set','--file',`${root}/baseline.pine`]);
  assertSource('get-baseline',source('baseline'));
  run('analyze-baseline',['pine','analyze','--file',`${root}/baseline.pine`]);
  const checked = run('check-baseline',['pine','check','--file',`${root}/baseline.pine`]);
  assert.equal(checked.compiled,true);
  const saved = run('save-baseline',['pine','save']);
  assert.equal(saved.saved,true);
  writeFileSync(`${raw}/identity.json`,JSON.stringify({primary:saved.script_id,sentinel:sentinel.script_id}));
  const compiled = run('compile-baseline',['pine','compile']);
  assert.equal(compiled.report_ready,true);
  run('errors-baseline',['pine','errors']);
  run('console-baseline',['pine','console']);
  run('tables-baseline',['data','tables','--filter',name]);
  const list = run('list-baseline',['pine','list']);
  assert.ok(list.scripts.some(s=>s.id===saved.script_id && s.name===name));
  record('baseline-saved-listed-compiled',{saved:true,listed:true,report_ready:true});
} else {
  const identity = JSON.parse(readFileSync(`${raw}/identity.json`,'utf8'));
  const opened = run('open-baseline',['pine','open',name]);
  assert.equal(opened.script_id,identity.primary);
  if (phase === 'edit') {
  assertSource('baseline-before-edit',source('baseline'));
  run('set-broken-stdin',['pine','set'],{input:source('broken')});
  assertSource('get-broken',source('broken'));
  run('analyze-broken',['pine','analyze','--file',`${root}/broken.pine`]);
  const checked = run('check-broken',['pine','check','--file',`${root}/broken.pine`],{code:1});
  assert.equal(checked.errors[0].line,120);
  assert.match(checked.errors[0].message,/qa_missing_max/);
  const gated = run('compile-without-save',['pine','compile'],{code:1});
  assert.equal(gated.code,'SAVE_REQUIRED');
  const broken = run('compile-broken',['pine','compile','--save'],{code:1});
  assert.equal(broken.has_errors,true);
  run('errors-broken',['pine','errors'],{code:1});
  const messages = run('console-broken',['pine','console']);
  assert.ok(messages.entries.some(e=>e.type==='error' && /qa_missing_max/.test(e.message)));
  run('set-corrected',['pine','set','--file',`${root}/edited.pine`]);
  assertSource('get-corrected',source('edited'));
  } else {
    assertSource('saved-after-timeout',source('edited'));
    // Explicit workaround, not a product fix: remove only this run's duplicated
    // QA strategy instances, then apply the unchanged saved source once.
    const state = run('before-workaround',['state']);
    const duplicates = state.studies.filter(s=>s.name===name);
    record('manual-workaround',{reason:'error-correction created duplicate QA strategy instances',removed_instances:duplicates.length});
    for (const study of duplicates) run(`remove-qa-${study.id}`,['indicator','remove',study.id]);
  }
  const corrected = run('compile-corrected',['pine','compile','--save']);
  assert.equal(corrected.report_ready,true);
  run('errors-corrected',['pine','errors']);
  const saved = run('save-corrected',['pine','save']);
  assert.equal(saved.saved,true);
  assert.equal(saved.script_id,identity.primary);
  const sentinel = run('open-sentinel',['pine','open',sentinelName]);
  assert.equal(sentinel.script_id,identity.sentinel);
  assertSource('sentinel-unchanged',source('sentinel'));
  const reopened = run('reopen-edited',['pine','open',name]);
  assert.equal(reopened.script_id,identity.primary);
  assertSource('saved-edited-roundtrip',source('edited'));
  const rawCompile = run('raw-compile-alias',['pine','raw-compile']);
  assert.equal(rawCompile.compiled,true);
  assert.equal(rawCompile.unchanged,true);
  run('console-edited',['pine','console']);
  run('tables-edited',['data','tables','--filter',name]);
  const list = run('list-final',['pine','list']);
  assert.equal(list.scripts.filter(s=>s.id===identity.primary && s.name===name).length,1);
  record('edit-roundtrip-complete',{same_document:true,sentinel_unchanged:true,full_source_equal:true,alias_unchanged:true});
}

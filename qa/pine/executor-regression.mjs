// Actual CLI regression on the disposable QA layout only. Raw results stay ignored.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const target = process.argv[2];
if (!target) throw new Error('Supply the explicit QA CDP target ID');
mkdirSync('results/pine-qa', { recursive: true });
const records = [];
function run(label, args, { input, code = 0 } = {}) {
  const start = Date.now();
  const result = spawnSync(process.execPath, ['src/cli/index.js', '--target', target, ...args], {
    encoding: 'utf8', input, timeout: 45000, env: { ...process.env, TV_CDP_TARGET: target },
  });
  const record = { label, args, elapsed_ms: Date.now() - start, exit_code: result.status,
    stdout: result.stdout, stderr: result.stderr };
  writeFileSync(`results/pine-qa/${label}.json`, JSON.stringify(record, null, 2));
  assert.equal(result.status, code, `${label}: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout || result.stderr);
  const sanitized = { ...output };
  for (const key of ['strategy_inputs', 'strategy_id', 'compilation_token', 'script_id', 'source', 'scripts', 'tabs']) delete sanitized[key];
  records.push({ label, args, elapsed_ms: record.elapsed_ms, exit_code: result.status, output: sanitized });
  console.log(JSON.stringify({ label, exit_code: result.status, elapsed_ms: record.elapsed_ms, output: sanitized }));
  return output;
}
const normalize = source => source.replace(/\r\n/g, '\n');
const A = 'CLI-QA-20261001 Indicator', B = 'CLI-QA-20261001 Copy', N = 'CLI-QA-20261001 Executor New';
const tabs = run('executor-layout-guard', ['tab', 'list']);
assert.equal(tabs.tabs.find(tab => tab.id === target)?.chart_id, 'kdn7wAFi');
run('executor-roundtrip-open-a-baseline', ['pine', 'open', A]);
const a = run('executor-roundtrip-a-baseline', ['pine', 'get']).source;
assert.equal(normalize(a).trimEnd(), normalize(readFileSync('qa/pine/indicator.pine', 'utf8')).trimEnd());
run('executor-roundtrip-open-b-baseline', ['pine', 'open', B]);
const b = run('executor-roundtrip-b-baseline', ['pine', 'get']).source;
assert.equal(normalize(b).trimEnd(), normalize(readFileSync('qa/pine/strategy.pine', 'utf8')).trimEnd());
run('executor-unsaved-b-set', ['pine', 'set'], { input: b + '\n// unsaved QA edit' });
run('executor-unsaved-open-a', ['pine', 'open', A]);
assert.equal(normalize(run('executor-unsaved-open-a-get', ['pine', 'get']).source), normalize(a));
run('executor-unsaved-a-set', ['pine', 'set'], { input: a + '\n// unsaved QA edit' });
run('executor-unsaved-new-library', ['pine', 'new', 'library']);
assert.match(run('executor-new-library-get', ['pine', 'get']).source, /library\("MyLibrary"\)/);
run('executor-new-indicator', ['pine', 'new', 'indicator']);
const n = `//@version=6\nindicator("${N}")\nplot(close)\n`;
run('executor-new-set', ['pine', 'set'], { input: n });
const savedNew = run('executor-new-save', ['pine', 'save']);
assert.equal(savedNew.saved, true);
const list = run('executor-new-list', ['pine', 'list']);
assert.ok(list.scripts.some(script => script.name === N));
run('executor-new-reopen', ['pine', 'open', N]);
assert.equal(normalize(run('executor-new-reopen-get', ['pine', 'get']).source), n);
run('executor-new-original-open', ['pine', 'open', A]);
assert.equal(normalize(run('executor-new-original-get', ['pine', 'get']).source), normalize(a));
run('executor-open-b-before-a-save', ['pine', 'open', B]);
run('executor-open-a-from-b', ['pine', 'open', A]);
const changedA = normalize(a) + '// QA save target regression\n';
run('executor-open-a-edit', ['pine', 'set'], { input: changedA });
run('executor-open-a-save', ['pine', 'save']);
run('executor-open-b-after-a-save', ['pine', 'open', B]);
assert.equal(normalize(run('executor-b-preserved-get', ['pine', 'get']).source), normalize(b));
run('executor-open-a-confirm', ['pine', 'open', A]);
assert.equal(normalize(run('executor-a-updated-get', ['pine', 'get']).source), changedA);
run('executor-a-restore-set', ['pine', 'set'], { input: a });
run('executor-a-restore-save', ['pine', 'save']);
run('executor-final-open-copy', ['pine', 'open', B]);
assert.equal(normalize(run('executor-final-get-copy', ['pine', 'get']).source), normalize(b));
run('executor-final-list', ['pine', 'list']);
writeFileSync('qa/pine/executor-evidence.json', JSON.stringify({ target_layout: 'CLI-QA-Pine-20261001', records }, null, 2) + '\n');

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { configureTarget, evaluate, disconnect } from '../../src/connection.js';
const target = process.argv[2];
if (!target) throw new Error('Supply the explicit QA target');
configureTarget(target);
const records = [];
function run(label, args, { code = 0, input } = {}) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ['src/cli/index.js', '--target', target, ...args], {
    encoding: 'utf8', input, timeout: 45000,
  });
  writeFileSync(`results/pine-qa/${label}.json`, JSON.stringify({ args, exit_code: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
  assert.equal(result.status, code, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout || result.stderr);
  const summary = { ...output };
  for (const key of ['strategy_inputs', 'strategy_id', 'script_id', 'compilation_token', 'source', 'entries']) delete summary[key];
  records.push({ label, args, elapsed_ms: Date.now() - started, exit_code: result.status, output: summary });
  console.log(JSON.stringify(records.at(-1)));
  return output;
}
const studies = () => evaluate(`(() => { if (!location.href.includes('/chart/kdn7wAFi/')) throw new Error('Wrong QA layout');
  return window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().model().dataSources().filter(source=>source.metaInfo?.()?.isTVScript).length; })()`);
try {
  run('executor-repeat-open-saved', ['pine', 'open', 'CLI-QA-20261001 Indicator']);
  const original = run('executor-repeat-original-get', ['pine', 'get']).source;
  const savedBefore = await studies();
  const first = run('executor-repeat-saved-first', ['pine', 'compile']);
  const second = run('executor-repeat-saved-second', ['pine', 'compile']);
  const savedAfter = await studies();
  assert.equal(first.compiled, true); assert.equal(second.unchanged, true); assert.equal(savedBefore, savedAfter);
  run('executor-save-required-set', ['pine', 'set'], { input: original + '\n// explicit save permission QA' });
  const required = run('executor-save-required-compile', ['pine', 'compile'], { code: 1 });
  assert.equal(required.code, 'SAVE_REQUIRED');
  const explicit = run('executor-explicit-save-compile', ['pine', 'compile', '--save']);
  assert.equal(explicit.saved, true); assert.ok(explicit.script_id);
  run('executor-repeat-restore-set', ['pine', 'set'], { input: original });
  run('executor-repeat-restore-save', ['pine', 'save']);
  run('executor-repeat-new', ['pine', 'new', 'indicator']);
  run('executor-repeat-new-set', ['pine', 'set'], { input: '//@version=6\nindicator("CLI-QA-20261001 Compile Repeat")\nplot(close)\n' });
  const freshBefore = await studies();
  run('executor-repeat-new-first', ['pine', 'compile']);
  let freshApplied = await studies();
  for (let attempt = 0; freshApplied < freshBefore + 1 && attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200)); freshApplied = await studies();
  }
  const repeated = run('executor-repeat-new-second', ['pine', 'compile']);
  const freshAfter = await studies();
  assert.equal(repeated.unchanged, true); assert.equal(freshApplied, freshBefore + 1); assert.equal(freshAfter, freshApplied);
  run('executor-draft-invalid-set', ['pine', 'set', '--file', 'qa/pine/invalid.pine']);
  const invalid = run('executor-draft-invalid-compile', ['pine', 'compile'], { code: 1 });
  assert.equal(invalid.has_errors, true); assert.equal(invalid.compiled, false);
  const console = run('executor-draft-error-console', ['pine', 'console']);
  assert.ok(console.entries.some(entry => entry.type === 'error' && /qa_missing_function/.test(entry.message)));
  assert.ok(console.entries.some(entry => /오전|오후/.test(entry.timestamp || '')));
  run('executor-draft-warning-set', ['pine', 'set', '--file', 'qa/pine/warning.pine']);
  run('executor-draft-warning-compile', ['pine', 'compile']);
  let warnings;
  for (let attempt = 0; attempt < 25; attempt++) {
    warnings = run('executor-draft-warning-errors', ['pine', 'errors']);
    if (warnings.warning_count > 0) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(warnings.has_errors, false); assert.ok(warnings.warning_count > 0);
  run('executor-draft-corrected-set', ['pine', 'set', '--file', 'qa/pine/indicator.pine']);
  run('executor-draft-corrected-compile', ['pine', 'compile']);
  run('executor-final-copy-open-after-compile', ['pine', 'open', 'CLI-QA-20261001 Copy']);
  const restored = run('executor-final-copy-get-after-compile', ['pine', 'get']).source;
  assert.equal(restored.replace(/\r\n/g, '\n').trimEnd(), readFileSync('qa/pine/strategy.pine', 'utf8').trimEnd());
  writeFileSync('qa/pine/executor-compile-evidence.json', JSON.stringify({
    target_layout: 'CLI-QA-Pine-20261001', saved_indicator_study_count: { before: savedBefore, after: savedAfter },
    fresh_indicator_study_count: { before: freshBefore, first_compile: freshApplied, second_compile: freshAfter }, records,
  }, null, 2) + '\n');
} finally { await disconnect(); }

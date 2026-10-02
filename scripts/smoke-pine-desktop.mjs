import CDP from '../src/cdp.js';
import { CDP_HOST, CDP_PORT } from '../src/config.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withReadOnlySession } from '../src/session.js';
import { findPineController, findPineEditor } from '../src/core/desktop-dom.js';
import { acquireWorkspace, workspaceStatus } from '../src/workspace-store.js';
import { WORKSPACE_PAGE_CODE } from '../src/workspace-page.js';
import { STRATEGY_PAGE_CODE } from '../src/strategy-state.js';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = resolve('results/issue-overhaul');
const summary = { evidence: 'Windows Desktop live natural QA mutations', checks: [] };
const record = name => {
  summary.checks.push({ name, passed: true });
  writeFileSync(join(root, 'smoke-pine-summary.json'), JSON.stringify(summary, null, 2));
  console.log(name);
};
const inventory = await withReadOnlySession(() => getDesktopInventory());
const identities = await withReadOnlySession(() => Promise.all(inventory.tabs.filter(tab => tab.id && tab.is_chart).map(async tab => ({
  tab, name: await inspectTarget(tab, `document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`),
}))));
const matches = identities.filter(item => item.name === 'CLI-QA-I22-A');
assert.equal(matches.length, 1, 'Exactly one dedicated QA-A target is required.');
const qa = matches[0].tab;
const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: qa.id });
const helpers = `const controller=(${findPineController.toString()})(document),editor=(${findPineEditor.toString()})(document);`;
async function ev(expression) {
  const result = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function verifyQA() {
  assert.equal(await ev(`document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`), 'CLI-QA-I22-A');
}
function run(args, { file, timeout = 60000 } = {}) {
  const prefix = file ? ['--workspace', file] : ['--target', qa.id];
  const raw = spawnSync(process.execPath, ['src/cli/index.js', ...prefix, ...args], { encoding: 'utf8', timeout });
  writeFileSync(join(root, 'smoke-pine-private-last.json'), JSON.stringify(raw));
  return { exit: raw.status, value: raw.stdout.trim() ? JSON.parse(raw.stdout) : null, stderr: raw.stderr };
}
async function mutate(args, options = {}) {
  await verifyQA();
  const result = run(args, options);
  assert.equal(result.exit, 0, result.stderr);
  assert.notEqual(result.value?.success, false);
  return result.value;
}
let original, study, workspaceFile, primaryError;
try {
  await verifyQA();
  const saved = run(['pine', 'list']).value?.scripts?.filter(script => script.name === 'CLI-QA-I22-Strategy');
  assert.equal(saved?.length, 1, 'Exactly one saved QA Strategy document is required.');
  original = await ev(`(() => {${helpers};return {source:editor?.editor.getValue(),identity:controller?.getScriptIdVersion(),
    draft:controller?.isDraft(),modified:controller?.isModified(),resolution:window.TradingViewApi._activeChartWidgetWV.value().resolution(),
    paired:controller?._editorRef?.current?._editor === editor?.editor,containers:document.querySelectorAll('.pine-editor-monaco').length};})()`);
  assert.ok(original.source?.includes('CLI-QA-I22-Strategy'), 'Open the saved QA Strategy document before this smoke.');
  assert.equal(original.identity.scriptIdPart, saved[0].id, 'QA document ID must match its exact saved name.');
  assert.equal(original.modified, false, 'Preexisting unsaved QA edits are not overwritten.');
  assert.equal(original.draft, false);
  writeFileSync(join(root, 'restore-strategy.pine'), original.source);
  summary.editor_pairing = { paired: original.paired, containers: original.containers };
  const mismatch = run(['pine', 'save', '--expect-script-id', 'not-the-QA-document']);
  assert.equal(mismatch.exit, 1);
  assert.equal((await ev(`(() => {${helpers};return controller.getScriptIdVersion().version;})()`)), original.identity.version);
  record('expected document mismatch performs no native save');

  const modifiedSource = original.source + '\n// CLI-QA smoke verification\n';
  writeFileSync(join(root, 'smoke-strategy.pine'), modifiedSource);
  await mutate(['pine', 'set', '--file', join(root, 'smoke-strategy.pine')]);
  await ev(`(() => {window.__qaCompileSamples=[];window.__qaCompileTimer=setInterval(()=>{
    ${helpers};const c=window.TradingViewApi._activeChartWidgetWV.value();
    const s=c._chartWidget.model().model().dataSources().find(s=>s.metaInfo?.().isTVScriptStrategy);
    const inputs=s?c.getStudyById(s.id()).getInputValues():[],identity=controller.getScriptIdVersion();
    let status=s?.status?.();if(status?.value)status=status.value();
    window.__qaCompileSamples.push({status:status?.type,phase:window.__tvCliCompilation?.phase,
      matching:String(inputs.find(i=>i.id==='pineVersion')?.value)===String(identity?.version)});
    if(window.__qaCompileSamples.length>3000)window.__qaCompileSamples.shift();
  },5);return true;})()`);
  const compiled = await mutate(['pine', 'compile', '--save', '--expect-script-id', original.identity.scriptIdPart]);
  const samples = await ev('clearInterval(window.__qaCompileTimer);window.__qaCompileSamples');
  const firstPending = samples.findIndex(sample => sample.phase === 'pending');
  const accepted = samples.slice(Math.max(0, firstPending)).filter(sample => sample.phase === 'ready');
  summary.freshness = { samples: samples.length, pending_seen: firstPending >= 0,
    ready_identity_matches: accepted.every(sample => sample.matching && sample.status === 2) };
  await ev('delete window.__qaCompileTimer;delete window.__qaCompileSamples;true');
  assert.equal(compiled.report_ready, true); assert.equal(compiled.persistence_verified, true); assert.ok(compiled.source_hash);
  record('legacy pine set/compile/save proves source and exact saved document');
  const state = await ev(`(() => { const c=window.TradingViewApi._activeChartWidgetWV.value();return c.getAllStudies().map(s=>({id:s.id,inputs:c.getStudyById(s.id).getInputValues(),visible:c.getStudyById(s.id).isVisible()}));})()`);
  study = state.find(item => item.inputs.some(input => input.id === 'pineId' && input.value === original.identity.scriptIdPart));
  assert.ok(study);
  const input = study.inputs.find(item => /^in_/.test(item.id) && Number.isFinite(Number(item.value)));
  assert.ok(input, 'QA strategy needs a numeric input.');
  const invalid = run(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: 25, unknownQA: 30 })]);
  assert.equal(invalid.exit, 1);
  const afterInvalid = run(['indicator', 'get', study.id]);
  assert.equal(afterInvalid.value.inputs.find(item => item.id === input.id).value, input.value);
  const changedValue = typeof input.value === 'string' ? String(Number(input.value) + 1) : Number(input.value) + 1;
  const changed = await mutate(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: changedValue })]);
  assert.equal(changed.report_ready, true);
  assert.equal(run(['indicator', 'get', study.id]).value.inputs.find(item => item.id === input.id).value, changedValue);
  await mutate(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: input.value })]);
  record('unknown indicator inputs fail atomically; valid inputs produce a fresh report');
  const typed = await mutate(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: String(Number(input.value) + 2) })]);
  assert.equal(typed.report_ready, true);
  assert.equal(typeof run(['indicator', 'get', study.id]).value.inputs.find(item => item.id === input.id).value, 'string');
  await mutate(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: input.value })]);
  record('numeric-string input retains native string type (no speculative coercion)');

  await mutate(['indicator', 'toggle', study.id, '--hidden']);
  run(['data', 'strategy']);
  assert.equal(run(['indicator', 'get', study.id]).value.visible, false);
  await mutate(['indicator', 'toggle', study.id, '--visible']);
  record('strategy report read preserves a hidden strategy');
  await mutate(['timeframe', '1m']);
  assert.equal(run(['state']).value.resolution, '1');
  await mutate(['timeframe', original.resolution]);
  record('1m sets one minute and restores the QA timeframe');
  const current = run(['state']).value.symbol;
  const other = current === 'BINANCE:BTCUSDT' ? 'BINANCE:ETHUSDT' : 'BINANCE:BTCUSDT';
  const quote = await mutate(['quote', other]);
  assert.equal(quote.restored, true); assert.equal(run(['state']).value.symbol, current);
  record('qualified quote retrieves another symbol and verifies restoration');

  await mutate(['pine', 'compile', '--expect-script-id', original.identity.scriptIdPart]);
  workspaceFile = join(root, `smoke-${Date.now()}.tvws.json`);
  const layout = qa.chart_id;
  await mutate(['workspace', 'init', '--file', workspaceFile, '--target', qa.id, '--layout', layout, '--pine', original.identity.scriptIdPart]);
  const handle = JSON.parse(readFileSync(workspaceFile, 'utf8'));
  assert.deepEqual(Object.keys(handle).sort(), ['endpoint_key', 'file', 'id', 'schema']);
  const workspaceCompile = await mutate(['pine', 'compile'], { file: workspaceFile });
  assert.equal(workspaceCompile.report_ready, true);
  const report = run(['data', 'strategy'], { file: workspaceFile });
  assert.equal(report.exit, 0, report.stderr); assert.ok(report.value.provenance.source_hash);
  const active = acquireWorkspace(workspaceFile);
  try {
    const owner = { id: active.workspace.id, token: active.workspace.token, nonce: active.workspace.binding.nonce };
    const permit = { inputs: { [input.id]: changedValue } };
    active.checkpoint({ phase: 'observer-smoke', permit });
    const baseline = await ev(`(() => {${WORKSPACE_PAGE_CODE};${STRATEGY_PAGE_CODE};
      startWorkspacePage(window,document,${JSON.stringify(owner)},${JSON.stringify(active.operation)},${JSON.stringify(permit)});
      prepareInputChange(window,${JSON.stringify(study.id)});
      const s=window.TradingViewApi._activeChartWidgetWV.value().getStudyById(${JSON.stringify(study.id)});
      s.setInputValues(s.getInputValues().map(i=>i.id===${JSON.stringify(input.id)}?{...i,value:${JSON.stringify(changedValue)}}:{...i}));
      return JSON.stringify({baseline:window.__tvCliWorkspace.baseline,permit:window.__tvCliWorkspace.permit});})()`);
    const observation = run(['ohlcv', '--count', '2'], { file: workspaceFile });
    assert.equal(observation.exit, 0, observation.stderr); assert.equal(observation.value.provenance.observation, true);
    assert.equal(workspaceStatus(workspaceFile).operation.id, active.operation);
    assert.equal(await ev('JSON.stringify({baseline:window.__tvCliWorkspace.baseline,permit:window.__tvCliWorkspace.permit})'), baseline);
    const finished = await ev(`(() => {${WORKSPACE_PAGE_CODE};return finishWorkspacePage(window,document,${JSON.stringify(owner)},${JSON.stringify(active.operation)});})()`);
    active.saveBinding({ ...active.workspace.binding, snapshot: finished.snapshot });
    for (let attempt = 0; attempt < 200; attempt++) {
      const phase = await ev(`(() => {${STRATEGY_PAGE_CODE};return compilationState(window).phase;})()`);
      if (phase === 'ready') break;
      assert.ok(attempt < 199, 'Observer fixture calculation did not become quiescent.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally { active.finish({ success: true }); }
  await mutate(['indicator', 'set', study.id, '--inputs', JSON.stringify({ [input.id]: input.value })], { file: workspaceFile });
  await mutate(['workspace', 'release', '--file', workspaceFile]); workspaceFile = null;
  record('workspace init/compile/report/active-operation observation/release cycle');

  await mutate(['pine', 'new', 'indicator']);
  await mutate(['pine', 'set', '--file', resolve('scripts/fixtures/smoke-indicator.pine')]);
  await mutate(['pine', 'compile']);
  const draft = await ev(`(() => {${helpers};return {id:controller.getScriptIdVersion()?.scriptIdPart,draft:controller.isDraft(),modified:controller.isModified()};})()`);
  assert.equal(draft.draft, true); assert.equal(draft.modified, false);
  const tables = run(['data', 'tables', '--filter', 'CLI-QA-I22-Smoke-Draft']);
  assert.equal(tables.exit, 0, tables.stderr);
  assert.deepEqual(tables.value.studies[0].tables[0].cells, [['A', '', 'C'], ['D', 'E', 'F']]);
  const labels = run(['data', 'labels', '--filter', 'CLI-QA-I22-Smoke-Draft', '--max', '3', '--verbose']);
  assert.equal(labels.exit, 0, labels.stderr);
  assert.deepEqual(labels.value.studies[0].labels.map(label => label.text), ['0', '1', '2']);
  const values = run(['values']);
  assert.equal(values.exit, 0, values.stderr);
  assert.ok(values.value.studies.every(study => !Object.hasOwn(study.inputs || {}, 'text')));
  record('live tables preserve blank columns, labels use x order, values exclude compiled text');
  const savedDraft = run(['pine', 'save']);
  assert.equal(savedDraft.exit, 1); assert.equal(savedDraft.value.saved, false); assert.equal(savedDraft.value.persistence_kind, 'draft');
  const addedDraft = await ev(`(() => {const c=window.TradingViewApi._activeChartWidgetWV.value();return c.getAllStudies().filter(s=>c.getStudyById(s.id).getInputValues().some(i=>i.id==='pineId'&&i.value===${JSON.stringify(draft.id)})).map(s=>s.id);})()`);
  for (const id of addedDraft) await mutate(['indicator', 'remove', id]);
  await mutate(['pine', 'open', 'CLI-QA-I22-Strategy']);
  record('unmodified QA draft save cannot claim saved-document persistence');
} catch (error) {
  primaryError=error;
  writeFileSync(join(root,'smoke-pine-private-failure.json'),JSON.stringify({error:error.message,stack:error.stack}));
  throw error;
} finally {
  try {
  await ev('clearInterval(window.__qaCompileTimer);delete window.__qaCompileTimer;delete window.__qaCompileSamples;true');
  if (workspaceFile) {
    let status = workspaceStatus(workspaceFile);
    if(status.interrupted){run(['workspace','recover','--file',workspaceFile,'--operation',status.interrupted.operation_id]);status=workspaceStatus(workspaceFile);}
    if (!status.interrupted && !status.operation) run(['workspace', 'release', '--file', workspaceFile]);
  }
  if (original?.source) {
    await verifyQA();
    const now = await ev(`(() => {${helpers};return {id:controller?.getScriptIdVersion()?.scriptIdPart,source:editor?.editor.getValue()};})()`);
    if (now.id === original.identity.scriptIdPart && now.source !== original.source) {
      await mutate(['pine', 'set', '--file', join(root, 'restore-strategy.pine')]);
      await mutate(['pine', 'compile', '--save', '--expect-script-id', original.identity.scriptIdPart]);
    }
  }
  } catch(cleanup) {
    writeFileSync(join(root,'smoke-pine-private-cleanup.json'),JSON.stringify({error:cleanup.message}));
    if(!primaryError)throw cleanup;
  }
  await client.close();
  writeFileSync(join(root, 'smoke-pine-summary.json'), JSON.stringify(summary, null, 2));
}

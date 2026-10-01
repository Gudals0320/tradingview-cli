import CDP from '../src/cdp.js';
import { CDP_HOST, CDP_PORT } from '../src/config.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withReadOnlySession, sessionStatus, sourceHash } from '../src/session.js';
import { reserveWorkspace, acquireWorkspace, releaseWorkspace } from '../src/workspace-store.js';
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { findPineController, findPineEditor } from '../src/core/desktop-dom.js';

const root = resolve('results/issue-overhaul');
mkdirSync(root, { recursive: true });
const output = { evidence: 'Windows Desktop live natural + explicitly labeled injection', checks: [] };
const check = (name, evidence, action) => {
  action(); output.checks.push({ name, evidence, passed: true });
};
const inventory = await withReadOnlySession(() => getDesktopInventory());
const names = new Map(await withReadOnlySession(() => Promise.all(inventory.tabs.filter(tab => tab.is_chart && tab.id).map(async tab => [tab.id,
  await inspectTarget(tab, `document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`),
]))));
const qaTabs = inventory.tabs.filter(tab => names.get(tab.id) === 'CLI-QA-I22-A');
assert.equal(qaTabs.length, 1, 'Open exactly one dedicated saved CLI-QA-I22-A tab before smoke.');
const qa = qaTabs[0];
const identity = await withReadOnlySession(() => inspectTarget(qa, `({
  qa: document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0] === 'CLI-QA-I22-A',
  lang: document.documentElement.lang,
  layout: window.location.pathname.split('/')[2]
})`));
assert.equal(identity.qa, true, 'Dedicated QA layout identity required.');
output.language = identity.lang;
const version = await CDP.Version({ host: CDP_HOST, port: CDP_PORT });
output.environment = { node: process.version, platform: process.platform,
  desktop: version['User-Agent']?.match(/TradingView\/([\d.]+)/)?.[1],
  electron: version['User-Agent']?.match(/Electron\/([\d.]+)/)?.[1], browser: version.Browser };

const protectedTabs = inventory.tabs.filter(tab => tab.is_chart && !names.get(tab.id)?.startsWith('CLI-QA-I22-'));
async function protectedState() {
  return withReadOnlySession(() => Promise.all(protectedTabs.map(async tab => sourceHash(JSON.stringify(
    await inspectTarget(tab, `(() => {const c=window.TradingViewApi._activeChartWidgetWV.value();
      const controller=(${findPineController.toString()})(document),editor=(${findPineEditor.toString()})(document);
      return {symbol:c.symbol(),resolution:c.resolution(),type:c.chartType(),studies:c.getAllStudies().map(s=>s.id),
        pane_count:window.TradingViewApi._chartWidgetCollection.getAll().length,
        layout_name:document.querySelector('[data-qa-id="save-load-button"]')?.innerText,
        modified:controller?.isModified?.() ?? null,source:editor?.editor.getValue() || null};})()`)
  )))));
}
const before = await protectedState();
async function qaStateHash() {
  const page = await withReadOnlySession(() => inspectTarget(qa, `(() => {
    const c=window.TradingViewApi._activeChartWidgetWV.value(),controller=(${findPineController.toString()})(document);
    return { symbol:c.symbol(),resolution:c.resolution(),type:c.chartType(),
      panes:window.TradingViewApi._chartWidgetCollection.getAll().map(p=>({symbol:p.model().mainSeries().symbol(),resolution:p.model().mainSeries().interval()})),
      studies:c.getAllStudies().map(s=>({id:s.id,visible:c.getStudyById(s.id).isVisible()})),
      layout:document.querySelector('[data-qa-id="save-load-button"]')?.innerText,
      modified:controller?.isModified?.() ?? null,
      editor_visible:Array.from(document.querySelectorAll('.pine-editor-monaco')).some(node=>node.offsetParent!==null),
      widgets:Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"],button[aria-pressed="true"]')).map(node=>node.getAttribute('data-name')||node.getAttribute('aria-label')) };
  })()`));
  const tabs = await withReadOnlySession(() => getDesktopInventory());
  return sourceHash(JSON.stringify({ page, active_tabs: tabs.tabs.filter(tab => tab.active).map(tab => tab.id) }));
}
function cli(args, env = process.env, timeout = 60000) {
  const result = spawnSync(process.execPath, ['src/cli/index.js', '--target', qa.id, ...args], {
    encoding: 'utf8', env, timeout,
  });
  writeFileSync(join(root, 'smoke-private-last.json'), JSON.stringify(result));
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr,
    value: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}

try {
  const chartState = cli(['state']);
  assert.equal(chartState.exit, 0);
  const readInvocations = [['state'], ['info'], ['ohlcv', '--count', '2'], ['values'], ['quote'],
    ['data', 'lines'], ['data', 'labels'], ['data', 'tables'], ['data', 'boxes'],
    ['data', 'strategy'], ['data', 'trades'], ['data', 'ledger'], ['data', 'equity'], ['data', 'depth'],
    ['pine', 'get'], ['pine', 'errors'], ['pine', 'console'], ['pine', 'list'], ['alert', 'list'],
    ['watchlist', 'get'], ['tab', 'list'], ['layout', 'list'], ['pane', 'list'], ['draw', 'list'],
    ['replay', 'status'], ['discover'], ['ui-state'], ['range'], ['symbol'], ['timeframe'], ['type']];
  if (chartState.value.studies.length) {
    readInvocations.push(['indicator', 'get', chartState.value.studies[0].id], ['data', 'indicator', chartState.value.studies[0].id]);
  }
  for (const args of readInvocations) {
    const prior = await qaStateHash();
    const read = cli(args);
    const after = await qaStateHash();
    check(`pure read preserves QA state: ${args.slice(0, 2).join(' ')}`, 'live natural before/after hash', () => assert.equal(after, prior));
    output.checks.at(-1).exit = read.exit; // Missing graphics/panels/reports remain explicit failures.
    if (args[0] === 'ohlcv' && read.exit === 0) assert.equal(read.value.context.target_id, qa.id);
  }
  check('strict positional rejection before CDP', 'live natural CLI', () => assert.equal(cli(['ohlcv', 'AAPL']).exit, 1));
  const isolated = mkdtempSync(join(root, 'stream-'));
  const childCode = `const timer=setInterval(()=>{if(process.listenerCount('SIGINT')){
    clearInterval(timer);setTimeout(()=>process.emit('SIGINT'),800);}},25);await import('./src/cli/index.js');`;
  const stream = spawnSync(process.execPath, ['--input-type=module', '-e', childCode, 'dummy',
    '--target', qa.id, 'stream', 'quote', '--interval', '200'], {
    encoding: 'utf8', timeout: 20000, env: { ...process.env, TEMP: isolated, TMP: isolated },
  });
  writeFileSync(join(root, 'smoke-stream-private.json'), JSON.stringify(stream));
  const options = { directory: join(isolated, 'tradingview-cli-sessions') };
  check('child SIGINT handler releases stream lease and emits JSONL only', 'live natural CLI with emitted SIGINT handler', () => {
    assert.equal(stream.status, 0, stream.stderr);
    assert.equal(sessionStatus(options).locked, false);
    assert.equal(sessionStatus(options).recovery_required, false);
    const records = stream.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.ok(records.length > 0);
    assert.ok(records.every(record => record._stream === 'quote'));
  });
  const resource = reserveWorkspace({ file: join(isolated, 'qa.tvws.json'), target: qa.id, layout: identity.layout, pine: 'isolated-admission-fixture' }, options);
  check('workspace admission succeeds after stream exit', 'real filesystem admission', () => assert.ok(resource.id));
  releaseWorkspace(acquireWorkspace(resource.file, options), options);
  const killedRoot = mkdtempSync(join(root, 'killed-read-'));
  const child = spawn(process.execPath, ['src/cli/index.js', '--target', qa.id, 'stream', 'quote', '--interval', '200'], {
    env: { ...process.env, TEMP: killedRoot, TMP: killedRoot }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', code => { if (code) reject(new Error('Read stream exited before hard-kill fixture.')); });
  });
  child.kill('SIGKILL');
  await new Promise(resolve => child.once('exit', resolve));
  const killedOptions = { directory: join(killedRoot, 'tradingview-cli-sessions') };
  check('hard-killed pure stream leaves no recovery journal', 'live OS hard kill during pure polling', () => {
    assert.equal(sessionStatus(killedOptions).recovery_required, false);
    assert.equal(sessionStatus(killedOptions).owner_alive, false);
  });
  const killedResource = reserveWorkspace({ file: join(killedRoot, 'qa.tvws.json'), target: qa.id, layout: identity.layout, pine: 'killed-read-fixture' }, killedOptions);
  releaseWorkspace(acquireWorkspace(killedResource.file, killedOptions), killedOptions);
  check('workspace admission reclaims hard-killed pure stream lease', 'real filesystem admission', () => assert.equal(sessionStatus(killedOptions).locked, false));
  const nativeRoot = mkdtempSync(join(root, 'killed-native-'));
  const nativeCode = `import {acquireSession,withLegacySession} from './src/session.js';
    import {configureTarget,evaluateAsync} from './src/connection.js';
    const lease=acquireSession({command:'smoke injected native'});configureTarget(${JSON.stringify(qa.id)});
    await withLegacySession(lease,()=>evaluateAsync('(()=>{window.__qaPreviousSave=window.__tvCliSave;window.__tvCliSave={pending:true,token:"smoke-injected"};return window.__qaRetainedNative=new Promise(resolve=>{window.__qaResolveNative=resolve;});})()', {mutation:true}));`;
  const nativeChild = spawn(process.execPath, ['--input-type=module', '-e', nativeCode], {
    env: { ...process.env, TEMP: nativeRoot, TMP: nativeRoot }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const nativeClient = await CDP({ host: CDP_HOST, port: CDP_PORT, target: qa.id });
  try {
    let pending = false;
    for (let i = 0; i < 50; i++) {
      const state = await nativeClient.Runtime.evaluate({ expression: 'Boolean(window.__qaRetainedNative)', returnByValue: true });
      if (state.result?.value) { pending = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(pending, true, 'Injected native dispatch did not start.');
    nativeChild.kill('SIGKILL'); await new Promise(resolve => nativeChild.once('exit', resolve));
    const nativeOptions = { directory: join(nativeRoot, 'tradingview-cli-sessions') };
    const state = sessionStatus(nativeOptions);
    const env = { ...process.env, TEMP: nativeRoot, TMP: nativeRoot };
    check('hard-killed pending native mutation retains exact-target fence', 'live injected retained page promise + OS hard kill', () => {
      assert.equal(state.recovery_required, true);
      assert.equal(cli(['session', 'recover', '--run-id', state.recovery_run_id], env).exit, 1);
      assert.equal(sessionStatus(nativeOptions).recovery_required, true);
    });
    await nativeClient.Runtime.evaluate({ expression: 'window.__tvCliSave.pending=false;window.__qaResolveNative();', returnByValue: true });
    const recovered = cli(['session', 'recover', '--run-id', state.recovery_run_id], env);
    check('quiescent native recovery succeeds without reload', 'live injected recovery', () => {
      assert.equal(recovered.exit, 0, recovered.stderr);
      assert.equal(recovered.value.incomplete, true);
      assert.equal(sessionStatus(nativeOptions).recovery_required, false);
    });
  } finally {
    if (nativeChild.exitCode === null) nativeChild.kill('SIGKILL');
    await nativeClient.Runtime.evaluate({ expression: 'window.__qaResolveNative?.();window.__tvCliSave=window.__qaPreviousSave;delete window.__qaPreviousSave;delete window.__qaRetainedNative;delete window.__qaResolveNative;', returnByValue: true });
    await nativeClient.close();
  }
  for (const script of ['scripts/smoke-pine-desktop.mjs', 'scripts/smoke-layout-desktop.mjs']) {
    const phase = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 300000 });
    writeFileSync(join(root, script.includes('pine') ? 'smoke-pine-private-run.json' : 'smoke-layout-private-run.json'), JSON.stringify(phase));
    assert.equal(phase.status, 0, phase.stderr);
    check(script.includes('pine') ? 'full dedicated Pine/workspace regression phase' : 'full dedicated layout/dialog regression phase',
      script.includes('pine') ? 'live natural QA + explicitly held workspace operation' : 'live natural QA + explicitly labeled layout injections', () => {});
  }
} finally {
  const after = await protectedState();
  output.protected_tabs = { count: before.length, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  assert.equal(output.protected_tabs.unchanged, true, 'Protected personal chart state changed.');
  writeFileSync(join(root, 'smoke-summary.json'), JSON.stringify(output, null, 2));
}
console.log(JSON.stringify(output, null, 2));

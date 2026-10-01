import CDP from '../src/cdp.js';
import { CDP_HOST, CDP_PORT } from '../src/config.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withReadOnlySession, sessionStatus, sourceHash } from '../src/session.js';
import { reserveWorkspace, acquireWorkspace, releaseWorkspace } from '../src/workspace-store.js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

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
      return {symbol:c.symbol(),resolution:c.resolution(),type:c.chartType(),studies:c.getAllStudies().map(s=>s.id)};})()`)
  )))));
}
const before = await protectedState();
function cli(args, env = process.env, timeout = 60000) {
  const result = spawnSync(process.execPath, ['src/cli/index.js', '--target', qa.id, ...args], {
    encoding: 'utf8', env, timeout,
  });
  writeFileSync(join(root, 'smoke-private-last.json'), JSON.stringify(result));
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr,
    value: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}

try {
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
} finally {
  const after = await protectedState();
  output.protected_tabs = { count: before.length, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  assert.equal(output.protected_tabs.unchanged, true, 'Protected personal chart state changed.');
  writeFileSync(join(root, 'smoke-summary.json'), JSON.stringify(output, null, 2));
}
console.log(JSON.stringify(output, null, 2));

import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
import { readOwnedFeeds } from '../src/core/stream.js';
import { normalizeTimeframe, symbolMatches } from '../src/chart-context.js';
const name = process.argv[2] || 'executor-feeds';
function call(args) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
call(['status']);
call(['--workspace', name, 'pane', 'symbol', '1', 'BINANCE:ETHUSDT']);
call(['--workspace', name, 'pane', 'focus', '0']);
const frames = [], events = [], child = spawn(process.execPath, ['src/cli/index.js', '--workspace', name, 'stream', 'ohlcv', 'BINANCE:SOLUSDT@60', 'BITSTAMP:BTCUSD@60', '--interval', '100']);
let buffer = '', stderr = '';
child.stdout.on('data', chunk => { buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop(); for (const line of lines) if (line.trim()) frames.push(JSON.parse(line)); });
child.stderr.on('data', chunk => stderr += chunk);
const stopped = new Promise(resolve => child.once('close', (exit, signal) => resolve({ exit, signal })));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 150; i++) { if (fn()) return; await sleep(100); } throw new Error('Stream frame condition did not occur: ' + stderr); }
try {
  await until(() => frames.length > 0);
  const mutation = spawn(process.execPath, ['src/cli/index.js', '--workspace', name, 'pane', 'symbol', '1', 'BITSTAMP:BTCUSD']);
  let out = '', err = ''; mutation.stdout.on('data', c => out += c); mutation.stderr.on('data', c => err += c);
  const exit = await new Promise(resolve => mutation.once('close', resolve)); assert.equal(exit, 0, err);
  assert.equal(JSON.parse(out).pane_verified, true);
  await until(() => frames.some(frame => frame.success));
  for (const frame of frames) for (const feed of frame.feeds) if (feed.status !== 'ok') assert.equal(feed.open, undefined);
  events.push(...stderr.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)));
} finally { child.kill('SIGTERM'); }
const ended = await stopped;
const workspace = loadWorkspace(resolveWorkspace(name));
let activeLoadingHealthy = false;
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  call(['--workspace', name, 'pane', 'focus', '0']);
  const mutation = spawn(process.execPath, ['src/cli/index.js', '--workspace', name, 'pane', 'symbol', '0', 'BINANCE:ADAUSDT']);
  let err = ''; mutation.stderr.on('data', c => err += c); mutation.stdout.resume();
  let done = false;
  const changed = new Promise(resolve => mutation.once('close', code => { done = true; resolve(code); }));
  for (let i = 0; i < 150 && !done; i++) {
    const probe = await evaluate(`(() => {${normalizeTimeframe.toString()};${symbolMatches.toString()};
      return {active_loading:window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().isLoading(),
        sample:(${readOwnedFeeds.toString()})(window,[{key:'BITSTAMP:BTCUSD@60',symbol:'BITSTAMP:BTCUSD',timeframe:'60'}])};})()`);
    if (probe.active_loading === true && probe.sample.success === true) activeLoadingHealthy = true;
    await sleep(10);
  }
  assert.equal(await changed, 0, err);
  call(['--workspace', name, 'pane', 'symbol', '0', 'BINANCE:SOLUSDT']);
}); } finally { await disconnect(); }
console.log(JSON.stringify({ success: true, frames: frames.map(frame => ({ success: frame.success, partial_success: frame.partial_success, feeds: frame.feeds.map(feed => ({ feed: feed.feed, status: feed.status, code: feed.code, series_symbol: feed.series_symbol, has_price: feed.open !== undefined })) })),
  loading_observed: frames.some(frame => frame.feeds.some(feed => feed.status === 'loading')), active_loading_secondary_healthy: activeLoadingHealthy, structured_stderr: events.every(event => typeof event === 'object'), ended }));

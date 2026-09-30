/** Run verified, exclusive Pine experiments with an on-disk recovery journal. */
import { parseArgs } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chart from '../src/core/chart.js';
import * as pine from '../src/core/pine.js';
import * as data from '../src/core/data.js';
import * as tabs from '../src/core/tab.js';
import * as connection from '../src/connection.js';
import * as session from '../src/session.js';
import { readChartContext, contextMatches, normalizeTimeframe } from '../src/chart-context.js';

const PREFIX = 'TV CLI Example SMA ';
const template = readFileSync(new URL('./sma-crossover.pine', import.meta.url), 'utf8');
const DEFAULT_API = { chart, pine, data, tabs, connection, session };

export function createStrategy({ fast, slow, start, end, runId }) {
  if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 1 || slow <= fast) throw new Error('Require integer SMA lengths with 0 < fast < slow');
  const begin = Date.parse(start), finish = Date.parse(end);
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || begin >= finish) throw new Error('Require a valid start before end');
  const title = `${PREFIX}${fast}-${slow}`;
  const reportTitle = runId ? `${title} [${runId.slice(0, 12)}]` : title;
  return { title, reportTitle,
    source: template.replace('"TV CLI Example SMA"', JSON.stringify(reportTitle))
      .replace('input.int(10,', `input.int(${fast},`).replace('input.int(30,', `input.int(${slow},`)
      .replace('input.time(0,', `input.time(${begin},`)
      .replace('input.time(timestamp("01 Jan 2100 00:00 +0000"),', `input.time(${finish},`),
  };
}

export function verifyHistory(report, options) {
  const from = report.backtest_window?.from || report.loaded_window?.from;
  const to = report.backtest_window?.to || report.loaded_window?.to;
  const tf = normalizeTimeframe(options.timeframe);
  const duration = /^\d+$/.test(tf) ? Number(tf) * 60000 : tf.endsWith('D') ? parseInt(tf) * 86400000 : tf.endsWith('W') ? parseInt(tf) * 604800000 : 0;
  const complete = Boolean(from && to && Date.parse(from) <= Date.parse(options.start)
    && (() => { const end = new Date(to); if (/^\d+M$/.test(tf)) end.setUTCMonth(end.getUTCMonth() + parseInt(tf));
      else end.setTime(end.getTime() + duration); return end.getTime() >= Date.parse(options.end); })());
  if (!complete && !options.allowPartialHistory) throw new Error(`Requested history is not covered: requested ${options.start}..${options.end}; actual ${from || 'unknown'}..${to || 'unknown'}.`);
  return { complete, actual: { from: from || null, to: to || null }, warnings: complete ? [] : ['Requested history is only partially covered.'] };
}

export function resolveRecoveryTarget(snapshot, tabs, explicitTargetId) {
  const usable = tabs.filter(tab => tab.id && tab.resolved !== false);
  if (explicitTargetId) {
    const explicit = usable.find(tab => tab.id === explicitTargetId);
    if (!explicit || (snapshot.chart_id && explicit.chart_id !== snapshot.chart_id)) throw new Error('The recovery --target-id must identify an open tab of the recorded chart layout.');
    return explicit;
  }
  const recorded = usable.find(tab => tab.id === snapshot.target_id && (!snapshot.chart_id || tab.chart_id === snapshot.chart_id));
  if (recorded) return recorded;
  const native = usable.filter(tab => snapshot.shell_tab_id && tab.shell_tab_id === snapshot.shell_tab_id
    && (!snapshot.window_id || tab.window_id === snapshot.window_id)
    && (!snapshot.chart_id || tab.chart_id === snapshot.chart_id));
  if (native.length === 1) return native[0];
  const layouts = usable.filter(tab => snapshot.chart_id && tab.chart_id === snapshot.chart_id);
  if (layouts.length === 1) return layouts[0];
  throw new Error(layouts.length ? `Recovery layout is ambiguous. Repeat --recover with --target-id chosen from: ${layouts.map(tab => tab.id).join(', ')}`
    : `Recovery target is unavailable. Open recorded layout ${snapshot.chart_id || snapshot.target_id}, inspect tv tab list, then retry --recover; or abandon restoration with tv session discard --run-id ${snapshot.run_id}`);
}

async function restoreSnapshot(snapshot, api, explicitTargetId) {
  const errors = [];
  const attempt = async (name, action) => { try { await action(); } catch (error) { errors.push(`${name}: ${error.message}`); } };
  const available = await api.tabs.list();
  const target = resolveRecoveryTarget(snapshot, available.tabs, explicitTargetId);
  await api.tabs.switchTab({ target_id: target.id });
  if (snapshot.before_chart) {
    await attempt('owned studies', async () => {
      const current = await api.chart.getState();
      for (const study of current.studies.filter(item => item.name.startsWith(PREFIX) && item.name.includes('[' + snapshot.run_id.slice(0, 12) + ']') && !snapshot.before_chart.studies.some(old => old.id === item.id))) {
        await api.chart.manageIndicator({ action: 'remove', entity_id: study.id });
      }
    });
    if (typeof snapshot.source_before === 'string') await attempt('editor draft', async () => {
      const current = (await api.pine.getSource()).source;
      const hash = session.sourceHash(current);
      if (!(snapshot.owned_source_hashes || [snapshot.last_source_hash]).includes(hash) && hash !== session.sourceHash(snapshot.source_before)) throw new Error(`Draft changed outside this run; refusing to overwrite it. Preserve the current draft manually before restoring the recorded one, or abandon restoration with tv session discard --run-id ${snapshot.run_id}`);
      await api.pine.setSource({ source: snapshot.source_before });
      if ((await api.pine.getSource()).source !== snapshot.source_before) throw new Error('Restored draft did not match.');
    });
    await attempt('chart settings', async () => {
      const current = await api.chart.getState();
      const old = snapshot.before_chart;
      const matches = value => current.symbol === value.symbol && normalizeTimeframe(current.resolution) === normalizeTimeframe(value.resolution) && current.chartType === value.chartType;
      const allowed = [old, ...(snapshot.owned_chart_states || []), snapshot.owned_chart].filter(Boolean);
      if (!allowed.some(matches)) throw new Error(`Chart changed outside this run; refusing to overwrite it. Current: ${JSON.stringify({ symbol: current.symbol, resolution: current.resolution, chartType: current.chartType })}. Set the chart manually to one of the recorded allowed states before retrying --recover: ${JSON.stringify(allowed.map(value => ({ symbol: value.symbol, resolution: value.resolution, chartType: value.chartType })))}; or abandon restoration with tv session discard --run-id ${snapshot.run_id}`);
      if (current.symbol !== old.symbol) await api.chart.setSymbol({ symbol: old.symbol });
      if (current.resolution !== old.resolution) await api.chart.setTimeframe({ timeframe: old.resolution });
      if (current.chartType !== old.chartType) await api.chart.setType({ chart_type: String(old.chartType) });
      const final = await api.chart.getState();
      if (final.symbol !== old.symbol || normalizeTimeframe(final.resolution) !== normalizeTimeframe(old.resolution) || final.chartType !== old.chartType) throw new Error('Restored chart settings did not match.');
    });
  }
  await attempt('active tab', async () => {
    if (snapshot.pine_panel_before === false && api.pine.closePanel) {
      const closed = await api.pine.closePanel(); if (!closed.closed) throw new Error(closed.error);
    }
    if (snapshot.original_active_target_id && snapshot.original_active_target_id !== snapshot.target_id) {
      const original = resolveRecoveryTarget(snapshot.original_active_tab || { target_id: snapshot.original_active_target_id }, available.tabs);
      await api.tabs.switchTab({ target_id: original.id });
    }
  });
  if (errors.length) throw new Error(errors.join('; '));
}

export async function runBatch(options, api = DEFAULT_API) {
  if (!options.recover && !options.chartId && !options.targetId) throw new Error('An explicit --chart-id or --target-id is required; use a separate disposable layout');
  const lease = (api.session || session).acquireSession({ recover: Boolean(options.recover) });
  let snapshot = null, failure = null, restored = false, recoveryAttempted = false;
  const results = [];
  const stop = () => { if (options.signal?.aborted) throw new Error('Batch interrupted; restoring the saved snapshot.'); };
  try {
    if (options.recover) {
      snapshot = lease.pending()?.snapshot;
      if (!snapshot) throw new Error('There is no pending recovery snapshot.');
      recoveryAttempted = true;
      await restoreSnapshot(snapshot, api, options.targetId); restored = true; snapshot = null;
      return { success: true, recovered: true, restored: true, results: [] };
    }
    const listed = await api.tabs.list();
    const matching = listed.tabs.filter(tab => options.targetId ? tab.id === options.targetId : tab.chart_id === options.chartId);
    if (matching.length !== 1) throw new Error(matching.length ? 'Duplicate chart layouts are open; use a unique --target-id.' : 'The specified chart layout is not open in TradingView Desktop');
    const target = matching[0];
    if (!target.id || target.resolved === false) throw new Error('The requested tab cannot be resolved unambiguously.');
    const active = listed.tabs.find(tab => tab.active && tab.window_id === target.window_id);
    const identity = tab => tab ? { target_id: tab.id, chart_id: tab.chart_id, shell_tab_id: tab.shell_tab_id, window_id: tab.window_id } : null;
    snapshot = { run_id: lease.run_id, ...identity(target),
      original_active_target_id: active?.id || null, original_active_tab: identity(active) };
    lease.checkpoint({ phase: 'selecting', snapshot });
    await api.tabs.switchTab({ target_id: target.id });
    const viewport = await api.connection.evaluate('({width:innerWidth,height:innerHeight})');
    if (!viewport.width || !viewport.height) throw new Error('Show TradingView Desktop; its chart viewport has zero size');
    const existing = await api.connection.evaluate(`(() => {
      const chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      return chart.model().model().dataSources().filter(s => { const info=s.metaInfo?.(); return info?.isTVScriptStrategy || info?.is_strategy; }).map(s => s.metaInfo().description);
    })()`);
    if (existing.length) throw new Error('Remove existing strategies from this disposable layout before running the example');
    snapshot.before_chart = await api.chart.getState();
    snapshot.owned_chart_states = [];
    snapshot.pine_panel_before = api.pine.getPanelState ? (await api.pine.getPanelState()).open : null;
    snapshot.source_before = (await api.pine.getSource()).source;
    snapshot.last_source_hash = session.sourceHash(snapshot.source_before);
    snapshot.owned_source_hashes = [];
    lease.checkpoint({ phase: 'prepared', snapshot });
    options = { ...options, timeframe: normalizeTimeframe(options.timeframe) };
    const variants = [[10, 30], [20, 60]].map(([fast, slow]) => createStrategy({ fast, slow, start: options.start, end: options.end, runId: lease.run_id }));
    stop();
    if (snapshot.before_chart.symbol !== options.symbol) {
      snapshot.owned_chart_states.push({ ...snapshot.before_chart, symbol: options.symbol });
      lease.checkpoint({ phase: 'configuring-symbol', snapshot });
      await api.chart.setSymbol({ symbol: options.symbol });
      snapshot.owned_chart = await api.chart.getState(); lease.checkpoint({ phase: 'configured-symbol', snapshot });
    }
    if (snapshot.before_chart.resolution !== options.timeframe) {
      snapshot.owned_chart_states.push({ ...(snapshot.owned_chart || snapshot.before_chart), resolution: options.timeframe });
      lease.checkpoint({ phase: 'configuring-timeframe', snapshot });
      await api.chart.setTimeframe({ timeframe: options.timeframe });
      snapshot.owned_chart = await api.chart.getState(); lease.checkpoint({ phase: 'configured-timeframe', snapshot });
    }
    if (snapshot.before_chart.chartType !== 1) {
      snapshot.owned_chart_states.push({ ...(snapshot.owned_chart || snapshot.before_chart), chartType: 1 });
      lease.checkpoint({ phase: 'configuring-type', snapshot });
      await api.chart.setType({ chart_type: 'Candles' });
    }
    snapshot.owned_chart = await api.chart.getState(); lease.checkpoint({ phase: 'configured', snapshot });
    const inspectContext = async () => {
      stop();
      const current = await api.connection.evaluate(`(${readChartContext.toString()})(window)`);
      if (!contextMatches(options, current) || current.chart_type !== 1 || !current.bar_count) throw new Error('Experiment symbol/timeframe/type/feed changed; refusing mixed results.');
      if (session.sourceHash((await api.pine.getSource()).source) !== snapshot.last_source_hash) throw new Error('Experiment source changed; refusing mixed results.');
      return current;
    };
    for (const variant of variants) {
      stop(); await inspectContext();
      const current = await api.chart.getState();
      for (const study of current.studies.filter(item => item.name.startsWith(PREFIX))) await api.chart.manageIndicator({ action: 'remove', entity_id: study.id });
      snapshot.last_source_hash = session.sourceHash(variant.source);
      snapshot.owned_source_hashes.push(snapshot.last_source_hash);
      lease.checkpoint({ phase: 'writing-source', snapshot });
      await api.pine.setSource({ source: variant.source }); await inspectContext();
      const compile = await api.pine.smartCompile();
      if (!compile.success || compile.has_errors || compile.runtime_error) throw new Error(`Pine compilation failed: ${compile.error || JSON.stringify(compile.errors)}`);
      stop();
      const report = await api.data.getStrategyResults({ strategy_id: compile.strategy_id, strategy: variant.reportTitle });
      if (!report.success || report.strategy !== variant.reportTitle || report.compilation_token !== compile.compilation_token
        || report.source_hash !== snapshot.last_source_hash || !contextMatches(options, report.context) || report.context.chart_type !== 1
        || JSON.stringify(report.strategy_inputs || []) !== JSON.stringify(compile.strategy_inputs || [])) throw new Error('Requested fresh strategy report was not verified; refusing stale results');
      const history = verifyHistory(report, options);
      const orders = await api.data.getTrades({ max_trades: 10, strategy_id: report.strategy_id });
      await inspectContext();
      results.push({ strategy: variant.title, report_strategy: variant.reportTitle, run_id: lease.run_id,
        symbol: report.context.symbol, timeframe: report.context.resolution, currency: report.currency,
        metrics: report.metrics, units: report.units, backtest_window: report.backtest_window,
        trade_window: report.trade_window, history_coverage: history, warnings: compile.warnings || [],
        recentOrders: orders.trades, totalOrders: orders.total_orders });
    }
  } catch (error) { failure = error; }
  finally {
    try { if (!recoveryAttempted) { if (snapshot) await restoreSnapshot(snapshot, api); restored = true; } }
    catch (error) { failure = new Error([failure?.message, `Recovery failed: ${error.message}. Inspect tv session status / tv tab list before retrying --recover.`].filter(Boolean).join('; ')); }
    lease.release({ restored });
  }
  if (failure) throw failure;
  return { symbol: options.symbol, timeframe: options.timeframe, start: options.start, endExclusive: options.end,
    results, run_id: lease.run_id, restored };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
  try {
    const { values } = parseArgs({ options: {
      'chart-id': { type: 'string' }, 'target-id': { type: 'string' }, symbol: { type: 'string', default: 'BINANCE:BTCUSDT' },
      timeframe: { type: 'string', default: '60' }, start: { type: 'string' }, end: { type: 'string' },
      recover: { type: 'boolean' }, 'allow-partial-history': { type: 'boolean' },
      out: { type: 'string', default: 'results/pine-batch.json' },
    } });
    const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
    const end = values.end || midnight.toISOString();
    const start = values.start || new Date(Date.parse(end) - 60 * 86400000).toISOString();
    const result = await runBatch({ chartId: values['chart-id'], targetId: values['target-id'], symbol: values.symbol,
      timeframe: values.timeframe, start, end, recover: values.recover, allowPartialHistory: values['allow-partial-history'], signal: controller.signal });
    const output = resolve(values.out); mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ success: true, experiments: result.results.length, output, restored: result.restored, recovered: result.recovered || false }));
  } catch (error) { console.error(JSON.stringify({ success: false, code: error.code, error: error.message })); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted); await connection.disconnect(); }
}

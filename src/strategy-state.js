import { readChartContext } from './chart-context.js';

export function formatDiagnostic(message, context = {}) {
  return String(message || '').replace(/\{([^}]+)\}/g, (placeholder, key) => context[key] == null ? placeholder : String(context[key]));
}

export function pageStrategies(window) {
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  if (!chart) return [];
  return chart._chartWidget.model().model().dataSources().flatMap((source) => {
    let info; try { info = source.metaInfo?.(); } catch { return []; }
    if (!info?.isTVScriptStrategy && !info?.is_strategy) return [];
    let report = null, status = null;
    try { report = source.reportData?.(); if (report?.value) report = report.value(); } catch { /* calculating */ }
    try { status = source.status?.(); if (status?.value) status = status.value(); } catch { /* older build */ }
    const detail = status?.errorDescription;
    const error = typeof status === 'object' ? (detail?.error ? formatDiagnostic(detail.error, detail.ctx)
      : status?.errorMessage || status?.error || status?.message?.error || (status?.type === 3 ? 'TradingView study execution failed.' : null)) : null;
    const id = source.id?.();
    let inputs = [];
    try { inputs = chart.getStudyById(id).getInputValues(); } catch { /* older build */ }
    return [{ source, id, name: info.description, report, inputs, status_type: status?.type, runtime_error: error }];
  });
}

export function reportFingerprint(report) {
  if (!report) return null;
  return JSON.stringify({ performance: report.performance, settings: report.settings,
    trades: report.trades?.length, last: report.trades?.at(-1), orders: report.filledOrders?.length });
}

export function reportIsComplete(report) {
  const all = report?.performance?.all;
  const count = all?.totalTrades ?? ((all?.numberOfWiningTrades ?? NaN) + (all?.numberOfLosingTrades ?? NaN));
  return Boolean(all && Number.isFinite(all.netProfit) && Number.isInteger(count) && count >= 0);
}

export function compiledIdentity(inputs) {
  const text = inputs.find(input => input.id === 'text')?.value;
  if (typeof text !== 'string' || !text) return null;
  return JSON.stringify(inputs.filter(input => ['text', 'pineId', 'pineVersion'].includes(input.id)));
}

export function calculationKey(inputs, context) {
  return JSON.stringify({ inputs, symbol: context?.symbol, resolution: context?.resolution, chart_type: context?.chart_type });
}

/** Keep native calculation transitions across separate CLI processes. */
export function observeCalculation(window, epoch, item) {
  if (epoch.observer_source === item.source) return;
  epoch.dispose?.();
  epoch.calculation = { cycle: 0, active: false, completed: null };
  epoch.accepted_cycle = 0;
  const inspect = () => pageStrategies(window).find(value => value.id === item.id);
  const statusChanged = () => {
    if (window.__tvCliCompilation !== epoch) { epoch.dispose?.(); return; }
    let status, report;
    try {
      status = item.source.status?.(); if (status?.value) status = status.value();
      report = item.source.reportData?.(); if (report?.value) report = report.value();
    } catch { return; }
    if (status?.type !== 2 || !reportIsComplete(report)) {
      if (!epoch.calculation.active) epoch.calculation.cycle++;
      epoch.calculation.active = true;
    }
  };
  const reportChanged = () => {
    statusChanged();
    if (window.__tvCliCompilation !== epoch || !epoch.calculation.active) return;
    const current = inspect();
    if (epoch.calculation.active && current?.status_type === 2 && reportIsComplete(current.report)) {
      epoch.calculation.completed = { cycle: epoch.calculation.cycle,
        key: calculationKey(current.inputs, readChartContext(window)) };
      epoch.calculation.active = false;
    }
  };
  try {
    const status = item.source.onStatusChanged?.(), reports = item.source.reportChanged?.();
    if (!status?.subscribe || !reports?.subscribe) return;
    epoch.dispose = () => { status.unsubscribe(epoch, statusChanged); reports.unsubscribe(epoch, reportChanged); epoch.observer_source = null; };
    status.subscribe(epoch, statusChanged); reports.subscribe(epoch, reportChanged);
    epoch.observer_source = item.source;
  } catch { epoch.dispose?.(); /* Unsupported native events: input changes fail closed. */ }
}

export function prepareInputChange(window, strategyId) {
  const item = pageStrategies(window).find(value => value.id === strategyId);
  if (!item) return false; // Ordinary indicator, not a Strategy Tester report.
  let epoch = window.__tvCliCompilation;
  if (!epoch || epoch.strategy_id !== strategyId || epoch.phase !== 'ready') {
    epoch?.dispose?.();
    epoch = window.__tvCliCompilation = { strategy_mode: true, strategy_id: strategyId, strategy_name: item.name,
      token: null, source_hash: null, phase: 'ready', report_verified: false, context: readChartContext(window), report: item.report,
      fingerprint: reportFingerprint(item.report), inputs_fingerprint: JSON.stringify(item.inputs), compiled_identity: compiledIdentity(item.inputs) };
  }
  observeCalculation(window, epoch, item);
  return true;
}

export function beginCompilation(window, token, sourceHash, strategyMode, strategyName = null) {
  const previous = window.__tvCliCompilation;
  const strategies = pageStrategies(window);
  const applied = strategies.find(item => item.id === previous?.strategy_id);
  const context = readChartContext(window);
  if (strategyMode && previous?.phase === 'ready' && previous.report_verified && previous.source_hash === sourceHash
    && previous.compiled_identity && compiledIdentity(applied?.inputs || []) === previous.compiled_identity
    && JSON.stringify(applied?.inputs) === previous.inputs_fingerprint && !applied?.runtime_error
    && reportIsComplete(applied?.report) && (applied.status_type == null || applied.status_type === 2)
    && context?.symbol === previous.context?.symbol && context?.resolution === previous.context?.resolution
    && context?.chart_type === previous.context?.chart_type) {
    return { phase: 'unchanged', token: previous.token, strategy_id: applied.id, inputs: applied.inputs };
  }
  previous?.dispose?.();
  window.__tvCliCompilation = { token, source_hash: sourceHash, strategy_mode: strategyMode,
    strategy_name: strategyName, requires_compiled_change: true,
    phase: 'pending', baselines: strategies.map((item) => {
      let second = item.source.reportData?.(); if (second?.value) second = second.value();
      return { id: item.id, report: item.report, fingerprint: reportFingerprint(item.report),
        compiled_identity: compiledIdentity(item.inputs),
        stable_reference: item.report === second, runtime_error: item.runtime_error };
    }) };
  return { phase: 'pending', token };
}

export function compilationState(window) {
  const epoch = window.__tvCliCompilation;
  if (!epoch || !epoch.strategy_mode) return { phase: 'not-strategy' };
  if (epoch.phase === 'ready') {
    const context = readChartContext(window);
    const selected = pageStrategies(window).find(item => item.id === epoch.strategy_id);
    if (!selected) { epoch.dispose?.(); window.__tvCliCompilation = null; return { phase: 'not-strategy' }; }
    if (compiledIdentity(selected.inputs) !== epoch.compiled_identity) {
      epoch.phase = 'invalidated'; epoch.error = 'Compiled script changed outside this CLI compilation; its source hash is no longer verified.';
    }
    if (epoch.phase === 'invalidated') return { phase: epoch.phase, error: epoch.error };
    if (context?.symbol !== epoch.context?.symbol || context?.resolution !== epoch.context?.resolution
      || context?.chart_type !== epoch.context?.chart_type
      || JSON.stringify(selected?.inputs) !== epoch.inputs_fingerprint) {
      epoch.phase = 'pending'; epoch.baselines = [{ id: epoch.strategy_id, report: epoch.report,
        fingerprint: epoch.fingerprint, compiled_identity: epoch.compiled_identity, stable_reference: true, runtime_error: null }];
      // Old real-time ticks are not evidence of recalculation for new inputs.
      epoch.requires_compiled_change = false;
    } else return { phase: 'ready', token: epoch.token, strategy_id: epoch.strategy_id, inputs: selected?.inputs || [] };
  }
  if (epoch.phase === 'invalidated') return { phase: epoch.phase, error: epoch.error };
  if (epoch.phase === 'failed') {
    if (epoch.strategy_id && !pageStrategies(window).some(item => item.id === epoch.strategy_id)) {
      window.__tvCliCompilation = null; return { phase: 'not-strategy' };
    }
    return { phase: epoch.phase, token: epoch.token, strategy_id: epoch.strategy_id, error: epoch.error };
  }
  const candidates = pageStrategies(window).filter(item => !epoch.strategy_name || item.name === epoch.strategy_name);
  const changed = candidates.filter(item => {
    const old = epoch.baselines.find(baseline => baseline.id === item.id);
    const identity = compiledIdentity(item.inputs);
    return (identity && (!old || identity !== old.compiled_identity))
      || (!epoch.requires_compiled_change && item.id === epoch.strategy_id);
  });
  if (changed.length > 1) return { phase: 'pending', token: epoch.token, error: 'More than one strategy changed; cannot identify the compiled script.' };
  for (const item of changed) {
    const old = epoch.baselines.find((baseline) => baseline.id === item.id);
    if (!epoch.requires_compiled_change && compiledIdentity(item.inputs) !== epoch.compiled_identity) {
      epoch.phase = 'invalidated'; epoch.error = 'Compiled script changed outside this CLI compilation.';
      return { phase: epoch.phase, error: epoch.error };
    }
    if (item.runtime_error) {
      epoch.phase = 'failed'; epoch.strategy_id = item.id; epoch.error = String(item.runtime_error); return { phase: 'failed', error: epoch.error };
    }
    if (!reportIsComplete(item.report) || (item.status_type != null && item.status_type !== 2)) continue;
    if (!epoch.requires_compiled_change) {
      const completed = epoch.calculation?.completed;
      if (!completed || completed.cycle <= epoch.accepted_cycle
        || completed.key !== calculationKey(item.inputs, readChartContext(window))) continue;
    }
    if (!old || (old.stable_reference && item.report !== old.report) || reportFingerprint(item.report) !== old.fingerprint) {
      epoch.phase = 'ready'; epoch.report_verified = true; epoch.strategy_id = item.id; epoch.baselines = [];
      epoch.context = readChartContext(window); epoch.report = item.report;
      epoch.fingerprint = reportFingerprint(item.report); epoch.inputs_fingerprint = JSON.stringify(item.inputs);
      epoch.compiled_identity = compiledIdentity(item.inputs);
      if (epoch.requires_compiled_change) observeCalculation(window, epoch, item);
      else epoch.accepted_cycle = epoch.calculation.completed.cycle;
      return { phase: 'ready', token: epoch.token, strategy_id: item.id, inputs: item.inputs };
    }
  }
  return { phase: 'pending', token: epoch.token };
}

export function splitMarkers(markers) {
  return { errors: markers.filter((marker) => marker.severity == null || marker.severity >= 8),
    warnings: markers.filter((marker) => marker.severity >= 4 && marker.severity < 8) };
}

export function readStrategyReport(window, options = {}) {
  const compile = compilationState(window);
  if (['pending', 'failed', 'invalidated'].includes(compile.phase)) return { success: false,
    error: compile.error || 'Fresh strategy report is still pending after compilation.',
    code: compile.phase === 'pending' ? 'REPORT_PENDING' : compile.phase === 'invalidated' ? 'REPORT_INVALIDATED' : 'STRATEGY_RUNTIME_ERROR' };
  const strategies = pageStrategies(window);
  const id = options.strategy_id || (!options.strategy && compile.phase === 'ready' ? compile.strategy_id : null);
  const matching = strategies.filter((item) => (!id || item.id === id) && (!options.strategy || item.name === options.strategy));
  const ready = matching.filter((item) => reportIsComplete(item.report));
  if (ready.length !== 1) return { success: false, error: ready.length > 1 ? 'Strategy report is ambiguous; specify a strategy ID.' : 'Requested strategy report is not ready.', code: 'REPORT_PENDING' };
  const found = ready[0], report = found.report;
  if (found.runtime_error) return { success: false, code: 'STRATEGY_RUNTIME_ERROR', error: String(found.runtime_error) };
  // A complete native report can still belong to the inputs before a GUI edit.
  // Only the epoch that observed compilation/recalculation proves its identity.
  if (compile.phase !== 'ready' || found.id !== compile.strategy_id || !window.__tvCliCompilation?.report_verified) {
    return { success: false, code: 'REPORT_UNVERIFIED', strategy_id: found.id,
      error: 'Strategy report has no verified calculation for its current inputs. Compile with tv pine compile or change a strategy input with tv indicator set, then retry.' };
  }
  const perf = report.performance, all = perf.all || {};
  const metrics = {
    net_profit: all.netProfit, net_profit_percent: all.netProfitPercent, gross_profit: all.grossProfit,
    gross_loss: all.grossLoss, profit_factor: all.profitFactor, max_drawdown: perf.maxStrategyDrawDown,
    max_drawdown_percent: perf.maxStrategyDrawDownPercent,
    total_trades: all.totalTrades ?? ((all.numberOfWiningTrades || 0) + (all.numberOfLosingTrades || 0)),
    winning_trades: all.numberOfWiningTrades, losing_trades: all.numberOfLosingTrades,
    percent_profitable: all.percentProfitable, avg_trade: all.avgTrade, largest_win: all.largestWinTrade,
    largest_loss: all.largestLosTrade, commission_paid: all.commissionPaid, sharpe_ratio: perf.sharpeRatio,
    sortino_ratio: perf.sortinoRatio, buy_hold_return: perf.buyHoldReturn,
    buy_hold_return_percent: perf.buyHoldReturnPercent, open_pl: perf.openPL,
  };
  const context = readChartContext(window);
  const iso = (value) => {
    if (value == null) return null;
    const number = typeof value === 'number' ? value : /^\d+$/.test(String(value)) ? Number(value) : Date.parse(value);
    const millis = typeof value === 'number' || /^\d+$/.test(String(value)) ? (number < 1e11 ? number * 1000 : number) : number;
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  };
  const range = report.settings?.dateRange?.backtest || {};
  const trades = Array.isArray(report.trades) ? report.trades : [];
  return { success: true, strategy: found.name, strategy_id: found.id, currency: report.currency || null,
    source: 'internal_api', compilation_token: compile.phase === 'ready' && found.id === compile.strategy_id ? compile.token : null,
    source_hash: compile.phase === 'ready' && found.id === compile.strategy_id ? window.__tvCliCompilation?.source_hash || null : null,
    strategy_inputs: found.inputs,
    metric_count: Object.values(metrics).filter((value) => value != null).length,
    metrics: Object.fromEntries(Object.entries(metrics).filter(([, value]) => value != null)),
    context, backtest_window: { from: iso(range.from), to: iso(range.to) },
    loaded_window: { from: iso(context?.first_bar_time), to: iso(context?.last_bar_time) },
    trade_window: { from: iso(trades[0]?.e?.tm), to: iso(trades.at(-1)?.x?.tm ?? trades.at(-1)?.e?.tm) },
    units: { money: report.currency || null, percent_fields: 'fraction (0.01 = 1%)',
      time_fields: 'ISO-8601 UTC', order_sequence: 'ordinal, not timestamp or bar index' },
  };
}

export const STRATEGY_PAGE_CODE = [readChartContext, formatDiagnostic, pageStrategies, reportFingerprint, reportIsComplete, compiledIdentity,
  calculationKey, observeCalculation, prepareInputChange, beginCompilation, compilationState, readStrategyReport].map(fn => fn.toString()).join('\n');

export function reportExpression(options = {}) {
  return `(() => { ${STRATEGY_PAGE_CODE}; return readStrategyReport(window, ${JSON.stringify(options)}); })()`;
}

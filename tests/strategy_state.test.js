import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { beginCompilation, compilationState, readStrategyReport, splitMarkers, reportExpression, formatDiagnostic } from '../src/strategy-state.js';
import { normalizeTimeframe, symbolMatches } from '../src/chart-context.js';

function fixture() {
  let report = { performance: { all: { netProfit: 10, netProfitPercent: 0.001, totalTrades: 2, numberOfWiningTrades: 1, numberOfLosingTrades: 0 } },
    settings: { dateRange: { backtest: { from: 1704067200000, to: 1704153600000 } } }, currency: 'USDT',
    trades: [{ e: { tm: 1704067200000, b: 0 }, x: { tm: 1704153600000, b: 1 } }] };
  let error = null, statusType = 2;
  const event = () => {
    const listeners = [];
    return { subscribe: (owner, fn) => listeners.push({ owner, fn }),
      unsubscribe: (owner, fn) => { const index = listeners.findIndex(item => item.owner === owner && item.fn === fn); if (index >= 0) listeners.splice(index, 1); },
      fire: () => listeners.slice().forEach(item => item.fn()) };
  };
  const statusEvent = event(), reportEvent = event();
  let inputs = [{ id: 'text', value: 'compiled-script-A' }, { id: 'in_0', value: 10 }];
  const series = { bars: () => ({ firstIndex: () => 0, lastIndex: () => 1, valueAt: (i) => [1704067200 + i * 86400] }), symbolInfo: () => ({ full_name: 'BINANCE:BTCUSDT' }) };
  const source = { id: () => 'strategy', metaInfo: () => ({ isTVScriptStrategy: true, description: 'Same title' }),
    reportData: () => ({ value: () => report }), status: () => ({ value: () => ({ error, type: statusType }) }),
    onStatusChanged: () => statusEvent, reportChanged: () => reportEvent };
  const model = { mainSeries: () => series, model: () => ({ dataSources: () => [source] }) };
  const chart = { symbol: () => 'BINANCE:BTCUSDT', resolution: () => '1D', chartType: () => 1,
    getStudyById: () => ({ getInputValues: () => inputs }), _chartWidget: { model: () => model } };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart } } };
  return { window, source, update: () => { report = { ...report, performance: { all: { ...report.performance.all, netProfit: 20 } } }; reportEvent.fire(); },
    input: value => { inputs = inputs.map(input => input.id === 'in_0' ? { ...input, value } : input); },
    status: type => { statusType = type; statusEvent.fire(); },
    tick: () => { report = { ...report }; reportEvent.fire(); },
    compile: (text = 'compiled-script-B') => { inputs = [{ id: 'text', value: text }, { id: 'in_0', value: 30 }]; },
    fail: () => { inputs = [{ id: 'text', value: 'compiled-script-error' }]; error = 'Array index out of bounds'; } };
}

describe('Strategy report identity and metadata', () => {
  it('rejects real-time report changes until the compiled script also changes', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true);
    assert.equal(compilationState(f.window).phase, 'pending');
    assert.equal(readStrategyReport(f.window).success, false);
    f.update();
    assert.equal(readStrategyReport(f.window).success, false);
    f.compile();
    const result = readStrategyReport(f.window);
    assert.equal(result.success, true); assert.equal(result.metrics.net_profit, 20);
    assert.equal(result.compilation_token, 'run');
  });
  it('waits for a new report even after compiled identity changes', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile();
    assert.equal(compilationState(f.window).phase, 'pending');
    f.update(); assert.equal(compilationState(f.window).phase, 'ready');
  });
  it('reports already verified identical source as unchanged without a new token', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(compilationState(f.window).phase, 'ready');
    const result = beginCompilation(f.window, 'new-token', 'hash', true);
    assert.equal(result.phase, 'unchanged'); assert.equal(result.token, 'run');
  });
  it('does not attribute another strategy title to the requested compile', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true, 'Requested title');
    f.compile(); f.update(); assert.equal(compilationState(f.window).phase, 'pending');
  });
  it('invalidates source verification when an external editor replaces the script', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(compilationState(f.window).phase, 'ready');
    f.compile('external-script');
    assert.equal(readStrategyReport(f.window).code, 'REPORT_INVALIDATED');
  });
  it('rejects old real-time ticks after an input change until native recalculation finishes', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(compilationState(f.window).phase, 'ready');
    f.input(60); f.tick();
    assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
    f.status(1); f.tick();
    assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
    f.status(2); f.update();
    assert.equal(readStrategyReport(f.window).strategy_inputs.find(input => input.id === 'in_0').value, 60);
  });
  it('records fast native transitions even when no CLI read runs during recalculation', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(compilationState(f.window).phase, 'ready');
    f.status(1); f.input(70); f.status(2); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.input(80); f.tick();
    assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
  });
  it('does not treat a report getter that returns copies as proof of a fresh calculation', () => {
    const f = fixture(); const original = f.source.reportData;
    f.source.reportData = () => ({ value: () => structuredClone(original().value()) });
    beginCompilation(f.window, 'run', 'hash', true);
    assert.equal(compilationState(f.window).phase, 'pending');
  });
  it('reports runtime failure distinctly from a zero-trade strategy', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.fail();
    const result = readStrategyReport(f.window);
    assert.equal(result.success, false); assert.equal(result.code, 'STRATEGY_RUNTIME_ERROR');
  });
  it('includes actual history bounds, UTC timestamps, units and native total trades', () => {
    const result = readStrategyReport(fixture().window);
    assert.equal(result.metrics.total_trades, 2);
    assert.equal(result.backtest_window.from, '2024-01-01T00:00:00.000Z');
    assert.equal(result.trade_window.to, '2024-01-02T00:00:00.000Z');
    assert.equal(result.units.percent_fields, 'fraction (0.01 = 1%)');
    assert.equal(result.context.bar_count, 2);
  });
  it('executes the real serialized page report code', () => {
    assert.equal(runInNewContext(reportExpression(), { window: fixture().window }).success, true);
  });
  it('keeps warnings out of the fatal diagnostic list', () => {
    const result = splitMarkers([{ severity: 4, message: 'warning' }, { severity: 8, message: 'error' }]);
    assert.equal(result.errors.length, 1); assert.equal(result.warnings.length, 1);
  });
  it('normalizes interval aliases and accepts evidenced symbol aliases', () => {
    assert.equal(normalizeTimeframe('D'), '1D'); assert.equal(normalizeTimeframe('4h'), '240');
    assert.equal(symbolMatches('NASDAQ:AAPL', { symbol: 'BATS:AAPL', aliases: ['NASDAQ:AAPL'] }), true);
    assert.equal(symbolMatches('BINANCE:INVALID', { symbol: 'BATS:AAPL', aliases: [] }), false);
  });
  it('formats native errorDescription fields rather than losing runtime errors', () => {
    const f = fixture();
    f.source.status = () => ({ type: 3, errorDescription: { error: 'Index {index} on bar {bar_index}', ctx: { index: 3, bar_index: 0 } } });
    const result = readStrategyReport(f.window);
    assert.equal(result.success, false); assert.equal(result.code, 'STRATEGY_RUNTIME_ERROR');
    assert.equal(formatDiagnostic('Function {functionName}', { functionName: 'ta.sma' }), 'Function ta.sma');
  });
});

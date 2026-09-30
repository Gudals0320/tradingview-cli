import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { beginCompilation, compilationState, readStrategyReport, splitMarkers, reportExpression, formatDiagnostic } from '../src/strategy-state.js';
import { normalizeTimeframe, symbolMatches } from '../src/chart-context.js';

function fixture() {
  let report = { performance: { all: { netProfit: 10, netProfitPercent: 0.001, totalTrades: 2, numberOfWiningTrades: 1, numberOfLosingTrades: 0 } },
    settings: { dateRange: { backtest: { from: 1704067200000, to: 1704153600000 } } }, currency: 'USDT',
    trades: [{ e: { tm: 1704067200000, b: 0 }, x: { tm: 1704153600000, b: 1 } }] };
  let error = null;
  const series = { bars: () => ({ firstIndex: () => 0, lastIndex: () => 1, valueAt: (i) => [1704067200 + i * 86400] }), symbolInfo: () => ({ full_name: 'BINANCE:BTCUSDT' }) };
  const source = { id: () => 'strategy', metaInfo: () => ({ isTVScriptStrategy: true, description: 'Same title' }),
    reportData: () => ({ value: () => report }), status: () => ({ value: () => ({ error }) }) };
  const model = { mainSeries: () => series, model: () => ({ dataSources: () => [source] }) };
  const chart = { symbol: () => 'BINANCE:BTCUSDT', resolution: () => '1D', chartType: () => 1, _chartWidget: { model: () => model } };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart } } };
  return { window, source, update: () => { report = { ...report, performance: { all: { ...report.performance.all, netProfit: 20 } } }; }, fail: () => { error = 'Array index out of bounds'; } };
}

describe('Strategy report identity and metadata', () => {
  it('rejects the old same-title report until the calculation changes', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true);
    assert.equal(compilationState(f.window).phase, 'pending');
    assert.equal(readStrategyReport(f.window).success, false);
    f.update();
    const result = readStrategyReport(f.window);
    assert.equal(result.success, true); assert.equal(result.metrics.net_profit, 20);
    assert.equal(result.compilation_token, 'run');
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

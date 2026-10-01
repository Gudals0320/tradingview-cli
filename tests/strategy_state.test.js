import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { beginCompilation, compilationState, readStrategyReport, splitMarkers, reportExpression, formatDiagnostic, prepareInputChange } from '../src/strategy-state.js';
import { getStrategyResults, getTrades, getTradeLedger, getEquity } from '../src/core/data.js';
import { smartCompile } from '../src/core/pine.js';
import { normalizeTimeframe, symbolMatches } from '../src/chart-context.js';
import { failCompilation } from '../src/strategy-state.js';
import { canonicalPineSource } from '../src/pine-source.js';
import { sourceHash } from '../src/session.js';

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
  it('a fresh input-only workspace cannot publish its old report before a new native cycle', () => {
    const f=fixture();
    assert.equal(f.window.__tvCliCompilation, undefined);
    prepareInputChange(f.window,'strategy');f.input(21);
    assert.equal(compilationState(f.window).phase,'pending');
    assert.equal(readStrategyReport(f.window).success,false);
    f.tick();assert.equal(readStrategyReport(f.window).success,false);
    f.status(1);f.status(2);f.update();
    assert.equal(compilationState(f.window).phase,'ready');
    assert.equal(readStrategyReport(f.window).success,true);
    assert.equal(readStrategyReport(f.window).metrics.net_profit,20);
    assert.equal(f.window.__tvCliCompilation.calculation.completed.cycle,1);
  });
  it('confirmed save awaits only its exact target/version and never adopts a pre-save report', () => {
    for(const matches of [true,false]){
      const f=fixture(),chart=f.window.TradingViewApi._activeChartWidgetWV.value(),inputs=chart.getStudyById;let version='1.0';
      chart.getStudyById=id=>({getInputValues:()=>[...inputs(id).getInputValues(),{id:'pineId',value:'P'},{id:'pineVersion',value:version}]});
      beginCompilation(f.window,'save','newhash',true,null,'P','strategy');
      Object.assign(f.window.__tvCliCompilation,{persistence_confirmed:true,saved_version:'2.0'});
      if(matches)version='2.0';
      const begun=beginCompilation(f.window,'compile','newhash',true,null,'P','strategy');
      assert.equal(begun.phase,matches?'awaiting':'pending');
      assert.equal(compilationState(f.window).phase,'pending');
      if(matches){f.compile();f.status(1);f.status(2);f.update();assert.equal(compilationState(f.window).phase,'ready');}
    }
  });
  it('restores canonical verified identity through beginCompilation itself', () => {
    const f=fixture(),chart=f.window.TradingViewApi._activeChartWidgetWV.value();const inputs=chart.getStudyById;
    chart.getStudyById=id=>({getInputValues:()=>[...inputs(id).getInputValues(),{id:'pineId',value:'P'}]});
    const lf='strategy("Same title")\nplot(close)\n',hash=sourceHash(lf);
    beginCompilation(f.window,'run',hash,true,'Same title','P','strategy');f.compile();f.update();assert.equal(compilationState(f.window).phase,'ready');
    beginCompilation(f.window,'other','other-source',false,null,'Q');
    assert.equal(beginCompilation(f.window,'reopen',sourceHash(canonicalPineSource(lf.replace(/\n/g,'\r\n'))),true,'Same title','P','strategy').phase,'unchanged');
    beginCompilation(f.window,'other2','other-source',false,null,'Q');
    assert.notEqual(beginCompilation(f.window,'raw',sourceHash(lf.replace(/\n/g,'\r\n')),true,'Same title','P','strategy').phase,'unchanged');
  });
  it('cache restoration rejects changed compiled identity and duplicate/foreign documents', () => {
    for(const mutation of ['compiled','duplicate','foreign']){
      const f=fixture(),chart=f.window.TradingViewApi._activeChartWidgetWV.value(),inputs=chart.getStudyById;
      chart.getStudyById=id=>({getInputValues:()=>[...inputs(id).getInputValues(),{id:'pineId',value:'P'}]});
      beginCompilation(f.window,'run','hash',true,'Same title','P','strategy');f.compile();f.update();compilationState(f.window);
      beginCompilation(f.window,'other','other',false,null,'Q');
      if(mutation==='compiled')f.compile('changed-externally');
      if(mutation==='duplicate')chart._chartWidget.model().model=()=>({dataSources:()=>[f.source,{...f.source,id:()=> 'duplicate'}]});
      assert.notEqual(beginCompilation(f.window,'reopen','hash',true,'Same title',mutation==='foreign'?'Q':'P','strategy').phase,'unchanged');
      if(mutation==='compiled')assert.equal(f.window.__tvCliVerifiedStrategies.has('strategy'),false);
    }
  });
  it('same-version refresh needs a new native calculation rather than a complete old report', () => {
    const f=fixture();beginCompilation(f.window,'refresh','hash',true,null,null,'strategy',true);
    assert.equal(compilationState(f.window).phase,'pending');
    f.status(1);f.status(2);f.tick();
    assert.equal(compilationState(f.window).phase,'ready');
  });
  it('canonicalizes physical CRLF only without changing source contents or trailing newlines', () => {
    const lf='strategy("\\r\\n")\n// 한글\n';
    assert.equal(sourceHash(canonicalPineSource(lf.replace(/\n/g,'\r\n'))),sourceHash(lf));
    assert.notEqual(sourceHash(canonicalPineSource(lf+'\n')),sourceHash(lf));
    assert.equal(canonicalPineSource('a\rb'),'a\rb');
  });
  it('keeps verified per-study monitoring while another document is compiled', () => {
    const f=fixture();beginCompilation(f.window,'run','hash',true);f.compile();f.update();
    assert.equal(compilationState(f.window).phase,'ready');
    const verified=f.window.__tvCliCompilation;
    beginCompilation(f.window,'indicator','other',false);
    f.status(1);f.input(70);f.status(2);f.update();
    f.window.__tvCliCompilation=verified;
    assert.equal(compilationState(f.window).phase,'ready');
    assert.equal(f.window.__tvCliCompilation.inputs_fingerprint.includes('70'),true);
  });
  it('rejected actions become a terminal code, and a new actual compile can recover', () => {
    const f=fixture();beginCompilation(f.window,'rejected','hash',true,null,null,'strategy');
    failCompilation(f.window,'rejected','No changes','NATIVE_ACTION_REJECTED');
    assert.equal(readStrategyReport(f.window).code,'NATIVE_ACTION_REJECTED');
    beginCompilation(f.window,'recovery','hash',true);f.compile();f.update();
    assert.equal(readStrategyReport(f.window).success,true);
  });
  it('binds report freshness to the Pine document despite another changed same-title strategy', () => {
    const f = fixture(), chart = f.window.TradingViewApi._activeChartWidgetWV.value();
    const inputs = chart.getStudyById;
    let otherText = 'Q-old';
    const other = { ...f.source, id: () => 'other' };
    chart._chartWidget.model().model = () => ({ dataSources: () => [f.source, other] });
    chart.getStudyById = id => ({ getInputValues: () => id === 'other'
      ? [{id:'text',value:otherText},{id:'pineId',value:'Q'}]
      : [...inputs(id).getInputValues(),{id:'pineId',value:'P'}] });
    beginCompilation(f.window,'run','hash',true,'Same title','P','strategy');
    f.compile();otherText='Q-new';f.update();
    const state=compilationState(f.window);
    assert.equal(state.phase,'ready');assert.equal(state.strategy_id,'strategy');
  });
  it('does not reuse a verified source for a different document or duplicated target', () => {
    const f=fixture(),chart=f.window.TradingViewApi._activeChartWidgetWV.value();
    const inputs=chart.getStudyById;
    chart.getStudyById=id=>({getInputValues:()=>[...inputs(id).getInputValues(),{id:'pineId',value:'P'}]});
    beginCompilation(f.window,'run','hash',true,'Same title','P','strategy');f.compile();f.update();
    assert.equal(compilationState(f.window).phase,'ready');
    const duplicate={...f.source,id:()=> 'duplicate'};
    chart._chartWidget.model().model=()=>({dataSources:()=>[f.source,duplicate]});
    assert.notEqual(beginCompilation(f.window,'retry','hash',true,'Same title','P').phase,'unchanged');
    assert.notEqual(beginCompilation(f.window,'different','hash',true,'Same title','Q').phase,'unchanged');
  });
  it('rejects an unmonitored GUI input edit even when native status is ready', () => {
    const f = fixture(); f.input(60);
    const result = readStrategyReport(f.window);
    assert.equal(result.success, false);
    assert.equal(result.code, 'REPORT_UNVERIFIED');
    assert.equal(result.metrics, undefined);
  });
  it('does not adopt a complete report just because monitoring starts', () => {
    const f = fixture(); f.input(60);
    prepareInputChange(f.window, 'strategy');
    assert.equal(readStrategyReport(f.window).code, 'REPORT_UNVERIFIED');
    f.tick();
    assert.equal(readStrategyReport(f.window).success, false);
    f.input(70); f.status(1); f.status(2); f.update();
    const result = readStrategyReport(f.window);
    assert.equal(result.success, true);
    assert.equal(result.compilation_token, null);
    assert.equal(result.source_hash, null);
    assert.equal(result.strategy_inputs.find(input => input.id === 'in_0').value, 70);
  });
  it('loses report verification after a page reload', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.window.__tvCliCompilation.dispose();
    delete f.window.__tvCliCompilation;
    f.input(60);
    assert.equal(readStrategyReport(f.window).code, 'REPORT_UNVERIFIED');
  });
  it('does not use another strategy verification for an explicit selection', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    const chart = f.window.TradingViewApi._activeChartWidgetWV.value();
    const other = { ...f.source, id: () => 'other', metaInfo: () => ({ isTVScriptStrategy: true, description: 'Other title' }) };
    chart._chartWidget.model().model = () => ({ dataSources: () => [f.source, other] });
    for (const options of [{ strategy_id: 'other' }, { strategy: 'Other title' }]) {
      const result = readStrategyReport(f.window, options);
      assert.equal(result.success, false);
      assert.equal(result.code, 'REPORT_UNVERIFIED');
    }
  });
  it('blocks unverified reports across every strategy data endpoint', async () => {
    const f = fixture(); f.input(60);
    const _deps = { evaluate: expression => runInNewContext(expression, { window: f.window }) };
    for (const read of [getStrategyResults, getTrades, getTradeLedger, getEquity]) {
      const result = await read({ _deps });
      assert.equal(result.success, false, read.name);
      assert.equal(result.code, 'REPORT_UNVERIFIED', read.name);
      assert.equal(result.metrics, undefined);
      assert.equal(result.trades, undefined);
      assert.equal(result.data, undefined);
    }
  });
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
  for (const verification of ['compilation', 'input-change']) {
    for (const beforeStatusEvent of [false, true]) {
      it(`rejects GUI ABA after ${verification}, including before status event=${beforeStatusEvent}`, () => {
        const f = fixture();
        if (verification === 'compilation') {
          beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
        } else {
          prepareInputChange(f.window, 'strategy'); f.input(30); f.status(1); f.status(2); f.update();
        }
        assert.equal(readStrategyReport(f.window).success, true);
        // No CLI reads while B finishes, then inputs return to verified A.
        f.input(60); f.status(1); f.status(2); f.update();
        f.input(30);
        if (!beforeStatusEvent) f.status(1);
        assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
        if (beforeStatusEvent) f.status(1);
        f.status(2); f.update();
        assert.equal(readStrategyReport(f.window).success, true);
      });
    }
  }
  it('does not skip identical-source compilation while an ABA calculation is pending', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.input(60); f.status(1); f.status(2); f.update(); f.input(30);
    const epoch = f.window.__tvCliCompilation;
    const begun = beginCompilation(f.window, 'new-run', 'hash', true);
    assert.equal(begun.phase, 'awaiting'); assert.equal(begun.token, 'run');
    assert.equal(f.window.__tvCliCompilation, epoch);
    assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
    f.status(1); f.status(2); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
  });
  it('rejects a native calculation in progress even when inputs do not change', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.status(1);
    assert.equal(readStrategyReport(f.window).code, 'REPORT_PENDING');
    f.status(2); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
  });
  it('fails closed when native calculation events are unavailable', () => {
    const f = fixture(); delete f.source.onStatusChanged;
    beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).code, 'REPORT_UNVERIFIED');
    f.input(60); f.status(1); f.status(2); f.update(); f.input(30);
    assert.equal(readStrategyReport(f.window).success, false);
    assert.notEqual(beginCompilation(f.window, 'new-run', 'hash', true).phase, 'unchanged');
  });
  it('does not transfer verification to a replacement source with the same ID', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    const replacement = { ...f.source };
    f.window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().model = () => ({ dataSources: () => [replacement] });
    assert.equal(readStrategyReport(f.window).code, 'REPORT_UNVERIFIED');
    assert.equal(f.window.__tvCliCompilation.source_hash, null);
    f.tick(); assert.equal(readStrategyReport(f.window).success, false);
    // Reattached monitoring can prove the next real input calculation.
    f.input(60); f.status(1); f.status(2); f.update();
    const report = readStrategyReport(f.window);
    assert.equal(report.success, true); assert.equal(report.source_hash, null);
    assert.equal(report.compilation_token, null);
  });
  it('waits for an existing identical-source recalculation without clicking compile', async () => {
    const f = fixture();
    const source = '//@version=6\nstrategy("Same title")\nplot(close)';
    const { sourceHash } = await import('../src/session.js');
    beginCompilation(f.window, 'run', sourceHash(source), true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.input(60); f.status(1); f.status(2); f.update(); f.input(30);
    const epoch = f.window.__tvCliCompilation;
    let clicks = 0, ticks = 0;
    const result = await smartCompile({ _deps: { source,
      evaluate: expression => {
        if (expression.includes('function pineCompileContext')) return {};
        if (expression.includes('getModelMarkers')) return [];
        if (expression.includes('document')) { clicks++; return 'clicked'; }
        return runInNewContext(expression, { window: f.window });
      },
      sleep: async () => { if (++ticks === 2) { f.status(1); f.status(2); f.update(); } },
      now: () => ticks * 200,
    } });
    assert.equal(result.success, true); assert.equal(result.compilation_token, 'run');
    assert.equal(result.compile_performed, false); assert.equal(clicks, 0);
    assert.equal(f.window.__tvCliCompilation, epoch);
    assert.equal(readStrategyReport(f.window).success, true);
  });
  it('preserves input monitoring when an identical-source wait times out', async () => {
    const f = fixture(); const source = '//@version=6\nstrategy("Same title")\nplot(close)';
    const { sourceHash } = await import('../src/session.js');
    beginCompilation(f.window, 'run', sourceHash(source), true); f.compile(); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
    f.input(60); f.status(1);
    const epoch = f.window.__tvCliCompilation; let ticks = 0;
    const result = await smartCompile({ timeout: 400, _deps: { source,
      evaluate: expression => expression.includes('function pineCompileContext') ? {} :
        expression.includes('getModelMarkers') ? [] : runInNewContext(expression, { window: f.window }),
      sleep: async () => { ticks++; }, now: () => ticks * 200,
    } });
    assert.equal(result.success, false); assert.equal(result.compile_performed, false);
    assert.equal(f.window.__tvCliCompilation, epoch);
    f.status(2); f.update();
    assert.equal(readStrategyReport(f.window).success, true);
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
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    const result = readStrategyReport(f.window);
    assert.equal(result.metrics.total_trades, 2);
    assert.equal(result.backtest_window.from, '2024-01-01T00:00:00.000Z');
    assert.equal(result.trade_window.to, '2024-01-02T00:00:00.000Z');
    assert.equal(result.units.percent_fields, 'fraction (0.01 = 1%)');
    assert.equal(result.context.bar_count, 2);
  });
  it('executes the real serialized page report code', () => {
    const f = fixture(); beginCompilation(f.window, 'run', 'hash', true); f.compile(); f.update();
    assert.equal(runInNewContext(reportExpression(), { window: f.window }).success, true);
    assert.equal(runInNewContext(reportExpression(), { window: fixture().window }).code, 'REPORT_UNVERIFIED');
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

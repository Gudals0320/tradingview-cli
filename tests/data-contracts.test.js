import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { getOhlcv, getPineTables, getPineLabels, getPineLines, getStudyValues, getQuote } from '../src/core/data.js';
import { analyze } from '../src/core/pine.js';
import { requestLayoutSwitch, layoutSwitch } from '../src/core/ui.js';
import { prepareFeedBindings, parseFeedSpecs, planFeedAssignments } from '../src/core/multi-feed.js';

function fixture() {
  let symbol = 'BINANCE:BTCUSDT';
  const bars = { firstIndex: () => 0, lastIndex: () => 1, size: () => 2, valueAt: i => [100 + i, 1, 3, 1, 2, 5] };
  const table = new Map(['A', '', 'C', '', '', ''].map((text, i) => [i, { t: text, row: Math.floor(i / 3), col: i % 3, tid: 0 }]));
  const labels = new Map([10, 2, 30].map(x => [x, { x, y: 1, t: String(x) }]));
  const collection = items => new Map([['labels', new Map([[false, { _primitivesDataById: items }]])]]);
  const source = { id: () => 'qa', metaInfo: () => ({ description: 'QA' }), inputs: () => ({ text: 'private compiled', in_0: 10 }),
    dataWindowView: () => ({ items: () => [{ _title: 'value', _value: '2' }] }),
    _graphics: { _primitivesCollection: { dwgtablecells: new Map([['tableCells', { _primitivesDataById: table }]]), dwglabels: collection(labels) } } };
  const series = { bars: () => bars };
  const model = { mainSeries: () => series, model: () => ({ dataSources: () => [source] }) };
  const chart = { symbol: () => symbol, resolution: () => '1D', chartType: () => 1, _chartWidget: { model: () => model }, setSymbol: value => { symbol = value; } };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart } } };
  const document = { querySelector: () => null };
  const evaluate = expression => runInNewContext(expression, { window, document });
  return { window, chart, bars, source, _deps: { evaluate, evaluateAsync: evaluate, waitForChartReady: async () => true, targetId: 'qa' } };
}

it('OHLCV reports a loaded tail separately from insufficient history and never invents missing volume', async () => {
  const f = fixture();
  const tail = await getOhlcv({ count: 1, _deps: f._deps });
  assert.equal(tail.total_available, 2); assert.equal(tail.truncated, true); assert.equal(tail.insufficient_history, false);
  const short = await getOhlcv({ count: 5, summary: true, _deps: f._deps });
  assert.equal(short.truncated, false); assert.equal(short.insufficient_history, true); assert.equal(short.limit, 500);
  f.bars.valueAt = i => [100 + i, 1, 3, 1, 2];
  assert.equal((await getOhlcv({ count: 1, _deps: f._deps })).bars[0].volume, null);
  assert.equal((await getOhlcv({ summary: true, _deps: f._deps })).avg_volume, null);
  f.bars.valueAt = i => i === 0 ? [100, 1, 3, 1, 2, 0] : null;
  await assert.rejects(getOhlcv({ count: 2, _deps: f._deps }), /OHLCV_EXTRACTION_FAILED/);
  await assert.rejects(getOhlcv({ count: 501, _deps: f._deps }), /500/);
});

it('graphics extraction failures are errors rather than successful empty collections', async () => {
  const f = fixture();
  f.source._graphics._primitivesCollection.dwglabels.get = () => { throw new Error('incompatible API'); };
  await assert.rejects(getPineLabels({ _deps: f._deps }), /GRAPHICS_EXTRACTION_FAILED.*incompatible API/);
  f.source.dataWindowView = () => { throw new Error('incompatible view'); };
  await assert.rejects(getStudyValues({ _deps: f._deps }), /VALUES_EXTRACTION_FAILED.*incompatible view/);
});

it('collection reads expose their exact context and preserve empty table cells/rows', async () => {
  const f = fixture();
  const ohlcv = await getOhlcv({ count: 2, _deps: f._deps });
  assert.equal(ohlcv.context.symbol, 'BINANCE:BTCUSDT'); assert.equal(ohlcv.context.target_id, 'qa');
  assert.equal(ohlcv.requested, 2); assert.equal(ohlcv.applied, 2);
  const table = await getPineTables({ _deps: f._deps });
  assert.deepEqual(table.studies[0].tables[0].cells, [['A', '', 'C'], ['', '', '']]);
  const values = await getStudyValues({ _deps: f._deps });
  assert.equal(values.studies[0].inputs.text, undefined); assert.equal(values.studies[0].inputs.in_0, 10);
  const labels = await getPineLabels({ max_labels: 2, _deps: f._deps });
  assert.deepEqual(labels.studies[0].labels.map(label => label.x), [30, 10]);
  assert.equal(labels.studies[0].truncated, true);
  await assert.rejects(getPineLines({ study_filter: 'missing', _deps: f._deps }), { code: 'STUDY_NOT_FOUND' });
  assert.equal((await getPineLines({ study_filter: 'QA', _deps: f._deps })).study_count, 0);
});

it('quote switches full exchange identity and exposes both retrieval and failed restoration', async () => {
  const f = fixture(); const quote = await getQuote({ symbol: 'COINBASE:BTCUSDT', _deps: f._deps });
  assert.equal(quote.context.symbol, 'COINBASE:BTCUSDT'); assert.equal(quote.restored, true);
  assert.equal(f.chart.symbol(), 'BINANCE:BTCUSDT');
  f.chart.setSymbol = value => { if (value === 'BINANCE:BTCUSDT') throw new Error('restore rejected'); };
  const failed = await getQuote({ symbol: 'COINBASE:BTCUSDT', _deps: f._deps });
  assert.equal(failed.success, false); assert.equal(failed.restored, false); assert.match(failed.restore_error, /restore rejected/);
});

it('layout lookup rejects ambiguity and late callback cannot navigate after timeout', async () => {
  let callback, loads = 0;
  const window = { TradingViewApi: { getSavedCharts: cb => { callback = cb; }, loadChartFromServer: () => loads++ } };
  const pending = requestLayoutSwitch(window, 'QA', 10); await pending;
  callback([{ id: 1, name: 'QA' }]); assert.equal(loads, 0);
  window.TradingViewApi.getSavedCharts = cb => cb([{ id: 1, name: 'QA-A' }, { id: 2, name: 'QA-B' }]);
  assert.equal((await requestLayoutSwitch(window, 'QA')).code, 'LAYOUT_AMBIGUOUS'); assert.equal(loads, 0);
  const result = await layoutSwitch({ name: 'QA-A', _deps: { evaluateAsync: async () => ({ success: true, id: 'A' }),
    evaluate: async () => ({ id: 'B', dialog: true }), sleep: async () => {} } });
  assert.equal(result.success, false); assert.equal(result.confirmation_required, true);
});
it('default feed preparation never mutates existing user panes and bounded empty tabs fail', async () => {
  const feeds = parseFeedSpecs(['AAPL@D']);
  assert.equal(planFeedAssignments(feeds, [{ targetId: 'user', panes: [{ index: 0, symbol: 'NASDAQ:AAPL', timeframe: '1D', hasBar: true }] }]).missing.length, 0);
  let opens = 0, mutations = 0;
  const targets = ['user'];
  const adapter = { discover: async () => targets.map(id => ({ id })), attach: async id => ({ id }), close: async () => {},
    inventory: async (_, targetId) => ({ targetId, panes: targetId === 'user' ? [{ index: 0, symbol: 'OTHER', timeframe: '1', hasBar: true }] : [] }),
    provision: async client => { if (client.id === 'user') mutations++; },
    setLayout: async client => { if (client.id === 'user') mutations++; throw Object.assign(new Error('capacity'), { code: 'LAYOUT_CAPACITY_UNAVAILABLE', native_terminal: true }); },
    openTab: async () => { opens++; targets.push('new' + opens); } };
  await assert.rejects(prepareFeedBindings(feeds, adapter, { maxNewTabs: 2 }), /Bounded tab creation/);
  assert.equal(opens, 2); assert.equal(mutations, 0);
});

it('analysis excludes dynamic size mutations and parses nested array.from arguments', () => {
  const dynamic = analyze({ source: 'a = array.new<float>(0)\narray.push(a,close)\nplot(array.get(a,0))' });
  assert.equal(dynamic.error_count, 0);
  assert.equal(analyze({ source: 'a = array.new<float>(0)\nb = a\narray.push(b,close)\narray.get(a,0)' }).error_count, 0);
  assert.equal(analyze({ source: 'a = array.new<float>(0)\nuserFunction(a)\narray.get(a,0)' }).error_count, 0);
  const nested = analyze({ source: 'a = array.from(f(1,2),3)\narray.get(a,2)', fail_on_error: true });
  assert.equal(nested.error_count, 1); assert.equal(nested.has_errors, true);
  assert.match(nested.diagnostics[0].message, /size is 2/);
});

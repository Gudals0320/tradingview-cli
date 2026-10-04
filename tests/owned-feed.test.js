import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { sampleOwnedFeeds } from '../src/core/stream.js';
function pane(symbol, options = {}) {
  const series = { symbol: () => symbol, interval: () => '60', isLoading: () => options.loading ?? false,
    status: () => ({ error: options.error }), symbolInfo: () => ({ full_name: options.actual || symbol }),
    isStatusError: () => Boolean(options.error),
    bars: () => ({ lastIndex: () => 1, valueAt: () => options.noBar ? null : [1, 100, 110, 90, 105, 10] }) };
  return { model: () => ({ mainSeries: () => series }), series };
}
it('production owned-feed expression validates each requested pane and permits partial success', async () => {
  const a = pane('EXCHANGE:AAA'), b = pane('EXCHANGE:BBB', { loading: true, error: 'Requested feed unavailable', actual: 'EXCHANGE:OLD' });
  const window = { TradingViewApi: { _chartWidgetCollection: { getAll: () => [a, b] } } };
  const _deps = { evaluate: expression => runInNewContext(expression, { window }) };
  const result = await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:AAA@60', 'EXCHANGE:BBB@60'], _deps });
  assert.equal(result.success, false); assert.equal(result.partial_success, true);
  assert.equal(result.feeds[0].status, 'ok'); assert.equal(result.feeds[1].code, 'DATA_FEED_ERROR');
  assert.equal(result.feeds[1].open, undefined); assert.equal(result.feeds[1].feed, 'EXCHANGE:BBB@60');
  a.series.isLoading = () => true;
  b.series.isLoading = () => false; b.series.status = () => ({}); b.series.isStatusError = () => false; b.series.symbolInfo = () => ({ full_name: 'EXCHANGE:BBB' });
  const secondary = await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps });
  assert.equal(secondary.success, true); assert.equal(secondary.feeds[0].close, 105);
  b.series.symbolInfo = () => ({ full_name: 'EXCHANGE:OLD' });
  const stale = await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps });
  assert.equal(stale.feeds[0].code, 'FEED_IDENTITY_MISMATCH'); assert.equal(stale.feeds[0].close, undefined);
  b.series.isLoading = () => true;
  assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps })).feeds[0].status, 'loading');
  b.series.isLoading = () => undefined;
  assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps })).feeds[0].code, 'FEED_STATE_UNREADABLE');
  assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:CCC@60'], _deps })).feeds[0].code, 'WORKSPACE_FEED_MISSING');
  b.series.isLoading = () => false; b.series.symbolInfo = () => ({ full_name: 'EXCHANGE:BBB' });
  b.series.status = () => 3; b.series.isStatusError = () => false;
  assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps })).success, true);
  b.series.isStatusError = () => true;
  assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps })).feeds[0].code, 'DATA_FEED_ERROR');
  for (const predicate of [undefined, () => undefined, () => 0, () => { throw new Error('unreadable'); }]) {
    b.series.isStatusError = predicate;
    assert.equal((await sampleOwnedFeeds({ feedSpecs: ['EXCHANGE:BBB@60'], _deps })).feeds[0].code, 'FEED_STATE_UNREADABLE');
  }
});

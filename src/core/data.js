/**
 * Core data access logic.
 */
import { evaluate, evaluateAsync, KNOWN_PATHS, safeString, requireInteger, configuredTarget } from '../connection.js';
import { readChartContext, symbolMatches, normalizeTimeframe } from '../chart-context.js';
import { nativeCheckpoint, nativeQuiescent } from '../session.js';
import { waitForChartReady } from '../wait.js';
import { reportExpression, STRATEGY_PAGE_CODE } from '../strategy-state.js';
import { createHash } from 'node:crypto';
import { projectStrategyProperties } from '../strategy-properties.js';
import { EQUITY_PAGE_CODE } from '../equity-plot-page.js';

const MAX_OHLCV_BARS = 20000;
const MAX_TRADES = 20;

// Round to 8 dp — enough to kill float noise (29899.999999997 → 29900) without
// destroying precision on forex/crypto prices. The old 2-dp rounding flattened
// sub-cent levels to 0.00 (issue upstream#77).
const roundPrice = (v) => (v == null ? null : Math.round(v * 1e8) / 1e8);
const CHART_API = KNOWN_PATHS.chartApi;
const BARS_PATH = KNOWN_PATHS.mainSeriesBars;

// Serializes getQuote() calls that mutate chart symbol so concurrent callers
// can't race over the shared chart state. JS is single-threaded but our
// awaits interleave; without this every parallel quote_get(symbol) would
// read whichever symbol the chart happened to be on at evaluate() time.
let _quoteLock = Promise.resolve();

async function readData(expression, _deps = {}) {
  const inspect = _deps.evaluate || evaluate;
  const result = await inspect(`(() => {
    const readContext = ${readChartContext.toString()};
    let context = null;
    try {
      context = readContext(window);
      const data = (${expression}), after = readContext(window);
      if (!context || !after || context.symbol !== after.symbol || context.resolution !== after.resolution
        || context.chart_type !== after.chart_type) throw new Error('DATA_CONTEXT_CHANGED: Chart changed during extraction.');
      return { data, context };
    } catch (error) {
      return { extraction_error: { code: error.code || String(error.message).match(/^([A-Z_]+):/)?.[1] || 'DATA_EXTRACTION_FAILED',
        message: error.message, details: { context, study_id: error.study_id ?? null, study_name: error.study_name ?? null, bar_index: error.bar_index ?? null } } };
    }
  })()`);
  if (result?.extraction_error) {
    const { code, message, details } = result.extraction_error;
    throw Object.assign(new Error(message), { code, details });
  }
  if (!result || !result.context) throw new Error('Chart context unavailable.');
  if (result.context.loading) throw Object.assign(new Error('Chart data is loading; retry after it becomes ready.'), { code: 'DATA_NOT_READY' });
  if (result.context.feed_error) throw Object.assign(new Error('Chart feed failed: ' + result.context.feed_error), { code: 'DATA_FEED_ERROR' });
  return { ...result, context: { ...result.context, target_id: _deps.targetId || configuredTarget() } };
}

async function graphics(collection, map, filter, _deps) {
  const result = await readData(buildGraphicsJS(collection, map, filter), _deps);
  if (filter && result.data.matched_studies === 0) {
    throw Object.assign(new Error('No study matches filter: ' + filter), { code: 'STUDY_NOT_FOUND', details: { context: result.context } });
  }
  return { raw: result.data.studies, context: result.context };
}

function buildGraphicsJS(collectionName, mapKey, filter) {
  return `
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      var filter = ${safeString(filter || '')};
      var matched = 0;
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (!name) continue;
          if (filter && name.indexOf(filter) === -1) continue;
          matched++;
          var g = s._graphics;
          if (!g || !g._primitivesCollection) continue;
          var pc = g._primitivesCollection;
          var items = [];
          try {
            var outer = pc.${collectionName};
            if (outer) {
              var inner = outer.get('${mapKey}');
              if (inner && typeof inner.get === 'function') {
                var coll = inner.get(false);
                if (coll && coll._primitivesDataById && coll._primitivesDataById.size > 0) {
                  coll._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              } else if (inner && '${collectionName}' !== 'dwgtablecells') throw new Error('Unsupported graphics collection shape.');
            }
          } catch(e) { throw new Error('Graphics collection read failed: ' + e.message); }
          if (items.length === 0 && '${collectionName}' === 'dwgtablecells') {
            try {
              var tcOuter = pc.dwgtablecells;
              if (tcOuter) {
                var tcColl = tcOuter.get('tableCells');
                if (tcColl && tcColl._primitivesDataById && tcColl._primitivesDataById.size > 0) {
                  tcColl._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            } catch(e) { throw new Error('Table collection read failed: ' + e.message); }
          }
          if (items.length > 0) results.push({name: name, count: items.length, items: items});
        } catch(e) {
          var studyId = null; try { studyId = s.id?.() ?? null; } catch {}
          throw Object.assign(new Error('GRAPHICS_EXTRACTION_FAILED: ' + e.message), { code:'GRAPHICS_EXTRACTION_FAILED', study_id:studyId, study_name:name || null });
        }
      }
      return { studies: results, matched_studies: matched };
    })()
  `;
}

export async function getOhlcv({ count, summary, _deps } = {}) {
  const limit = requireInteger(count === undefined ? 500 : count, 'count', 1, MAX_OHLCV_BARS);
  const extracted = await readData(`
      (function() {
        var bars = ${BARS_PATH};
        if (!bars || typeof bars.lastIndex !== 'function') return null;
        var result = [];
        var end = bars.lastIndex();
        var start = Math.max(bars.firstIndex(), end - ${limit} + 1);
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (!v) throw Object.assign(new Error('OHLCV_EXTRACTION_FAILED: Missing bar inside requested range.'), { code:'OHLCV_EXTRACTION_FAILED', bar_index:i });
          result.push({time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] ?? null});
        }
        return {bars: result, total_bars: bars.size(), source: 'direct_bars'};
      })()
    `, _deps);
  const { data, context } = extracted;

  if (!data || !data.bars || data.bars.length === 0) {
    throw new Error('Could not extract OHLCV data. The chart may still be loading.');
  }

  if (summary) {
    const bars = data.bars;
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);
    const volumes = bars.map(b => b.volume);
    const first = bars[0];
    const last = bars[bars.length - 1];
    return {
      success: true, context, requested: limit, applied: bars.length, limit: MAX_OHLCV_BARS,
      truncated: data.total_bars > bars.length, insufficient_history: bars.length < limit,
      total_available: data.total_bars, bar_count: bars.length,
      period: { from: first.time, to: last.time },
      open: first.open, close: last.close,
      high: Math.max(...highs), low: Math.min(...lows),
      range: roundPrice(Math.max(...highs) - Math.min(...lows)),
      change: roundPrice(last.close - first.open),
      change_pct: Math.round(((last.close - first.open) / first.open) * 10000) / 100 + '%',
      avg_volume: volumes.every(Number.isFinite) ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length) : null,
      last_5_bars: bars.slice(-5),
    };
  }

  return { success: true, context, requested: limit, applied: data.bars.length, limit: MAX_OHLCV_BARS,
    truncated: data.total_bars > data.bars.length, insufficient_history: data.bars.length < limit,
    bar_count: data.bars.length, total_available: data.total_bars, source: data.source, bars: data.bars };
}

export async function getIndicator({ entity_id }) {
  const data = await evaluate(`
    (function() {
      var api = ${CHART_API};
      var study = api.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      var result = { name: null, inputs: null, visible: null };
      try { result.visible = study.isVisible(); } catch(e) {}
      try { result.inputs = study.getInputValues(); } catch(e) { result.inputs_error = e.message; }
      return result;
    })()
  `);

  if (data?.error) throw new Error(data.error);

  let inputs = data?.inputs;
  if (Array.isArray(inputs)) {
    inputs = inputs.filter(inp => {
      if (inp.id === 'text' && typeof inp.value === 'string' && inp.value.length > 200) return false;
      if (typeof inp.value === 'string' && inp.value.length > 500) return false;
      return true;
    });
  }
  return { success: true, entity_id, visible: data?.visible, inputs };
}

export async function getStrategyResults(options = {}) {
  const inspect = options._deps?.evaluate || evaluate;
  const result=await inspect(reportExpression({ strategy_id: options.strategy_id, strategy: options.strategy }));
  if(result.effective_properties)result.effective_properties=projectStrategyProperties(result.effective_properties);
  return result;
}

export async function getTrades({ max_trades = 20, strategy_id, _deps } = {}) {
  if (!Number.isInteger(max_trades) || max_trades < 1) throw new Error('max_trades must be a positive integer.');
  const limit = Math.min(max_trades, MAX_TRADES);
  const inspect = _deps?.evaluate || evaluate;
  return inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    const found = pageStrategies(window).find(item => item.id === summary.strategy_id);
    let orders = found.source.ordersData?.(); if (orders?.value) orders = orders.value();
    if (!Array.isArray(orders)) return {success:false,code:'ORDERS_UNAVAILABLE',error:'Strategy orders unavailable.'};
    const trades = orders.slice(-${limit}).map(order => ({ id:order.id,type:order.tp,
      side:order.b?'buy':'sell',entry:order.e,price:order.p,qty:order.q,
      order_seq:order.tm,time_index:order.tm }));
    return {success:true,strategy_id:summary.strategy_id,compilation_token:summary.compilation_token,
      source_hash:summary.source_hash,strategy_inputs:summary.strategy_inputs,
      trade_count:trades.length,total_orders:orders.length,source:'internal_api',trades,orders:trades,
      record_kind:'orders',context:summary.context,requested:${max_trades},applied:trades.length,limit:${limit},truncated:orders.length>trades.length,
      units:{order_seq:'ordinal',time_index:'deprecated ordinal alias'}};
  })()`);
}

/** Paginated trade ledger, preserving native fields alongside explicit UTC timestamps. */
export async function getTradeLedger({ offset = 0, limit = 100, strategy_id, report_revision, _deps } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset + limit)) throw new Error('Require safe offset >= 0 and limit 1..500.');
  const inspect = _deps?.evaluate || evaluate;
  const result = await inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    const item = pageStrategies(window).find(strategy => strategy.id === summary.strategy_id);
    const ledger = item.report.trades;
    if (!Array.isArray(ledger)) return { success: false, code:'LEDGER_UNAVAILABLE', error: 'Trade ledger unavailable in this build.' };
    const time = strategyTime;
    const trades = ledger.slice(${offset}, ${offset + limit}).map((trade, index) => {
      const open = strategyTradeIsOpen(trade);
      return {trade_seq: index + ${offset}, entry_time: time(trade.e?.tm), exit_time: open ? null : time(trade.x?.tm),
      open, mark_time: open ? time(trade.x?.tm) : null, mark_bar: open ? trade.x?.b ?? null : null,
      timestamp_errors: ['e','x'].filter(key => trade[key]?.tm != null && time(trade[key].tm) == null),
      entry_bar: trade.e?.b ?? null, exit_bar: open ? null : trade.x?.b ?? null, raw: trade };});
    return { success: true,mode:summary.mode, strategy_id: summary.strategy_id, currency: summary.currency, total_trades: ledger.length,
      compilation_token:summary.compilation_token,source_hash:summary.source_hash,strategy_inputs:summary.strategy_inputs,
      context:summary.context,effective_properties:summary.effective_properties,backtest_window:summary.backtest_window,loaded_window:summary.loaded_window,trade_window:summary.trade_window,
      record_kind:'trade_ledger',order:'native_ordinal_ascending',
      units:{time_fields:'ISO-8601 UTC',raw_time:'native tm; magnitude < 1e11 interpreted as seconds, otherwise milliseconds'},
      _snapshot:JSON.stringify({strategy_id:summary.strategy_id,token:summary.compilation_token,source_hash:summary.source_hash,
        inputs:summary.strategy_inputs,symbol:summary.context.symbol,resolution:summary.context.resolution,chart_type:summary.context.chart_type,
        effective_properties:summary.effective_properties,performance:item.report.performance,settings:item.report.settings,trades:ledger}),
      offset: ${offset}, limit: ${limit}, trades, has_more: ${offset + limit} < ledger.length,
      next_offset: ${offset + limit} < ledger.length ? ${offset} + trades.length : null };
  })()`);
  if (!result.success) return result;
  const { _snapshot, ...page } = result;
  const revision = createHash('sha256').update(_snapshot).digest('hex');
  if (report_revision && report_revision !== revision) return { success: false, code: 'REPORT_CHANGED',
    error: 'Strategy report changed during pagination; restart collection at offset 0.',
    expected_revision: report_revision, report_revision: revision, strategy_id: page.strategy_id };
  return { ...page, ...(page.effective_properties?{effective_properties:projectStrategyProperties(page.effective_properties)}:{}),report_revision: revision };
}

export async function getEquity({ strategy_id,plot_id,offset=0,limit=100,report_revision,mode='normal',list_plots=false,export_all=false,_deps } = {}) {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(offset+limit))throw Object.assign(new Error('Require safe offset >= 0 and limit 1..500.'),{code:'INVALID_EQUITY_REQUEST'});
  if(mode!=='normal')return {success:false,code:'EQUITY_DEEP_UNSUPPORTED',error:'No verified native per-bar Deep equity plot path is available; no normal fallback.'};
  if(list_plots&&plot_id||export_all&&!plot_id||list_plots&&export_all)throw Object.assign(new Error('list-plots and plot-id/export are separate modes; exporting requires an explicit plot-id.'),{code:'INVALID_EQUITY_REQUEST'});
  if(plot_id||list_plots){const result=await (_deps?.evaluateAsync||_deps?.evaluate||evaluateAsync)(`(async()=>{${EQUITY_PAGE_CODE};return readEquityPlot(window,document,${JSON.stringify({strategy_id,plot_id,offset,limit,report_revision,list_plots,export_all})});})()`);return result.success?{...result,...(result.effective_properties?{effective_properties:projectStrategyProperties(result.effective_properties)}:{})}:result;}
  const inspect = _deps?.evaluate || evaluate;
  return inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    return {success:false,code:'EQUITY_UNAVAILABLE',data:[],data_points:0,
      error:'Select an explicit native plot of strategy.equity; an untyped report array does not verify per-bar equity.'};
  })()`);
}

export async function getQuote({ symbol, _deps } = {}) {
  // Serialize: chained on _quoteLock so parallel callers run one after another.
  // Catch on the lock chain prevents a single failure from poisoning the chain.
  const run = _quoteLock.then(() => _getQuoteInternal({ symbol, _deps }));
  _quoteLock = run.then(() => {}, () => {});
  return run;
}

async function _getQuoteInternal({ symbol, _deps = {} } = {}) {
  const inspect = _deps.evaluate || evaluate;
  const inspectAsync = _deps.evaluateAsync || evaluateAsync;
  const wait = _deps.waitForChartReady || waitForChartReady;
  const requested = String(symbol || '').trim();
  const original = await inspect(`(${readChartContext.toString()})(window)`);
  if (!original) throw new Error('Original chart context is unavailable; no quote switch was dispatched.');
  const needsRestore = Boolean(requested && !symbolMatches(requested, original));
  let result, primaryError, restoreError;
  const changeSymbol = async value => {
    await inspectAsync(`${CHART_API}.setSymbol(${safeString(value)}, {})`, { mutation: true });
    if (!await wait(value)) throw new Error('Chart readiness was not verified for ' + value);
  };
  try {
    if (needsRestore) {
      nativeCheckpoint('quote', configuredTarget(), { original_context: original });
      await changeSymbol(requested);
    }
    const { data, context } = await readData(`
      (function() {
        var api = ${CHART_API};
        var sym = '';
        try { sym = api.symbol(); } catch(e) {}
        if (!sym) { try { sym = api.symbolExt().symbol; } catch(e) {} }
        var ext = {};
        try { ext = api.symbolExt() || {}; } catch(e) {}
        var bars = ${BARS_PATH};
        var quote = { symbol: sym };
        if (bars && typeof bars.lastIndex === 'function') {
          var last = bars.valueAt(bars.lastIndex());
          if (last) { quote.time = last[0]; quote.open = last[1]; quote.high = last[2]; quote.low = last[3]; quote.close = last[4]; quote.last = last[4]; quote.volume = last[5] || 0; }
        }
        try {
          var bidEl = document.querySelector('[class*="bid"] [class*="price"], [class*="dom-"] [class*="bid"]');
          var askEl = document.querySelector('[class*="ask"] [class*="price"], [class*="dom-"] [class*="ask"]');
          if (bidEl) quote.bid = parseFloat(bidEl.textContent.replace(/[^0-9.\\-]/g, ''));
          if (askEl) quote.ask = parseFloat(askEl.textContent.replace(/[^0-9.\\-]/g, ''));
        } catch(e) {}
        try {
          var hdr = document.querySelector('[class*="headerRow"] [class*="last-"]');
          if (hdr) { var hdrPrice = parseFloat(hdr.textContent.replace(/[^0-9.\\-]/g, '')); if (!isNaN(hdrPrice)) quote.header_price = hdrPrice; }
        } catch(e) {}
        if (ext.description) quote.description = ext.description;
        if (ext.exchange) quote.exchange = ext.exchange;
        if (ext.type) quote.type = ext.type;
        return quote;
      })()
    `, _deps);
    if (requested && !symbolMatches(requested, context)) throw new Error('Quote context does not match requested symbol.');
    if (!data || (data.last == null && data.close == null)) throw new Error('No quote is available for this chart.');
    result = { success: true, ...data, requested_symbol: requested || null, context };
  } catch (error) { primaryError = error; }
  finally {
    if (needsRestore) {
      try { await changeSymbol(original.symbol); }
      catch (error) { restoreError = error; }
    }
  }
  let finalContext;
  try { finalContext = await inspect(`(${readChartContext.toString()})(window)`); }
  catch (error) { restoreError ||= error; }
  const restored = !restoreError && Boolean(finalContext && symbolMatches(original.symbol, finalContext)
    && normalizeTimeframe(finalContext.resolution) === normalizeTimeframe(original.resolution));
  if (primaryError || !restored) return { ...result, success: false, requested_symbol: requested || null,
    restored, actual_context: finalContext || null, error: primaryError?.message || 'Original chart could not be restored.',
    restore_error: restoreError?.message, recovery_required: !restored || [primaryError, restoreError].some(error => error?.code === 'CDP_TIMEOUT') };
  if (needsRestore) nativeQuiescent();
  return { ...result, restored: true, actual_context: finalContext };
}

export async function getDepth() {
  const data = await evaluate(`
    (function() {
      var domPanel = document.querySelector('[class*="depth"]')
        || document.querySelector('[class*="orderBook"]')
        || document.querySelector('[class*="dom-"]')
        || document.querySelector('[class*="DOM"]')
        || document.querySelector('[data-name="dom"]');
      if (!domPanel) return { found: false, error: 'DOM / Depth of Market panel not found.' };
      var bids = [], asks = [];
      var rows = domPanel.querySelectorAll('[class*="row"], tr');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var priceEl = row.querySelector('[class*="price"]');
        var sizeEl = row.querySelector('[class*="size"], [class*="volume"], [class*="qty"]');
        if (!priceEl) continue;
        var price = parseFloat(priceEl.textContent.replace(/[^0-9.\\-]/g, ''));
        var size = sizeEl ? parseFloat(sizeEl.textContent.replace(/[^0-9.\\-]/g, '')) : 0;
        if (isNaN(price)) continue;
        var rowClass = row.className || '';
        var rowHTML = row.innerHTML || '';
        if (/bid|buy/i.test(rowClass) || /bid|buy/i.test(rowHTML)) bids.push({ price, size });
        else if (/ask|sell/i.test(rowClass) || /ask|sell/i.test(rowHTML)) asks.push({ price, size });
        else if (i < rows.length / 2) asks.push({ price, size });
        else bids.push({ price, size });
      }
      if (bids.length === 0 && asks.length === 0) {
        var cells = domPanel.querySelectorAll('[class*="cell"], td');
        var prices = [];
        cells.forEach(function(c) { var val = parseFloat(c.textContent.replace(/[^0-9.\\-]/g, '')); if (!isNaN(val) && val > 0) prices.push(val); });
        if (prices.length > 0) return { found: true, raw_values: prices.slice(0, 50), bids: [], asks: [], note: 'Could not classify bid/ask levels.' };
      }
      bids.sort(function(a, b) { return b.price - a.price; });
      asks.sort(function(a, b) { return a.price - b.price; });
      var spread = null;
      if (asks.length > 0 && bids.length > 0) spread = +(asks[0].price - bids[0].price).toFixed(6);
      return { found: true, bids: bids, asks: asks, spread: spread };
    })()
  `);

  if (!data || !data.found) throw new Error(data?.error || 'DOM panel not found.');
  return { success: true, bid_levels: data.bids?.length || 0, ask_levels: data.asks?.length || 0, spread: data.spread, bids: data.bids || [], asks: data.asks || [], raw_values: data.raw_values, note: data.note };
}

export async function getStudyValues({ _deps } = {}) {
  const { data, context } = await readData(`
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo || typeof s.dataWindowView !== 'function') continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (!name) continue;
          var values = {};
          try {
            var dwv = s.dataWindowView();
            if (dwv) {
              var items = dwv.items();
              if (items) {
                for (var i = 0; i < items.length; i++) {
                  var item = items[i];
                  if (item._value && item._value !== '∅' && item._title) values[item._title] = item._value;
                }
              }
            }
          } catch(e) { throw new Error('Data window read failed: ' + e.message); }
          // Include id + inputs so multiple instances of the same indicator
          // (e.g. two EMAs with different lengths) are distinguishable (upstream#143).
          var id = null;
          try { id = s.id ? s.id() : null; } catch(e) {}
          var inputs = null;
          try { var ip = s.inputs ? s.inputs() : null; if (ip && Object.keys(ip).length) inputs = Object.fromEntries(Object.entries(ip).filter(([key]) => key !== 'text')); } catch(e) {}
          if (Object.keys(values).length > 0) results.push({ id: id, name: name, inputs: inputs, values: values });
        } catch(e) {
          var studyId = null; try { studyId = s.id?.() ?? null; } catch {}
          throw Object.assign(new Error('VALUES_EXTRACTION_FAILED: ' + e.message), { code:'VALUES_EXTRACTION_FAILED', study_id:studyId, study_name:name || null });
        }
      }
      return results;
    })()
  `, _deps);
  return { success: true, context, study_count: data?.length || 0, studies: data || [] };
}

export async function getPineLines({ study_filter, verbose, _deps } = {}) {
  const filter = study_filter || '';
  const { raw, context } = await graphics('dwglines', 'lines', filter, _deps);
  if (!raw || raw.length === 0) return { success: true, context, study_count: 0, studies: [] };

  const studies = raw.map(s => {
    const hLevels = [];
    const seen = {};
    const allLines = [];
    for (const item of s.items) {
      const v = item.raw;
      const y1 = roundPrice(v.y1);
      const y2 = roundPrice(v.y2);
      if (verbose) allLines.push({ id: item.id, y1, y2, x1: v.x1, x2: v.x2, horizontal: v.y1 === v.y2, style: v.st, width: v.w, color: v.ci });
      if (y1 != null && v.y1 === v.y2 && !seen[y1]) { hLevels.push(y1); seen[y1] = true; }
    }
    hLevels.sort((a, b) => b - a);
    const result = { name: s.name, total_lines: s.count, horizontal_levels: hLevels };
    if (verbose) result.all_lines = allLines;
    return result;
  });
  return { success: true, context, study_count: studies.length, studies };
}

export async function getPineLabels({ study_filter, max_labels, verbose, _deps } = {}) {
  const limit = requireInteger(max_labels === undefined ? 50 : max_labels, 'max_labels');
  const filter = study_filter || '';
  const { raw, context } = await graphics('dwglabels', 'labels', filter, _deps);
  if (!raw || raw.length === 0) return { success: true, context, study_count: 0, studies: [] };

  const studies = raw.map(s => {
    let labels = [...s.items].sort((a,b) => (b.raw.x ?? -Infinity) - (a.raw.x ?? -Infinity)).map(item => {
      const v = item.raw;
      const text = v.t || '';
      const price = roundPrice(v.y);
      if (verbose) return { id: item.id, text, price, x: v.x, yloc: v.yl, size: v.sz, textColor: v.tci, color: v.ci };
      return { text, price, x: v.x };
    }).filter(l => l.text || l.price != null);
    if (labels.length > limit) labels = labels.slice(0,limit);
    return { name: s.name, total_labels: s.count, showing: labels.length, requested: limit, truncated: s.count > labels.length, sort: 'x_descending_stable', labels };
  });
  return { success: true, context, study_count: studies.length, studies };
}

export async function getPineTables({ study_filter, _deps } = {}) {
  const filter = study_filter || '';
  const { raw, context } = await graphics('dwgtablecells', 'tableCells', filter, _deps);
  if (!raw || raw.length === 0) return { success: true, context, study_count: 0, studies: [] };

  const studies = raw.map(s => {
    const tables = {};
    for (const item of s.items) {
      const v = item.raw;
      const tid = v.tid || 0;
      if (!tables[tid]) tables[tid] = {};
      if (!tables[tid][v.row]) tables[tid][v.row] = {};
      tables[tid][v.row][v.col] = v.t || '';
    }
    const tableList = Object.entries(tables).map(([tid, rows]) => {
      const height = Math.max(...Object.keys(rows).map(Number)) + 1;
      const width = Math.max(...Object.values(rows).flatMap(row => Object.keys(row).map(Number))) + 1;
      const cells = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => rows[row]?.[col] ?? ''));
      return { cells, rows: cells.map(row => row.join(' | ')), row_count: height, column_count: width };
    });
    return { name: s.name, tables: tableList };
  });
  return { success: true, context, study_count: studies.length, studies };
}

export async function getPineBoxes({ study_filter, verbose, _deps } = {}) {
  const filter = study_filter || '';
  const { raw, context } = await graphics('dwgboxes', 'boxes', filter, _deps);
  if (!raw || raw.length === 0) return { success: true, context, study_count: 0, studies: [] };

  const studies = raw.map(s => {
    const zones = [];
    const seen = {};
    const allBoxes = [];
    for (const item of s.items) {
      const v = item.raw;
      const high = v.y1 != null && v.y2 != null ? roundPrice(Math.max(v.y1, v.y2)) : null;
      const low = v.y1 != null && v.y2 != null ? roundPrice(Math.min(v.y1, v.y2)) : null;
      if (verbose) allBoxes.push({ id: item.id, high, low, x1: v.x1, x2: v.x2, borderColor: v.c, bgColor: v.bc });
      if (high != null && low != null) { const key = high + ':' + low; if (!seen[key]) { zones.push({ high, low }); seen[key] = true; } }
    }
    zones.sort((a, b) => b.high - a.high);
    const result = { name: s.name, total_boxes: s.count, zones };
    if (verbose) result.all_boxes = allBoxes;
    return result;
  });
  return { success: true, context, study_count: studies.length, studies };
}

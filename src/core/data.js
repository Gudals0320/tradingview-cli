/**
 * Core data access logic.
 */
import { evaluate, evaluateAsync, KNOWN_PATHS, safeString } from '../connection.js';
import { waitForChartReady } from '../wait.js';
import { reportExpression, STRATEGY_PAGE_CODE } from '../strategy-state.js';

const MAX_OHLCV_BARS = 500;
const MAX_TRADES = 20;

// Round to 8 dp — enough to kill float noise (29899.999999997 → 29900) without
// destroying precision on forex/crypto prices. The old 2-dp rounding flattened
// sub-cent levels to 0.00 (issue #77).
const roundPrice = (v) => (v == null ? null : Math.round(v * 1e8) / 1e8);
const CHART_API = KNOWN_PATHS.chartApi;
const BARS_PATH = KNOWN_PATHS.mainSeriesBars;

// Serializes getQuote() calls that mutate chart symbol so concurrent callers
// can't race over the shared chart state. JS is single-threaded but our
// awaits interleave; without this every parallel quote_get(symbol) would
// read whichever symbol the chart happened to be on at evaluate() time.
let _quoteLock = Promise.resolve();

// Shared page-context JS: locate the strategy data source. Strategies are
// identified by metaInfo().isTVScriptStrategy / is_strategy — NOT by
// is_price_study===false (that was the #48/#173/#181 bug: strategies actually
// have is_price_study===true, so the old check excluded every one). Falls
// back to any source exposing reportData/ordersData.
const FIND_STRATEGY_JS = `
  function _reportOf(s) {
    try { var rd = s.reportData(); if (rd && typeof rd.value === 'function') rd = rd.value(); return rd; } catch (e) { return null; }
  }
  function findStrategies() {
    var chart = ${CHART_API}._chartWidget;
    var sources = chart.model().model().dataSources();
    var strategies = [];
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i], mi = null;
      try { mi = s.metaInfo ? s.metaInfo() : null; } catch (e) {}
      var isStrat = mi && (mi.isTVScriptStrategy || mi.is_strategy);
      if ((isStrat || typeof s.reportData === 'function') && typeof s.reportData === 'function') {
        strategies.push({ s: s, name: mi ? mi.description : null });
      }
    }
    return strategies;
  }
  // Returns { strat, report } — prefers a strategy whose report is actually
  // computed (the one selected in the Strategy Tester panel). With multiple
  // strategies on the chart, only the selected one has non-null reportData,
  // so returning the first strategy blindly reads the wrong (empty) one.
  function findStrategy() {
    var strategies = findStrategies();
    // Prefer one with a computed report (has .performance).
    for (var j = 0; j < strategies.length; j++) {
      var rd = _reportOf(strategies[j].s);
      if (rd && rd.performance) return { strat: strategies[j].s, report: rd, name: strategies[j].name, strategy_count: strategies.length };
    }
    // None computed — return the first so callers can hint "open the panel".
    if (strategies.length) return { strat: strategies[0].s, report: null, name: strategies[0].name, strategy_count: strategies.length };
    return null;
  }
  // TradingView never computes a report for a hidden strategy (crossed-out eye
  // in the legend), so a hidden one looks identical to "panel not opened yet".
  // Unhide any hidden strategies and report their names so callers can tell
  // the user what changed.
  function unhideStrategies() {
    var unhidden = [];
    var strategies = findStrategies();
    for (var i = 0; i < strategies.length; i++) {
      var s = strategies[i].s;
      try {
        var vis = null;
        try { vis = s.properties().visible.value(); } catch (e) {}
        if (vis !== false) continue;
        var done = false;
        try { s.properties().visible.setValue(true); done = true; } catch (e) {}
        if (!done) {
          try { var st = ${CHART_API}.getStudyById(s.id()); if (st) { st.setVisible(true); done = true; } } catch (e) {}
        }
        if (done) unhidden.push(strategies[i].name || 'strategy');
      } catch (e) {}
    }
    return unhidden;
  }
`;

function buildGraphicsJS(collectionName, mapKey, filter) {
  return `
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      var filter = ${safeString(filter || '')};
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (!name) continue;
          if (filter && name.indexOf(filter) === -1) continue;
          var g = s._graphics;
          if (!g || !g._primitivesCollection) continue;
          var pc = g._primitivesCollection;
          var items = [];
          try {
            var outer = pc.${collectionName};
            if (outer) {
              var inner = outer.get('${mapKey}');
              if (inner) {
                var coll = inner.get(false);
                if (coll && coll._primitivesDataById && coll._primitivesDataById.size > 0) {
                  coll._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            }
          } catch(e) {}
          if (items.length === 0 && '${collectionName}' === 'dwgtablecells') {
            try {
              var tcOuter = pc.dwgtablecells;
              if (tcOuter) {
                var tcColl = tcOuter.get('tableCells');
                if (tcColl && tcColl._primitivesDataById && tcColl._primitivesDataById.size > 0) {
                  tcColl._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            } catch(e) {}
          }
          if (items.length > 0) results.push({name: name, count: items.length, items: items});
        } catch(e) {}
      }
      return results;
    })()
  `;
}

export async function getOhlcv({ count, summary } = {}) {
  const limit = Math.min(count || 100, MAX_OHLCV_BARS);
  let data;
  try {
    data = await evaluate(`
      (function() {
        var bars = ${BARS_PATH};
        if (!bars || typeof bars.lastIndex !== 'function') return null;
        var result = [];
        var end = bars.lastIndex();
        var start = Math.max(bars.firstIndex(), end - ${limit} + 1);
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (v) result.push({time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0});
        }
        return {bars: result, total_bars: bars.size(), source: 'direct_bars'};
      })()
    `);
  } catch { data = null; }

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
      success: true, bar_count: bars.length,
      period: { from: first.time, to: last.time },
      open: first.open, close: last.close,
      high: Math.max(...highs), low: Math.min(...lows),
      range: roundPrice(Math.max(...highs) - Math.min(...lows)),
      change: roundPrice(last.close - first.open),
      change_pct: Math.round(((last.close - first.open) / first.open) * 10000) / 100 + '%',
      avg_volume: Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length),
      last_5_bars: bars.slice(-5),
    };
  }

  return { success: true, bar_count: data.bars.length, total_available: data.total_bars, source: data.source, bars: data.bars };
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

// #173: TradingView doesn't compute strategy report/orders until the Strategy
// Tester panel is opened — and never computes one for a hidden strategy.
// Ensure the panel is open (via bottomWidgetBar), unhide any hidden
// strategies, and wait for reportData to populate, so the strategy read tools
// work even when the panel started closed or the strategy was hidden.
// Returns { status, unhidden } — unhidden lists strategies made visible.
async function ensureStrategyTesterReady(maxWaitMs = 6000) {
  const unhidden = await evaluate(`
    (function() {
      ${FIND_STRATEGY_JS}
      try {
        var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
        if (bwb && typeof bwb.showWidget === 'function') bwb.showWidget('backtesting');
      } catch (e) {}
      return unhideStrategies();
    })()
  `);
  const deadline = Date.now() + maxWaitMs;
  let status = 'timeout';
  while (Date.now() < deadline) {
    const ready = await evaluate(`
      (function() {
        ${FIND_STRATEGY_JS}
        var f = findStrategy();
        if (!f) return 'no-strategy';
        return f.report && f.report.performance ? 'ready' : 'pending';
      })()
    `);
    if (ready === 'ready' || ready === 'no-strategy') { status = ready; break; }
    await new Promise(r => setTimeout(r, 500));
  }
  return { status, unhidden: unhidden || [] };
}

export async function getStrategyResults(options = {}) {
  const inspect = options._deps?.evaluate || evaluate;
  if (!options._deps) await ensureStrategyTesterReady();
  return inspect(reportExpression({ strategy_id: options.strategy_id, strategy: options.strategy }));
}

export async function getTrades({ max_trades = 20, strategy_id, _deps } = {}) {
  if (!Number.isInteger(max_trades) || max_trades < 1) throw new Error('max_trades must be a positive integer.');
  const limit = Math.min(max_trades, MAX_TRADES);
  const inspect = _deps?.evaluate || evaluate;
  if (!_deps) await ensureStrategyTesterReady();
  return inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    const found = pageStrategies(window).find(item => item.id === summary.strategy_id);
    let orders = found.source.ordersData?.(); if (orders?.value) orders = orders.value();
    if (!Array.isArray(orders)) return {success:false,error:'Strategy orders unavailable.'};
    const trades = orders.slice(-${limit}).map(order => ({ id:order.id,type:order.tp,
      side:order.b?'buy':'sell',entry:order.e,price:order.p,qty:order.q,
      order_seq:order.tm,time_index:order.tm }));
    return {success:true,strategy_id:summary.strategy_id,compilation_token:summary.compilation_token,
      trade_count:trades.length,total_orders:orders.length,source:'internal_api',trades,
      units:{order_seq:'ordinal',time_index:'deprecated ordinal alias'}};
  })()`);
}

/** Paginated trade ledger, preserving native fields alongside explicit UTC timestamps. */
export async function getTradeLedger({ offset = 0, limit = 100, strategy_id, _deps } = {}) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Require offset >= 0 and limit 1..500.');
  const inspect = _deps?.evaluate || evaluate;
  if (!_deps) await ensureStrategyTesterReady();
  return inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    const item = pageStrategies(window).find(strategy => strategy.id === summary.strategy_id);
    const ledger = item.report.trades;
    if (!Array.isArray(ledger)) return { success: false, error: 'Trade ledger unavailable in this build.' };
    const time = value => value == null ? null : new Date(value < 1e11 ? value * 1000 : value).toISOString();
    const trades = ledger.slice(${offset}, ${offset + limit}).map((trade, index) => ({
      trade_seq: index + ${offset}, entry_time: time(trade.e?.tm), exit_time: time(trade.x?.tm),
      entry_bar: trade.e?.b ?? null, exit_bar: trade.x?.b ?? null, raw: trade }));
    return { success: true, strategy_id: summary.strategy_id, currency: summary.currency, total_trades: ledger.length,
      offset: ${offset}, limit: ${limit}, trades, has_more: ${offset + limit} < ledger.length };
  })()`);
}

export async function getEquity({ strategy_id, _deps } = {}) {
  const inspect = _deps?.evaluate || evaluate;
  if (!_deps) await ensureStrategyTesterReady();
  return inspect(`(() => { ${STRATEGY_PAGE_CODE};
    const summary = readStrategyReport(window, ${JSON.stringify({ strategy_id })});
    if (!summary.success) return summary;
    const report = pageStrategies(window).find(item => item.id === summary.strategy_id).report;
    const curve = report.equity || report.equityChart;
    if (Array.isArray(curve)) return {success:true,data:curve,data_points:curve.length,source:'internal_api',strategy_id:summary.strategy_id};
    return {success:false,code:'EQUITY_UNAVAILABLE',data:[],data_points:0,
      buy_hold_points:Array.isArray(report.buyHold)?report.buyHold.length:0,
      error:'Per-bar equity is unavailable in this Desktop build; buy-and-hold is not strategy equity.'};
  })()`);
}

export async function getQuote({ symbol } = {}) {
  // Serialize: chained on _quoteLock so parallel callers run one after another.
  // Catch on the lock chain prevents a single failure from poisoning the chain.
  const run = _quoteLock.then(() => _getQuoteInternal({ symbol }));
  _quoteLock = run.then(() => {}, () => {});
  return run;
}

async function _getQuoteInternal({ symbol } = {}) {
  const requested = (symbol || '').toString().trim();
  let originalSymbol = null;
  let needsRestore = false;

  if (requested) {
    try { originalSymbol = await evaluate(`${CHART_API}.symbol()`); } catch {}
    const bare = (s) => (s || '').toString().split(':').pop().toUpperCase();
    if (bare(originalSymbol) !== bare(requested)) {
      needsRestore = true;
      await evaluateAsync(`
        (function() {
          var chart = ${CHART_API};
          return new Promise(function(resolve) {
            chart.setSymbol(${safeString(requested)}, {});
            setTimeout(resolve, 500);
          });
        })()
      `);
      await waitForChartReady(requested);
    }
  }

  try {
    const data = await evaluate(`
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
    `);
    if (!data || (!data.last && !data.close)) throw new Error('Could not retrieve quote. The chart may still be loading.');
    return { success: true, ...data };
  } finally {
    if (needsRestore && originalSymbol) {
      try {
        await evaluateAsync(`
          (function() {
            var chart = ${CHART_API};
            return new Promise(function(resolve) {
              chart.setSymbol(${safeString(originalSymbol)}, {});
              setTimeout(resolve, 500);
            });
          })()
        `);
        await waitForChartReady(originalSymbol);
      } catch {}
    }
  }
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

export async function getStudyValues() {
  const data = await evaluate(`
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
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
          } catch(e) {}
          // Include id + inputs so multiple instances of the same indicator
          // (e.g. two EMAs with different lengths) are distinguishable (#143).
          var id = null;
          try { id = s.id ? s.id() : null; } catch(e) {}
          var inputs = null;
          try { var ip = s.inputs ? s.inputs() : null; if (ip && Object.keys(ip).length) inputs = ip; } catch(e) {}
          if (Object.keys(values).length > 0) results.push({ id: id, name: name, inputs: inputs, values: values });
        } catch(e) {}
      }
      return results;
    })()
  `);
  return { success: true, study_count: data?.length || 0, studies: data || [] };
}

export async function getPineLines({ study_filter, verbose } = {}) {
  const filter = study_filter || '';
  const raw = await evaluate(buildGraphicsJS('dwglines', 'lines', filter));
  if (!raw || raw.length === 0) return { success: true, study_count: 0, studies: [] };

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
  return { success: true, study_count: studies.length, studies };
}

export async function getPineLabels({ study_filter, max_labels, verbose } = {}) {
  const filter = study_filter || '';
  const raw = await evaluate(buildGraphicsJS('dwglabels', 'labels', filter));
  if (!raw || raw.length === 0) return { success: true, study_count: 0, studies: [] };

  const limit = max_labels || 50;
  const studies = raw.map(s => {
    let labels = s.items.map(item => {
      const v = item.raw;
      const text = v.t || '';
      const price = roundPrice(v.y);
      if (verbose) return { id: item.id, text, price, x: v.x, yloc: v.yl, size: v.sz, textColor: v.tci, color: v.ci };
      return { text, price };
    }).filter(l => l.text || l.price != null);
    if (labels.length > limit) labels = labels.slice(-limit);
    return { name: s.name, total_labels: s.count, showing: labels.length, labels };
  });
  return { success: true, study_count: studies.length, studies };
}

export async function getPineTables({ study_filter } = {}) {
  const filter = study_filter || '';
  const raw = await evaluate(buildGraphicsJS('dwgtablecells', 'tableCells', filter));
  if (!raw || raw.length === 0) return { success: true, study_count: 0, studies: [] };

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
      const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
      const formatted = rowNums.map(rn => {
        const cols = rows[rn];
        const colNums = Object.keys(cols).map(Number).sort((a, b) => a - b);
        return colNums.map(cn => cols[cn]).filter(Boolean).join(' | ');
      }).filter(Boolean);
      return { rows: formatted };
    });
    return { name: s.name, tables: tableList };
  });
  return { success: true, study_count: studies.length, studies };
}

export async function getPineBoxes({ study_filter, verbose } = {}) {
  const filter = study_filter || '';
  const raw = await evaluate(buildGraphicsJS('dwgboxes', 'boxes', filter));
  if (!raw || raw.length === 0) return { success: true, study_count: 0, studies: [] };

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
  return { success: true, study_count: studies.length, studies };
}

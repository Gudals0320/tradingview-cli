/**
 * Core chart control logic.
 */
import { evaluate as _evaluate, evaluateAsync as _evaluateAsync, safeString, requireFinite, KNOWN_PATHS } from '../connection.js';
import { waitForChartReady as _waitForChartReady } from '../wait.js';
import { normalizeTimeframe, readChartContext, chartIdentity, historyCoverage } from '../chart-context.js';

const CHART_API = KNOWN_PATHS.chartApi;

function _resolve(deps) {
  return {
    evaluate: deps?.evaluate || _evaluate,
    evaluateAsync: deps?.evaluateAsync || _evaluateAsync,
    waitForChartReady: deps?.waitForChartReady || _waitForChartReady,
  };
}

export async function getState({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const state = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = [];
      try {
        var allStudies = chart.getAllStudies();
        studies = allStudies.map(function(s) {
          return { id: s.id, name: s.name || s.title || 'unknown' };
        });
      } catch(e) {}
      return {
        symbol: chart.symbol(),
        resolution: chart.resolution(),
        chartType: chart.chartType(),
        studies: studies,
      };
    })()
  `);
  return { success: true, ...state };
}

export async function setSymbol({ symbol, _deps }) {
  const { evaluateAsync, waitForChartReady } = _resolve(_deps);
  await evaluateAsync(`
    (function() {
      var chart = ${CHART_API};
      return new Promise(function(resolve) {
        chart.setSymbol(${safeString(symbol)}, {});
        setTimeout(resolve, 500);
      });
    })()
  `, { mutation: true });
  const ready = await waitForChartReady(symbol);
  return { success: ready, symbol, chart_ready: ready, ...(!ready && { recovery_required: true, error: `Chart did not become ready for ${symbol}.` }) };
}

export async function setTimeframe({ timeframe, _deps }) {
  timeframe = normalizeTimeframe(timeframe);
  const { evaluate, waitForChartReady } = _resolve(_deps);
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setResolution(${safeString(timeframe)}, {});
    })()
  `, { mutation: true });
  const ready = await waitForChartReady(null, timeframe);
  return { success: ready, timeframe, chart_ready: ready, ...(!ready && { recovery_required: true, error: `Chart did not reach timeframe ${timeframe}.` }) };
}

export async function setType({ chart_type, _deps }) {
  const { evaluate } = _resolve(_deps);
  const typeMap = {
    'Bars': 0, 'Candles': 1, 'Line': 2, 'Area': 3,
    'Renko': 4, 'Kagi': 5, 'PointAndFigure': 6, 'LineBreak': 7,
    'HeikinAshi': 8, 'HollowCandles': 9,
  };
  const typeNum = typeMap[chart_type] ?? Number(chart_type);
  if (isNaN(typeNum) || typeNum < 0 || typeNum > 9 || !Number.isInteger(typeNum)) {
    throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
  }
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setChartType(${typeNum});
    })()
  `, { mutation: true });
  return { success: true, chart_type, type_num: typeNum };
}

export async function manageIndicator({ action, indicator, entity_id, inputs: inputsRaw, _deps }) {
  const { evaluate } = _resolve(_deps);
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;

  if (action === 'add') {
    const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.createStudy(${safeString(indicator)}, false, false, []);
      })()
    `, { mutation: true });
    await new Promise(r => setTimeout(r, 1500));
    const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    const newIds = (after || []).filter(id => !(before || []).includes(id));
    const entityId = newIds[0] || null;

    // createStudy's inputs argument is unreliable across builds (upstream#249): the
    // study is created with defaults regardless. Apply overrides afterward
    // via the study's own getInputValues/setInputValues, then read back to
    // report what actually took.
    let appliedInputs;
    if (entityId && inputs && Object.keys(inputs).length) {
      const result = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var study = chart.getStudyById(${safeString(entityId)});
          if (!study || typeof study.getInputValues !== 'function') return { error: 'inputs unsupported for this study' };
          var current = study.getInputValues();
          var overrides = ${JSON.stringify(inputs)};
          var applied = {}, unknown = [];
          var byId = {};
          for (var i = 0; i < current.length; i++) byId[current[i].id] = true;
          for (var k in overrides) {
            if (byId[k]) { for (var j = 0; j < current.length; j++) { if (current[j].id === k) current[j].value = overrides[k]; } applied[k] = overrides[k]; }
            else unknown.push(k);
          }
          study.setInputValues(current);
          var after = study.getInputValues();
          var confirmed = {};
          for (var m = 0; m < after.length; m++) { if (applied.hasOwnProperty(after[m].id)) confirmed[after[m].id] = after[m].value; }
          return { confirmed: confirmed, unknown: unknown };
        })()
      `, { mutation: true });
      if (result?.error) appliedInputs = { error: result.error };
      else appliedInputs = { applied: result?.confirmed || {}, ...(result?.unknown?.length && { unknown_inputs: result.unknown }) };
    }

    return {
      success: newIds.length > 0,
      action: 'add',
      indicator,
      entity_id: entityId,
      new_study_count: newIds.length,
      ...(appliedInputs && { inputs: appliedInputs }),
    };
  } else if (action === 'remove') {
    if (!entity_id) throw new Error('entity_id required for remove action. Use chart_get_state to find study IDs.');
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.removeEntity(${safeString(entity_id)});
      })()
    `, { mutation: true });
    return { success: true, action: 'remove', entity_id };
  } else {
    throw new Error('action must be "add" or "remove"');
  }
}

export async function getVisibleRange({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
    })()
  `);
  return { success: true, visible_range: result.visible_range, bars_range: result.bars_range };
}

export async function setVisibleRange({ from, to, _deps }) {
  const { evaluate } = _resolve(_deps);
  const f = requireFinite(from, 'from'), t = requireFinite(to, 'to');
  if (f > t) throw Object.assign(new Error('from must be <= to.'), {code:'INVALID_RANGE'});
  const sleep = _deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const probe = () => evaluate(`(() => {const read = ${readChartContext.toString()}; return read(window);})()`);
  const initial = await probe();
  let context = initial, termination = 'unknown', attempts = 0;
  const check = current => {
    const details = {requested:{from:f,to:t}, context:current, coverage:historyCoverage(current,{from:f,to:t},null,termination)};
    const fail = (code,message) => {throw Object.assign(new Error(message),{code,details});};
    if (current?.feed_error) fail('DATA_FEED_ERROR','Chart feed failed: '+current.feed_error);
    if (!current || current.loading || !current.bar_count || current.first_bar_time === null || current.last_bar_time === null) fail('DATA_NOT_READY','Chart history is empty or loading; wait before requesting a range.');
    if (JSON.stringify(chartIdentity(initial)) !== JSON.stringify(chartIdentity(current))) fail('DATA_CONTEXT_CHANGED','Chart identity changed during history loading.');
  };
  check(context);
  while (context.first_bar_time > f) {
    if (context.more_data_available === false) { termination = 'feed_end'; break; }
    if (context.more_data_available !== true) break;
    if (attempts >= 25) { termination = 'guard'; break; }
    await evaluate(`${CHART_API}._chartWidget.model().mainSeries().requestMoreData(1000)`,{mutation:true});
    attempts++;
    await sleep(1800);
    context = await probe();
    for (let poll = 0; context?.loading && poll < 20; poll++) { await sleep(250); context = await probe(); }
    if (context?.loading) termination = 'guard';
    check(context);
  }
  if (context.first_bar_time <= f && context.last_bar_time >= t) termination = 'satisfied';
  const applied = await evaluate(`(() => {
    const read = ${readChartContext.toString()}, identity = ${chartIdentity.toString()};
    const context = read(window), requested = ${JSON.stringify({from:f,to:t})};
    const fail = (code,error) => ({success:false,code,error,context,requested});
    if (context?.feed_error) return fail('DATA_FEED_ERROR','Chart feed failed.');
    if (!context || context.loading || !context.bar_count) return fail('DATA_NOT_READY','Chart is empty or loading.');
    if (JSON.stringify(identity(context)) !== ${JSON.stringify(JSON.stringify(chartIdentity(initial)))}) return fail('DATA_CONTEXT_CHANGED','Chart identity changed before range application.');
    const chart = ${CHART_API}, model = chart._chartWidget.model(), bars = model.mainSeries().bars();
    let fromIdx = null, toIdx = null;
    for (let i = bars.firstIndex(); i <= bars.lastIndex(); i++) {
      const v = bars.valueAt(i);
      if (!v) return fail('DATA_NOT_READY','Loaded history has an unreadable bar.');
      if (v[0] >= requested.from && fromIdx === null) fromIdx = i;
      if (v[0] <= requested.to) toIdx = i;
    }
    if (fromIdx === null || toIdx === null || fromIdx > toIdx) return fail('RANGE_OUTSIDE_DATA','Requested window contains no loaded bar open times.');
    model.timeScale().zoomToBarsRange(fromIdx,toIdx);
    return {success:true,context,from_index:fromIdx,to_index:toIdx,from:bars.valueAt(fromIdx)[0],to:bars.valueAt(toIdx)[0],
      clamped:context.first_bar_time > requested.from || context.last_bar_time < requested.to};
  })()`,{mutation:true});
  if (!applied?.success) throw Object.assign(new Error(applied?.error || 'Range application unavailable.'),{code:applied?.code || 'DATA_NOT_READY',
    details:{requested:{from:f,to:t},context:applied?.context || context,coverage:historyCoverage(applied?.context || context,{from:f,to:t},null,termination),loading:{attempts,termination}}});
  await sleep(500);
  const actual = await evaluate(`${CHART_API}.getVisibleRange()`);
  return {success:true,applied,requested:{from:f,to:t},actual,context:applied.context,
    coverage:historyCoverage(applied.context,{from:f,to:t},{from:applied.from,to:applied.to},termination),loading:{attempts,termination}};
}

export async function scrollToDate({ date, _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  let timestamp;
  if (/^\d+$/.test(date)) timestamp = Number(date);
  else timestamp = Math.floor(new Date(date).getTime() / 1000);
  if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

  const resolution = await evaluate(`${CHART_API}.resolution()`);
  let secsPerBar = 60;
  const res = String(resolution);
  if (res === 'D' || res === '1D') secsPerBar = 86400;
  else if (res === 'W' || res === '1W') secsPerBar = 604800;
  else if (res === 'M' || res === '1M') secsPerBar = 2592000;
  else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

  const halfWindow = 25 * secsPerBar;
  const from = timestamp - halfWindow;
  const to = timestamp + halfWindow;

  const result = await setVisibleRange({from,to,_deps});
  return {...result,date,centered_on:timestamp,resolution,window:{from,to}};
}

export async function symbolInfo({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var info = chart.symbolExt();
      return {
        symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
        description: info.description, type: info.type, pro_name: info.pro_name,
        typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType()
      };
    })()
  `);
  return { success: true, ...result };
}

export async function symbolSearch({ query, type = '', exchange = '', count = 15, offset = 0, _deps } = {}) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 500 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Search count must be 1..500 and offset a safe nonnegative integer.');
  const params = new URLSearchParams({text:query,hl:'1',exchange,lang:'en',search_type:type,domain:'production'});
  const resp = await (_deps?.fetch || fetch)(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
    headers: {'Origin':'https://www.tradingview.com','Referer':'https://www.tradingview.com/'}
  });
  if (!resp.ok) throw Object.assign(new Error(`Symbol search provider returned ${resp.status}.`),{code:resp.status===403?'SEARCH_PROVIDER_BLOCKED':'SEARCH_PROVIDER_ERROR',details:{status:resp.status}});
  let data;
  try { data = await resp.json(); } catch { throw Object.assign(new Error('Symbol search provider returned non-JSON data; no authenticated fallback.'),{code:'SEARCH_PROVIDER_BLOCKED',details:{status:resp.status}}); }
  const rows = Array.isArray(data) ? data : data?.symbols;
  if (!Array.isArray(rows)) throw Object.assign(new Error('Symbol search provider schema is unavailable.'),{code:'SEARCH_PROVIDER_SCHEMA'});
  const strip = value => String(value || '').replace(/<\/?em>/g,'');
  const results = rows.slice(offset,offset+count).map(r => {
    const prefix = r.exchange || r.prefix || '';
    return {symbol:strip(r.symbol),description:strip(r.description),exchange:prefix,type:r.type || '',
      full_name:strip(r.full_name || r.pro_name || (prefix ? `${prefix}:${strip(r.symbol)}` : r.symbol)),
      provider_symbol:r.symbol,provider_full_name:r.full_name ?? r.pro_name ?? null};
  });
  const remaining = Number.isSafeInteger(data?.symbols_remaining) && data.symbols_remaining >= 0 ? data.symbols_remaining : null;
  return {success:true,query,source:'rest_api',results,count:results.length,requested:count,offset,
    filters:{exchange,type,applied_by:'provider',verified:false},response_count:rows.length,cli_truncated:offset+results.length<rows.length,
    truncated:offset+results.length<rows.length,has_more:offset+results.length<rows.length,
    next_offset:offset+results.length<rows.length?offset+results.length:null,
    provider:{pagination:'unverified',total:null,remaining,limit:remaining>0?'observed_more_results':'unknown',
      note:'Offset slices one freshly fetched provider response; cross-call ordering and native provider paging are unverified.'}};
}

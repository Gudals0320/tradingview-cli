/**
 * Core streaming logic — real-time JSONL output from TradingView.
 * Uses efficient poll + dedup: only emits when data changes.
 */
import { readChartContext, normalizeTimeframe, symbolMatches } from '../chart-context.js';
import { getStudyValues, getPineLines, getPineLabels, getPineTables } from './data.js';
import { evaluate, configuredTarget, KNOWN_PATHS, requireInteger } from '../connection.js';
import { currentWorkspaceSession } from '../session.js';
import { parseFeedSpecs } from './multi-feed.js';

const CHART_API = KNOWN_PATHS.chartApi;
const MODEL = `${CHART_API}._chartWidget.model()`;

export function streamExpression(expression, scope = 'active_chart') {
  return `(() => {
    const context=(${readChartContext.toString()})(window),data=(${expression});
    const after=(${readChartContext.toString()})(window);
    if(!context||!after||context.symbol!==after.symbol||context.resolution!==after.resolution) throw new Error('STREAM_CONTEXT_CHANGED: Chart changed during sample.');
    if(context.loading||context.feed_error)return {success:false,code:context.feed_error?'DATA_FEED_ERROR':'DATA_NOT_READY',
      error:context.feed_error||'Chart data is loading.',context:{...context,scope:${JSON.stringify(scope)}}};
    return data ? {...data,context:{...context,scope:${JSON.stringify(scope)}}} : null;
  })()`;
}
async function streamEvaluate(expression, scope) {
  const data=await evaluate(streamExpression(expression,scope));
  const workspace=currentWorkspaceSession()?.workspace;
  if(data?.context) {data.context.target_id=configuredTarget();if(workspace)data.context.scope='workspace';}
  if(data&&workspace)data.provenance={workspace_id:workspace.id,target:workspace.target,page_generation:workspace.binding?.nonce};
  return data;
}

/**
 * Generic poll-and-diff loop.
 * Calls fetcher(), compares to last value, emits JSONL on change.
 * Writes to stdout directly for pipe-friendliness.
 */
async function pollLoop(fetcher, { interval = 500, dedupe = true, label = 'stream' } = {}) {
  interval = requireInteger(interval, 'interval', 100);
  let lastHash = null;
  let running = true;
  let failure;

  const cleanup = () => { running = false; };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  const stdoutError = error => { if (error.code === 'EPIPE') cleanup(); else throw error; };
  process.stdout.on('error', stdoutError);

  // Emit header with compliance notice
  const start = Date.now();
  process.stderr.write(JSON.stringify({ event: 'stream_started', stream: label, interval_ms: interval,
    notice: 'Unofficial local Desktop tool, not affiliated with TradingView. Use subject to TradingView terms.' }) + '\n');

  while (running) {
    try {
      if(currentWorkspaceSession())await evaluate('true'); // Verify ownership/nonce before every sample, including null samples.
      const data = await fetcher();
      if (!data) { await sleep(interval); continue; }
      const workspace=currentWorkspaceSession()?.workspace;
      if(workspace)data.provenance={workspace_id:workspace.id,target:workspace.target,page_generation:workspace.binding?.nonce};

      const hash = dedupe ? JSON.stringify(data) : null;
      if (!dedupe || hash !== lastHash) {
        lastHash = hash;
        const line = JSON.stringify({ ...data, _ts: Date.now(), _stream: label });
        process.stdout.write(line + '\n');
      }
    } catch (err) {
      if (err.code?.startsWith('WORKSPACE_') || ['TARGET_NOT_FOUND', 'CDP_CONNECTION', 'CDP_TIMEOUT'].includes(err.code)) {
        running = false;
        failure=err;
        break;
      }
      // Connection errors — retry silently
      if (/CDP|ECONNREFUSED/i.test(err.message)) {
        await sleep(2000);
        continue;
      }
      if(err.code==='STUDY_NOT_FOUND') {
        const failure={success:false,code:err.code,error:err.message,context:err.details?.context};
        const hash=JSON.stringify(failure);
        if(hash!==lastHash){lastHash=hash;process.stdout.write(JSON.stringify({...failure,_ts:Date.now(),_stream:label})+'\n');}
      } else process.stderr.write(JSON.stringify({ success: false, stream: label, code: err.code || 'STREAM_SAMPLE_FAILED', error: err.message }) + '\n');
    }
    await sleep(interval);
  }

  process.stderr.write(JSON.stringify({ event: 'stream_stopped', stream: label, duration_ms: Date.now() - start }) + '\n');
  process.removeListener('SIGINT', cleanup);
  process.removeListener('SIGTERM', cleanup);
  process.stdout.removeListener('error', stdoutError);
  if(failure)throw failure;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Stream: quote ──

async function fetchQuote() {
  return streamEvaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = ${MODEL};
      var bars = m.mainSeries().bars();
      var last = bars.lastIndex();
      var v = bars.valueAt(last);
      if (!v) return null;
      return {
        symbol: chart.symbol(),
        time: v[0],
        open: v[1],
        high: v[2],
        low: v[3],
        close: v[4],
        volume: v[5] || 0,
      };
    })()
  `);
}

export async function streamQuote({ interval } = {}) {
  return pollLoop(fetchQuote, { interval: interval ?? 300, label: 'quote' });
}

// ── Stream: ohlcv (last N bars, emits on new bar) ──

async function fetchLastBar() {
  return streamEvaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = ${MODEL};
      var bars = m.mainSeries().bars();
      var last = bars.lastIndex();
      var v = bars.valueAt(last);
      if (!v) return null;
      return {
        symbol: chart.symbol(),
        resolution: chart.resolution(),
        bar_time: v[0],
        open: v[1],
        high: v[2],
        low: v[3],
        close: v[4],
        volume: v[5] || 0,
        bar_index: last,
      };
    })()
  `);
}

export async function streamBars({ interval } = {}) {
  return pollLoop(fetchLastBar, { interval: interval ?? 500, label: 'bars' });
}

// ── Stream: indicator values ──

async function fetchValues() {
  return getStudyValues();
}

export async function streamValues({ interval } = {}) {
  return pollLoop(fetchValues, { interval: interval ?? 500, label: 'values' });
}

// ── Stream: pine lines ──

async function fetchLines(studyFilter) {
  return getPineLines({study_filter:studyFilter});
}

export async function streamLines({ interval, filter } = {}) {
  return pollLoop(() => fetchLines(filter), { interval: interval ?? 1000, label: 'lines' });
}

// ── Stream: pine labels ──

async function fetchLabels(studyFilter) {
  return getPineLabels({study_filter:studyFilter,max_labels:50,verbose:true});
}

export async function streamLabels({ interval, filter } = {}) {
  return pollLoop(() => fetchLabels(filter), { interval: interval ?? 1000, label: 'labels' });
}

// ── Stream: pine tables ──

async function fetchTables(studyFilter) {
  const result=await getPineTables({study_filter:studyFilter});
  return {...result,studies:result.studies.map(study=>({...study,tables:study.tables.map(table=>({...table,display_rows:table.rows,rows:table.cells}))}))};
}

export async function streamTables({ interval, filter } = {}) {
  return pollLoop(() => fetchTables(filter), { interval: interval ?? 2000, label: 'tables' });
}

// ── Stream: all panes (multi-symbol) ──

const CWC = KNOWN_PATHS.chartWidgetCollection;

async function fetchAllPanes() {
  return streamEvaluate(`
    (function() {
      var cwc = ${CWC};
      var all = cwc.getAll();
      var layoutType = cwc._layoutType;
      if (typeof layoutType === 'object' && layoutType && typeof layoutType.value === 'function') layoutType = layoutType.value();
      var count = cwc.inlineChartsCount;
      if (typeof count === 'object' && count && typeof count.value === 'function') count = count.value();

      var panes = [];
      for (var i = 0; i < Math.min(all.length, count || all.length); i++) {
        try {
          var c = all[i];
          var model = c.model();
          var ms = model.mainSeries();
          var bars = ms.bars();
          var last = bars.lastIndex();
          var v = bars.valueAt(last);
          if (!v) { panes.push({ index: i, symbol: ms.symbol(), error: 'no bars' }); continue; }
          panes.push({
            index: i,
            symbol: ms.symbol(),
            resolution: ms.interval(),
            time: v[0],
            open: v[1],
            high: v[2],
            low: v[3],
            close: v[4],
            volume: v[5] || 0,
          });
        } catch(e) { panes.push({ index: i, error: e.message }); }
      }
      return { layout: layoutType, pane_count: panes.length, panes: panes };
    })()
  `, 'all_panes');
}

export async function streamAllPanes({ interval } = {}) {
  return pollLoop(fetchAllPanes, { interval: interval ?? 500, label: 'all-panes' });
}

export async function streamOwnedFeeds({feedSpecs,interval=250}) {
  return pollLoop(() => sampleOwnedFeeds({ feedSpecs }), {interval:Number(interval),label:'ohlcv'});
}

export function readOwnedFeeds(window, feeds) {
  const unwrap = value => typeof value?.value === 'function' ? value.value() : value;
  const all = window.TradingViewApi?._chartWidgetCollection?.getAll?.();
  const samples = feeds.map(feed => {
    const failure = (code, error, extra = {}, status = 'error') => ({ feed: feed.key, status, code, error, ...extra });
    try {
      if (!Array.isArray(all)) return failure('FEED_STATE_UNREADABLE', 'Pane collection is unavailable.');
      const matches = all.flatMap((pane, index) => {
        try {
          const model = pane.model?.() || pane._chartWidget?.model?.(), series = model?.mainSeries?.();
          return series && symbolMatches(feed.symbol, { symbol: series.symbol() }) && normalizeTimeframe(series.interval()) === normalizeTimeframe(feed.timeframe) ? [{ index, series }] : [];
        } catch { return []; }
      });
      if (matches.length !== 1) return failure(matches.length ? 'WORKSPACE_FEED_AMBIGUOUS' : 'WORKSPACE_FEED_MISSING', 'Prepare one uniquely matching owned pane for the requested feed.');
      const { index, series } = matches[0], info = series.symbolInfo?.(), state = unwrap(series.status?.()), loading = unwrap(series.isLoading?.());
      // Desktop 3.4.1 main series has a numeric status enum; its explicit
      // isStatusError predicate supplies the error meaning without guessing enums.
      const statusError = unwrap(series.isStatusError?.());
      const identity = { symbol: info?.full_name || info?.pro_name, aliases: [info?.full_name, info?.pro_name, info?.original_name].filter(Boolean) };
      const detail = { index, symbol: feed.symbol, resolution: feed.timeframe, series_symbol: identity.symbol || null };
      if (statusError === true || state?.error || state?.errorMessage) return failure('DATA_FEED_ERROR', String(state?.error || state?.errorMessage || 'Requested series reports a feed error.'), detail);
      if (loading === true) return failure('DATA_NOT_READY', 'Requested pane is loading.', detail, 'loading');
      if (loading !== false || statusError !== false) return failure('FEED_STATE_UNREADABLE', 'Requested feed readiness/error predicate is unavailable.', detail);
      if (!identity.symbol || !symbolMatches(feed.symbol, identity)) return failure('FEED_IDENTITY_MISMATCH', 'Actual series belongs to another or unknown symbol.', detail);
      const bars = series.bars?.(), value = bars?.valueAt(bars.lastIndex());
      if (!value) return failure('DATA_NOT_READY', 'Requested feed has no current bar.', detail, 'loading');
      const afterInfo = series.symbolInfo?.(), afterState = unwrap(series.status?.());
      if (unwrap(series.isLoading?.()) !== false || !symbolMatches(feed.symbol, { symbol: series.symbol() }) || normalizeTimeframe(series.interval()) !== normalizeTimeframe(feed.timeframe)
        || (afterInfo?.full_name || afterInfo?.pro_name) !== identity.symbol || unwrap(series.isStatusError?.()) === true || afterState?.error || afterState?.errorMessage) return failure('DATA_NOT_READY', 'Feed changed during sample.', detail, 'loading');
      return { feed: feed.key, status: 'ok', ...detail, time: value[0], open: value[1], high: value[2], low: value[3], close: value[4], volume: value[5] || 0 };
    } catch (error) { return failure('FEED_STATE_UNREADABLE', error.message); }
  });
  return { success: samples.every(sample => sample.status === 'ok'), partial_success: samples.some(sample => sample.status === 'ok') && samples.some(sample => sample.status !== 'ok'), scope: 'workspace', feeds: samples };
}

export async function sampleOwnedFeeds({ feedSpecs, _deps } = {}) {
  const feeds = parseFeedSpecs(feedSpecs);
  return (_deps?.evaluate || evaluate)(`(() => {${normalizeTimeframe.toString()};${symbolMatches.toString()};return (${readOwnedFeeds.toString()})(window,${JSON.stringify(feeds)});})()`);
}

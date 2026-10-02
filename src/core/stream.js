/**
 * Core streaming logic — real-time JSONL output from TradingView.
 * Uses efficient poll + dedup: only emits when data changes.
 */
import { readChartContext } from '../chart-context.js';
import { getStudyValues, getPineLines, getPineLabels, getPineTables } from './data.js';
import { evaluate, configuredTarget, KNOWN_PATHS, CDP_PORT, requireInteger } from '../connection.js';

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
  if(data?.context)data.context.target_id=configuredTarget();
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

  const cleanup = () => { running = false; };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  const stdoutError = error => { if (error.code === 'EPIPE') cleanup(); else throw error; };
  process.stdout.on('error', stdoutError);

  // Emit header with compliance notice
  const start = Date.now();
  process.stderr.write(`\u26A0  tradingview-cli  |  Unofficial tool. Not affiliated with TradingView Inc.\n`);
  process.stderr.write(`   Streams from your locally running TradingView Desktop instance only.\n`);
  process.stderr.write(`   Does not connect to TradingView servers. Requires --remote-debugging-port=${CDP_PORT}.\n`);
  process.stderr.write(`   Ensure your usage complies with TradingView's Terms of Use.\n`);
  process.stderr.write(`[stream:${label}] started, interval=${interval}ms, Ctrl+C to stop\n`);

  while (running) {
    try {
      const data = await fetcher();
      if (!data) { await sleep(interval); continue; }

      const hash = dedupe ? JSON.stringify(data) : null;
      if (!dedupe || hash !== lastHash) {
        lastHash = hash;
        const line = JSON.stringify({ ...data, _ts: Date.now(), _stream: label });
        process.stdout.write(line + '\n');
      }
    } catch (err) {
      if (err.code?.startsWith('WORKSPACE_') || ['TARGET_NOT_FOUND', 'CDP_CONNECTION', 'CDP_TIMEOUT'].includes(err.code)) {
        running = false;
        process.stderr.write(JSON.stringify({ success: false, code: err.code, error: err.message }) + '\n');
        process.exitCode = 1;
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
      } else process.stderr.write(`[stream:${label}] error: ${err.message}\n`);
    }
    await sleep(interval);
  }

  process.stderr.write(`[stream:${label}] stopped after ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
  process.removeListener('SIGINT', cleanup);
  process.removeListener('SIGTERM', cleanup);
  process.stdout.removeListener('error', stdoutError);
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

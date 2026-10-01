// Independent verification of S01 Pine output against raw chart/HTF bars.
// Usage: node qa/pine/scenarios/s01-mtf-trend/analyze.mjs ON_LABEL OFF_LABEL V1_LABEL HTF_LABEL TABLE_ON_LABEL TABLE_OFF_LABEL [HTF_SECONDS] [OUT_NAME]
import { readFileSync, writeFileSync } from 'node:fs';
const RAW = 'results/pine-scenarios/s01-mtf-trend/raw/';
const [onL, offL, v1L, htfL, tOnL, tOffL, htfSecArg, outName] = process.argv.slice(2);
const HTF = Number(htfSecArg || 3600);
const load = l => JSON.parse(JSON.parse(JSON.parse(readFileSync(RAW + l + '.json', 'utf8')).stdout).result);
const table = l => JSON.parse(JSON.parse(readFileSync(RAW + l + '.json', 'utf8')).stdout).studies[0].tables[0].rows;
const named = x => x.rows.map(r => Object.fromEntries([['time', r[0]], ...x.titles.map((t, i) => [t, r[i + 1]])]));
const emaSeries = (vals, len) => { const a = 2 / (len + 1); const out = []; let e = null;
  vals.forEach((v, i) => { e = e === null ? v : a * v + (1 - a) * e; out.push(e); }); return out; };
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
const res = { checks: {} };
const ck = (name, pass, detail) => { res.checks[name] = { pass, ...detail }; };

const on = load(onL), off = load(offL), v1 = v1L === '-' ? { rows: [], titles: [] } : load(v1L), htf = load(htfL);
const R = named(on), O = named(off), V1 = named(v1);
const sec = Number(on.resolution) * 60;
res.dataset = { symbol: on.symbol, resolution: on.resolution, htf_seconds: HTF, rows: R.length, chart_bars: on.bars.length,
  first_row_utc: new Date(R[0].time * 1000).toISOString(), last_row_utc: new Date(R.at(-1).time * 1000).toISOString(),
  htf_bars: htf.bars.length, htf_first_utc: new Date(htf.bars[0][0] * 1000).toISOString(), htf_last_utc: new Date(htf.bars.at(-1)[0] * 1000).toISOString(),
  bar_index_last: R.at(-1).barIndex, inputs: Object.fromEntries(Object.entries(on.inputs).filter(([k]) => k.startsWith('in_')).map(([k, v]) => [k, v.v])) };
// 'confirmed' rows: exclude the last (realtime/forming) chart bar from historical equality checks.
const hist = R.slice(0, -1);

// 1. Cross logic from Pine's own EMA plots (all rows except first).
let m1 = 0, n1 = 0;
for (let i = 1; i < R.length; i++) { const p = R[i - 1], c = R[i];
  const exp = (c['EMA Fast'] > c['EMA Slow'] && p['EMA Fast'] <= p['EMA Slow']) ? 1 : (c['EMA Fast'] < c['EMA Slow'] && p['EMA Fast'] >= p['EMA Slow']) ? -1 : 0;
  n1++; if (exp !== c.rawCross) m1++; }
ck('cross_from_pine_emas', m1 === 0, { compared: n1, mismatches: m1 });

// 2. Independent EMA12/36 from raw chart bars (converged region = after 200 bars of the 300 available).
const bars = on.bars, closes = bars.map(b => b[4]);
const f = emaSeries(closes, Number(res.dataset.inputs.in_0)), s = emaSeries(closes, Number(res.dataset.inputs.in_1));
const byTime = new Map(R.map(r => [r.time, r]));
let maxRelF = 0, maxRelS = 0, crossCmp = 0, crossMis = [], WARM = 200;
for (let i = WARM; i < bars.length; i++) { const r = byTime.get(bars[i][0]); if (!r) continue;
  maxRelF = Math.max(maxRelF, rel(f[i], r['EMA Fast'])); maxRelS = Math.max(maxRelS, rel(s[i], r['EMA Slow']));
  const exp = (f[i] > s[i] && f[i - 1] <= s[i - 1]) ? 1 : (f[i] < s[i] && f[i - 1] >= s[i - 1]) ? -1 : 0;
  crossCmp++; if (exp !== r.rawCross) crossMis.push({ t: r.time, exp, pine: r.rawCross }); }
ck('independent_ema_and_cross', maxRelF < 1e-6 && maxRelS < 1e-6 && crossMis.length === 0,
  { warmup_bars_skipped: WARM, compared: crossCmp, max_rel_err_fast: maxRelF, max_rel_err_slow: maxRelS, cross_mismatches: crossMis.slice(0, 5) });

// 3. Confirmed HTF identity: expected = previous HTF bar of the HTF bar containing the chart bar.
let idMis = [], future = [], live = [];
for (const r of R) { const expOpen = (Math.floor(r.time / HTF) * HTF - HTF) * 1000;
  if (r.htfOpenTime !== expOpen || r.htfCloseTime !== expOpen + HTF * 1000) idMis.push({ t: r.time, htfOpen: r.htfOpenTime, expOpen });
  if (!(r.htfCloseTime <= r.time * 1000)) future.push(r.time); }
ck('htf_bar_is_last_confirmed', idMis.length === 0, { compared: R.length, mismatches: idMis.slice(0, 5) });
ck('no_future_htf_data', future.length === 0, { rule: 'htfCloseTime <= chart bar open time for every row incl. realtime', violations: future.length });
const last = R.at(-1);
res.realtime_bar = { chart_bar_utc: new Date(last.time * 1000).toISOString(), forming_htf_open_utc: new Date(Math.floor(last.time / HTF) * HTF * 1000).toISOString(),
  used_htf_open_utc: new Date(last.htfOpenTime).toISOString(), used_htf_close_utc: new Date(last.htfCloseTime).toISOString(),
  forming_htf_used: last.htfOpenTime === Math.floor(last.time / HTF) * HTF * 1000 };

// 4. HTF close/EMA vs independent hourly bars.
const hb = htf.bars, hClose = new Map(hb.map(b => [b[0] * 1000, b[4]]));
const hEma = emaSeries(hb.map(b => b[4]), Number(res.dataset.inputs.in_3)); const hEmaBy = new Map(hb.map((b, i) => [b[0] * 1000, { e: hEma[i], i }]));
let cMis = 0, cCmp = 0, eMax = 0, eCmp = 0, trendMis = [], indepTrendMis = [];
for (const r of R) { const c = hClose.get(r.htfOpenTime); if (c !== undefined) { cCmp++; if (c !== r.htfClose) cMis++; }
  const e = hEmaBy.get(r.htfOpenTime); if (e && e.i >= 200) { eCmp++; eMax = Math.max(eMax, rel(e.e, r.htfEma));
    const it = c > e.e ? 1 : c < e.e ? -1 : 0; if (it !== r.htfTrend) indepTrendMis.push({ t: r.time, it, pine: r.htfTrend, gap: c - e.e }); }
  const pt = r.htfClose > r.htfEma ? 1 : r.htfClose < r.htfEma ? -1 : 0; if (pt !== r.htfTrend) trendMis.push(r.time); }
ck('htf_close_matches_hourly_bars', cMis === 0 && cCmp > 0, { compared: cCmp, mismatches: cMis });
ck('htf_ema_matches_independent', eMax < 1e-4 && eCmp > 0, { compared: eCmp, warmup_htf_bars_skipped: 200, max_rel_err: eMax });
ck('htf_trend_sign', trendMis.length === 0 && indepTrendMis.length === 0, { pine_internal_mismatches: trendMis.length, independent_mismatches: indepTrendMis.slice(0, 5) });
// 4b. Aggregate 5m closes: last 5m close inside a confirmed hour equals htfClose.
const lastClose = new Map(); for (const b of bars) lastClose.set(Math.floor(b[0] / HTF) * HTF * 1000, { t: b[0], c: b[4] });
let aggCmp = 0, aggMis = 0; for (const r of R) { const a = lastClose.get(r.htfOpenTime); if (a && a.t === r.htfOpenTime / 1000 + HTF - sec) { aggCmp++; if (a.c !== r.htfClose) aggMis++; } }
ck('htf_close_matches_5m_aggregation', aggMis === 0 && aggCmp > 0, { compared: aggCmp, mismatches: aggMis });

// 5. Filter ON pass/exclude logic + independent trend.
let pMis = 0, xMis = 0, sig = 0, passN = 0, exclN = 0;
for (const r of R) { const exp = r.rawCross !== 0 && r.rawCross === r.htfTrend ? r.rawCross : 0; const ex = r.rawCross !== 0 && exp === 0 ? r.rawCross : 0;
  if (r.rawCross) sig++; if (exp) passN++; if (ex) exclN++;
  if (exp !== r.passCode) pMis++; if (ex !== r.excludedCode) xMis++;
  const shapes = [r['Bull pass'], r['Bear pass'], r['Excluded']]; }
ck('filter_on_pass_exclude', pMis === 0 && xMis === 0, { crosses_in_window: sig, passed: passN, excluded: exclN, pass_mismatches: pMis, excluded_mismatches: xMis });

// 6. Counters: delta across window == flags; dashboard == last-row counters.
const dBull = R.at(-1).bullPassCount - R[0].bullPassCount, dBear = R.at(-1).bearPassCount - R[0].bearPassCount, dEx = R.at(-1).excludedCount - R[0].excludedCount;
const fB = R.slice(1).filter(r => r.passCode === 1).length, fS = R.slice(1).filter(r => r.passCode === -1).length, fX = R.slice(1).filter(r => r.excludedCode !== 0).length;
const tOn = table(tOnL);
const dash = Object.fromEntries(tOn.map(x => x.split(' | ')));
const dashPass = dash['Pass bull/bear'], dashEx = Number(dash['Excluded']);
ck('counters_and_dashboard', dBull === fB && dBear === fS && dEx === fX && dashPass === R.at(-1).bullPassCount + '/' + R.at(-1).bearPassCount && dashEx === R.at(-1).excludedCount
  && dash['HTF close'] === last.htfClose.toFixed(2) && dash['Trend'] === (last.htfTrend === 1 ? 'UP' : last.htfTrend === -1 ? 'DOWN' : 'FLAT')
  && dash['HTF bar (confirmed)'] === new Date(last.htfOpenTime).toISOString().slice(0, 16).replace('T', ' '),
  { window_delta: [dBull, dBear, dEx], window_flags: [fB, fS, fX], dashboard: dash, last_row_counters: [last.bullPassCount, last.bearPassCount, last.excludedCount] });

// 7. Filter OFF == raw crosses, and == baseline v1 crosses.
const Ob = new Map(O.map(r => [r.time, r])); const V1b = new Map(V1.map(r => [r.time, r]));
let offMis = 0, offCmp = 0, v1Cmp = 0, v1Mis = [];
for (const r of O.slice(0, -1)) { offCmp++; if (r.passCode !== r.rawCross || r.excludedCode !== 0) offMis++; }
for (const r of O.slice(0, -1)) { const b = V1b.get(r.time); if (!b || b.time === V1.at(-1).time) continue; v1Cmp++; if (b.rawCross !== r.passCode) v1Mis.push({ t: r.time, v1: b.rawCross, off: r.passCode }); }
const tOff = Object.fromEntries(table(tOffL).map(x => x.split(' | ')));
const totalOn = last.bullPassCount + last.bearPassCount + last.excludedCount; const offLast = O.at(-1);
ck('filter_off_equals_raw_and_baseline', offMis === 0 && v1Mis.length === 0 && (v1Cmp > 0 || v1L === '-') && Number(tOff['Excluded']) === 0,
  { off_rows_compared: offCmp, off_mismatches: offMis, baseline_v1_rows_compared: v1Cmp, baseline_mismatches: v1Mis.slice(0, 5),
    off_dashboard: tOff, on_total_signals: totalOn, off_total_signals: offLast.bullPassCount + offLast.bearPassCount + offLast.excludedCount });

// 8. Diagnostic: unconfirmed (forming) HTF trend differs from confirmed trend on how many rows/signals.
let liveDiff = 0, liveSigDiff = 0; for (const r of R) { if (r.htfLiveTrendDiag !== r.htfTrend) { liveDiff++; if (r.rawCross) liveSigDiff++; } }
res.diagnostic_unconfirmed_htf = { rows_where_live_trend_differs: liveDiff, cross_rows_where_it_differs: liveSigDiff, note: 'Filter uses htfTrend (confirmed); live series shown only for comparison.' };
res.all_pass = Object.values(res.checks).every(c => c.pass);
writeFileSync('results/pine-scenarios/s01-mtf-trend/' + (outName || 'analysis') + '.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));

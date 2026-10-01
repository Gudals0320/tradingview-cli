// S02 independent runtime verification of the dashboard study's per-bar series.
// The extraction records one snapshot row per bar of interest (session start, completion,
// archive change), each carrying the study plots for that bar. This script recomputes the
// UTC sessions from the very same bar snapshot and compares field by field.
// Usage: node qa/pine/scenarios/s02-session-dashboard/verify-series.mjs EXTRACT_RAW [EXPECT_KEEP]
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'results/pine-scenarios/s02-session-dashboard';
const [extractPath, keepArg] = process.argv.slice(2);
const EXPECT_KEEP = Number(keepArg || 20);
const raw = JSON.parse(readFileSync(extractPath, 'utf8'));
const d = JSON.parse(JSON.parse(raw.stdout).result);
const times = d.barTimes, vols = d.barVol, highs = d.barHigh, lows = d.barLow;
const utc = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);
const r4 = v => (v == null ? null : Math.round(v * 1e4) / 1e4);
const eq = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const DAY = 86400, START = 0, LEN = 3600;

// ── Independent aggregation: session = [dayStart+START, +LEN) in UTC ─────────
const sessions = [];
let cur = null;
for (let i = 0; i < times.length; i++) {
  const secOfDay = times[i] % DAY;
  // Leaving the window closes the open session; the next in-window bar starts a new one.
  if (!(secOfDay >= START && secOfDay < START + LEN)) { if (cur) { sessions.push(cur); cur = null; } continue; }
  const key = times[i] - secOfDay + START;
  if (!cur || cur.start !== key) {
    if (cur) sessions.push(cur);
    cur = { start: key, firstIdx: i, endIdx: i, vol: 0, high: -Infinity, low: Infinity, bars: 0 };
  }
  cur.vol += vols[i]; cur.high = Math.max(cur.high, highs[i]); cur.low = Math.min(cur.low, lows[i]);
  cur.bars += 1; cur.endIdx = i;
}
if (cur) sessions.push(cur);
for (const s of sessions) { s.session = utc(s.start); s.sessionEnd = utc(s.start + LEN); s.endTime = times[s.endIdx]; s.startTime = times[s.firstIdx]; }

// ── Recorded rows, indexed by bar time ───────────────────────────────────────
const rowsByTime = new Map(d.boundaryRows.map(r => [r.t, r]));
const firstCompletionTime = sessions.length ? sessions[0].endTime : null;
const rowsBeforeFirstCompletion = d.boundaryRows.filter(r => firstCompletionTime != null && r.t < firstCompletionTime);

// ── Increment (archive push) checks ──────────────────────────────────────────
const increments = [];
for (const s of sessions) {
  const row = rowsByTime.get(s.endTime);
  if (!row) { increments.push({ session: s.session, missing_snapshot: true }); continue; }
  const exp = { bars: s.bars, vol: r4(s.vol), high: r4(s.high), low: r4(s.low), range: r4(s.high - s.low) };
  const got = { bars: row.lb, vol: r4(row.lv), high: r4(row.lh), low: r4(row.ll), range: r4(row.lr) };
  const diffs = Object.keys(exp).filter(k => !eq(exp[k], got[k], 1e-4)).map(k => ({ field: k, expected: exp[k], actual: got[k] }));
  increments.push({ session: s.session, end_bar: utc(s.endTime), expected: exp, actual: got, differences: diffs, stored_after: row.hc, removed_after: row.rm });
}
const sessionIndex = new Map(sessions.map((s, i) => [s.session, i + 1]));
// When the visible history starts mid-stream the archive is already partly filled: derive the
// baseline from the first increment instead of assuming an empty archive.
const base = increments.length ? Math.max(0, (increments[0].stored_after ?? 1) - 1) : 0;
const growthOk = increments.every((inc, i) => inc.stored_after === Math.min(base + i + 1, EXPECT_KEEP));
const statsMatch = increments.every(inc => inc.differences.length === 0);
const removedMonotonic = (() => { let prev = null, ok = true;
  for (const inc of increments) { if (inc.removed_after == null) { ok = false; break; }
    if (prev !== null && inc.removed_after < prev) { ok = false; break; } prev = inc.removed_after; }
  return ok; })();

// ── Session-start reset checks ───────────────────────────────────────────────
const resets = [];
for (const s of sessions) {
  const row = rowsByTime.get(s.startTime);
  if (!row) { resets.push({ session: s.session, missing_snapshot: true }); continue; }
  resets.push({ session: s.session, start_bar: utc(s.startTime), runBars: row.rb, runVol: r4(row.rv),
    first_bar_volume: r4(vols[s.firstIdx]), first_bar_high: highs[s.firstIdx], first_bar_low: lows[s.firstIdx],
    runHigh: row.rh, runLow: row.rl,
    reset_ok: row.rb === 1 && eq(row.rv, vols[s.firstIdx], 1e-4) && eq(row.rh, highs[s.firstIdx], 1e-8) && eq(row.rl, lows[s.firstIdx], 1e-8) });
}
const resetsOk = resets.every(r => r.reset_ok === true);

// ── Empty-history behaviour before the first completion ─────────────────────
const emptyState = {
  snapshots_before_first_completion: rowsBeforeFirstCompletion.length,
  all_have_no_stored_sessions: rowsBeforeFirstCompletion.every(r => r.hc == null),
  all_have_no_derived_values: rowsBeforeFirstCompletion.every(r => r.lv == null && r.lb == null && r.lr == null && r.av == null),
  all_have_zero_removals: rowsBeforeFirstCompletion.every(r => r.rm == null || r.rm === 0),
  sample: rowsBeforeFirstCompletion.slice(-3).map(r => ({ t: utc(r.t), hc: r.hc, rm: r.rm, lv: r.lv, lb: r.lb, av: r.av, ins: r.ins })),
};

// ── Final state ──────────────────────────────────────────────────────────────
const last = d.lastRow.values;
const finalStored = Number(last.histCount);
const expectedStored = Math.min(base + sessions.length, EXPECT_KEEP);
const tail = sessions.slice(-expectedStored);
const expectedAvg = tail.reduce((a, s) => a + s.vol, 0) / tail.length;
const finalChecks = {
  stored_equals_min_completed_cap: finalStored === expectedStored,
  last_volume_matches_latest_session: eq(Number(last.lastVol), tail[tail.length - 1].vol, 1e-4),
  last_range_matches_latest_session: eq(Number(last.lastRange), tail[tail.length - 1].high - tail[tail.length - 1].low, 1e-4),
  last_bars_matches_latest_session: Number(last.lastBars) === tail[tail.length - 1].bars,
  average_matches_latest_window: eq(Number(last.avgVol), expectedAvg, 1e-4),
};

const result = {
  extract: extractPath, keep: EXPECT_KEEP, archive_baseline: base,
  symbol: d.symbol, resolution: d.resolution, bar_count: times.length,
  first_bar: utc(times[0]), last_bar: utc(times[times.length - 1]),
  sessions_recomputed: sessions.length,
  session_stats: sessions.map(s => ({ session: s.session, end: s.sessionEnd, bars: s.bars, vol: r4(s.vol), high: r4(s.high), low: r4(s.low), range: r4(s.high - s.low) })),
  increments, resets, empty_history_state: emptyState,
  final_row: { stored: finalStored, removed: last.removed, avgVol: r4(Number(last.avgVol)), lastVol: r4(Number(last.lastVol)), lastRange: r4(Number(last.lastRange)), lastBars: Number(last.lastBars), runBars: last.runBars, inSession: last.inSession },
  expected_final: { stored: expectedStored, avgVol: r4(expectedAvg), lastVol: r4(tail[tail.length - 1].vol), lastRange: r4(tail[tail.length - 1].high - tail[tail.length - 1].low) },
  checks: {
    one_increment_per_completed_session: increments.every(inc => !inc.missing_snapshot) && increments.length === sessions.length,
    increments_match_independent_stats: statsMatch,
    archive_growth_one_at_a_time_until_cap: growthOk,
    retention_cap_never_exceeded: increments.every(inc => inc.stored_after == null || inc.stored_after <= EXPECT_KEEP),
    removals_monotonic: removedMonotonic,
    one_completion_bar_per_session: sessions.length === new Set(sessions.map(s => s.endTime)).size,
    new_session_reset_ok: resetsOk,
    empty_history_has_no_values_before_first_completion: emptyState.all_have_no_stored_sessions && emptyState.all_have_no_derived_values,
    archive_baseline_is_zero_for_fresh_start: base === 0,
    ...finalChecks,
  },
};
writeFileSync(OUT + '/series-verification.json', JSON.stringify(result, null, 2));
const failed = Object.entries(result.checks).filter(([, v]) => v !== true).map(([k]) => k);
console.log(JSON.stringify({ bar_count: times.length, first_bar: result.first_bar, last_bar: result.last_bar,
  sessions_recomputed: sessions.length, increments: increments.length, checks: result.checks, failed_checks: failed,
  increment_mismatches: increments.filter(i => i.differences && i.differences.length).slice(0, 5),
  final_row: result.final_row, expected_final: result.expected_final, empty_history_state: emptyState }, null, 1));


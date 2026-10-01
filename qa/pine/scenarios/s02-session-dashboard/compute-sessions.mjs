// S02 independent recomputation: aggregates the raw CLI OHLCV bars per UTC session and
// compares them with the recorded console completion lines and the dashboard table rows.
// Usage: node .../compute-sessions.mjs <ohlcv-raw.json> <console-raw.json> <table-raw.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'results/pine-scenarios/s02-session-dashboard';
mkdirSync(OUT, { recursive: true });
const [ohlcvPath, consolePath, tablePath] = process.argv.slice(2);
const bars = JSON.parse(JSON.parse(readFileSync(ohlcvPath, 'utf8')).stdout).bars;
const DAY = 86400, START_SEC = 0, LEN_SEC = 3600;
const utc = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);

// Independent session aggregation: session = [floor(t/86400)*86400 + START_SEC, +LEN_SEC)
const sessions = new Map();
const offSession = [];
for (const b of bars) {
  const secOfDay = b.time % DAY;
  const dayStart = b.time - secOfDay;
  if (secOfDay >= START_SEC && secOfDay < START_SEC + LEN_SEC) {
    const key = dayStart + START_SEC;
    if (!sessions.has(key)) sessions.set(key, { start: key, vol: 0, high: -Infinity, low: Infinity, bars: 0, times: [] });
    const s = sessions.get(key);
    s.vol += b.volume; s.high = Math.max(s.high, b.high); s.low = Math.min(s.low, b.low);
    s.bars += 1; s.times.push(b.time);
  } else offSession.push(b.time);
}
const list = [...sessions.values()].sort((a, b) => a.start - b.start);
const round4 = v => Math.round(v * 1e4) / 1e4;
for (const s of list) { s.session = utc(s.start); s.end = utc(s.start + LEN_SEC); s.range = round4(s.high - s.low); s.exact4 = round4(s.vol); }

const consoleEntries = JSON.parse(JSON.parse(readFileSync(consolePath, 'utf8')).stdout).entries || [];
const num = v => Number(String(v).replace(/,/g, ''));
const events = [];
for (const e of consoleEntries) {
  const m = (e.message || '').match(/S02 session completed utc=([\d-]+ [\d:]+) bars=(\d+) vol=([\d.,]+) high=([\d.,]+) low=([\d.,]+) range=([\d.,]+)/);
  if (m) events.push({ session: m[1], bars: Number(m[2]), vol: num(m[3]), high: num(m[4]), low: num(m[5]), range: num(m[6]) });
}
const tableRows = (() => {
  try {
    const rows = JSON.parse(JSON.parse(readFileSync(tablePath, 'utf8')).stdout).studies?.[0]?.tables?.[0]?.rows || [];
    const h = rows.findIndex(r => /^session \(UTC\)/.test(r));
    return rows.slice(h + 1).map(r => { const p = r.split(' | ').map(s => s.trim());
      return { session: p[0], bars: Number(p[1]), vol: num(p[2]), high: num(p[3]), low: num(p[4]), range: num(p[5]) }; });
  } catch { return []; }
})();

const cmp = (label, expected, actual, tolVol, tolPrice) => {
  const diffs = [];
  for (const e of expected) {
    const a = actual.find(x => x.session === e.session);
    if (!a) { diffs.push({ session: e.session, reason: 'missing in ' + label }); continue; }
    if (a.bars !== e.bars) diffs.push({ session: e.session, field: 'bars', expected: e.bars, actual: a.bars });
    if (Math.abs(a.vol - e.vol) > tolVol) diffs.push({ session: e.session, field: 'vol', expected: e.vol, actual: a.vol, delta: +(a.vol - e.vol).toFixed(6) });
    if (Math.abs(a.high - e.high) > tolPrice) diffs.push({ session: e.session, field: 'high', expected: e.high, actual: a.high });
    if (Math.abs(a.low - e.low) > tolPrice) diffs.push({ session: e.session, field: 'low', expected: e.low, actual: a.low });
    if (Math.abs(a.range - e.range) > tolPrice) diffs.push({ session: e.session, field: 'range', expected: e.range, actual: a.range });
  }
  return { compared: expected.length, missing_actual_sessions: actual.filter(a => !expected.some(e => e.session === a.session)).map(a => a.session), differences: diffs };
};

// The console may not retain every historical line; compare on the sessions it does have.
const consoleVsOhlcv = cmp('console', events, list, 1e-4, 1e-6);
const tableVsOhlcv = cmp('table', tableRows, list, 1e-4, 1e-6);
const sessionBarPattern = list.map(s => ({ session: s.session, bars: s.bars, times: s.times.map(utc), expectedTimes: [0, 900, 1800, 2700].map(o => utc(s.start + o)) }));
const allFourBars = sessionBarPattern.every(s => s.bars === 4 && s.times.join('|') === s.expectedTimes.join('|'));
const volumesExact4 = list.every(s => Math.abs(s.exact4 - s.vol) < 1e-9);
const newest = list[list.length - 1];
const result = {
  source_bars: bars.length, first_bar: utc(bars[0].time), last_bar: utc(bars[bars.length - 1].time),
  bars_outside_session_window: offSession.length,
  sessions_found: list.length,
  sessions: list.map(s => ({ session: s.session, end: s.end, bars: s.bars, vol: s.vol, vol_4dp: s.exact4, high: s.high, low: s.low, range: s.range })),
  console_events_found: events.length, table_rows_found: tableRows.length,
  console_vs_ohlcv: consoleVsOhlcv, table_vs_ohlcv: tableVsOhlcv,
  checks: {
    every_session_has_exactly_four_15m_bars: allFourBars,
    four_dp_volume_round_trip_exact: volumesExact4,
    console_matches_ohlcv: consoleVsOhlcv.differences.length === 0,
    table_matches_ohlcv: tableVsOhlcv.differences.length === 0,
  },
  session_bar_pattern: sessionBarPattern,
  latest_session: newest ? { session: newest.session, bars: newest.bars, vol: newest.vol, high: newest.high, low: newest.low, range: newest.range } : null,
};
writeFileSync(OUT + '/ohlcv-session-verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ sessions: list.length, console_events: events.length, table_rows: tableRows.length,
  checks: result.checks, console_vs_ohlcv: consoleVsOhlcv.differences.slice(0, 5), table_vs_ohlcv: tableVsOhlcv.differences.slice(0, 5),
  latest_session: result.latest_session }, null, 1));


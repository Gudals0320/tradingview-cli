// S02 analysis: parse the study's Pine console lines and cross-check the dashboard table.
// Usage: node qa/pine/scenarios/s02-session-dashboard/analyze-sessions.mjs <console-raw.json> [table-raw.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'results/pine-scenarios/s02-session-dashboard';
mkdirSync(OUT, { recursive: true });
const [consolePath, tablePath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(consolePath, 'utf8'));
const payload = JSON.parse(raw.stdout);
const entries = payload.entries || [];

const num = s => Number(String(s).replace(/,/g, ''));
const started = [], completed = [], removed = [], errors = [], other = [];
for (const e of entries) {
  const m = e.message || '';
  let mm;
  if ((mm = m.match(/S02 session started utc=([\d-]+ [\d:]+) prior_completed=(\d+)/))) {
    started.push({ at: e.timestamp, session: mm[1], prior_completed: Number(mm[2]), level: e.type });
  } else if ((mm = m.match(/S02 session completed utc=([\d-]+ [\d:]+) bars=(\d+) vol=([\d.,]+) high=([\d.,]+) low=([\d.,]+) range=([\d.,]+)/))) {
    completed.push({ at: e.timestamp, session: mm[1], bars: Number(mm[2]), vol: num(mm[3]), high: num(mm[4]), low: num(mm[5]), range: num(mm[6]), level: e.type });
  } else if ((mm = m.match(/S02 oldest session removed utc=([\d-]+ [\d:]+) stored_after=(\d+)/))) {
    removed.push({ at: e.timestamp, session: mm[1], stored_after: Number(mm[2]), level: e.type });
  } else if (/S02/.test(m)) {
    other.push({ at: e.timestamp, level: e.type, message: m });
  }
  if (/error/i.test(e.type || '')) errors.push({ at: e.timestamp, level: e.type, message: m });
}

const countBy = (list, key) => list.reduce((acc, x) => (acc[x[key]] = (acc[x[key]] || 0) + 1, acc), {});
const startCounts = countBy(started, 'session');
const completeCounts = countBy(completed, 'session');
const dupStarts = Object.entries(startCounts).filter(([, c]) => c !== 1).map(([s, c]) => ({ session: s, count: c }));
const dupCompletes = Object.entries(completeCounts).filter(([, c]) => c !== 1).map(([s, c]) => ({ session: s, count: c }));
const completedWithoutStart = completed.filter(c => !startCounts[c.session]).map(c => c.session);
const removedNotCompleted = removed.filter(r => !completeCounts[r.session]).map(r => r.session);
const storedAfterOk = removed.every(r => r.stored_after <= 20 || r.stored_after <= Number(process.env.S02_KEEP || 20));
const firstCompleteIdx = entries.findIndex(e => /S02 session completed/.test(e.message || ''));
const errorsBeforeFirstComplete = firstCompleteIdx < 0 ? [] : entries.slice(0, firstCompleteIdx).filter(e => /error/i.test(e.type || '')).map(e => ({ level: e.type, message: e.message }));
const expectedBars = Number(process.env.S02_EXPECT_BARS || 4);
const badBarCounts = completed.filter(c => c.bars !== expectedBars).map(c => ({ session: c.session, bars: c.bars }));
const monotonic = completed.every((c, i) => i === 0 || c.session > completed[i - 1].session.slice(0, 10) || c.session > completed[i - 1].session);
const rangeConsistent = completed.every(c => Math.abs((c.high - c.low) - c.range) < 1e-6);

let tableCheck = null;
if (tablePath) {
  const traw = JSON.parse(readFileSync(tablePath, 'utf8'));
  const tpayload = JSON.parse(traw.stdout);
  const rows = (tpayload.studies?.[0]?.tables?.[0]?.rows || []);
  const meta = rows.find(r => /^stored=/.test(r));
  const header = rows.findIndex(r => /^session \(UTC\)/.test(r));
  const dataRows = rows.slice(header + 1).map(r => {
    const p = r.split(' | ').map(s => s.trim());
    return { session: p[0], bars: Number(p[1]), vol: num(p[2]), high: num(p[3]), low: num(p[4]), range: num(p[5]) };
  });
  const metaM = meta && meta.match(/stored=(\d+) limit=(\d+) removed=(\d+) avgVol=([\d.,]+)/);
  const stored = metaM ? Number(metaM[1]) : null, limit = metaM ? Number(metaM[2]) : null, removedTotal = metaM ? Number(metaM[3]) : null, avgVol = metaM ? num(metaM[4]) : null;
  const tail = completed.slice(-dataRows.length);
  const mismatches = [];
  for (let i = 0; i < dataRows.length; i++) {
    const t = dataRows[i], c = tail[i];
    if (!c) { mismatches.push({ i, reason: 'no console event' }); continue; }
    if (t.session !== c.session) mismatches.push({ i, field: 'session', table: t.session, console: c.session });
    if (t.bars !== c.bars) mismatches.push({ i, field: 'bars', table: t.bars, console: c.bars });
    if (Math.abs(t.vol - c.vol) > 1e-4) mismatches.push({ i, field: 'vol', table: t.vol, console: c.vol });
    if (Math.abs(t.high - c.high) > 1e-6) mismatches.push({ i, field: 'high', table: t.high, console: c.high });
    if (Math.abs(t.low - c.low) > 1e-6) mismatches.push({ i, field: 'low', table: t.low, console: c.low });
  }
  const expectedAvg = stored ? tail.reduce((a, c) => a + c.vol, 0) / tail.length : null;
  tableCheck = { stored, limit, removedTotal, avgVol, tableRowCount: dataRows.length, mismatches,
    rowCountMatchesStored: stored === dataRows.length, avgVolMatchesConsole: avgVol != null && expectedAvg != null && Math.abs(avgVol - expectedAvg) < 1e-4,
    latestRow: dataRows[dataRows.length - 1] || null };
}

const summary = {
  console_source: consolePath,
  entry_count: entries.length,
  s02_started: started.length, s02_completed: completed.length, s02_removed: removed.length, s02_other: other.length,
  first_started: started[0] || null, last_completed: completed[completed.length - 1] || null,
  first_completed: completed[0] || null, last_removed: removed[removed.length - 1] || null,
  checks: {
    exactly_one_start_per_session: dupStarts.length === 0 && completedWithoutStart.length === 0,
    duplicate_starts: dupStarts, duplicate_completes: dupCompletes, completed_without_start: completedWithoutStart,
    exactly_one_completion_per_session: dupCompletes.length === 0,
    all_started_sessions_completed: started.length === completed.length,
    first_session_prior_completed_zero: started.length > 0 && started[0].prior_completed === 0,
    removed_sessions_were_completed: removedNotCompleted.length === 0,
    removal_only_after_limit: storedAfterOk,
    errors_before_first_completion: errorsBeforeFirstComplete,
    sessions_with_unexpected_bar_count: badBarCounts,
    sessions_monotonic: monotonic,
    range_equals_high_minus_low: rangeConsistent,
    error_entries: errors,
  },
  table_check: tableCheck,
  started, completed, removed, other,
};
const outPath = OUT + '/session-analysis.json';
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: outPath, entry_count: entries.length, started: started.length, completed: completed.length,
  removed: removed.length, errors: errors.length, checks: summary.checks, table_check: tableCheck }, null, 1));


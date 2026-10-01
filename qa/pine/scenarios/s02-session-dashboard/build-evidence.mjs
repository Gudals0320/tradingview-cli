// S02 evidence builder: assembles a compact, sanitized evidence.json from the raw CLI log
// and the independent verification artifacts (all under the ignored results directory).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RAW = 'results/pine-scenarios/s02-session-dashboard';
const OUT = 'qa/pine/scenarios/s02-session-dashboard/evidence.json';
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const maybe = p => (existsSync(p) ? readJson(p) : null);

const log = readFileSync(RAW + '/log.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const analysis = maybe(RAW + '/session-analysis.json');
const ohlcv = maybe(RAW + '/ohlcv-session-verification.json');
const series = maybe(RAW + '/series-verification.json');
const source = maybe(RAW + '/source-verification.json');

const raw = label => maybe(RAW + '/raw/' + label + '.json');
const payload = label => { const r = raw(label); try { return r ? JSON.parse(r.stdout) : null; } catch { return null; } };

const keyCommands = [
  ['tab new (dedicated layout)', '01-tab-new'],
  ['timeframe 15', '07-timeframe-15'],
  ['ohlcv 500 bars', '08-ohlcv-15m-500'],
  ['pine new indicator', '21-pine-new-indicator'],
  ['pine set v1 baseline', '22-set-v1'],
  ['pine save v1', '23-save-v1'],
  ['pine compile v1', '24-compile-v1'],
  ['data tables v1', '26-tables-v1'],
  ['pine console v1', '27-console-v1'],
  ['indicator set keep=5', '32-indicator-set-keep5'],
  ['data tables keep=5', '35-tables-keep5'],
  ['range back to 2026-09-25', '36-range-back'],
  ['ohlcv after range', '37-ohlcv-after-range'],
  ['data tables keep=5 (500 bar window)', '39-tables-keep5-500'],
  ['pine set v2 (injected)', '42-set-v2-injected'],
  ['pine save v2', '43-save-v2'],
  ['pine compile --save v2 (rejected)', '44-compile-v2-save'],
  ['pine compile v2 retry (rejected)', '48-compile-v2-retry'],
  ['pine set v3 (fixed)', '53-set-v3-fixed'],
  ['pine save v3', '54-save-v3'],
  ['pine compile v3', '55-compile-v3'],
  ['data tables after v3', '57-tables-after-v3'],
  ['replay start 2026-09-30', '67-replay-start'],
  ['replay stop', '74-replay-stop'],
  ['indicator set keep=20', '78-input-keep20'],
  ['pine set v2 (repro 2)', '89-repro-set-v2'],
  ['pine save v2 (repro 2)', '90-repro-save-v2'],
  ['pine compile --save v2 (repro 2 rejected)', '91-repro-compile-v2'],
  ['study status probe (runtime error)', '92-probe-study-status'],
  ['pine set v3 (recovery)', '94-restore-set-v3'],
  ['pine save v3 (recovery)', '95-restore-save-v3'],
  ['pine compile --save v3 (recovery)', '96-restore-compile-v3'],
  ['study status probe (recovered)', '101-probe-study-status'],
  ['data tables final', '100-tables-final'],
  ['pine open saved name', '104-open-saved'],
  ['pine get after reopen', '105-get-reopened'],
  ['pine save final', '103-save-final'],
  ['pine errors final', '113-final-errors'],
];

const evidence = {
  scenario: 'S02 — UTC session volume/range/bar-count dashboard',
  slug: 's02-session-dashboard',
  cwd: 'C:\\Codex\\.worktrees\\tradingview-cli-pinescript-qa',
  branch: 'codex/pine-qa',
  product_baseline: '57ee8e7',
  recorded_at: new Date().toISOString(),
  environment: {
    cli: 'node src/cli/index.js',
    target: readFileSync(RAW + '/target.txt', 'utf8').trim(),
    layout: 'CLI-QA-S02-20261001',
    chart_id: 'nipHauoX',
    final_symbol: 'BINANCE:ETHUSDT',
    final_timeframe: '15',
    final_studies: ['rLenrk:Volume', 'XvcQgK:CLI-QA-S02 Session Dashboard 20261001'],
    saved_document: { name: 'CLI-QA-S02 Session Dashboard 20261001', script_id: 'USER;6b325663a8a24b548558d60895ec3bc8', final_version: '5.0' },
  },
  commands: {
    total_recorded: log.length,
    with_nonzero_exit: log.filter(l => l.exit_code !== 0).map(l => ({ label: l.label, exit_code: l.exit_code, args: l.args.join(' ') })),
    key: keyCommands.map(([desc, label]) => { const r = raw(label); return r ? { step: desc, label, exit_code: r.exit_code, elapsed_ms: r.elapsed_ms, args: r.args.slice(1).join(' ') } : null; }).filter(Boolean),
  },
  pine_commands_attempted: log.filter(l => l.args.includes('pine')).map(l => ({ label: l.label, args: l.args.filter(a => a !== '--target' && !/^\d+$/.test(a)).join(' '), exit_code: l.exit_code })),
  static_analysis: {
    'pine analyze v1': payload('11-analyze-v1-baseline'),
    'pine analyze v3': payload('40-analyze-v2-v3'),
    'pine analyze v2 (injected, not detected)': payload('41-analyze-v2-injected'),
    server_check_v1: { label: '10-check-v1-baseline (escalated)' },
    server_check_v1_result: { compiled: true, error_count: 0, warning_count: 0 },
    server_check_v2_result: { compiled: true, error_count: 0, warning_count: 0, note: 'server accepts the injected source; the failure is a runtime array error' },
  },
  acceptance: {
    C1_no_error_before_first_completion: 'PASS (bounded: no error entries and no runtime error state in any captured log; the very first computation window is outside the captured snapshots)',
    C2_exactly_one_record_per_session: 'PASS',
    C3_new_session_reset: 'PASS',
    C4_limit_5_keeps_newest_5_table_array_consistent: 'PASS',
    C5_two_completed_sessions_vs_independent_ohlcv: 'PASS (5 of 5 table rows exact; 15m: BTCUSDT 9 sessions / ETHUSDT 24 sessions on the study series)',
    C6_console_real_log_rows_only: 'PASS (bounded)',
    C7_array_error_observed_then_fixed: 'PASS',
    C8_save_reopen_preserves_source: 'PASS',
    C9_fresh_empty_archive_start_observed_live: 'NOT TESTED (initial computation window not observable in the available 500-bar extraction window / 40-line console buffer; whether the live study began with an empty archive is not claimed)',
    C10_live_session_rollover: 'NOT TESTED',
  },
  independent_verification: {
    evidence_selection: 'Only table-vs-OHLCV and the study-series checks are used as pass evidence. console_vs_table and ohlcv_recomputation.console_vs_ohlcv disagree for two explained reasons and are kept as raw material only: (1) different snapshots/kept windows — the table snapshot spans 2026-09-12..2026-10-01 while the console snapshot spans 2026-09-21..2026-09-29, so sessions missing from the console are capture-time differences; (2) the console completion log prints volume with 4 decimals, giving ±0.0001..0.0004 deltas versus the exact value (e.g. printed 4418.377 vs exact 4418.3769).',
    console_vs_table: analysis && { entry_count: analysis.entry_count, started: analysis.s02_started, completed: analysis.s02_completed, removed: analysis.s02_removed, checks: analysis.checks, table_check: analysis.table_check },
    ohlcv_recomputation: ohlcv && { sessions_found: ohlcv.sessions_found, console_events: ohlcv.console_events_found, table_rows: ohlcv.table_rows_found, checks: ohlcv.checks, latest_session: ohlcv.latest_session },
    study_series: series && { keep: series.keep, archive_baseline: series.archive_baseline, sessions_recomputed: series.sessions_recomputed, checks: series.checks, final_row: series.final_row, expected_final: series.expected_final, empty_history_state: series.empty_history_state },
    source_identity: source && { hashes: source.fixtures, editor_matches_fixture_v3: source.editor_matches_fixture_v3, reopened_matches_fixture_v3: source.reopened_matches_fixture_v3, reopened_sha256_normalized: source.reopened_sha256_normalized, reopened_reported_lines: source.reopened_reported_lines },
  },
  defects: [
    {
      id: 'D1',
      title: 'Runtime-erroring Pine script rejects chart update with a bare Rejected message',
      severity: 'medium (diagnostics)',
      trigger: 'pine set (v2 with unguarded array.get) -> pine save (succeeds) -> pine compile or pine compile --save (updateOnChart path)',
      minimal_repro: 'Compile a saved script whose runtime fails at the first session start against an empty archive (observed bar_index 18, line 53) onto an existing chart study.',
      expected: 'A structured diagnostic identifying the runtime error (the chart study itself reports RE10045 with funcName/index/size/bar_index).',
      actual: '{"success":false,"compiled":false,"error":"Rejected"} with exit 1 and no code/diagnostics; the editor has no markers and the declaration-time button is disabled.',
      frequency: '3/3 attempts (labels 44, 48, 91 across two injection cycles: compile --save, compile, compile --save). The healthy v1 first add used addToChart and is not the same condition (and is not recorded as a failure).',
      workaround: 'Fix the script; the corrected v3 updates successfully through the same path.',
      suspected_component: 'src/core/pine-state.js (dispatchPineCompilation / verifyPineCompilation) or the native updateOnChart rejection path',
      evidence: ['44-compile-v2-save', '48-compile-v2-retry', '91-repro-compile-v2', '92-probe-study-status', '50-probe-rejected', '51-markers'],
    },
  ],
  environment_notes: [
    {
      id: 'E1', type: 'environment',
      title: 'pine check fails with a bare "fetch failed" without network access',
      trigger: 'node src/cli/index.js pine check --file <pine> without network access',
      expected: 'A message that distinguishes network reachability from a compile result.',
      actual: '{success:false,error:"fetch failed"}, exit 1',
      frequency: '1/1 attempts; passes with network (escalated)',
      workaround: 'Run with network access.',
      evidence: ['10-check-v1-baseline'],
    },
  ],
  known_limitations: [
    {
      id: 'L1',
      title: 'pine analyze does not flag a computed-index array.get on an empty array',
      trigger: 'pine analyze --file on v2-array-error.pine (array.get on a run-time-indexed empty array)',
      observed: 'issue_count 0; the tool only bounds-checks integer-literal indices, and the protocol documents analyze as heuristic.',
      frequency: '1/1',
      classification: 'known heuristic coverage, not a product defect',
      evidence: ['41-analyze-v2-injected'],
    },
    {
      id: 'L2',
      title: 'Runtime-error rejection surfaced only on the updateOnChart path',
      detail: 'Both chart updates used updateOnChart because the study was added once via addToChart; the addToChart path was not re-exercised with a failing script.',
      classification: 'coverage limitation',
    },
  ],
  fixture_errors: [
    { id: 'F1', area: 'QA harness', detail: 'extract-study.mjs treated series values as [plot0..] instead of [time, plot0..]; fixed by offsetting plot indices.' },
    { id: 'F2', area: 'QA harness', detail: 'verify-series.mjs dropped the open session when leaving the window; fixed to push on window exit.' },
    { id: 'F3', area: 'QA harness', detail: 'ui click --text is harness invalid usage; the supported form is --by text --value.' },
  ],
  limitations: [
    'The Pine console ring buffer retains only the latest 40 messages, so a complete fresh-run log (first session started with prior_completed=0) is not observable after ~9 sessions; empty-archive behaviour was verified from the study series instead.',
    'The initial-computation window is not observable with the available extraction window (max 500 bars of 2300 available) and the 40-line console buffer; the study may or may not have begun with a pre-filled archive, which this run does not claim.',
    'Label 82-console-clean referenced in an earlier draft does not exist; the console evidence labels are 27, 34, 38, 47, 49, 58 and 93.',
  ],
  qa_state: {
    layout: 'CLI-QA-S02-20261001 (chart nipHauoX)',
    documents: ['CLI-QA-S02 Session Dashboard 20261001 (USER;6b325663a8a24b548558d60895ec3bc8, v5.0)'],
    studies_on_chart: 2,
    replay: 'stopped, current_date null',
    dialogs: 0,
    other_scenario_assets_touched: 'none (S01 document verified still present, v6.0)',
  },
};

writeFileSync(OUT, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ out: OUT, recorded_commands: log.length, nonzero_exit: evidence.commands.with_nonzero_exit.length,
  defects: evidence.defects.length, acceptance: evidence.acceptance }, null, 1));


import fs from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = 'C:/Codex/.worktrees/tradingview-cli-pinescript-qa';
const RAW = ROOT + '/results/pine-scenarios/s05-library-contracts/raw';
const QA = ROOT + '/qa/pine/scenarios/s05-library-contracts';
const sha = p => createHash('sha256').update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const rec = tag => JSON.parse(fs.readFileSync(RAW + '/' + tag + '.json', 'utf8'));
const pick = (tag, keys) => {
  const r = rec(tag);
  const o = { tag, command: r.command.slice(1).join(' '), elapsed_ms: r.elapsed_ms, exit_code: r.exit_code, expected_exit: r.expect_exit };
  for (const k of (keys || [])) o[k] = r[k];
  if (r.fence_pre) o.fence = { pre: r.fence_pre.state, post: r.fence_post ? r.fence_post.state : null, post_error: r.fence_post_error || null };
  o.record_file = 'results/pine-scenarios/s05-library-contracts/raw/' + tag + '.json';
  return o;
};
const state = JSON.parse(fs.readFileSync(ROOT + '/results/pine-scenarios/s05-library-contracts/state.json', 'utf8'));
const hashes = JSON.parse(fs.readFileSync(RAW + '/hashes.json', 'utf8'));
const vectors = JSON.parse(fs.readFileSync(RAW + '/vector-check.json', 'utf8'));
const tableRows = JSON.parse(fs.readFileSync(RAW + '/tables-verifier-v2-final.json', 'utf8')).json_sanitized.studies[0].tables[0].rows;
const tableRowsV1 = JSON.parse(fs.readFileSync(RAW + '/tables-verifier3.json', 'utf8')).json_sanitized.studies[0].tables[0].rows;
const norm = x => x.replace(/\r\n/g, '\n');
const sl = (arr, b, e) => { const i = arr.findIndex(l => l.includes(b)), j = arr.findIndex(l => l.includes(e)); return arr.slice(i + 1, j); };
const fnNorm = x => x.map(l => l.replace(/^([A-Za-z_][A-Za-z0-9_]*)\(/, 'FN('));
const tamperedBody = fnNorm(sl(norm(fs.readFileSync(RAW + '/library-tampered.pine', 'utf8')).split('\n'), 'CLIQAS05-BODY-BEGIN', 'CLIQAS05-BODY-END').map(l => l.replace(/^export /, '')));
const finalBody = fnNorm(sl(norm(fs.readFileSync(QA + '/library-v2.pine', 'utf8')).split('\n'), 'CLIQAS05-BODY-BEGIN', 'CLIQAS05-BODY-END').map(l => l.replace(/^export /, '')));
const diffs = [];
for (let q = 0; q < Math.max(tamperedBody.length, finalBody.length); q++) if (tamperedBody[q] !== finalBody[q]) diffs.push({ line_index: q, library_body: tamperedBody[q], verifier_body: finalBody[q] });
const evidence = {
  scenario: 'S05 - library type/edge/save contracts (CLI-QA-S05)',
  executed_at_utc: new Date().toISOString(),
  environment: {
    repo: ROOT, branch: 'codex/pine-qa', product_baseline: '57ee8e7',
    target_id: state.target, chart_url: state.chartUrl, layout: state.layout, chart_id: 'XUvlQKpS',
    node: process.version,
    cli_pattern: 'node src/cli/index.js --target <id> ... via Node spawnSync(process.execPath, ...); child exit code and parsed JSON both recorded',
    network_note: 'pine check performs its own Node-side fetch to pine-facade.tradingview.com. Inside the file sandbox that fails with {"success":false,"error":"fetch failed"} (records check-lib, check-typeerr) - environment, not product. The escalated re-runs are the records referenced here.',
  },
  documents: {
    library: { saved_name: 'CLIQA S05 Math Lib 20261001', script_id: 'USER;96d5d636d91444b2bbd5595e8cc1da04', final_version: '3.0',
      library_title_inside_source: 'CLIQAS05MathLib20261001', fixture_library_v2_hash_nl: sha(QA + '/library-v2.pine'),
      editor_source_hash_nl_after_reopen: '9da754638b48aacafe87b0f05d41d3d1ba336f74be91eb4fac83a79f6e4a641d',
      steps: ['pine new library (template verified, unsaved)', 'pine set library-v1 -> pine save = v1.0 saved_with_dialog', 'pine set library-v2 (+scale) -> pine save = v2.0', 'pine open by name', 'pine set library-v2 (identifier-safe title) -> pine save = v3.0', 'pine open by name -> pine get (hash matches fixture)'] },
    verifier: { saved_name: 'CLIQA S05 Verifier 20261001', script_id: 'USER;17a6e38619324bfeb6425cbe969c0cb3', final_version: '9.0',
      fixture_hash_nl: sha(QA + '/verifier-indicator.pine'), chart_study_id: '3IwshQ', study_status: 2,
      study_pineId: 'USER;17a6e38619324bfeb6425cbe969c0cb3', study_pineVersion: '9.0' },
  },
  fixtures: {
    'library-v1.pine': { hash_nl: hashes.library_v1.hash_nl, chars: hashes.library_v1.chars, lines: hashes.library_v1.lines, exported_body_lines: hashes.library_v1.body_lines, role: 'v1 function contract without scale; current file has corrected identifier title, original spaced-title run is retained in raw evidence' },
    'library-v2.pine': { hash_nl: hashes.library_final.hash_nl, chars: hashes.library_final.chars, lines: hashes.library_final.lines, exported_body_lines: hashes.library_final.body_lines, role: 'FINAL keeper: weighted_score(..., float scale = 1.0), identifier-safe title' },
    'library-type-error.pine': { hash_nl: hashes.type_error.hash_nl, chars: hashes.type_error.chars, lines: hashes.type_error.lines, role: 'negative control: clamped + "px" and clamp(hi, lo, "wide")' },
    'verifier-indicator.pine': { hash_nl: hashes.verifier.hash_nl, chars: hashes.verifier.chars, lines: hashes.verifier.lines, copied_body_lines: hashes.verifier.copy_lines, role: 'independent verifier, 33 literal probes, copy region equals the FINAL library-v2 body' },
    'raw/verifier-spliced.pine (ignored)': { hash_nl: sha(RAW + '/verifier-spliced.pine'), role: 'body-mismatch variant built from a tampered library source; the detector flagged it and the chart update was rejected' },
  },
  body_identity: {
    method: 'Library body region between CLIQAS05-BODY-BEGIN/END (export stripped, function name normalized to FN) versus the verifier copy region between CLIQAS05-VERIFY-COPY-BEGIN/END (name normalized the same way). Name normalization is allowed because the verifier cannot import and therefore renames.',
    compared_lines: hashes.verifier.copy_lines,
    body_exact_match_vs_final_library_v2: hashes.body_exact_match_vs_final,
    body_exact_match_vs_library_v1: hashes.body_exact_match_vs_v1,
    final_body_hash_nl: hashes.library_final.body_hash_nl,
    verifier_copy_hash_nl: hashes.verifier.copy_hash_nl,
    detector_sensitivity_negative_control: { compared_lines: Math.max(tamperedBody.length, finalBody.length), diff_count: diffs.length, diffs,
      note: 'Final-v2 comparison detects exactly one changed line: the math.max function token changed to math.min inside clamp.' },
  },
  server_checks: [
    { tag: 'check-lib-net', fixture: 'library-v1.pine (title with spaces)', exit: 0, result: 'compiled true, 0 errors, 0 warnings' },
    { tag: 'check-v2', fixture: 'library-v2.pine (scale argument)', exit: 0, result: 'compiled true, 0 errors, 0 warnings' },
    { tag: 'check-v1-final', fixture: 'library-v1.pine (current)', exit: 0, result: 'compiled true, 0 errors, 0 warnings' },
    { tag: 'check-v2-final', fixture: 'library-v2.pine (current)', exit: 0, result: 'compiled true, 0 errors, 0 warnings' },
    { tag: 'check-typeerr-exit1', fixture: 'library-type-error.pine', exit: 1, result: 'compiled false, 2 errors with exact line/column and argument name' },
    { tag: 'check-verifier-v2', fixture: 'verifier-indicator.pine (v2-aligned, 33 probes)', exit: 0, result: 'compiled true, 0 errors, 0 warnings' },
    { tag: 'analyze-lib', fixture: 'library-v1.pine', exit: 0, result: 'offline heuristic analyzer: 0 issues' },
    { tag: 'analyze-verifier-v2', fixture: 'verifier-indicator.pine', exit: 0, result: 'offline heuristic analyzer: 0 issues' },
  ],
  desktop_compile: {
    verifier: [
      { tag: 'compile-verifier', exit: 1, expected: 'diagnostic', json: 'has_errors true: Cannot call "addProbe" with "na" as a value for a non-typified argument (fixture fixed afterwards)' },
      { tag: 'compile-verifier3', exit: 0, json: 'unchanged true (study already carried the matching applied version)' },
      { tag: 'compile-restore', exit: 0, json: 'compiled true, saved true, button_clicked updateOnChart -> v5.0' },
      { tag: 'compile-verifier-v2', exit: 1, json: 'save ok (v9.0) then chart update Rejected; pine errors 0, console shows only open/save/compile messages, study stayed status 2 running the previous version' },
      { tag: 'compile-verifier-v2b', exit: 1, json: 'same Rejected result on retry' },
      { tag: 'remove-stuck-v2', exit: 0, json: 'indicator remove of the old study (own QA asset)' },
      { tag: 'compile-readd-v2', exit: 0, json: 'compiled true, button_clicked addToChart -> study 3IwshQ, status 2, pineVersion 9.0' },
    ],
    library: [
      { tag: 'compile-library', exit: 1, expected: 'diagnostic', json: 'has_errors true, 1 error: library title with spaces rejected (line 5 col 9)' },
      { tag: 'compile-library2', exit: 1, json: 'translation passed; then Applied indicator calculation did not finish before timeout (study utwwmx left at status 0)' },
      { tag: 'compile-library2b', exit: 1, json: 'same timeout after re-save to v3.0' },
    ],
  },
  library_chart_add: {
    scope_note: 'Library import integration is out of scope for S05. No import-based verification was performed and none is claimed.',
    attempts_in_order: [
      { attempt: 1, tag: 'compile-library', source: 'library-v1 (title with spaces)', outcome: 'diagnostic only: 1 error, invalid library title' },
      { attempt: 2, tag: 'compile-library2', source: 'library-v2 (identifier-safe title)', outcome: 'translation OK; Desktop attached the library as study utwwmx; the study never calculated (runtime status 0, no error text); pine compile reported a ~30 s timeout' },
      { attempt: 3, tag: 'compile-library2b', source: 'library-v2 re-saved (v3.0)', outcome: 'identical timeout and identical status-0 study' },
    ],
    observed_result: 'A library can be attached to the chart as a study but its application cannot be verified by pine compile: 2/2 valid-title attempts timed out at ~30 s and the added study stayed at runtime status 0.',
    causal_status: 'HYPOTHESIS, not established: a library computes no series, so the applied calculation never reports completion. The evidence recorded here is only (a) the library study existed with status 0 and (b) pine compile timed out. No platform-level cause was proven, and no other indicator was studied for comparison beyond one state probe.',
    related_state_probe: { tag: 'add-rsi-probe', what: 'diagnostic indicator add on the same chart at that moment', result: 'new_study_count 0 (no study created) - recorded as chart-state context only, not as a library finding and not investigated further' },
    cleanup: 'indicator remove utwwmx; the final chart carries Volume and the CLIQA S05 verifier study only.',
  },
  calculation_cross_check: {
    result_is_final: 'The 33-probe table below is the FINAL result and it runs the FINAL library-v2 body. An earlier 30-probe capture (tables-verifier3, header: ' + tableRowsV1[0] + ') came from the v1 body and is superseded.',
    final_fixture_relation: 'The verifier copy region now equals the FINAL library-v2 body (name-normalized, export stripped), so the on-chart numbers and the library keeper source are aligned by construction plus the body-identity check.',
    chart_table_source: 'data tables --filter "CLIQA S05 Verifier" (study 3IwshQ)',
    chart_table_header: tableRows[0],
    chart_table_rows: tableRows.length - 1,
    chart_table_pass: tableRows.slice(1).filter(r => r.endsWith('PASS')).length,
    chart_table_mismatch: tableRows.slice(1).filter(r => !r.endsWith('PASS')).length,
    node_oracle: { probes: vectors.probes, literal_mismatches: vectors.literal_mismatches, actual_mismatches: vectors.actual_mismatches, indicator_mismatch_rows: vectors.indicator_mismatch_rows, all_match: vectors.all_match },
    probes: vectors.report.map(r => ({ id: r.id, vars: r.vars, oracle: r.truth, expected_shown: r.expected_shown, actual_shown: r.actual_shown, indicator: r.indicator_status })),
    scale_probes: vectors.report.filter(r => r.id.startsWith('weighted-scale')).map(r => ({ id: r.id, oracle: r.truth, actual: r.actual_shown, scale_argument: r.vars })),
  },
  key_commands: [
    pick('check-lib-net', ['stdout_sanitized']),
    pick('check-v2-final', ['stdout_sanitized']),
    pick('check-typeerr-exit1', ['stdout_sanitized']),
    pick('new-library', ['stdout_sanitized']),
    pick('set-lib-v1', ['stdout_sanitized']),
    pick('save-lib', ['stdout_sanitized']),
    pick('save-lib-2', ['stdout_sanitized']),
    pick('list-after-save', ['stdout_sanitized']),
    pick('get-lib-saved', ['line_count', 'char_count', 'stdout_sanitized']),
    pick('set-lib-v2', ['stdout_sanitized']),
    pick('save-lib-v2', ['stdout_sanitized']),
    pick('new-indicator', ['stdout_sanitized']),
    pick('set-verifier', ['stdout_sanitized']),
    pick('save-verifier', ['stdout_sanitized']),
    pick('compile-verifier', ['stdout_sanitized']),
    pick('compile-verifier3', ['stdout_sanitized']),
    pick('compile-restore', ['stdout_sanitized']),
    pick('tables-verifier3', ['stdout_sanitized']),
    pick('set-verifier-v2', ['stdout_sanitized']),
    pick('save-verifier-v2', ['stdout_sanitized']),
    pick('compile-verifier-v2', ['stdout_sanitized']),
    pick('remove-stuck-v2', ['stdout_sanitized']),
    pick('compile-readd-v2', ['stdout_sanitized']),
    pick('tables-verifier-v2-final', ['stdout_sanitized']),
    pick('indicator-get-final2', ['stdout_sanitized']),
    pick('set-tampered', ['stdout_sanitized']),
    pick('compile-tampered', ['stdout_sanitized']),
    pick('errors-tampered', ['stdout_sanitized']),
    pick('set-restore2', ['stdout_sanitized']),
    pick('save-restore2', ['stdout_sanitized']),
    pick('compile-library', ['stdout_sanitized']),
    pick('compile-library2b', ['stdout_sanitized']),
    pick('remove-lib-study', ['stdout_sanitized']),
    pick('open-lib2', ['stdout_sanitized']),
    pick('get-lib-reopened', ['line_count', 'char_count', 'stdout_sanitized']),
    pick('open-lib-final', ['stdout_sanitized']),
    pick('get-lib-final', ['line_count', 'char_count', 'stdout_sanitized']),
    pick('open-lib', ['stderr', 'stdout_sanitized']),
    pick('panel-open', ['stdout_sanitized']),
    pick('state-qa-final2', ['state', 'values']),
  ],
  guards_demonstrated: [
    'The brand-new layout reopened another scenario document (USER;e4b6a39e8a79466bb3134287eb3713a0, CLI-QA-S04 Pivot Zones, modified false). Nothing was mutated under it: the first editor action was pine new library.',
    'Every recorded command carries fence_pre/fence_post with the QA target URL, the native Pine document id, version and modified flag. A mismatch or a page-evaluation failure aborts the harness (exit 3); a child exit code or JSON failure is re-thrown instead of being reported as outer exit 0.',
    'The sandboxed pine check failure (fetch failed) was classified as environment and re-run with network escalation rather than reported as a product defect.',
  ],
  limits: [
    'Library import integration was NOT verified (out of scope): no importing script exists and no import behaviour is claimed.',
    'The library chart-add question is answered only as far as three attempts show (one title diagnostic, two timeouts); the platform-level cause remains a hypothesis.',
    'pine open cannot reopen the Pine panel after a tab reload (observed once); ui panel pine-editor open is the recorded workaround.',
    'The chart update of an already-applied study was rejected in 3/3 attempts while the same source loaded fine after indicator remove and re-add; the reason was not diagnosed (UI workaround used, marked as a hypothesis-free observation).',
  ],
};
fs.writeFileSync(QA + '/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('evidence.json bytes=' + fs.statSync(QA + '/evidence.json').size);
console.log('final table rows=' + evidence.calculation_cross_check.chart_table_rows + ' pass=' + evidence.calculation_cross_check.chart_table_pass + ' mismatch=' + evidence.calculation_cross_check.chart_table_mismatch);
console.log('oracle all_match=' + evidence.calculation_cross_check.node_oracle.all_match + ' probes=' + evidence.calculation_cross_check.node_oracle.probes);
console.log('body match vs final=' + evidence.body_identity.body_exact_match_vs_final_library_v2 + ' vs v1=' + evidence.body_identity.body_exact_match_vs_library_v1);

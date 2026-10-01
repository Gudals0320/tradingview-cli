// Build sanitized evidence.json from the ignored raw run directory.
// Usage: node qa/pine/scenarios/s01-mtf-trend/build-evidence.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const RAW = 'results/pine-scenarios/s01-mtf-trend/', QA = 'qa/pine/scenarios/s01-mtf-trend/';
const sha = s => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const lines = f => readFileSync(RAW + f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const summarize = (label, out) => {
  let j; try { j = JSON.parse(out); } catch { return out ? { text: out.slice(0, 300) } : null; }
  if (j.result && typeof j.result === 'string' && j.result.startsWith('{"study"')) {
    const x = JSON.parse(j.result);
    if (x.error) return { extract_error: x.error };
    const last = x.rows.at(-1); const named = last ? Object.fromEntries(x.titles.map((t, i) => [t, last[i + 1]])) : null;
    return { extract: { study: x.study, resolution: x.resolution, pineVersion: x.inputs?.pineVersion, inputs: x.inputs && Object.fromEntries(Object.entries(x.inputs).filter(([k]) => k.startsWith('in_')).map(([k, v]) => [k, v.v])), plot_count: x.titles.length, rows: x.rows.length, bars: x.bars.length, last_row_time: last?.[0], last_row: named } };
  }
  if (Array.isArray(j.scripts)) return { success: j.success, total_saved_scripts: j.scripts.length, s01_scripts: j.scripts.filter(s => /CLI-QA-S01/.test(s.name + s.title)) };
  if (j.tabs) return { success: j.success, tab_count: j.tab_count, tabs: j.tabs.map(t => ({ id: t.id, chart_id: t.chart_id, active: t.active, shell_visibility: t.shell_visibility })) };
  if (typeof j.source === 'string') return { success: j.success, line_count: j.line_count, char_count: j.char_count, source_sha256: sha(j.source) };
  if (j.buttons) return { success: j.success, pine_editor: j.pine_editor, bottom_panel: j.bottom_panel };
  if (j.result && typeof j.result === 'string' && j.result.length > 600) return { success: j.success, result_chars: j.result.length };
  if (j.inputs && j.inputs.text) delete j.inputs.text;
  return j;
};
const commands = lines('log.jsonl').map(e => {
  const raw = JSON.parse(readFileSync(RAW + 'raw/' + e.label + '.json', 'utf8'));
  return { label: e.label, at: e.at, args: e.args.map(a => a.length > 200 ? '<expression ' + a.length + ' chars sha256=' + sha(a).slice(0, 16) + '>' : a),
    exit_code: e.exit_code, elapsed_ms: e.elapsed_ms, stdin_sha256: e.stdin_sha256, stdout: summarize(e.label, raw.stdout), stderr: raw.stderr ? summarize(e.label, raw.stderr) : undefined };
});
const stages = Object.fromEntries(readdirSync(QA).filter(f => f.endsWith('.pine')).map(f => [f, sha(readFileSync(QA + f, 'utf8'))]));
const analyses = Object.fromEntries(readdirSync(RAW).filter(f => /^analysis.*\.json$/.test(f)).map(f => [f.replace('.json', ''), JSON.parse(readFileSync(RAW + f, 'utf8'))]));
const extra = existsSync(RAW + 'extra.json') ? JSON.parse(readFileSync(RAW + 'extra.json', 'utf8')) : {};
writeFileSync(QA + 'evidence.json', JSON.stringify({ scenario: 's01-mtf-trend', generated_at: new Date().toISOString(),
  target: { layout: 'CLI-QA-S01-20261001', chart_id: 'XrSm3eti', cdp_target: '3D2E5C4CE6FF2209409B3094C7F0ABA2', study_id: 'vJ6QON', script_id: 'USER;d0059b19d02d4e4ebb29d64ad56728d8', repro_script_id: 'USER;c729aeacdfbd417f833d3bfecc41e49c' },
  stage_source_sha256: stages, source_checks: lines('source-checks.jsonl'), analyses, ...extra, commands }, null, 1) + '\n');
console.log('commands', commands.length, 'analyses', Object.keys(analyses));

// S02 source identity checks: hashes (CRLF-normalized, no trimming) of the local Pine
// fixtures, the editor contents, and the console-extracted copy of the saved document.
// Usage: node qa/pine/scenarios/s02-session-dashboard/verify-source.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = 'results/pine-scenarios/s02-session-dashboard';
const sha = s => createHash('sha256').update(String(s ?? '').replace(/\r\n/g, '\n')).digest('hex');
const readRaw = label => JSON.parse(readFileSync(OUT + '/raw/' + label + '.json', 'utf8'));
const readPayload = label => JSON.parse(readRaw(label).stdout);

const fixture = f => readFileSync('qa/pine/scenarios/s02-session-dashboard/' + f, 'utf8');
const v1 = fixture('v1-baseline.pine'), v2 = fixture('v2-array-error.pine'), v3 = fixture('v3-array-fixed.pine');
const editor = readPayload('102-get-editor-source').source;

// The Pine console prints its own compiled source; take the v3 body out of that record.
const consoleEntries = readPayload('93-console-repro').entries.map(e => e.message || '');
const firstLine = consoleEntries.findIndex(m => /^\/\/@version=6/.test(m));
const storedFromConsole = firstLine >= 0 ? consoleEntries.slice(firstLine).join('\n').trim() : null;

// The editor drops the trailing newline-like blank line vs the file on disk (pine set reports 141 lines).
const localV3 = v3.replace(/\n$/, '');
const editorTrim = editor.replace(/\n$/, '');
const consoleTrim = storedFromConsole == null ? null : storedFromConsole.replace(/\n$/, '');

const result = {
  fixtures: {
    'v1-baseline.pine': { bytes: v1.length, sha256_normalized: sha(v1) },
    'v2-array-error.pine': { bytes: v2.length, sha256_normalized: sha(v2) },
    'v3-array-fixed.pine': { bytes: v3.length, sha256_normalized: sha(v3) },
  },
  editor: { bytes: editor.length, sha256_normalized: sha(editor) },
  save_pipeline: [
    { step: 'pine set v2', label: '89-repro-set-v2', exit: readRaw('89-repro-set-v2').exit_code, lines_set: readPayload('89-repro-set-v2').lines_set, stdin_sha256: readRaw('89-repro-set-v2').stdin_sha256, fixture_sha256: sha(v2) },
    { step: 'pine save v2', label: '90-repro-save-v2', exit: readRaw('90-repro-save-v2').exit_code, script_id: readPayload('90-repro-save-v2').script_id, version: readPayload('90-repro-save-v2').version },
    { step: 'pine set v3 (recovery)', label: '94-restore-set-v3', exit: readRaw('94-restore-set-v3').exit_code, lines_set: readPayload('94-restore-set-v3').lines_set, stdin_sha256: readRaw('94-restore-set-v3').stdin_sha256, fixture_sha256: sha(v3) },
    { step: 'pine save v3 (recovery)', label: '95-restore-save-v3', exit: readRaw('95-restore-save-v3').exit_code, script_id: readPayload('95-restore-save-v3').script_id, version: readPayload('95-restore-save-v3').version },
  ],
  editor_matches_fixture_v3: editorTrim === localV3,
  reopened_matches_fixture_v3: readPayload('105-get-reopened').source.replace(/\n$/, '') === localV3,
  reopened_bytes: readPayload('105-get-reopened').source.length,
  reopened_sha256_normalized: sha(readPayload('105-get-reopened').source),
  reopened_reported_lines: readPayload('104-open-saved').lines,
  console_saved_source_present: storedFromConsole != null,
  console_saved_source_equals_v3: consoleTrim != null && consoleTrim === localV3,
  console_extract_lines: storedFromConsole == null ? null : storedFromConsole.split('\n').length,
  console_saved_sha256_normalized: storedFromConsole == null ? null : sha(storedFromConsole),
  notes: 'Hashes are CRLF-normalized only; no trimming. The trailing newline of the file is not part of the editor value.',
};
writeFileSync(OUT + '/source-verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ editor_matches_fixture_v3: result.editor_matches_fixture_v3,
  console_saved_source_equals_v3: result.console_saved_source_equals_v3,
  console_extract_lines: result.console_extract_lines,
  hashes: { v1: sha(v1), v2_written: readRaw('89-repro-set-v2').stdin_sha256, v2_file: sha(v2), v3: sha(v3),
    v3_written: readRaw('94-restore-set-v3').stdin_sha256, editor: sha(editor), console: result.console_saved_sha256_normalized } }, null, 1));


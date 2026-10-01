// Produce a small, reviewed evidence set from this Lead run; never include
// status, account script listings, or raw compiled strategy payloads.
import { readFileSync, writeFileSync } from 'node:fs';
const labels = [
  'analyze-clean', 'analyze-comment', 'check-clean', 'check-comment', 'check-invalid',
  'set-indicator', 'get-indicator', 'compile-indicator', 'compile-invalid',
  'errors-invalid-immediate', 'errors-invalid-later', 'check-warning',
  'errors-warning', 'compile-warning-settled', 'new-strategy', 'get-new-strategy',
  'new-library', 'get-new-library', 'new-invalid-type', 'get-invalid-type',
  'compile-corrected', 'save-initial', 'open-before-save', 'open-saved', 'get-opened',
  'new-after-saved', 'save-after-new', 'original-after-new-get',
  'open-a-from-b', 'save-after-open-a', 'reopen-b', 'b-after-open-a-get',
  'compile-strategy-confirmed', 'strategy-unchanged-confirmed',
  'raw-strategy-unchanged', 'raw-invalid', 'stdin-get', 'final-errors',
  'console-indicator', 'console-invalid',
];
const omit = new Set(['strategy_inputs', 'strategy_id', 'script_id', 'compilation_token']);
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omit.has(key)).map(([key, item]) => [key, clean(item)]));
  return value;
}
const evidence = labels.map(label => {
  const r = JSON.parse(readFileSync(`results/pine-qa/${label}.json`, 'utf8'));
  return { label, args: r.args, elapsed_ms: r.elapsed_ms, exit_code: r.exit_code,
    stdout: r.stdout ? clean(JSON.parse(r.stdout)) : null,
    stderr: r.stderr ? clean(JSON.parse(r.stderr)) : null };
});
writeFileSync('qa/pine/evidence.json', JSON.stringify({ base: '95a58288', date_kst: '2026-10-01', evidence }, null, 2) + '\n');
console.log(`Wrote ${evidence.length} sanitized command records`);

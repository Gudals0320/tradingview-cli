// Compare a recorded `pine get` raw result (or pine-facade source) against a stage file.
// Usage: node qa/pine/scenarios/s01-mtf-trend/verify-src.mjs RAW_LABEL STAGE_FILE
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [label, file] = process.argv.slice(2);
const norm = s => s.replace(/\r\n/g, '\n');
const sha = s => createHash('sha256').update(norm(s)).digest('hex');
const raw = JSON.parse(readFileSync('results/pine-scenarios/s01-mtf-trend/raw/' + label + '.json', 'utf8'));
const got = JSON.parse(raw.stdout).source;
const want = readFileSync(file, 'utf8');
const out = { label, file, editor_sha256: sha(got), file_sha256: sha(want), match: norm(got) === norm(want), editor_chars: got.length, file_chars: norm(want).length };
appendFileSync('results/pine-scenarios/s01-mtf-trend/source-checks.jsonl', JSON.stringify(out) + '\n');
console.log(JSON.stringify(out));

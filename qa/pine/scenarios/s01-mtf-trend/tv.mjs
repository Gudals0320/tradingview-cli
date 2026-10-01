// S01 evidence recorder. Executes the real CLI and logs raw output (ignored dir).
// Usage: node qa/pine/scenarios/s01-mtf-trend/tv.mjs LABEL [--stdin FILE] [--no-target] -- <cli args>
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const RAW = 'results/pine-scenarios/s01-mtf-trend';
mkdirSync(RAW + '/raw', { recursive: true });
const argv = process.argv.slice(2);
const label = argv.shift();
if (!label || !/^[a-z0-9_.-]+$/i.test(label)) throw new Error('safe label required');
let stdinFile = null, useTarget = true;
while (argv.length && argv[0] !== '--') {
  const a = argv.shift();
  if (a === '--stdin') stdinFile = argv.shift();
  else if (a === '--no-target') useTarget = false;
  else throw new Error('unknown harness opt ' + a);
}
argv.shift();
const targetFile = RAW + '/target.txt';
const target = useTarget && existsSync(targetFile) ? readFileSync(targetFile, 'utf8').trim() : null;
const args = [...(target ? ['--target', target] : []), ...argv];
const input = stdinFile ? readFileSync(stdinFile, 'utf8') : undefined;
const started = Date.now();
const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', input, timeout: 65000, maxBuffer: 8 * 1024 * 1024 });
const elapsed_ms = Date.now() - started;
const sha = s => createHash('sha256').update(String(s ?? '').replace(/\r\n/g, '\n')).digest('hex');
let json = null; try { json = JSON.parse(r.stdout); } catch {}
const rec = { label, at: new Date(started).toISOString(), args, stdin_sha256: input !== undefined ? sha(input) : null,
  elapsed_ms, exit_code: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr };
writeFileSync(RAW + '/raw/' + label + '.json', JSON.stringify(rec, null, 2));
appendFileSync(RAW + '/log.jsonl', JSON.stringify({ label, at: rec.at, args, exit_code: r.status, elapsed_ms, stdin_sha256: rec.stdin_sha256, success: json?.success ?? null }) + '\n');
console.log(JSON.stringify({ label, exit_code: r.status, elapsed_ms, stdout: (r.stdout || '').slice(0, 3500), stderr: (r.stderr || '').slice(0, 1500) }, null, 1));


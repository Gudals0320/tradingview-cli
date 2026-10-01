// Evidence recorder. Executes the actual CLI; keeps raw account/UI data ignored.
// Usage: node qa/pine/run-command.mjs LABEL pine get
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [label, ...args] = process.argv.slice(2);
if (!label || !args.length || !/^[a-z0-9_-]+$/i.test(label)) throw new Error('Supply a safe label and CLI arguments');
const started = Date.now();
const result = spawnSync(process.execPath, ['src/cli/index.js', ...args], {
  encoding: 'utf8', timeout: 65000, maxBuffer: 4 * 1024 * 1024,
});
const evidence = { args, elapsed_ms: Date.now() - started, exit_code: result.status,
  signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
mkdirSync('results/pine-qa', { recursive: true });
writeFileSync(resolve('results/pine-qa', `${label}.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ...evidence, stdout: evidence.stdout?.slice(0, 1800), stderr: evidence.stderr?.slice(0, 1800) }, null, 2));

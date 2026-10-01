import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.js') && name !== 'e2e.test.js')
  .sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, TRADINGVIEW_SKIP_NETWORK_TESTS: process.argv.includes('--network') ? '0' : '1' },
});
process.exitCode = result.status ?? 1;

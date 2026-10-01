import { readdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.js') && name !== 'e2e.test.js')
  .sort().map(name => `tests/${name}`);
const testTemp = mkdtempSync(join(tmpdir(), 'tradingview-unit-'));
const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, TEMP: testTemp, TMP: testTemp,
    TRADINGVIEW_SKIP_NETWORK_TESTS: process.argv.includes('--network') ? '0' : '1' },
});
process.exitCode = result.status ?? 1;

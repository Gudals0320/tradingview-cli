import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli/index.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const flag of ['--version', '-V']) {
  it(`${flag} prints the package version without initializing Desktop configuration`, () => {
    const result = spawnSync(process.execPath, [cli, flag], {
      encoding: 'utf8', env: { ...process.env, TV_CDP_PORT: 'invalid' },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${version}\n`);
    assert.equal(result.stderr, '');
  });
}

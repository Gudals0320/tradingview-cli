import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPOSITORY, isPersonalOrigin } from '../src/repository.js';
import { checkForUpdate } from '../src/core/health.js';

const SHA = 'a'.repeat(40);

function updateDeps({ origin = `https://github.com/${REPOSITORY}.git`, remote = SHA, offline = false } = {}) {
  const calls = [];
  return { calls, deps: { repoRoot: 'C:/personal-fixture', execFileSync: (command, args, opts) => {
    calls.push(args.join(' '));
    assert.equal(command, 'git');
    assert.equal(opts.cwd, 'C:/personal-fixture');
    assert.equal(opts.env.GIT_TERMINAL_PROMPT, '0');
    if (args[0] === 'rev-parse') return SHA;
    if (args[0] === 'remote') return origin;
    if (args[0] === 'ls-remote') {
      if (offline) throw new Error('private origin unavailable');
      return `${remote}\trefs/heads/main`;
    }
    throw new Error('Unexpected Git operation');
  } } };
}

describe('personal repository isolation', () => {
  it('keeps the tv binary and marks the package private', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.private, true);
    assert.deepEqual(pkg.bin, { tv: 'src/cli/index.js' });
    assert.equal(pkg.repository.url, `git+https://github.com/${REPOSITORY}.git`);
  });

  it('allows only the personal GitHub HTTPS and SSH origins', () => {
    assert.equal(isPersonalOrigin(`https://github.com/${REPOSITORY}.git`), true);
    assert.equal(isPersonalOrigin(`git@github.com:${REPOSITORY}.git`), true);
    assert.equal(isPersonalOrigin(`ssh://git@github.com/${REPOSITORY}`), true);
    assert.equal(isPersonalOrigin('https://github.com/tradesdontlie/tradingview-cli.git'), false);
    assert.equal(isPersonalOrigin('https://github.com/Gudals0320/tv-personal.git'), false);
    assert.equal(isPersonalOrigin(`https://example.com/${REPOSITORY}.git`), false);
  });

  it('checks private updates through credential-aware Git from the package directory', async () => {
    const { deps, calls } = updateDeps();
    const result = await checkForUpdate({ _deps: deps });
    assert.equal(result.update_available, false);
    assert.ok(calls.includes('ls-remote --exit-code origin refs/heads/main'));
  });

  it('detects a new personal main commit', async () => {
    const { deps } = updateDeps({ remote: 'b'.repeat(40) });
    assert.equal((await checkForUpdate({ _deps: deps })).update_available, true);
  });

  it('does not contact a former upstream origin', async () => {
    const { deps, calls } = updateDeps({ origin: 'https://github.com/tradesdontlie/tradingview-cli.git' });
    assert.equal(await checkForUpdate({ _deps: deps }), null);
    assert.ok(!calls.some(call => call.startsWith('ls-remote')));
  });

  it('treats missing private access as unavailable rather than up-to-date', async () => {
    const { deps } = updateDeps({ offline: true });
    assert.equal(await checkForUpdate({ _deps: deps }), null);
  });

  it('preserves the original license and source attribution', () => {
    const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
    const notice = readFileSync(new URL('../NOTICE.md', import.meta.url), 'utf8');
    assert.match(license, /Copyright \(c\) 2026 tradesdontlie/);
    assert.match(license, /MIT License/);
    assert.match(license, /TRADEMARK NOTICE/);
    assert.match(notice, /tradesdontlie\/tradingview-cli/);
  });
});

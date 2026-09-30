import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireSession, sessionStatus, sessionPaths } from '../src/session.js';

const moduleUrl = new URL('../src/session.js', import.meta.url).href;
function fixture() { return { directory: mkdtempSync(join(tmpdir(), 'tv-session-test-')), host: 'test', port: 1 }; }
describe('Desktop session ownership and recovery', () => {
  it('rejects a second process before it can snapshot or mutate the session', () => {
    const opts = fixture(), first = acquireSession(opts);
    try {
      const output = execFileSync(process.execPath, ['--input-type=module', '-e',
        `import {acquireSession} from ${JSON.stringify(moduleUrl)};try{acquireSession(${JSON.stringify(opts)});console.log('unexpected');}catch(error){console.log(error.code);}`], { encoding: 'utf8' });
      assert.equal(output.trim(), 'SESSION_BUSY');
    } finally { first.release({ restored: true }); }
  });
  it('keeps a failed recovery journal and refuses the next ordinary run', () => {
    const opts = fixture(), first = acquireSession(opts);
    first.checkpoint({ snapshot: { source: 'original' }, phase: 'running' }); first.release();
    assert.equal(sessionStatus(opts).recovery_required, true);
    assert.throws(() => acquireSession(opts), /Recover/);
    const recovery = acquireSession({ ...opts, recover: true });
    assert.equal(recovery.pending().snapshot.source, 'original');
    recovery.release({ restored: true });
    assert.equal(sessionStatus(opts).recovery_required, false);
  });
  it('detects killed owners and does not adopt their dirty state as a new baseline', () => {
    const opts = fixture(), paths = sessionPaths(opts);
    const first = acquireSession(opts);
    first.checkpoint({ snapshot: { source: 'before crash' } }); first.release();
    writeFileSync(paths.lock, JSON.stringify({ pid: 99999999, run_id: 'killed-owner' }));
    assert.throws(() => acquireSession(opts), /Recover/);
    const next = acquireSession({ ...opts, recover: true });
    assert.equal(next.pending().snapshot.source, 'before crash'); next.release({ restored: true });
  });
  it('does not remove a lock whose ownership cannot be verified', () => {
    const opts = fixture(), paths = sessionPaths(opts);
    const first = acquireSession(opts); first.release({ restored: true });
    writeFileSync(paths.lock, '{}');
    assert.throws(() => acquireSession(opts), /owns/);
    unlinkSync(paths.lock);
  });
});

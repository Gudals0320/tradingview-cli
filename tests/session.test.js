import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireSession, sessionStatus, sessionPaths, assertSessionAccess, withReadOnlySession, discardSession } from '../src/session.js';

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
  it('allows recovery inspection but still blocks mutation', () => {
    const opts = fixture(), first = acquireSession(opts);
    first.checkpoint({ snapshot: { source: 'private draft' } }); first.release();
    assert.throws(() => assertSessionAccess(opts), { code: 'RECOVERY_REQUIRED' });
    withReadOnlySession(() => assertSessionAccess(opts));
    assert.throws(() => assertSessionAccess(opts), { code: 'RECOVERY_REQUIRED' });
    assert.equal(JSON.stringify(sessionStatus(opts)).includes('private draft'), false);
  });
  it('leases read-only inspection during legacy recovery without discarding its journal', () => {
    const opts = fixture(), first = acquireSession(opts);
    first.checkpoint({ snapshot: { source: 'retained draft' } }); first.release();
    const readOnly = acquireSession({ ...opts, readOnly: true });
    assert.equal(readOnly.pending().snapshot.source, 'retained draft'); readOnly.release();
    assert.equal(sessionStatus(opts).recovery_required, true);
    assert.throws(() => acquireSession(opts), { code: 'RECOVERY_REQUIRED' });
  });
  it('blocks read-only access while a foreign process is active', () => {
    const opts = fixture(), first = acquireSession(opts);
    try {
      const output = execFileSync(process.execPath, ['--input-type=module', '-e',
        `import {assertSessionAccess,withReadOnlySession} from ${JSON.stringify(moduleUrl)};try{withReadOnlySession(()=>assertSessionAccess(${JSON.stringify(opts)}));console.log('unexpected');}catch(error){console.log(error.code);}`], { encoding: 'utf8' });
      assert.equal(output.trim(), 'SESSION_BUSY');
    } finally { first.release({ restored: true }); }
  });
  it('requires the exact run ID and archives an explicitly discarded journal', () => {
    const opts = fixture(), first = acquireSession(opts);
    first.checkpoint({ snapshot: { source: 'saved draft' } }); first.release();
    assert.throws(() => discardSession(opts), { code: 'RUN_ID_REQUIRED' });
    assert.throws(() => discardSession({ ...opts, runId: 'wrong' }), { code: 'RUN_ID_MISMATCH' });
    assert.equal(sessionStatus(opts).recovery_required, true);
    const discarded = discardSession({ ...opts, runId: first.run_id });
    assert.equal(discarded.restored, false);
    assert.equal(JSON.parse(readFileSync(discarded.backup_path, 'utf8')).snapshot.source, 'saved draft');
    assert.equal(sessionStatus(opts).recovery_required, false);
    assertSessionAccess(opts);
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

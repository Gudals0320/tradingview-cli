// Offline baseline reproducer: real processes and current session guards, no CDP.
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSession, assertSessionAccess, sessionPaths, sessionStatus } from '../../../src/session.js';

const self = fileURLToPath(import.meta.url);
if (process.argv[2] === '--child') {
  const options = JSON.parse(process.argv[3]);
  let result;
  try {
    assertSessionAccess(options);
    result = { admitted: true, lock_created: sessionStatus(options).locked };
  } catch (error) {
    result = { admitted: false, code: error.code };
  }
  process.on('message', message => { if (message === 'finish') process.disconnect(); });
  process.send(result);
} else {
  const directory = mkdtempSync(join(tmpdir(), 'tv-issue14-offline-'));
  const options = { host: 'issue14-offline.invalid', port: 1, directory };
  const children = [];
  const start = () => {
    const child = fork(self, ['--child', JSON.stringify(options)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Child admission timed out')), 5000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('message', result => { clearTimeout(timeout); resolve(result); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Child exited before admission: ${code}`)); });
    });
  };
  const finish = async () => {
    await Promise.all(children.splice(0).map(child => new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      if (child.connected) child.send('finish');
      else child.kill();
    })));
  };
  let lease;
  try {
    const ordinary = await Promise.all([start(), start()]);
    assert.ok(ordinary.every(result => result.admitted && !result.lock_created));
    const simultaneousAdmissions = children.filter(child => child.exitCode === null).length;
    assert.equal(simultaneousAdmissions, 2);
    await finish();
    lease = acquireSession(options);
    const duringBatch = await start();
    assert.deepEqual(duringBatch, { admitted: false, code: 'SESSION_BUSY' });
    await finish();
    lease.release({ restored: true }); lease = null;
    const sameKey = sessionPaths({ ...options, targetId: 'target-A' }).key
      === sessionPaths({ ...options, targetId: 'target-B' }).key;
    assert.equal(sameKey, true);
    console.log(JSON.stringify({
      baseline_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version, platform: process.platform, live_desktop_touched: false,
      ordinary_processes: ordinary, simultaneous_admitted_processes: simultaneousAdmissions,
      foreign_process_during_endpoint_lease: duringBatch, different_target_options_share_lock_key: sameKey,
      conclusion: 'Ordinary access checks do not reserve ownership; batch ownership is endpoint-wide.',
      limits: 'Reproduces admission semantics only, not live chart corruption or throughput. targetId is not currently an accepted session-scoping option.',
    }, null, 2));
  } finally {
    for (const child of children) child.kill();
    lease?.release({ restored: true });
    rmdirSync(directory);
  }
}

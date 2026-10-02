import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deadline, boundClient } from '../src/cdp.js';
import { acquireSession, sessionPaths, sessionStatus, reclaimDeadSession, clearAdmissionGate } from '../src/session.js';
import { reserveWorkspace, acquireWorkspace, workspaceStatus, workspaceArtifactDirectory } from '../src/workspace-store.js';
import { recoverSession } from '../src/session-recovery.js';
import { observePineCompilation, dispatchPineCompilation, abortPineObservation } from '../src/core/pine-state.js';
import { setInputs } from '../src/core/indicators.js';
import { runInNewContext } from 'node:vm';
import { trackNativeOperation } from '../src/connection.js';

function options() { return { host: 'lifetime-test', port: 1, directory: mkdtempSync(join(tmpdir(), 'tv-lifetime-')) }; }

it('CDP deadlines explicitly fail while the underlying action can still complete', async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  await assert.rejects(deadline(() => pending, { timeout: 10 }), { code: 'CDP_TIMEOUT', recovery_required: true });
  complete('late');
  assert.equal(await pending, 'late');
  const client = boundClient({ Runtime: { evaluate: async () => ({ value: 1 }) }, Input: { insertText: async () => true } });
  assert.deepEqual(await client.Runtime.evaluate(), { value: 1 });
  assert.equal(await client.Input.insertText(), true);
});
it('generic native operations retain busy across await and retire only their own token', async () => {
  const window = {}; let finish;
  const action = trackNativeOperation(window, 'old', () => new Promise(resolve => { finish = resolve; }));
  assert.equal(window.__tvCliNativeOperations.old.pending, true);
  await assert.rejects(trackNativeOperation(window, 'new', async () => 2), /NATIVE_BUSY/);
  finish(1); assert.equal(await action, 1);
  assert.deepEqual(window.__tvCliNativeOperations, {});
  assert.equal(await trackNativeOperation(window, 'new', async () => 2), 2);
  assert.deepEqual(window.__tvCliNativeOperations, {});
});

it('workspace admission reclaims only dead leases under the gate and preserves journals', () => {
  const opts = options(), paths = sessionPaths(opts);
  acquireSession(opts).release();
  writeFileSync(paths.lock, JSON.stringify({ pid: 99999999, port: 1 }));
  assert.throws(() => reclaimDeadSession(opts), { code: 'ADMISSION_REQUIRED' });
  const resources = { file: join(opts.directory, 'qa.json'), target: 'qa', layout: 'qa', pine: 'qa' };
  reserveWorkspace(resources, opts);
  assert.equal(sessionStatus(opts).locked, false);
  const second = options(), p2 = sessionPaths(second);
  const lease = acquireSession(second); lease.checkpoint({ source: 'retain' }); lease.release();
  writeFileSync(p2.lock, JSON.stringify({ pid: 99999999, port: 1 }));
  assert.ok(reserveWorkspace({ ...resources, file: join(second.directory, 'qa.json') }, second));
  assert.equal(JSON.parse(readFileSync(p2.journal)).source, 'retain');
  assert.equal(sessionStatus(second).locked, false);
});

it('operation setup failure rolls back only its operation and dead repair is explicitly recoverable', () => {
  const opts = options(), resource = reserveWorkspace({ file: join(opts.directory, 'qa.json'), target: 'qa', layout: 'qa', pine: 'qa' }, opts);
  writeFileSync(workspaceArtifactDirectory(resource, opts), 'block directory');
  assert.throws(() => acquireWorkspace(resource.file, opts), { code: 'EEXIST' });
  assert.equal(workspaceStatus(resource.file, opts).operation, null);
  writeFileSync(`${sessionPaths(opts).gate}.repair`, JSON.stringify({ token: 'dead-repair', pid: 99999999 }));
  assert.throws(() => clearAdmissionGate(null, { ...opts, repairToken: 'wrong' }), { code: 'GATE_TOKEN_MISMATCH' });
  assert.equal(clearAdmissionGate(null, { ...opts, repairToken: 'dead-repair' }).repair_cleared, true);
});

it('native recovery keeps fencing while pending and succeeds after quiescence without reload', async () => {
  const opts = options();
  const first = acquireSession(opts); first.checkpoint({ native_quiescence_required: true, target_id: 'qa' }); first.release();
  let ready = false;
  const _deps = { acquireSession: () => acquireSession({ ...opts, recover: true }), connect: async () => ({
    Runtime: { evaluate: async () => ({ result: { value: { ready } } }) }, close: async () => {},
  }) };
  await assert.rejects(recoverSession({ runId: first.run_id, _deps }), { code: 'NATIVE_BUSY' });
  assert.equal(sessionStatus(opts).recovery_required, true);
  ready = true;
  assert.equal((await recoverSession({ runId: first.run_id, _deps })).recovered, true);
  assert.equal(sessionStatus(opts).recovery_required, false);
});

it('pre-dispatch failure releases compile busy; pending dispatch cannot be replaced', () => {
  const store = { getState: () => ({ ui: { pendingRequests: {} } }), subscribe: () => () => {} };
  const controller = { _editorStore: { getStore: () => store } };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => ({ _chartWidget: { model: () => ({ model: () => ({ dataSources: () => [] }) }) } }) } } };
  observePineCompilation(window, controller, 'first');
  assert.throws(() => dispatchPineCompilation(window, controller, 'first'), /unavailable/);
  assert.equal(window.__tvCliPineCompile.actionDone, true);
  observePineCompilation(window, controller, 'second');
  assert.throws(() => observePineCompilation(window, controller, 'third'), /PINE_NATIVE_BUSY/);
  assert.equal(window.__tvCliPineCompile.token, 'second');
  assert.equal(abortPineObservation(window, 'second', 'pre-dispatch failure'), true);
  assert.throws(() => dispatchPineCompilation(window, controller, 'second'), /PINE_DISPATCH_CANCELLED/);
  assert.equal(window.__tvCliPineCompile.actionDone, true);
});

it('input baseline snapshots old shared native values before applying a cloned override array', async () => {
  let inputs = [{ id: 'in_0', value: 10 }], baseline;
  const series = { bars: () => ({ firstIndex: () => 0, lastIndex: () => 0, valueAt: () => [1] }) };
  const source = { id: () => 'qa', metaInfo: () => ({ is_strategy: true }), reportData: () => null };
  const study = { getInputValues: () => inputs, setInputValues: next => {
    baseline = window.__tvCliCompilation.inputs_fingerprint;
    assert.equal(inputs[0].value, 10);
    inputs = next;
  } };
  const chart = { symbol: () => 'QA', resolution: () => '1D', chartType: () => 1, getStudyById: () => study,
    _chartWidget: { model: () => ({ mainSeries: () => series, model: () => ({ dataSources: () => [source] }) }) } };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart } } };
  const _deps = { evaluate: expression => runInNewContext(expression, { window }) };
  await setInputs({ entity_id: 'qa', inputs: { in_0: 20 }, timeout: 0, _deps });
  assert.equal(JSON.parse(baseline)[0].value, 10);
  assert.equal(inputs[0].value, 20);
});

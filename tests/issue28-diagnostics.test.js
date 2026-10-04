import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { withAdmissionGate, sessionPaths, sessionStatus, acquireSession } from '../src/session.js';
import { sessionPageQuiescence, recoverSession } from '../src/session-recovery.js';
import { findPineController } from '../src/core/desktop-dom.js';
import { readChartContext } from '../src/chart-context.js';
import { LAYOUT_PAGE_CODE } from '../src/layout-state.js';
import { raw } from '../src/core/watchlist.js';
function options() { return { directory: mkdtempSync(join(tmpdir(), 'tv-i28-')), host: 'fixture', port: 1 }; }
it('gate denial preserves errno/absence and competition exposes only safe owner details', () => {
  const opts = options();
  for (const code of ['EACCES', 'EPERM']) {
    assert.throws(() => withAdmissionGate({ ...opts, _deps: { openSync() { throw Object.assign(new Error('denied'), { code, syscall: 'open' }); } } }, () => {}), e => e.code === 'ADMISSION_PERMISSION' && e.details.errno === code && e.details.gate_exists === false && e.details.gate_owner === null);
  }
  writeFileSync(sessionPaths(opts).gate, JSON.stringify({ pid: process.pid, token: 'PRIVATE_TOKEN', process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString() }));
  assert.throws(() => withAdmissionGate({ ...opts, gateTimeout: 1 }, () => {}), e => {
    assert.equal(e.code, 'ADMISSION_BUSY'); assert.equal(e.details.errno, 'EEXIST'); assert.equal(e.details.gate_exists, true);
    assert.equal(e.details.gate_owner.pid, process.pid); assert.ok(!JSON.stringify(e.details).includes('PRIVATE_TOKEN')); return true;
  });
});
it('native and batch status normalize recovery targets/panes/command/phase without private fields', () => {
  const opts = options(), path = sessionPaths(opts).journal;
  for (const journal of [{ run_id: 'native', target_id: 'A', targets: ['A', 'B'], target_panes: { A: [0], B: '*' }, command: 'pine compile', phase: 'pending' },
    { snapshot: { run_id: 'batch', target_id: 'C', chart_id: 'layout' }, targets: ['C'], command: 'pine-batch', phase: 'restore' }]) {
    writeFileSync(path, JSON.stringify({ ...journal, source: 'PRIVATE_SOURCE', token: 'PRIVATE_TOKEN' }));
    const state = sessionStatus(opts);
    assert.equal(state.recovery_target.target_id, journal.target_id || journal.snapshot.target_id);
    assert.deepEqual(state.recovery_targets, journal.targets);
    assert.equal(state.recovery_command, journal.command); assert.equal(state.recovery_phase, journal.phase);
    assert.ok(!JSON.stringify(state).includes('PRIVATE_SOURCE')); assert.ok(!JSON.stringify(state).includes('PRIVATE_TOKEN'));
  }
});
it('Pine indicator and strategy status plus auxiliary loading have idle/busy/unknown boundaries', () => {
  const series = { isLoading: () => false, bars: () => ({ firstIndex: () => 0, lastIndex: () => 0, valueAt: () => [1] }) };
  let source;
  const model = { mainSeries: () => series, model: () => ({ dataSources: () => [source] }) };
  const chart = { _chartWidget: { model: () => model }, symbol: () => 'X:A', resolution: () => '60', chartType: () => 1 };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart }, _chartWidgetCollection: { getAll: () => [chart], metaInfo: { uid: 'layout' } } } };
  const document = { querySelectorAll: () => [] };
  const sample = () => runInNewContext(`(() => {${LAYOUT_PAGE_CODE};${findPineController.toString()};${readChartContext.toString()};return (${sessionPageQuiescence.toString()})(window,document);})()`, { window, document });
  for (const strategy of [false, true]) for (const [type, expected] of [[0, 'busy'], [1, 'busy'], [2, 'idle'], [99, 'unknown'], [undefined, 'unknown']]) {
    source = { id: () => 'pine', metaInfo: () => ({ isTVScript: true, isTVScriptStrategy: strategy }), status: () => ({ type }), isLoading: () => false };
    const state = sample(); assert.equal(state.source_states[0].state, expected); assert.equal(state.ready, expected === 'idle');
  }
  source = { id: () => 'ESD$FIXTURE', metaInfo: () => ({}), status: () => ({ type: 1 }), isLoading: () => false };
  assert.equal(sample().ready, false); assert.equal(sample().source_states[0].state, 'unknown');
  source.isLoading = () => true; assert.equal(sample().ready, false);
  delete source.isLoading; assert.equal(sample().source_states[0].state, 'unknown');
  source.status = () => ({ type: 2 }); assert.equal(sample().ready, true);
});
it('raw watchlist preserves every native item and separates virtualized rows without selecting a list', async () => {
  const symbols = ['###SECTION', 'EXCHANGE:A', '2*EXCHANGE:A/EXCHANGE:B', 'EXCHANGE:A', 'EXCHANGE:C'];
  const row = { __reactFiber$test: { memoizedProps: { current: { id: 7, name: 'Research' } } } };
  const panel = { querySelectorAll: () => [row, row] }, document = { querySelector: () => panel };
  let lists = [{ id: 7, name: 'Research', symbols }, { id: 8, name: 'Other', symbols: ['###EMPTY'] }];
  const _deps = { evaluateAsync: expression => runInNewContext(expression, { document, fetch: async () => ({ ok: true, json: async () => lists }) }) };
  const result = await raw({ id: '7', _deps });
  assert.deepEqual(Array.from(result.symbols), symbols); assert.equal(result.raw_count, 5); assert.equal(result.rendered_count, 2);
  assert.equal((await raw({ name: 'Other', _deps })).rendered_count, null);
  assert.equal((await raw({ id: '9', _deps })).code, 'WATCHLIST_NOT_FOUND');
  lists = [...lists, { id: 9, name: 'Research', symbols: [] }];
  assert.equal((await raw({ name: 'Research', _deps })).code, 'WATCHLIST_AMBIGUOUS');
  lists = {}; assert.equal((await raw({ id: '7', _deps })).code, 'WATCHLIST_MALFORMED');
});

it('exact stable auxiliary-only unknown acknowledgement archives raw journal and never declares completion', async () => {
  const opts = options(), first = acquireSession(opts);
  first.checkpoint({ native_quiescence_required: true, target_id: 'A', source: 'PRIVATE_DRAFT' }); first.release();
  const original = readFileSync(first.paths.journal, 'utf8');
  const state = { ready: false, layout_id: 'layout', generation: 'G', blockers: { compile: false, save: false, registry_tokens: [], layout_switch_unverified: false, pending_requests: [], calculating: [],
    unknown_sources: [{ pane_index: 0, id: 'aux' }], context_loading: false, pane_loading: [], unreadable_panes: [] },
    source_states: [{ pane_index: 0, id: 'aux', kind: 'auxiliary', state: 'unknown', status_type: 1, loading: false, basis: 'unverified' }] };
  const deps = { acquireSession: () => acquireSession({ ...opts, recover: true, shared: true }), sleep: async () => {},
    connect: async () => ({ Runtime: { evaluate: async () => ({ result: { value: state } }) }, close: async () => {} }) };
  let hash;
  await assert.rejects(recoverSession({ runId: first.run_id, _deps: deps }), e => { hash = e.details.unknown_hash; return e.code === 'NATIVE_BUSY' && e.details.target_state === 'unknown'; });
  assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(sessionStatus(opts).recovery_blocker_class, 'unknown');
  assert.equal(sessionStatus(opts).recovery_unknown_hash, hash); assert.equal(sessionStatus(opts).recovery_confirmation_required, true);
  await assert.rejects(recoverSession({ runId: first.run_id, acknowledgeUnknown: '0'.repeat(64), _deps: deps }), { code: 'UNKNOWN_ACK_MISMATCH' });
  state.blockers.registry_tokens = ['native-pending'];
  await assert.rejects(recoverSession({ runId: first.run_id, acknowledgeUnknown: hash, _deps: deps }), { code: 'NATIVE_BUSY' });
  state.blockers.registry_tokens = [];
  deps.sleep = async () => { state.blockers.pane_loading = [0]; };
  await assert.rejects(recoverSession({ runId: first.run_id, acknowledgeUnknown: hash, _deps: deps }), { code: 'UNKNOWN_ACK_MISMATCH' });
  assert.equal(readFileSync(first.paths.journal, 'utf8'), original);
  state.blockers.pane_loading = []; deps.sleep = async () => {};
  const result = await recoverSession({ runId: first.run_id, acknowledgeUnknown: hash, _deps: deps });
  assert.equal(result.recovered, false); assert.equal(result.outcome, 'unknown'); assert.equal(result.journal_archived, true);
  assert.equal(readFileSync(result.backup_path, 'utf8'), original); assert.equal(sessionStatus(opts).recovery_required, false);
});

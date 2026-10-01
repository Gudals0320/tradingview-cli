import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { WORKSPACE_PAGE_CODE } from '../src/workspace-page.js';
function fixture() {
  const resource = { id: 'work', token: 'secret', layout: 'layout', pine: 'pine' };
  let source = 'strategy("fixture")';
  const editor = { getValue: () => source, setValue: value => { source = value; }, getModel: () => ({}) };
  const controller = { openNewScript() {}, openScript() {}, setScript() {}, getScriptIdVersion: () => ({ scriptIdPart: resource.pine, version: 1 }),
    _editorStore: { getStore: () => ({ getState: () => ({ ui: { pendingRequests: {} } }) }) },
    monacoEnv: { editor: {} }, _editorRef: { current: { _editor: editor, _monaco: { editor: {} } } } };
  const container = { offsetParent: {}, __reactFiber$fixture: { memoizedProps: { value: controller } } };
  const document = { querySelectorAll: () => [container] };
  const inputs = [{ id: 'pineId', value: 'pine' }, { id: 'text', value: 'compiled' }, { id: 'in_0', value: 20 }];
  const study = { id: () => 'study', metaInfo: () => ({ isTVScript: true, isTVScriptStrategy: true }), status: () => ({ type: 2 }) };
  const series = { bars: () => ({ firstIndex: () => 0, lastIndex: () => 1, valueAt: () => [123] }) };
  const chart = { _chartWidget: { model: () => ({ mainSeries: () => series, model: () => ({ dataSources: () => [study] }) }) },
    getStudyById: () => ({ getInputValues: () => inputs }), symbol: () => 'BTCUSD', symbolExt: () => ({ full_name: 'BITSTAMP:BTCUSD' }), resolution: () => '60', chartType: () => 1 };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart }, _chartWidgetCollection: { metaInfo: { uid: { value: () => 'layout' } } } }, innerWidth: 1280, innerHeight: 800 };
  const context = vm.createContext({ window, document }); vm.runInContext(WORKSPACE_PAGE_CODE, context);
  const call = (fn, ...args) => context[fn](window, document, ...args);
  call('bindWorkspacePage', resource, 'nonce');
  return { resource, window, chart, inputs, editor, controller, call, owner: { ...resource, nonce: 'nonce' } };
}
describe('atomic workspace page guards', () => {
  it('detects source, layout and nonce changes before any action', () => {
    for (const change of [f => f.editor.setValue('external'), f => { f.window.__tvCliWorkspace.nonce = 'other'; },
      f => { f.window.TradingViewApi._chartWidgetCollection.metaInfo.uid.value = () => 'other'; }]) {
      const f = fixture(); change(f);
      assert.throws(() => f.call('guardWorkspacePage', f.owner), /WORKSPACE_(EXTERNAL_CHANGE|GENERATION_CHANGED)/);
    }
  });
  it('allows only a requested source change and consumes its permission', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', { source: 'requested' });
    f.editor.setValue('requested'); f.call('guardWorkspacePage', f.owner);
    f.editor.setValue('external'); assert.throws(() => f.call('guardWorkspacePage', f.owner), /EXTERNAL_CHANGE/);
  });
  it('rejects a changed study input unless the exact override was requested', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', { inputs: { in_0: 21 } });
    f.inputs[2].value = 21; f.call('guardWorkspacePage', f.owner);
    f.inputs[2].value = 22; assert.throws(() => f.call('guardWorkspacePage', f.owner), /EXTERNAL_CHANGE/);
  });
  it('accepts normalized symbols and timeframe aliases only for requested context', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', { symbol: 'BITSTAMP:BTCUSD', resolution: '1D' });
    f.chart.symbol = () => 'BITSTAMP:BTCUSD'; f.chart.resolution = () => 'D';
    f.call('guardWorkspacePage', f.owner);
    f.chart.resolution = () => 'W'; assert.throws(() => f.call('guardWorkspacePage', f.owner), /EXTERNAL_CHANGE/);
  });
  it('keeps pending native actions from release/recovery completion', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', {});
    f.window.__tvCliSave = { pending: true };
    assert.throws(() => f.call('finishWorkspacePage', f.owner, 'op'), /NATIVE_BUSY/);
    assert.equal(f.window.__tvCliWorkspace.operation, 'op');
    assert.throws(() => f.call('bindWorkspacePage', f.resource, 'new'), /NATIVE_BUSY/);
    assert.equal(f.window.__tvCliWorkspace.nonce, 'nonce');
  });
  it('rejects a controller replacement even on the same target and document ID', () => {
    const f = fixture(); f.window.__tvCliWorkspace.controller = {};
    assert.throws(() => f.call('guardWorkspacePage', f.owner), /GENERATION_CHANGED/);
  });
});

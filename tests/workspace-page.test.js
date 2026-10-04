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
  it('quote permission derives restore identity from the guarded execution baseline', () => {
    const f = fixture();
    f.chart.symbolExt = () => ({ full_name: f.chart.symbol() });
    f.call('startWorkspacePage', f.owner, 'symbol', { symbol: 'BINANCE:SOLUSDT' });
    f.chart.symbol = () => 'BINANCE:SOLUSDT';
    f.call('finishWorkspacePage', f.owner, 'symbol');
    f.call('startWorkspacePage', f.owner, 'quote', { quote_symbol: 'BITSTAMP:BTCUSD' });
    assert.deepEqual(Array.from(f.window.__tvCliWorkspace.permit.symbols), ['BITSTAMP:BTCUSD', 'BINANCE:SOLUSDT']);
    f.chart.symbol = () => 'BITSTAMP:BTCUSD'; f.call('guardWorkspacePage', f.owner);
    f.chart.symbol = () => 'BINANCE:SOLUSDT'; f.call('finishWorkspacePage', f.owner, 'quote');
    f.call('startWorkspacePage', f.owner, 'external', { quote_symbol: 'BITSTAMP:BTCUSD' });
    f.chart.symbol = () => 'BINANCE:ETHUSDT';
    assert.throws(() => f.call('guardWorkspacePage', f.owner), /EXTERNAL_CHANGE/);
  });
  it('a draft identity cannot masquerade as a saved Pine resource',()=>{
    const f=fixture();f.controller.isDraft=()=>true;
    assert.throws(()=>f.call('bindWorkspacePage',f.resource,'new'),/WORKSPACE_SAVED_DOCUMENT_REQUIRED/);
    assert.equal(f.window.__tvCliWorkspace.nonce,'nonce');
  });
  it('binds a chart-only workspace without querying any Pine editor and permits symbol changes', () => {
    const f=fixture();
    const resource={...f.resource,pine:null};
    f.window.__tvCliWorkspace=null;
    // Editor/controller reads would throw: chart-only operations must not touch a GUI draft.
    f.controller.getScriptIdVersion=()=>{throw new Error('foreign editor touched');};
    const binding=f.call('bindWorkspacePage',resource,'chart-only');
    assert.equal(binding.snapshot.pine,null);assert.equal(binding.snapshot.source,'');
    const owner={...resource,nonce:'chart-only'};
    f.call('startWorkspacePage',owner,'chart-op',{symbol:'ETHUSD'});f.chart.symbol=()=> 'ETHUSD';
    assert.equal(f.call('finishWorkspacePage',owner,'chart-op').snapshot.context.symbol,'ETHUSD');
  });
  it('observation preserves an active operation baseline and pending permits byte for byte', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', { source: 'requested', inputs: { in_0: 21 } });
    f.editor.setValue('requested'); f.inputs[2].value = 21;
    const before = JSON.stringify({ baseline: f.window.__tvCliWorkspace.baseline, permit: f.window.__tvCliWorkspace.permit });
    assert.equal(f.call('guardWorkspacePage', f.owner, { observe: true }).source, 'requested');
    assert.equal(f.call('guardWorkspacePage', f.owner, { observe: true }).studies[0].inputs[2].value, 21);
    assert.equal(JSON.stringify({ baseline: f.window.__tvCliWorkspace.baseline, permit: f.window.__tvCliWorkspace.permit }), before);
    const finished = f.call('finishWorkspacePage', f.owner, 'op');
    assert.equal(finished.snapshot.source, 'requested'); assert.equal(f.window.__tvCliWorkspace.operation, null);
  });
  it('permits transient compile absence but rejects an absent owned study at final completion', () => {
    const f = fixture(); f.call('startWorkspacePage', f.owner, 'op', { compile: true });
    f.chart._chartWidget.model = () => ({ mainSeries: () => ({ bars: () => ({ firstIndex: () => 0, lastIndex: () => 0, valueAt: () => [1] }) }), model: () => ({ dataSources: () => [] }) });
    assert.equal(f.call('guardWorkspacePage', f.owner).studies.length, 0);
    assert.throws(() => f.call('finishWorkspacePage', f.owner, 'op'), /WORKSPACE_STUDY_MISSING/);
    assert.equal(f.window.__tvCliWorkspace.operation, 'op');
    const failure=f.call('finishWorkspacePage',f.owner,'op',{allowIncomplete:true});
    assert.equal(failure.snapshot.studies.length,0,'A known completed compile failure may retain an empty chart without fabricating a recovery fence.');
  });
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
  it('permits native save retranslation but rejects unrelated input changes', () => {
    const f = fixture();f.call('startWorkspacePage', f.owner, 'op', { save: true });
    f.inputs[1].value = 'new compiled identity';f.call('guardWorkspacePage', f.owner);
    f.inputs[2].value = 99;assert.throws(() => f.call('guardWorkspacePage', f.owner), /EXTERNAL_CHANGE/);
  });
  it('restores only the recorded document and refuses a modified foreign draft', async () => {
    for (const modified of [false,true]) {
      const f=fixture();let documentId='foreign',opened=0;
      f.controller.getScriptIdVersion=()=>({scriptIdPart:documentId,version:1});f.controller.isModified=()=>modified;
      f.controller.openScript=async request=>{assert.equal(request.scriptIdPart,'pine');assert.equal(request.version,1);documentId=request.scriptIdPart;opened++;};
      const resource={...f.resource,binding:{snapshot:{version:1}}};
      if(modified){await assert.rejects(()=>f.call('restoreWorkspaceDocument',resource),/FOREIGN_DRAFT/);assert.equal(opened,0);}
      else{assert.equal((await f.call('restoreWorkspaceDocument',resource)).restored_document,true);assert.equal(opened,1);}
    }
  });
  it('explicit document restore recovers the exact private unsaved source without saving or overwriting foreign edits', async () => {
    for (const modified of [false, true]) {
      const f = fixture(); f.controller.isModified = () => modified;
      let writes = 0;
      f.controller.setScript = async source => { writes++; f.editor.setValue(source); };
      const resource = { ...f.resource, binding: { snapshot: { version: 1, modified: true, source: 'private recorded draft' } } };
      if (modified) { await assert.rejects(f.call('restoreWorkspaceDocument', resource), /FOREIGN_DRAFT/); assert.equal(writes, 0); }
      else { assert.equal((await f.call('restoreWorkspaceDocument', resource)).restored_draft, true); assert.equal(f.editor.getValue(), 'private recorded draft'); assert.equal(writes, 1); }
    }
  });
});

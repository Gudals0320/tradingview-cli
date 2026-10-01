import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers';
import { smartCompile } from '../src/core/pine.js';
import { observePineCompilation, dispatchPineCompilation, pineCompilationStatus, pineCompileContext } from '../src/core/pine-state.js';

function fixture({ error = false, pending = false } = {}) {
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => ({
    _chartWidget: {model: () => ({model: () => ({dataSources: () => []})})},
  }) } } }; let state = { ui: { pendingRequests: {} }, console: { messages: [] } };
  const listeners = new Set();
  const emit = changes => { state = { ...state, ...changes }; listeners.forEach(fn => fn()); };
  const store = { getState: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const controller = { _editorStore: { getStore: () => store },
    getScriptIdVersion: () => null,
    addToChart: async () => {
      emit({ ui: { pendingRequests: { compile: true } } });
      if (pending) await new Promise(() => {});
      if (error) emit({ console: { messages: [{ level: 'error', text: 'late compile error', start: { line: 3, column: 6 } }] } });
      emit({ ui: { pendingRequests: {} } });
    },
  };
  const document = { querySelectorAll: () => [] };
  return { window, controller, document, emit, listeners };
}
it('captures a fast complete request and errors before Monaco publishes markers', async () => {
  const f = fixture({ error: true });
  observePineCompilation(f.window, f.controller, 'token');
  dispatchPineCompilation(f.window, f.controller, 'token', f.document);
  await new Promise(resolve => setImmediate(resolve));
  const result = pineCompilationStatus(f.window, 'token', true);
  assert.equal(result.completed, true);
  assert.equal(result.diagnostics[0].message, 'late compile error');
  assert.equal(f.listeners.size, 0);
});
it('does not claim a fresh completion when the native action did no work', async () => {
  const f = fixture(); f.controller.addToChart = async () => {};
  observePineCompilation(f.window, f.controller, 'token');
  dispatchPineCompilation(f.window, f.controller, 'token', f.document);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pineCompilationStatus(f.window, 'token').completed, false);
});
function dependencies({ delayedError = false, neverComplete = false, saveRequired = false, modifiedAfter = false } = {}) {
  const f = fixture(); let ticks = 0;
  f.controller.getScriptIdVersion = () => ({ scriptIdPart: 'saved A', version: '2.0' });
  f.controller.isModified = () => modifiedAfter;
  const context = { window: f.window, document: f.document };
  return { source: '//@version=6\nindicator("QA")\nplot(close)',
    evaluate: expression => {
      if (expression.includes('function pineCompileContext')) return {save_required:saveRequired};
      if (expression.includes('return beginCompilation(')) return { phase: 'pending' };
      if (expression.includes('return (function observePineCompilation')) return observePineCompilation(f.window, f.controller, 'token');
      if (expression.includes('return (function dispatchPineCompilation')) {
        f.window.__tvCliPineCompile.controller = f.controller;
        return 'addToChart';
      }
      if (expression.includes('function pineCompilationStatus')) {
        // Execute the real status helper, with the generated token mirrored.
        const token = expression.match(/\)\(window, "([^"]+)"/)?.[1];
        f.window.__tvCliPineCompile.token = token;
        return runInNewContext(expression, context);
      }
      if (expression.includes('getModelMarkers')) return [];
      throw new Error('Unexpected evaluation');
    },
    sleep: async () => {
      ticks++;
      if (ticks === 1) f.emit({ ui: { pendingRequests: { compiling: true } } });
      if (ticks === 4 && !neverComplete) {
        if (delayedError) f.emit({ console: { messages: [{ level: 'error', text: 'delayed error' }] } });
        f.window.__tvCliPineCompile.actionDone = true;
        f.emit({ ui: { pendingRequests: {} } });
      }
    }, now: () => ticks * 200,
  };
}
it('smartCompile waits past the first empty marker poll for an actual indicator error', async () => {
  const result = await smartCompile({ _deps: dependencies({ delayedError: true }) });
  assert.equal(result.compiled, false); assert.equal(result.has_errors, true);
  assert.equal(result.errors[0].message, 'delayed error');
});
it('indicator unchanged requires matching applied script ID/version and clean editor', () => {
  const source = { id: () => 'study', metaInfo: () => ({ isTVScript: true }), status: () => ({ type: 2 }) };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => ({
    _chartWidget: { model: () => ({ model: () => ({ dataSources: () => [source] }) }) },
    getStudyById: () => ({ getInputValues: () => [{ id: 'pineId', value: 'A' }, { id: 'pineVersion', value: '1.0' }] }),
  }) } } };
  const controller = { getScriptIdVersion: () => ({ scriptIdPart: 'A', version: '1.0' }),
    isModified: () => false, isDraft: () => false };
  assert.equal(pineCompileContext(window, controller).unchanged, true);
  source.status = () => ({ type: 1 });
  assert.equal(pineCompileContext(window, controller).pending, true);
  source.status = () => ({ type: 2 });
  controller.getScriptIdVersion = () => ({ scriptIdPart: 'B', version: '1.0' });
  assert.equal(pineCompileContext(window, controller).unchanged, false);
  controller.getScriptIdVersion = () => ({ scriptIdPart: 'A', version: '2.0' });
  assert.equal(pineCompileContext(window, controller).unchanged, false);
  controller.isModified = () => true;
  assert.equal(pineCompileContext(window, controller).save_required, true);
  controller.isDraft = () => true;
  assert.equal(pineCompileContext(window, controller).save_required, false);
});
it('unchanged indicators wait for a pending applied study without dispatching another compile', async () => {
  let ticks = 0;
  const result = await smartCompile({ _deps: { source: 'indicator("QA")',
    evaluate: expression => {
      assert.match(expression, /function pineCompileContext/);
      return ticks < 3 ? { pending: true } : { unchanged: true };
    }, sleep: async () => { ticks++; }, now: () => ticks * 200,
  } });
  assert.equal(result.unchanged, true); assert.equal(result.compile_performed, false); assert.equal(ticks, 3);
});
it('compile requires explicit permission to persist edits to a saved script', async () => {
  let inspections = 0;
  const result = await smartCompile({ _deps: { source: 'indicator("QA")', evaluate: () => {
    inspections++; return { save_required: true };
  } } });
  assert.equal(result.code, 'SAVE_REQUIRED'); assert.equal(inspections, 1);
});
it('smartCompile verifies late clean completion and fails closed on timeout', async () => {
  assert.equal((await smartCompile({ _deps: dependencies() })).compiled, true);
  const result = await smartCompile({ timeout: 1000, _deps: dependencies({ neverComplete: true }) });
  assert.equal(result.compiled, false); assert.match(result.error, /timeout/);
});
it('compile --save requires saved identity and a clean editor after native completion', async () => {
  const good = await smartCompile({ save:true, _deps:dependencies({saveRequired:true}) });
  assert.equal(good.saved, true); assert.equal(good.script_id, 'saved A');
  const dirty = await smartCompile({ save:true, _deps:dependencies({saveRequired:true,modifiedAfter:true}) });
  assert.equal(dirty.success, false); assert.equal(dirty.saved, false);
  assert.equal(dirty.code, 'SAVE_NOT_CONFIRMED');
});

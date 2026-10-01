import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers';
import { smartCompile } from '../src/core/pine.js';
import { observePineCompilation, dispatchPineCompilation, pineCompilationStatus } from '../src/core/pine-state.js';

function fixture({ error = false, pending = false } = {}) {
  const window = {}; let state = { ui: { pendingRequests: {} }, console: { messages: [] } };
  const listeners = new Set();
  const emit = changes => { state = { ...state, ...changes }; listeners.forEach(fn => fn()); };
  const store = { getState: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const controller = { _editorStore: { getStore: () => store },
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
function dependencies({ delayedError = false, neverComplete = false } = {}) {
  const f = fixture(); let ticks = 0;
  const context = { window: f.window, document: f.document };
  return { source: '//@version=6\nindicator("QA")\nplot(close)',
    evaluate: expression => {
      if (expression.includes('return beginCompilation(')) return { phase: 'pending' };
      if (expression.includes('return (function observePineCompilation')) return observePineCompilation(f.window, f.controller, 'token');
      if (expression.includes('return (function dispatchPineCompilation')) return 'addToChart';
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
it('smartCompile verifies late clean completion and fails closed on timeout', async () => {
  assert.equal((await smartCompile({ _deps: dependencies() })).compiled, true);
  const result = await smartCompile({ timeout: 1000, _deps: dependencies({ neverComplete: true }) });
  assert.equal(result.compiled, false); assert.match(result.error, /timeout/);
});

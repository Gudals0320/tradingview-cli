import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers';
import { newScript, openScript, save, listScripts, smartCompile } from '../src/core/pine.js';
import { confirmPineSaveDialog } from '../src/core/desktop-dom.js';

it('rejects invalid new types before connecting to or changing an editor', async () => {
  await assert.rejects(newScript({ type: 'typo' }), /Invalid Pine script type/);
  await assert.rejects(newScript({ type: 'toString' }), /Invalid Pine script type/);
});

function fixture() {
  let source = 'original B', id = 'B';
  const editor = { getValue: () => source, setValue: value => { source = value; }, getModel: () => ({}) };
  const controller = { _editorStore: {}, _editorRef: { current: { _editor: editor, _monaco: { editor: {} } } },
    getScriptIdVersion: () => id ? { scriptIdPart: id } : null,
    openNewScript: async () => { await Promise.resolve(); id = null; source = 'async template'; },
    setScript: async value => { source = value; },
    openScript: async value => { id = value.scriptIdPart; source = 'saved A\r\n'; },
  };
  const container = { offsetParent: {}, __reactFiber$qa: { memoizedProps: { value: controller } } };
  const document = { querySelectorAll: selector => selector.startsWith('button') ? [] : [container] };
  const fetch = async url => ({ json: async () => url.includes('list/')
    ? [{ scriptIdPart: 'A', scriptName: 'A', version: 2 }] : { source: 'saved A\n' } });
  const window = {};
  const context = { document, fetch, window };
  return { controller, context, read: () => ({ id, source }),
    evaluate: expression => runInNewContext(expression, context),
    evaluateAsync: expression => runInNewContext(expression, context) };
}

it('new detaches the saved identity and waits for the async template before setting source', async () => {
  const f = fixture();
  await newScript({ type: 'strategy', _deps: f });
  assert.equal(f.read().id, null);
  assert.match(f.read().source, /strategy\("My strategy"/);
});
it('new rejects an incomplete controller before changing the document', async () => {
  const f = fixture(); delete f.controller.setScript;
  await assert.rejects(newScript({ type: 'indicator', _deps: f }), /controller unavailable/);
  assert.equal(f.read().id, 'B'); assert.equal(f.read().source, 'original B');
});
it('new reports a failed identity/template verification accurately', async () => {
  const f = fixture(); f.controller.openNewScript = async () => {};
  await assert.rejects(newScript({ type: 'indicator', _deps: f }), /identity\/template verification failed/);
});

it('save confirms the Korean dialog using stable attributes', () => {
  let clicked = 0;
  const button = { offsetParent: {}, disabled: false, textContent: '저장',
    parentElement: { parentElement: { querySelector: () => ({}), textContent: '스크립트 저장새 스크립트 이름' } },
    getAttribute: () => null, click: () => clicked++ };
  assert.equal(confirmPineSaveDialog({ querySelectorAll: selector => {
    assert.equal(selector, 'button[data-qa-id="save-btn"][name="save"]'); return [button];
  } }), true);
  assert.equal(clicked, 1);
  assert.equal(confirmPineSaveDialog({ querySelectorAll: () => [{ ...button, disabled: true }] }), false);
  assert.equal(confirmPineSaveDialog({ querySelectorAll: () => [{ ...button, parentElement: null }] }), false);
});
function saveFixture() {
  const f = fixture(); let ticks = 0;
  f.controller.isModified = () => false;
  f.controller.saveScript = async () => {};
  f.context.fetch = async () => ({ ok: true, json: async () => ({ source: 'original B' }) });
  f.sleep = async () => { ticks++; };
  f.now = () => ticks * 100;
  return f;
}
it('save verifies already saved source without dispatching another save', async () => {
  const f = saveFixture(); f.controller.saveScript = () => { throw new Error('must not dispatch'); };
  assert.equal((await save({ _deps: f })).saved, true);
});
it('expected document mismatch rejects native save and compile before dispatch', async () => {
  const f = saveFixture(); let calls = 0;
  f.controller.saveScript = () => { calls++; };
  const result = await save({ expect_script_id: 'other', _deps: f });
  assert.equal(result.code, 'PINE_DOCUMENT_MISMATCH'); assert.equal(calls, 0);
  const compiled = await smartCompile({ expect_script_id: 'other', _deps: {
    source: 'indicator("QA")', readOutcome: async () => ({ markers: [], targets: [] }),
    evaluate: expression => {
      if (expression.includes('function pineCompileContext')) return { identity: { scriptIdPart: 'current' } };
      if (expression.includes('return failCompilation(')) return true;
      calls++; throw new Error('Unexpected native dispatch');
    },
  } });
  assert.equal(compiled.code, 'PINE_DOCUMENT_MISMATCH'); assert.equal(calls, 0);
});
it('Pine list failure is distinct from a successful empty list', async () => {
  const f = fixture(); f.context.fetch = async () => { throw new Error('injected network failure'); };
  const failed = await listScripts({ _deps: f }); assert.equal(failed.success, false); assert.match(failed.error, /network failure/);
  f.context.fetch = async () => ({ json: async () => [] });
  assert.equal((await listScripts({ _deps: f })).success, true);
});
it('save waits for completion and verifies persisted source', async () => {
  const f = saveFixture(); let modified = true;
  f.controller.isModified = () => modified;
  f.controller.saveScript = async () => { modified = false; };
  assert.equal((await save({ _deps: f })).saved, true);
});
it('save never reports success on persistence mismatch, rejection, or timeout', async () => {
  const f = saveFixture(); f.context.fetch = async () => ({ ok: true, json: async () => ({ source: 'other' }) });
  assert.equal((await save({ _deps: f })).success, false);
  const rejected = saveFixture(); rejected.controller.isModified = () => true;
  rejected.controller.saveScript = async () => { throw new Error('network failure'); };
  assert.match((await save({ _deps: rejected })).error, /network failure/);
  const pending = saveFixture(); pending.controller.isModified = () => true;
  pending.controller.saveScript = () => new Promise(() => {});
  assert.match((await save({ timeout: 200, _deps: pending })).error, /timeout/);
  pending.controller.isModified = () => false;
  const duplicate = await save({ _deps: pending });
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /pending/);
  assert.equal(pending.context.window.__tvCliSave.pending, true);
});
it('save retains expired operation fencing until native quiescence', async () => {
  const f = saveFixture();
  f.context.window.__tvCliSave = { pending: true, token: 'dead-process', expiresAt: Date.now() - 1 };
  assert.equal((await save({ _deps: f })).success, false);
  assert.equal(f.context.window.__tvCliSave.pending, true);
  f.context.window.__tvCliSave.pending = false;
  assert.equal((await save({ _deps: f })).saved, true);
});
it('late native save completion releases only its original pending operation', async () => {
  const f = saveFixture(); let resolveNative, calls = 0, modified = true;
  f.controller.isModified = () => modified;
  f.controller.saveScript = () => { calls++; return new Promise(resolve => { resolveNative = resolve; }); };
  const timedOut = await save({ timeout: 200, _deps: f });
  assert.equal(timedOut.saved, null);
  assert.equal(timedOut.persistence_verified, false);
  assert.equal(timedOut.recovery_required, true);
  const old = f.context.window.__tvCliSave;
  assert.equal(old.pending, true);
  assert.equal((await save({ _deps: f })).success, false);
  assert.equal(calls, 1);
  modified = false; resolveNative();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(old.pending, false);
  assert.equal((await save({ _deps: f })).saved, true);
  assert.notEqual(f.context.window.__tvCliSave.token, old.token);
  assert.equal(calls, 1);
});
it('unmodified draft cannot claim saved-document persistence', async () => {
  const f = saveFixture(); f.controller.isDraft = () => true;
  const result = await save({ _deps: f });
  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.persistence_kind, 'draft');
});
it('save fails if a user cancels the native name dialog', async () => {
  const f = saveFixture(); f.controller.isModified = () => true;
  f.controller.saveScript = async () => { throw new Error('Save canceled'); };
  const result = await save({ _deps: f });
  assert.equal(result.success, false); assert.equal(result.saved, false);
});
it('save confirms its name dialog only once while the operation remains pending', async () => {
  const f = saveFixture(); let clicks = 0;
  f.controller.isModified = () => true;
  f.controller.saveScript = () => new Promise(() => {});
  const query = f.context.document.querySelectorAll;
  f.context.document.querySelectorAll = selector => selector.startsWith('button') ? [{
    offsetParent: {}, disabled: false, getAttribute: () => null,
    parentElement: { parentElement: { querySelector: () => ({}), textContent: '스크립트 저장새 스크립트 이름' } },
    click: () => clicks++,
  }] : query(selector);
  await save({ timeout: 500, _deps: f });
  assert.equal(clicks, 1);
});
it('open changes the document identity as well as source', async () => {
  const f = fixture();
  await openScript({ name: 'A', _deps: f });
  assert.equal(f.read().id, 'A');
  assert.equal(f.read().source, 'saved A\r\n');
});
it('open prioritizes the exact saved name over another document with the same title', async () => {
  const f=fixture();f.context.fetch=async url=>({json:async()=>url.includes('list/')
    ? [{scriptIdPart:'Q',scriptName:'Q',scriptTitle:'A'},{scriptIdPart:'A',scriptName:'A',scriptTitle:'A'}]
    : {source:'saved A\n'}});
  await openScript({name:'A',_deps:f});assert.equal(f.read().id,'A');
});
it('open rejects ambiguous title and partial matches without changing the editor', async () => {
  const f=fixture();f.context.fetch=async()=>({json:async()=>[
    {scriptIdPart:'Q',scriptName:'QA-one',scriptTitle:'Same title'},
    {scriptIdPart:'R',scriptName:'QA-two',scriptTitle:'Same title'},
  ]});
  await assert.rejects(openScript({name:'Same title',_deps:f}),/Ambiguous/);
  await assert.rejects(openScript({name:'QA',_deps:f}),/Ambiguous/);
  assert.equal(f.read().source,'original B');
});
it('open fails when the native controller silently opens a different document', async () => {
  const f = fixture(); f.controller.openScript = async () => {};
  await assert.rejects(openScript({ name: 'A', _deps: f }), /identity\/source/);
  assert.equal(f.read().source, 'original B');
});

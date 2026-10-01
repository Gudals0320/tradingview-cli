import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { newScript, openScript, save } from '../src/core/pine.js';
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

it('save confirms the Korean dialog using stable attributes', () => {
  let clicked = 0;
  const button = { offsetParent: {}, disabled: false, textContent: '저장',
    getAttribute: () => null, click: () => clicked++ };
  assert.equal(confirmPineSaveDialog({ querySelectorAll: selector => {
    assert.equal(selector, 'button[data-qa-id="save-btn"][name="save"]'); return [button];
  } }), true);
  assert.equal(clicked, 1);
  assert.equal(confirmPineSaveDialog({ querySelectorAll: () => [{ ...button, disabled: true }] }), false);
});
function saveFixture() {
  const f = fixture(); let ticks = 0;
  f.controller.isModified = () => false;
  f.context.fetch = async () => ({ ok: true, json: async () => ({ source: 'original B' }) });
  f.sleep = async () => { ticks++; };
  f.now = () => ticks * 100;
  return f;
}
it('save verifies already saved source without dispatching another save', async () => {
  const f = saveFixture(); f.controller.saveScript = () => { throw new Error('must not dispatch'); };
  assert.equal((await save({ _deps: f })).saved, true);
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
});
it('open changes the document identity as well as source', async () => {
  const f = fixture();
  await openScript({ name: 'A', _deps: f });
  assert.equal(f.read().id, 'A');
  assert.equal(f.read().source, 'saved A\r\n');
});
it('open fails when the native controller silently opens a different document', async () => {
  const f = fixture(); f.controller.openScript = async () => {};
  await assert.rejects(openScript({ name: 'A', _deps: f }), /identity\/source/);
  assert.equal(f.read().source, 'original B');
});

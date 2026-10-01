import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { newScript, openScript } from '../src/core/pine.js';

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
  const document = { querySelectorAll: () => [container] };
  const fetch = async url => ({ json: async () => url.includes('list/')
    ? [{ scriptIdPart: 'A', scriptName: 'A', version: 2 }] : { source: 'saved A\n' } });
  return { controller, read: () => ({ id, source }), evaluateAsync: expression => runInNewContext(expression, { document, fetch }) };
}

it('new detaches the saved identity and waits for the async template before setting source', async () => {
  const f = fixture();
  await newScript({ type: 'strategy', _deps: f });
  assert.equal(f.read().id, null);
  assert.match(f.read().source, /strategy\("My strategy"/);
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

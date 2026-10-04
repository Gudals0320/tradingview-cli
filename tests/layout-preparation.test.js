import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedCharts } from '../src/core/ui.js';
import { openLayout } from '../src/workspace.js';

it('layout timeout ignores a late callback', async () => {
  let callback;
  const result = await readSavedCharts({ TradingViewApi: { getSavedCharts: cb => { callback = cb; } } }, 1);
  assert.equal(result.code, 'LAYOUT_LIST_TIMEOUT');
  callback([{ url: 'late-id' }]);
  assert.equal(result.success, false);
});

it('exact IDs survive duplicate names and new/NEW names through explicit open dispatch', async () => {
  let dispatch, records = 0, layouts = [{ id: 'A', name: 'Research' }, { id: 'B', name: 'Research' }, { id: 'C', name: 'new' }, { id: 'D', name: 'NEW' }];
  const _deps = { inventory: async () => ({ tabs: [] }), layoutList: async () => ({ success: true, layouts }),
    newTab: async opts => { dispatch = opts; return { success: true, chart_id: opts.layout_id, target: 'new-target' }; }, recordOwnedTab: () => { records++; } };
  for (const name of ['A', 'B', 'C', 'D']) {
    const result = await openLayout({ name, _deps });
    assert.equal(result.chart_id, name);
    assert.equal(dispatch.layout_id, name);
    assert.equal(dispatch.create, undefined);
  }
  await assert.rejects(openLayout({ name: 'Research', _deps }), { code: 'LAYOUT_AMBIGUOUS' });
  await assert.rejects(openLayout({ name: 'Res', _deps }), { code: 'LAYOUT_NOT_FOUND' });
  _deps.newTab = async () => ({ success: true, chart_id: 'wrong', target: 'wrong-target' });
  const previous = records;
  await assert.rejects(openLayout({ name: 'A', _deps }), e => e.code === 'LAYOUT_IDENTITY_MISMATCH' && e.details.target === 'wrong-target');
  assert.equal(records, previous);
  let calls = 0;
  _deps.newTab = async () => { calls++; };
  _deps.layoutList = async () => ({ success: false, code: 'LAYOUT_LIST_FAILED', error: 'read failed' });
  await assert.rejects(openLayout({ name: 'A', _deps }), { code: 'LAYOUT_LIST_FAILED' });
  assert.equal(calls, 0);
  layouts = [];
});

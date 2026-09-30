import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInventory, activeTarget } from '../src/desktop.js';
import { switchTab } from '../src/core/tab.js';

function fixture({ duplicate = false, bound = false } = {}) {
  const targets = [{ id: 'second', type: 'page', title: 'Chart', url: 'https://kr.tradingview.com/chart/B/' },
    { id: 'first', type: 'page', title: 'Chart', url: `https://kr.tradingview.com/chart/${duplicate ? 'B' : 'A'}/` }];
  const shells = [{ id: 'shell', state: { window_id: 'window', visibility: 'hidden', tabs: [
    { shell_tab_id: 'one', layout_name: duplicate ? 'B' : 'A', active: true, is_chart: true },
    { shell_tab_id: 'two', layout_name: 'B', active: false, is_chart: true },
  ] } }];
  const identities = { first: { window_id: 'window', layout_name: duplicate ? 'B' : 'A', shell_tab_id: bound ? 'one' : null },
    second: { window_id: 'window', layout_name: 'B', shell_tab_id: bound ? 'two' : null } };
  return { targets, shells, tabs: resolveInventory(targets, shells, identities) };
}

describe('Desktop target selection', () => {
  it('follows native active-tab order instead of CDP target order', () => {
    const inventory = fixture();
    assert.equal(activeTarget(inventory).id, 'first');
    assert.equal(inventory.tabs[0].shell_tab_id, 'one');
  });
  it('rejects unbound duplicate layouts instead of guessing', () => {
    assert.throws(() => activeTarget(fixture({ duplicate: true })), /ambiguous/);
  });
  it('maps duplicate layouts using explicit native bindings', () => {
    assert.equal(activeTarget(fixture({ duplicate: true, bound: true })).id, 'first');
  });
  it('does not let a stale initial renderer ID hide a uniquely matched native tab', () => {
    const f = fixture();
    const rows = resolveInventory(f.targets, f.shells, {
      first: { layout_name: 'A', window_id: null, shell_tab_id: 'obsolete-renderer-id' },
      second: { layout_name: 'B', window_id: null, shell_tab_id: 'other-obsolete-id' },
    });
    assert.equal(rows[0].id, 'first');
  });
  it('does not treat a visible inactive page as the active tab', () => {
    const inventory = fixture();
    inventory.tabs[0].active = false; inventory.tabs[1].active = true;
    assert.equal(activeTarget(inventory).id, 'second');
  });
  it('rejects negative/noninteger tab indexes', async () => {
    await assert.rejects(switchTab({ index: -1, _deps: { inventory: async () => fixture() } }), /out of range/);
    await assert.rejects(switchTab({ index: 0.5, _deps: { inventory: async () => fixture() } }), /out of range/);
  });
  it('clicks exactly the requested native tab even if every page claims visible', async () => {
    const inventory = fixture();
    const expressions = [], connected = [];
    const result = await switchTab({ index: 1, _deps: {
      inventory: async () => inventory,
      inspect: async (target, expression) => { expressions.push(expression); return expression.includes('getElementById')
        ? true : { visibility: 'hidden', tabs: [{ shell_tab_id: 'two', active: true }] }; },
      bind: async () => {}, reconnect: async (id) => connected.push(id), sleep: async () => {},
    } });
    assert.ok(expressions[0].includes('"two"'));
    assert.deepEqual(connected, ['second']);
    assert.equal(result.shell_active_verified, true);
    assert.equal(result.visually_switched, false);
  });
});

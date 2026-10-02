import { it } from 'node:test';
import assert from 'node:assert/strict';
import { getDesktopInventory } from '../src/desktop.js';

it('inventory probes are bounded, uncached and finish cleanup before a failed target is returned', async () => {
  const targets = Array.from({ length: 9 }, (_, index) => ({ id: String(index), type: 'page', url: `https://www.tradingview.com/chart/qa-${index}/` }));
  let active = 0, maximum = 0, completed = 0, calls = 0;
  const inspect = async target => {
    calls++; active++; maximum = Math.max(maximum, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (target.id === '3') throw new Error('target closed');
      return { layout_name: `qa-${target.id}` };
    } finally { active--; completed++; }
  };
  const inventory = await getDesktopInventory({ _deps: { targets, inspect } });
  assert.equal(inventory.partial, true); assert.deepEqual(inventory.errors.map(error => error.target_id), ['3']);
  assert.equal(maximum, 4); assert.equal(active, 0); assert.equal(completed, 9);
  const again = await getDesktopInventory({ _deps: { targets, inspect } });
  assert.equal(again.tabs.length, 9);
  assert.equal(calls, 18, 'Every inventory revalidates target identity; no speculative cache.');
});

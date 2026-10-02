import CDP from '../src/cdp.js';
import { CDP_HOST, CDP_PORT } from '../src/config.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withSharedSession } from '../src/session.js';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const label = process.argv[2];
assert.ok(['baseline', 'parallel'].includes(label));
const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
const charts = targets.filter(target => target.type === 'page' && /tradingview\.com\/chart\//.test(target.url || ''));
const shells = targets.filter(target => target.type === 'page' && /\/window\/index\.html/.test(target.url || ''));
assert.ok(charts.length >= 2 && shells.length > 0, 'Two existing charts and a shell are required; benchmark creates none.');
const trials = [];
async function trial(count, warmup = false) {
  let probes = 0, active = 0, maximum = 0;
  const selected = [...shells, ...charts.slice(0, count)];
  const start = performance.now();
  const result = { chart_targets: count, warmup };
  try {
    const inventory = await withSharedSession(() => getDesktopInventory({ _deps: { targets: selected,
      inspect: async (target, expression) => {
        probes++; active++; maximum = Math.max(maximum, active);
        try { return await inspectTarget(target, expression); } finally { active--; }
      },
    } }));
    result.resolved_charts = inventory.tabs.filter(tab => tab.resolved && tab.is_chart).length;
    assert.equal(result.resolved_charts, count);
    result.correct = true;
  } catch (error) { result.correct = false; result.error_code = error.code || 'INSPECTION_FAILED'; }
  Object.assign(result, { elapsed_ms: Number((performance.now() - start).toFixed(3)), probes, maximum_parallel_probes: maximum });
  trials.push(result);
  writeFileSync(`results/issue-overhaul/inventory-${label}.json`, JSON.stringify({ label,
    protocol: 'one warmup per workload, four paired ABBA repetitions, no failed trial excluded', trials }, null, 2));
}
await trial(1, true); await trial(2, true);
for (let repeat = 0; repeat < 4; repeat++) for (const count of [1, 2, 2, 1]) await trial(count);
console.log(JSON.stringify({ label, trials, correct: trials.every(trial => trial.correct) }, null, 2));

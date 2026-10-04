import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resourceLockStatus } from '../src/resource-lock.js';
const name = process.argv[2];
if (!name) throw new Error('Pass the dedicated workspace name.');
function call(args) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
function start(args) {
  const began = Date.now(), child = spawn(process.execPath, ['src/cli/index.js', ...args]);
  let out = '', err = '';
  child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => { if (code !== 0) reject(new Error(err)); else resolve({ ms: Date.now() - began, exit: code, value: JSON.parse(out) }); });
  });
  return { done };
}
call(['status']);
call(['--workspace', name, 'symbol', 'BINANCE:ETHUSDT']);
const id = call(['workspace', 'show', name]).workspace_id;
const symbol = start(['--workspace', name, 'symbol', 'BINANCE:SOLUSDT']);
let seen = false;
for (let i = 0; i < 150; i++) {
  if (resourceLockStatus().holders.some(h => h.workspace_id === id && h.command === 'symbol')) { seen = true; break; }
  await new Promise(resolve => setTimeout(resolve, 10));
}
assert.ok(seen, 'Native symbol holder was not observed; timing not reproduced.');
const quote = start(['--workspace', name, 'quote', 'BITSTAMP:BTCUSD']);
const [s, q] = await Promise.all([symbol.done, quote.done]);
assert.ok(q.value.provenance.locks.waited_ms > 0);
assert.ok(q.value.provenance.locks.waited_for.some(row => row.command === 'symbol'));
assert.equal(q.value.restored, true);
assert.equal(q.value.provenance.context.symbol, 'BINANCE:SOLUSDT');
const state = call(['--workspace', name, 'state']), show = call(['workspace', 'show', name]);
assert.equal(state.symbol, 'BINANCE:SOLUSDT'); assert.equal(show.interrupted, null);
call(['--workspace', name, 'timeframe', '60']);
console.log(JSON.stringify({ success: true, symbol_exit: s.exit, quote_exit: q.exit, symbol_ms: s.ms, quote_ms: q.ms,
  waited_ms: q.value.provenance.locks.waited_ms, waited_for: q.value.provenance.locks.waited_for.map(row => ({ command: row.command })),
  restored: q.value.restored, quote_symbol: q.value.symbol, final_symbol: state.symbol, state: show.state, interrupted: show.interrupted }));

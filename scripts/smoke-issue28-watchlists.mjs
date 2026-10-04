import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { configureTarget, evaluateAsync, disconnect } from '../src/connection.js';
import { readActiveListInfo } from '../src/core/watchlist.js';
const name = process.argv[2] || 'executor-issues', workspace = loadWorkspace(resolveWorkspace(name));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function call(args) {
  const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
call(['status']);
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  const lists = await evaluateAsync(`fetch('/api/v1/symbols_list/custom/',{credentials:'include'}).then(r=>r.json())`);
  const mounted = await evaluateAsync(`(${readActiveListInfo.toString()})(document)`);
  if (mounted && !lists.some(list => String(list.id) === String(mounted.id))) lists.push(mounted);
  const receipts = [];
  for (const list of lists) {
    const raw = call(['--workspace', name, 'watchlist', 'raw', '--list-id', String(list.id)]);
    assert.deepEqual(raw.symbols, list.symbols); assert.equal(raw.raw_count, list.symbols.length);
    const byName = call(['--workspace', name, 'watchlist', 'raw', '--list-name', list.name]);
    assert.deepEqual(byName.symbols, raw.symbols);
    receipts.push({ raw_count: raw.raw_count, rendered_count: raw.rendered_count, sha256: hash(raw.symbols),
      section_count: raw.symbols.filter(s => s.startsWith('###')).length,
      expression_count: raw.symbols.filter(s => /[*/+]/.test(s)).length,
      duplicates: raw.symbols.length - new Set(raw.symbols).size, exact_server_array: true, exact_name_array: true });
  }
  console.log(JSON.stringify({ success: true, read_only: true, lists: receipts.length, receipts }));
}); } finally { await disconnect(); }

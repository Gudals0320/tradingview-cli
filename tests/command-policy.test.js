import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { registeredCommands } from '../src/cli/router.js';
import { commandScope, WORKSPACE_COMMANDS, OFFLINE_COMMANDS, LEGACY_COMMANDS, ADMIN_COMMANDS, pureRead, WORKSPACE_READS } from '../src/cli/policy.js';
for (const file of readdirSync(new URL('../src/cli/commands/', import.meta.url))) await import(`../src/cli/commands/${file}`);
it('classifies every registered command/subcommand once and rejects future unclassified adapters', () => {
  const all = [...registeredCommands()].flatMap(([name, command]) => command.subcommands
    ? [...command.subcommands.keys()].map(sub => `${name} ${sub}`) : [name]);
  assert.equal(all.length, WORKSPACE_COMMANDS.size + OFFLINE_COMMANDS.size + LEGACY_COMMANDS.size + ADMIN_COMMANDS.size);
  for (const name of all) {
    assert.ok(commandScope(name));
    assert.equal([WORKSPACE_COMMANDS, OFFLINE_COMMANDS, LEGACY_COMMANDS, ADMIN_COMMANDS].filter(set => set.has(name)).length, 1);
  }
  assert.throws(() => commandScope('new unsafe adapter'), /Unclassified/);
});
it('workspace observation has an explicit pure invocation contract', () => {
  for (const command of WORKSPACE_READS) assert.equal(pureRead(command, {}, []), true);
  for (const command of ['pine compile', 'pine save', 'indicator set', 'layout switch', 'stream ohlcv', 'ui eval']) {
    assert.equal(WORKSPACE_READS.has(command), false);
    assert.equal(pureRead(command, {}, []), false);
  }
  assert.equal(pureRead('quote', {}, []), true);
  assert.equal(pureRead('quote', {}, ['OTHER:SYMBOL']), false);
  assert.equal(pureRead('range', { from: 1, to: 2 }), false);
});

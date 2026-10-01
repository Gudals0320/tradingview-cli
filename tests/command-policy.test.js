import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { registeredCommands } from '../src/cli/router.js';
import { commandScope, WORKSPACE_COMMANDS, OFFLINE_COMMANDS, LEGACY_COMMANDS, ADMIN_COMMANDS } from '../src/cli/policy.js';
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

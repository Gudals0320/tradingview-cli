import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registeredCommands } from '../src/cli/router.js';
import { buildCatalog } from '../src/cli/catalog.js';
import { MIXED_COMMANDS, MIXED_RULES } from '../src/cli/policy.js';
for (const file of readdirSync(new URL('../src/cli/commands/', import.meta.url))) await import(`../src/cli/commands/${file}`);

const CLI = fileURLToPath(new URL('../src/cli/index.js', import.meta.url));
function run(args) {
  try {
    return { stdout: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 15000 }), stderr: '', exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout || '', stderr: error.stderr || '', exitCode: error.status };
  }
}

it('catalog lists every registered command and subcommand exactly once', () => {
  const expected = [...registeredCommands()].flatMap(([name, command]) => command.subcommands
    ? [...command.subcommands.keys()].map(sub => `${name} ${sub}`) : [name]);
  const names = buildCatalog(registeredCommands()).commands.map(command => command.name);
  assert.deepEqual([...names].sort(), [...expected].sort());
  assert.equal(new Set(names).size, names.length);
});

it('catalog entries carry the published contract fields', () => {
  const catalog = buildCatalog(registeredCommands());
  assert.equal(catalog.success, true);
  assert.deepEqual(Object.keys(catalog.output.exit_codes), ['0', '1', '2']);
  for (const command of catalog.commands) {
    assert.ok(command.description, command.name);
    assert.ok(command.usage.startsWith(`tv ${command.name}`), command.name);
    assert.ok(command.scope in catalog.scopes, command.name);
    assert.ok(command.invocation in catalog.invocations, command.name);
    assert.ok(String(command.read_only) in catalog.read_only_values, command.name);
    assert.equal(command.output, command.name.startsWith('stream ') ? 'jsonl' : 'json');
    for (const option of command.options) {
      assert.match(option.name, /^--[a-z0-9-]+$/);
      assert.ok(option.description.trim(), `${command.name} ${option.name} needs a description`);
    }
  }
  const compile = catalog.commands.find(command => command.name === 'pine compile');
  assert.equal(compile.read_only, false);
  assert.ok(compile.options.some(option => option.name === '--save' && option.type === 'boolean'));
  assert.deepEqual(catalog.commands.find(command => command.name === 'search').positionals, { min: 1, max: null });
});

it('every mixed command documents when it stays a pure read', () => {
  assert.deepEqual([...MIXED_RULES.keys()].sort(), [...MIXED_COMMANDS].sort());
  for (const command of buildCatalog(registeredCommands()).commands) {
    assert.equal(command.read_only === 'conditional', command.read_only_when !== undefined, command.name);
  }
});

it('catalog filters by command and subcommand and rejects unknown names', () => {
  const pine = buildCatalog(registeredCommands(), ['pine']).commands.map(command => command.name);
  assert.ok(pine.length > 1 && pine.every(name => name.startsWith('pine ')));
  assert.deepEqual(buildCatalog(registeredCommands(), ['pine', 'compile']).commands.map(command => command.name), ['pine compile']);
  assert.deepEqual(buildCatalog(registeredCommands(), ['status']).commands.map(command => command.name), ['status']);
  assert.throws(() => buildCatalog(registeredCommands(), ['pin']), { code: 'UNKNOWN_COMMAND' });
});

it('tv help --json prints the catalog without a Desktop connection', () => {
  const { stdout, exitCode } = run(['help', '--json', 'pine', 'check']);
  assert.equal(exitCode, 0);
  const catalog = JSON.parse(stdout);
  assert.deepEqual(catalog.commands.map(command => command.name), ['pine check']);
  assert.equal(catalog.commands[0].scope, 'offline');

  const unknown = run(['help', '--json', 'nonexistent']);
  assert.equal(unknown.exitCode, 1);
  assert.equal(JSON.parse(unknown.stderr).code, 'UNKNOWN_COMMAND');
});

it('tv help without --json prints the same text as --help', () => {
  assert.equal(run(['help']).stdout, run(['--help']).stdout);
  assert.equal(run(['help', 'pine']).stdout, run(['pine', '--help']).stdout);
  assert.equal(run(['help', 'pine', 'compile']).stdout, run(['pine', 'compile', '--help']).stdout);
  assert.ok(run(['--help']).stdout.includes('tv help --json'));
});

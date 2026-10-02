import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { registeredCommands } from '../src/cli/router.js';
import { POSITIONALS } from '../src/cli/arguments.js';
for (const file of readdirSync(new URL('../src/cli/commands/', import.meta.url))) await import(`../src/cli/commands/${file}`);

it('documented single-line CLI examples retain strict option and positional syntax', () => {
  const files = ['README.md', 'docs/workspaces.md', 'AGENTS.md'];
  let checked = 0;
  for (const file of files) for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.includes('→') || !/^tv\s/.test(line) || /\\$|\.\.\.|\[.*\]/.test(line)) continue;
    const tokens = (line.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || []).map(token => /^['"]/.test(token) ? token.slice(1, -1) : token);
    tokens.shift();
    if (['--target', '--workspace'].includes(tokens[0])) tokens.splice(0, 2);
    const command = tokens.shift(), parent = registeredCommands().get(command);
    assert.ok(parent, `${file}: ${line}`);
    const sub = parent.subcommands ? tokens.shift() : null;
    const adapter = sub ? parent.subcommands.get(sub) : parent;
    assert.ok(adapter, `${file}: ${line}`);
    const parsed = parseArgs({ args: tokens, options: { help: { type: 'boolean', short: 'h' }, ...adapter.options }, strict: true, allowPositionals: true });
    const [min, max] = POSITIONALS.get(sub ? `${command} ${sub}` : command) || [0, 0];
    assert.ok(parsed.values.help || (parsed.positionals.length >= min && parsed.positionals.length <= max), `${file}: ${line}`);
    checked++;
  }
  assert.ok(checked > 25, 'Documented syntax coverage unexpectedly disappeared.');
});

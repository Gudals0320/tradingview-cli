/**
 * Machine-readable command catalog for `tv help --json`.
 * Built from the registered adapters and CLI policy so it cannot drift from the code.
 */
import { readFileSync } from 'node:fs';
import { POSITIONALS } from './arguments.js';
import { commandScope, invocationClass, MIXED_RULES } from './policy.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const SCOPES = {
  workspace: 'Runs under --workspace FILE or as an exclusive legacy call.',
  offline: 'Independent of the Desktop runtime; takes no endpoint lease.',
  'workspace-admin': 'Workspace administration on the reserved CDP target.',
  legacy: 'Exclusive legacy call only: holds the endpoint lease; rejected under --workspace.',
};

const INVOCATIONS = {
  pure: 'Pure read of Desktop state; never creates a recovery journal.',
  mixed: 'Pure read or Desktop change depending on arguments; see read_only_when.',
  native: 'Dispatches native Desktop changes that may outlive the CLI.',
  offline: 'Does not touch the Desktop chart.',
  'workspace-admin': 'Manages workspace reservations.',
};

function describe(name, adapter) {
  const [min, max] = POSITIONALS.get(name) || [0, 0];
  const invocation = invocationClass(name);
  const options = Object.entries(adapter.options || {}).map(([option, spec]) => ({
    name: `--${option}`,
    ...(spec.short ? { short: `-${spec.short}` } : {}),
    type: spec.type,
    ...(spec.multiple ? { multiple: true } : {}),
    description: spec.description || '',
  }));
  return {
    name,
    description: adapter.description,
    usage: `tv ${name}${max === 0 ? '' : min === 0 ? ' [ARGS]' : ' <ARGS>'}${options.length ? ' [options]' : ''}`,
    positionals: { min, max: Number.isFinite(max) ? max : null },
    options,
    scope: commandScope(name),
    invocation,
    read_only: invocation === 'pure' ? true : invocation === 'mixed' ? 'conditional' : invocation === 'native' ? false : null,
    ...(MIXED_RULES.has(name) ? { read_only_when: MIXED_RULES.get(name) } : {}),
    output: name.startsWith('stream ') ? 'jsonl' : 'json',
  };
}

export function buildCatalog(commands, filter = []) {
  const entries = [...commands].flatMap(([name, command]) => command.subcommands
    ? [...command.subcommands].map(([sub, adapter]) => [`${name} ${sub}`, adapter])
    : [[name, command]]);
  const prefix = filter.join(' ');
  const selected = entries.filter(([name]) => !prefix || name === prefix || name.startsWith(`${prefix} `));
  if (!selected.length) {
    throw Object.assign(new Error(`Unknown command: ${prefix}`), { code: 'UNKNOWN_COMMAND' });
  }
  return {
    success: true,
    catalog_version: 1,
    cli: { name: 'tv', version },
    usage: 'tv [--target CDP_ID | --workspace FILE] <command> [subcommand] [args] [options]',
    global_options: [
      { name: '--target', value: 'CDP_ID', description: 'Run against this CDP page target (see `tv tab list`).' },
      { name: '--workspace', value: 'FILE', description: 'Run inside a reserved workspace (see docs/workspaces.md).' },
    ],
    environment: [
      { name: 'TV_CDP_HOST', default: '127.0.0.1', description: 'CDP host.' },
      { name: 'TV_CDP_PORT', default: 9222, description: 'CDP port (1..65535).' },
      { name: 'TV_CDP_TIMEOUT_MS', default: 15000, description: 'Per-request CDP timeout (100..120000). A timeout does not cancel native work.' },
      { name: 'TV_CDP_TARGET', default: null, description: 'Default CDP page target; cannot be combined with --workspace.' },
    ],
    output: {
      stdout: 'One JSON object per call; stream commands emit JSONL until interrupted.',
      stderr: 'Errors as JSON: {success:false, error, code?, details?}.',
      success_rule: 'Check both the exit code and success; success:false results can appear on stdout with exit 1.',
      exit_codes: {
        0: 'Success.',
        1: 'Invalid command or input, operation failure, compile failure or fatal error.',
        2: 'CDP transport or connection failure.',
      },
    },
    scopes: SCOPES,
    invocations: INVOCATIONS,
    read_only_values: {
      true: 'Pure read.',
      false: 'Changes Desktop state.',
      conditional: 'Depends on arguments; see read_only_when.',
      null: 'Not a chart read or change; see scope and invocation.',
    },
    commands: selected.map(([name, adapter]) => describe(name, adapter)),
  };
}

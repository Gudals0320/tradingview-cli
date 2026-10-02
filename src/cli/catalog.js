/**
 * Machine-readable command catalog for `tv help --json`.
 * Built from the registered adapters and CLI policy so it cannot drift from the code.
 */
import { readFileSync } from 'node:fs';
import { POSITIONALS } from './arguments.js';
import { commandScope, invocationClass, MIXED_RULES, DESKTOP_REQUIREMENTS, OFFLINE_LEASE_COMMANDS, resourceKinds, workspaceRequired, FOREGROUND_COMMANDS } from './policy.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const SCOPES = {
  workspace: 'Requires an explicit workspace name or terminal-local selection. Never falls back to the active tab.',
  offline: 'Routed without the endpoint lease or a CDP client; see desktop and endpoint_lease for handlers that still need them.',
  'workspace-admin': 'Workspace administration on the reserved CDP target.',
  preparation: 'Layout and workspace preparation, available before selection.',
  'app-shared': 'App/account shared operation. Uses the app resource lock when changing shared state.',
};

const INVOCATIONS = {
  pure: 'Pure read of Desktop state; never creates a recovery journal.',
  mixed: 'Pure read or Desktop change depending on arguments; see read_only_when.',
  native: 'Dispatches native Desktop changes that may outlive the CLI.',
  offline: 'Does not touch the Desktop chart.',
  'workspace-admin': 'Manages workspace reservations.',
  preparation: 'Prepares saved layouts or validates workspace selection.',
};

const DESKTOP = {
  cdp: 'Connects to a running Desktop page over CDP.',
  cdp_http: 'Reads the Desktop CDP HTTP endpoint only (no page execution).',
  launches: 'Starts Desktop with CDP enabled; Desktop need not be running.',
  none: 'Does not contact Desktop.',
};

const LEASES = {
  true: 'Holds the shared endpoint lease; overlapping lease holders fail with SESSION_BUSY.',
  false: 'Does not hold the endpoint lease.',
};

// Only `help` changes format with an option; every other adapter emits JSON or JSONL.
const OUTPUT_RULES = new Map([['help', 'JSON with --json; plain text otherwise.']]);

function endpointLease(name, scope) {
  if (scope === 'app-shared') return invocationClass(name) !== 'pure';
  return OFFLINE_LEASE_COMMANDS.has(name);
}

function describe(name, adapter) {
  const [min, max] = POSITIONALS.get(name) || [0, 0];
  const invocation = invocationClass(name), scope = commandScope(name);
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
    scope,
    invocation,
    desktop: DESKTOP_REQUIREMENTS.get(name) || (scope === 'offline' ? 'none' : 'cdp'),
    endpoint_lease: endpointLease(name, scope),
    workspace_required: workspaceRequired(name),
    locks: resourceKinds(name),
    foreground: FOREGROUND_COMMANDS.has(name) ? 'required' : ['layout create', 'layout open', 'tab new'].includes(name) ? 'changes' : 'background',
    read_only: invocation === 'pure' ? true : invocation === 'mixed' ? 'conditional' : invocation === 'native' ? false : null,
    ...(MIXED_RULES.has(name) ? { read_only_when: MIXED_RULES.get(name) } : {}),
    output: OUTPUT_RULES.has(name) ? 'conditional' : name.startsWith('stream ') ? 'jsonl' : 'json',
    ...(OUTPUT_RULES.has(name) ? { output_when: OUTPUT_RULES.get(name) } : {}),
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
    catalog_version: 2,
    cli: { name: 'tv', version },
    usage: 'tv [--workspace NAME] <command> [subcommand] [args] [options]',
    global_options: [
      { name: '--target', value: 'CDP_ID', description: 'Preparation-only legacy target selection. Register a named workspace for chart work.' },
      { name: '--workspace', value: 'NAME', description: 'Explicit workspace for this invocation; takes priority over TV_WORKSPACE. Legacy handles are deprecated.' },
      { name: '--lock-timeout-ms', value: 'MS', description: 'Bounded resource wait: default 30000, maximum 300000; SIGINT cancels and removes the ticket.' },
    ],
    environment: [
      { name: 'TV_CDP_HOST', default: '127.0.0.1', description: 'CDP host.' },
      { name: 'TV_CDP_PORT', default: 9222, description: 'CDP port (1..65535).' },
      { name: 'TV_CDP_TIMEOUT_MS', default: 15000, description: 'Per-request CDP timeout (100..120000). A timeout does not cancel native work.' },
      { name: 'TV_CDP_TARGET', default: null, description: 'Default CDP page target; cannot be combined with --workspace.' },
      { name: 'TV_WORKSPACE', default: null, description: 'Calling terminal workspace selection, set by the PowerShell module.' },
      { name: 'TV_LAYOUT', default: null, description: 'Calling terminal selected saved layout, set with its workspace.' },
      { name: 'TV_STATE_DIR', default: null, description: 'Persistent private state directory override; defaults to LOCALAPPDATA or XDG state home.' },
    ],
    output: {
      stdout: 'One JSON object per call; stream commands emit JSONL until interrupted; see each command\'s output.',
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
    desktop_values: DESKTOP,
    endpoint_lease_values: LEASES,
    ownership_fields: { workspace_required: 'Selection must resolve before any chart access.', locks: 'Resource kinds acquired together; reads use no mutation lock. Mixed commands depend on arguments.', foreground: 'background targets the owned page; required verifies the selected Desktop tab; changes opens/selects tabs.' },
    read_only_values: {
      true: 'Pure read.',
      false: 'Changes Desktop state.',
      conditional: 'Depends on arguments; see read_only_when.',
      null: 'Not a chart read or change; see scope and invocation.',
    },
    commands: selected.map(([name, adapter]) => describe(name, adapter)),
  };
}

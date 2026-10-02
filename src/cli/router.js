/**
 * CLI command router using node:util parseArgs.
 * Zero dependencies — uses only Node.js built-ins.
 */
import { parseArgs } from 'node:util';
import { disconnect, configureTarget, configuredTarget } from '../connection.js';
import { acquireSession, withReadOnlySession, withLegacySession, assertNoWorkspaceAnywhere } from '../session.js';
import { runWorkspace } from '../workspace.js';
import { commandScope } from './policy.js';
import { validateArguments } from './arguments.js';

/** @type {Map<string, { description: string, options?: object, handler: Function, subcommands?: Map<string, object> }>} */
const commands = new Map();
export function registeredCommands() { return commands; }

export function register(name, config) {
  commands.set(name, config);
}

export function printHelp() {
  console.log('Usage: tv [--target CDP_ID | --workspace FILE] <command> [options]\n');
  console.log('Commands:');
  const maxLen = Math.max(...[...commands.keys()].map(k => k.length));
  for (const [name, cmd] of commands) {
    if (cmd.subcommands) {
      const subs = [...cmd.subcommands.keys()].join(', ');
      console.log(`  ${name.padEnd(maxLen + 2)}${cmd.description}  [${subs}]`);
    } else {
      console.log(`  ${name.padEnd(maxLen + 2)}${cmd.description}`);
    }
  }
  console.log('\nRun "tv <command> --help" for command-specific options.');
  console.log('Run "tv help --json" for a machine-readable command catalog.');
  console.log('\nDISCLAIMER');
  console.log('  Not affiliated with TradingView Inc.');
  console.log('  Use subject to TradingView\'s Terms of Use: tradingview.com/policies');
}

export function printCommandHelp(name, cmd) {
  if (cmd.subcommands) {
    console.log(`Usage: tv ${name} <subcommand> [options]\n`);
    console.log('Subcommands:');
    for (const [sub, subConf] of cmd.subcommands) {
      console.log(`  ${sub.padEnd(12)}${subConf.description}`);
    }
  } else {
    console.log(`Usage: tv ${name} [options]\n`);
    console.log(cmd.description);
  }
  const opts = cmd.options || {};
  if (Object.keys(opts).length > 0) {
    console.log('\nOptions:');
    for (const [k, v] of Object.entries(opts)) {
      const flag = v.short ? `-${v.short}, --${k}` : `    --${k}`;
      console.log(`  ${flag.padEnd(20)}${v.description || ''}`);
    }
  }
}

export function printSubcommandHelp(name, subName, sub) {
  const options = sub.options || {};
  console.log(`Usage: tv ${name} ${subName} [options]\n`);
  console.log(sub.description);
  if (Object.keys(options).length > 0) {
    console.log('\nOptions:');
    for (const [k, v] of Object.entries(options)) {
      const flag = v.short ? `-${v.short}, --${k}` : `    --${k}`;
      console.log(`  ${flag.padEnd(20)}${v.description || ''}`);
    }
  }
}

export async function run(argv) {
  const args = argv.slice(2);
  let workspaceFile = null;
  if (args[0] === '--workspace') {
    if (!args[1] || args[1].startsWith('--')) { handleError(new Error('--workspace requires a workspace file.')); return; }
    workspaceFile = args[1]; args.splice(0, 2);
    if (args.includes('--target') || process.env.TV_CDP_TARGET) { const error = new Error('--target and TV_CDP_TARGET cannot override a workspace.'); error.code = 'WORKSPACE_TARGET_MISMATCH'; handleError(error); return; }
  }
  if (args[0] === '--target') {
    if (!args[1] || args[1].startsWith('--')) { handleError(new Error('--target requires a CDP target ID.')); return; }
    configureTarget(args[1]); args.splice(0, 2);
  }

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const cmdName = args[0];
  const offline = cmdName === 'update' || cmdName === 'session' || cmdName === 'workspace'
    || (cmdName === 'pine' && ['analyze', 'check'].includes(args[1]));
  // These handlers only inspect existing state. Data/Pine reads can open panels
  // or trigger recalculation, so they deliberately remain blocked in recovery.
  const readOnly = ['status', 'state'].includes(cmdName) || (cmdName === 'tab' && args[1] === 'list');
  const cmd = commands.get(cmdName);

  if (!cmd) {
    console.error(`Unknown command: ${cmdName}`);
    console.error('Run "tv --help" for a list of commands.');
    process.exit(1);
  }

  // Handle subcommands (e.g., tv pine get)
  let handler, options;
  if (cmd.subcommands) {
    const subName = args[1];
    if (!subName || subName === '--help' || subName === '-h') {
      printCommandHelp(cmdName, cmd);
      process.exit(0);
    }
    const sub = cmd.subcommands.get(subName);
    if (!sub) {
      console.error(`Unknown subcommand: ${cmdName} ${subName}`);
      printCommandHelp(cmdName, cmd);
      process.exit(1);
    }
    handler = sub.handler;
    options = sub.options || {};
    // Parse remaining args after command + subcommand
    try {
      const { values, positionals } = parseArgs({
        args: args.slice(2),
        options: { help: { type: 'boolean', short: 'h' }, ...options },
        allowPositionals: true,
        strict: true,
      });
      if (values.help) {
        printSubcommandHelp(cmdName, subName, sub);
        process.exit(0);
      }
      validateArguments(`${cmdName} ${subName}`, values, positionals);
      await execute(handler, values, positionals, offline, readOnly, workspaceFile, `${cmdName} ${subName}`);
    } catch (err) {
      handleError(err);
    }
  } else {
    handler = cmd.handler;
    options = cmd.options || {};
    try {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: { help: { type: 'boolean', short: 'h' }, ...options },
        allowPositionals: true,
        strict: true,
      });
      if (values.help) {
        printCommandHelp(cmdName, cmd);
        process.exit(0);
      }
      validateArguments(cmdName, values, positionals);
      await execute(handler, values, positionals, offline, readOnly, workspaceFile, cmdName);
    } catch (err) {
      handleError(err);
    }
  }
}

async function execute(handler, values, positionals, offline = false, readOnly = false, workspaceFile = null, command = '') {
  let lease, result, primaryError, retainRecovery = false;
  const cleanupWarnings = [];
  try {
    const action = async () => {
      if (workspaceFile) return runWorkspace(workspaceFile, command, values, positionals, handler);
      if (command === 'workspace wait') throw new Error('workspace wait requires --workspace FILE.');
      if (command === 'launch') assertNoWorkspaceAnywhere();
      if (['workspace', 'legacy'].includes(commandScope(command))) {
        lease = acquireSession({ readOnly, command, desktopWide: command === 'launch' });
      }
      if (!lease) return handler(values, positionals);
      return withLegacySession(lease, () => handler(values, positionals));
    };
    result = await (readOnly ? withReadOnlySession(action) : action());
    retainRecovery = result?.recovery_required === true;
  } catch (err) {
    primaryError = err;
    retainRecovery = err.code === 'CDP_TIMEOUT' || err.recovery_required === true;
  } finally {
    if (lease && retainRecovery && lease.pending()?.native_quiescence_required) {
      try { lease.checkpoint({ ...lease.pending(), phase: 'recovery_required', command,
        target_id: configuredTarget() || lease.pending()?.target_id, native_quiescence_required: true }); }
      catch (error) { cleanupWarnings.push(error.message); }
    }
    // Close CDP explicitly and let pending stdout/HTTP handles drain. Forcing
    // exit after fetch() can abort in libuv on Windows Node.js 24.
    try { await disconnect(); } catch (error) { cleanupWarnings.push(error.message); }
    if (lease) {
      try { lease.release({ restored: !readOnly && !retainRecovery }); }
      catch (error) { cleanupWarnings.push(error.message); }
    }
  }
  if (primaryError) {
    if (cleanupWarnings.length) primaryError.details = { ...primaryError.details, cleanup_warnings: cleanupWarnings };
    handleError(primaryError);
    return;
  }
  if (result !== undefined) {
    if (cleanupWarnings.length) result = { ...result, cleanup_warnings: cleanupWarnings };
    console.log(JSON.stringify(result, null, 2));
  } else if (cleanupWarnings.length) console.error(JSON.stringify({ cleanup_warnings: cleanupWarnings }));
  process.exitCode = result?.success === false || result?.compiled === false || result?.has_errors === true ? 1 : 0;
}

function handleError(err) {
  const message = err.message || String(err);
  // Connection failures get exit code 2
  if (['CDP_CONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code)
    || ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.cause?.code)) {
    console.error(JSON.stringify({ success: false, error: message }, null, 2));
    process.exitCode = 2;
    return;
  }
  console.error(JSON.stringify({ success: false, error: message,...(err.code?{code:err.code}:{}),...(err.details?{details:err.details}:{}) }, null, 2));
  process.exitCode = 1;
}

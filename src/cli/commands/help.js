import { register, registeredCommands, printHelp, printCommandHelp, printSubcommandHelp } from '../router.js';
import { buildCatalog } from '../catalog.js';

register('help', {
  description: 'Show help; --json prints the machine-readable command catalog',
  options: {
    json: { type: 'boolean', description: 'Print the command catalog as JSON (optionally filtered by COMMAND [SUBCOMMAND])' },
    brief: { type: 'boolean', description: 'With --json, omit repeated catalog explanations; cache by CLI/catalog version and fingerprint' },
  },
  handler: (opts, positionals) => {
    if (opts.brief && !opts.json) throw Object.assign(new Error('--brief requires --json.'), { code: 'INVALID_OPTION_COMBINATION' });
    if (opts.json) return buildCatalog(registeredCommands(), positionals, { brief: opts.brief });
    const [name, subName] = positionals;
    if (!name) { printHelp(); return undefined; }
    const command = registeredCommands().get(name);
    const sub = subName ? command?.subcommands?.get(subName) : null;
    if (!command || (subName && !sub)) {
      throw Object.assign(new Error(`Unknown command: ${positionals.join(' ')}`), { code: 'UNKNOWN_COMMAND' });
    }
    if (sub) printSubcommandHelp(name, subName, sub);
    else printCommandHelp(name, command);
    return undefined;
  },
});

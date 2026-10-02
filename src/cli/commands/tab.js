import { register } from '../router.js';
import * as core from '../../core/tab.js';

register('tab', {
  description: 'Tab management (list, new, close, switch)',
  subcommands: new Map([
    ['list', {
      description: 'List all open chart tabs',
      handler: () => core.list(),
    }],
    ['new', {
      description: 'Open a new chart tab',
      options: {
        layout: { type: 'string', description: 'Saved layout name, or new' },
        name: { type: 'string', description: 'Name for a new saved layout' },
      },
      handler: (opts) => core.newTab({ layout: opts.layout, name: opts.name }),
    }],
    ['close', {
      description: 'Close the current tab',
      handler: opts => core.closeTab({ target_id: opts.workspaceTarget }),
    }],
    ['switch', {
      description: 'Select the owned workspace tab; an optional legacy index must match it',
      handler: (opts, positionals) => {
        return core.switchTab({ index: positionals[0], target_id: opts.workspaceTarget });
      },
    }],
  ]),
});

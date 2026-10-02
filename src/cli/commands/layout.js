import { register } from '../router.js';
import * as core from '../../core/ui.js';
import { openLayout } from '../../workspace.js';

register('layout', {
  description: 'Layout tools (list, switch)',
  subcommands: new Map([
    ['create', { description: 'Create a dedicated saved layout in a new tab (changes foreground)', handler: (_, args) => openLayout({ name: args.join(' '), create: true }) }],
    ['open', { description: 'Open a saved layout in a new tab; then create/select its workspace', handler: (_, args) => openLayout({ name: args.join(' ') }) }],
    ['list', {
      description: 'List saved chart layouts',
      handler: () => core.layoutList(),
    }],
    ['switch', {
      description: 'Switch to a saved layout by name or ID',
      handler: (opts, positionals) => {
        if (!positionals[0]) throw new Error('Layout name required. Usage: tv layout switch "My Layout"');
        return core.layoutSwitch({ name: positionals.join(' ') });
      },
    }],
  ]),
});

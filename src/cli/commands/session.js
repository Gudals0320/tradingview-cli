import { register } from '../router.js';
import { sessionStatus } from '../../session.js';
register('session', { description: 'Desktop batch ownership and recovery status', subcommands: new Map([
  ['status', { description: 'Inspect ownership without touching Desktop or exposing the saved draft', handler: () => ({ success: true, ...sessionStatus() }) }],
]) });

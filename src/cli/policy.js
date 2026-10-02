// Every adapter is classified explicitly; additions fail the policy coverage test.
export const WORKSPACE_COMMANDS = new Set(['state', 'symbol', 'timeframe', 'type', 'info',
  'pine get', 'pine set', 'pine compile', 'pine raw-compile', 'pine save', 'pine errors', 'pine console',
  'indicator get', 'indicator set', 'data strategy', 'data trades', 'data ledger', 'data equity', 'workspace wait',
  'ohlcv', 'values', 'quote', 'data lines', 'data labels', 'data tables', 'data boxes']);
export const PURE_READ_COMMANDS = new Set(['status', 'state', 'info', 'ohlcv', 'values', 'data lines', 'data labels',
  'data tables', 'data boxes', 'data strategy', 'data trades', 'data ledger', 'data equity', 'data depth',
  'data indicator', 'indicator get', 'pine get', 'pine errors', 'pine console', 'pine list', 'alert list',
  'watchlist get', 'tab list', 'layout list', 'pane list', 'draw list', 'draw get', 'replay status', 'discover', 'ui-state', 'ui find', 'workspace wait',
  'stream quote', 'stream bars', 'stream values', 'stream lines', 'stream labels', 'stream tables', 'stream all']);
export const MIXED_COMMANDS = new Set(['quote', 'symbol', 'timeframe', 'type', 'range', 'screenshot', 'stream ohlcv']);
// When a mixed command stays a pure read; published by `tv help --json`.
export const MIXED_RULES = new Map([
  ['quote', 'Pure read without SYMBOL; with SYMBOL it temporarily switches the chart symbol and restores it.'],
  ['symbol', 'Pure read without an argument; with one it changes the chart symbol.'],
  ['timeframe', 'Pure read without an argument; with one it changes the chart timeframe.'],
  ['type', 'Pure read without an argument; with one it changes the chart type.'],
  ['range', 'Pure read without --from/--to; with them it changes the visible range.'],
  ['screenshot', 'Pure read from the CLI (CDP capture); writes a PNG file locally.'],
  ['stream ohlcv', 'Feed provisioning may split panes, open tabs or reassign CLI-created targets; polling is a pure read.'],
]);
export const WORKSPACE_READS = new Set(['state', 'info', 'ohlcv', 'values', 'quote', 'data lines', 'data labels',
  'data tables', 'data boxes', 'pine get', 'pine errors', 'pine console', 'indicator get']);
export function pureRead(command, values = {}, positionals = []) {
  if (['quote', 'symbol', 'timeframe', 'type'].includes(command)) return positionals.length === 0;
  if (command === 'range') return values.from === undefined && values.to === undefined;
  if (command === 'screenshot') return values.method !== 'api';
  if (command === 'stream ohlcv') return values.phase === 'polling';
  return PURE_READ_COMMANDS.has(command);
}
export const OFFLINE_COMMANDS = new Set(['help', 'update', 'search', 'pine analyze', 'pine check', 'session status', 'session discard', 'session recover',
  'workspace inventory', 'workspace status', 'workspace interrupt', 'workspace abandon', 'workspace gate-status', 'workspace gate-clear']);
// Offline routing takes no lease and no CDP client, but these handlers still
// reach Desktop or take the endpoint lease themselves; published by `tv help --json`.
export const DESKTOP_REQUIREMENTS = new Map([['launch', 'launches'], ['session recover', 'cdp'], ['workspace inventory', 'cdp_http']]);
export const OFFLINE_LEASE_COMMANDS = new Set(['session recover', 'session discard']);
export const ADMIN_COMMANDS = new Set(['workspace init', 'workspace recover', 'workspace rebind', 'workspace release']);
// Only these commands dispatch native changes which may outlive the CLI.
// Pure collection and observation never create a recovery journal.
export const NATIVE_COMMANDS = new Set(['launch', 'range', 'scroll', 'pine set', 'pine compile', 'pine raw-compile',
  'pine save', 'pine new', 'pine open', 'indicator set', 'indicator add', 'indicator remove', 'indicator toggle',
  'layout switch', 'pane layout', 'pane focus', 'pane symbol', 'tab new', 'tab close', 'tab switch',
  'alert create', 'alert delete', 'draw shape', 'draw remove', 'draw clear', 'replay start', 'replay step',
  'replay stop', 'replay autoplay', 'replay trade', 'watchlist add', 'watchlist add-bulk', 'watchlist remove',
  'ui click', 'ui keyboard', 'ui hover', 'ui scroll', 'ui eval', 'ui type', 'ui panel', 'ui fullscreen', 'ui mouse']);
export function commandMutates(command, values, positionals) {
  if (['symbol', 'timeframe', 'type', 'quote'].includes(command)) return positionals.length > 0;
  if (command === 'range') return values.from !== undefined;
  return NATIVE_COMMANDS.has(command);
}
export function invocationClass(command) {
  if (PURE_READ_COMMANDS.has(command)) return 'pure';
  if (MIXED_COMMANDS.has(command)) return 'mixed';
  if (NATIVE_COMMANDS.has(command)) return 'native';
  const scope = commandScope(command);
  if (['offline', 'workspace-admin'].includes(scope)) return scope;
  throw new Error(`Unclassified invocation contract: ${command}`);
}
export const LEGACY_COMMANDS = new Set(['status', 'launch', 'range', 'scroll', 'discover', 'ui-state', 'screenshot',
  'alert list', 'alert create', 'alert delete', 'data depth', 'data indicator',
  'draw shape', 'draw list', 'draw get', 'draw remove', 'draw clear', 'indicator add', 'indicator remove', 'indicator toggle',
  'layout list', 'layout switch', 'pane list', 'pane layout', 'pane focus', 'pane symbol', 'pine new', 'pine open', 'pine list',
  'replay start', 'replay step', 'replay stop', 'replay status', 'replay autoplay', 'replay trade',
  'stream quote', 'stream bars', 'stream values', 'stream lines', 'stream labels', 'stream tables', 'stream ohlcv', 'stream all',
  'tab list', 'tab new', 'tab close', 'tab switch', 'ui click', 'ui keyboard', 'ui hover', 'ui scroll', 'ui find', 'ui eval', 'ui type', 'ui panel', 'ui fullscreen', 'ui mouse',
  'watchlist get', 'watchlist add', 'watchlist add-bulk', 'watchlist remove']);
export function commandScope(command) {
  if (WORKSPACE_COMMANDS.has(command)) return 'workspace';
  if (OFFLINE_COMMANDS.has(command)) return 'offline';
  if (ADMIN_COMMANDS.has(command)) return 'workspace-admin';
  if (LEGACY_COMMANDS.has(command)) return 'legacy';
  throw new Error(`Unclassified CLI command: ${command}`);
}

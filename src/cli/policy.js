// Every adapter is classified explicitly; additions fail the policy coverage test.
export const WORKSPACE_COMMANDS = new Set(['state', 'symbol', 'timeframe', 'type', 'info',
  'pine get', 'pine set', 'pine compile', 'pine raw-compile', 'pine save', 'pine errors', 'pine console',
  'indicator get', 'indicator set', 'data strategy', 'data trades', 'data ledger', 'data equity', 'workspace wait']);
export const OFFLINE_COMMANDS = new Set(['update', 'search', 'pine analyze', 'pine check', 'session status', 'session discard',
  'workspace inventory', 'workspace init', 'workspace status', 'workspace interrupt', 'workspace recover', 'workspace release', 'workspace gate-status', 'workspace gate-clear']);
export const LEGACY_COMMANDS = new Set(['status', 'launch', 'range', 'scroll', 'discover', 'ui-state', 'quote', 'ohlcv', 'values', 'screenshot',
  'alert list', 'alert create', 'alert delete', 'data lines', 'data labels', 'data tables', 'data boxes', 'data depth', 'data indicator',
  'draw shape', 'draw list', 'draw get', 'draw remove', 'draw clear', 'indicator add', 'indicator remove', 'indicator toggle',
  'layout list', 'layout switch', 'pane list', 'pane layout', 'pane focus', 'pane symbol', 'pine new', 'pine open', 'pine list',
  'replay start', 'replay step', 'replay stop', 'replay status', 'replay autoplay', 'replay trade',
  'stream quote', 'stream bars', 'stream values', 'stream lines', 'stream labels', 'stream tables', 'stream ohlcv', 'stream all',
  'tab list', 'tab new', 'tab close', 'tab switch', 'ui click', 'ui keyboard', 'ui hover', 'ui scroll', 'ui find', 'ui eval', 'ui type', 'ui panel', 'ui fullscreen', 'ui mouse',
  'watchlist get', 'watchlist add', 'watchlist add-bulk', 'watchlist remove']);
export function commandScope(command) {
  if (WORKSPACE_COMMANDS.has(command)) return 'workspace';
  if (OFFLINE_COMMANDS.has(command)) return 'offline';
  if (LEGACY_COMMANDS.has(command)) return 'legacy';
  throw new Error(`Unclassified CLI command: ${command}`);
}

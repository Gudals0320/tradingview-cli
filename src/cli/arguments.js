import { requireFinite, requireInteger } from '../connection.js';
import { alertCondition } from '../core/alerts.js';

// A command without an entry accepts no positional arguments.
export const POSITIONALS = new Map([
  ['quote', [0, 1]], ['symbol', [0, 1]], ['timeframe', [0, 1]], ['type', [0, 1]],
  ['search', [1, Infinity]], ['scroll', [1, 1]], ['data indicator', [1, 1]],
  ['indicator add', [1, Infinity]], ['indicator remove', [1, 1]],
  ['indicator toggle', [1, 1]], ['indicator set', [1, 1]], ['indicator get', [1, 1]],
  ['layout switch', [1, Infinity]], ['pane layout', [1, 1]], ['pane focus', [1, 1]],
  ['pane symbol', [2, 2]], ['pine new', [0, 1]], ['pine open', [1, Infinity]],
  ['tab switch', [1, 1]], ['draw get', [1, 1]], ['draw remove', [1, 1]],
  ['replay trade', [1, 1]], ['stream ohlcv', [1, Infinity]],
  ['watchlist add', [1, 1]], ['watchlist add-bulk', [1, Infinity]], ['watchlist remove', [1, Infinity]],
  ['ui keyboard', [1, 1]], ['ui scroll', [0, 1]], ['ui find', [1, Infinity]],
  ['ui eval', [1, Infinity]], ['ui type', [1, Infinity]], ['ui panel', [1, 2]], ['ui mouse', [2, 2]],
]);

export function validateArguments(command, values, positionals) {
  const [min, max] = POSITIONALS.get(command) || [0, 0];
  if (positionals.length < min || positionals.length > max) {
    throw new Error(`${command} accepts ${min === max ? min : `${min} to ${max}`} positional arguments; received ${positionals.length}.`);
  }
  if (positionals.some(value => !value.trim())) throw new Error(`${command} positional arguments must not be empty.`);
  for (const name of ['expect-script-id', 'file', 'target', 'layout', 'pine', 'name']) {
    if (values[name] !== undefined && !values[name].trim()) throw new Error(`--${name} must not be empty.`);
  }
  if (command === 'indicator toggle' && values.visible && values.hidden) throw new Error('Choose --visible or --hidden, not both.');
  for (const name of ['count', 'max', 'limit', 'offset', 'interval', 'timeout', 'port', 'speed']) {
    if (values[name] === undefined) continue;
    const low = name === 'offset' ? 0 : name === 'interval' ? 100 : 1;
    const high = name === 'port' ? 65535 : ['count', 'limit'].includes(name) ? 500 : Number.MAX_SAFE_INTEGER;
    requireInteger(values[name], `--${name}`, low, high);
  }
  for (const name of ['price', 'price2', 'time', 'time2', 'from', 'to', 'amount']) {
    if (values[name] !== undefined) requireFinite(values[name], `--${name}`);
  }
  if (command === 'range' && ((values.from === undefined) !== (values.to === undefined))) {
    throw new Error('range requires both --from and --to.');
  }
  if (['indicator set', 'indicator add'].includes(command) && values.inputs !== undefined) {
    const inputs = JSON.parse(values.inputs);
    if (!inputs || Array.isArray(inputs) || typeof inputs !== 'object' || !Object.keys(inputs).length) {
      throw new Error('--inputs must be a non-empty JSON object.');
    }
  }
  if (['pane focus', 'pane symbol', 'tab switch'].includes(command)) requireInteger(positionals[0], 'index', 0);
  if (command === 'ui mouse') positionals.forEach(value => requireFinite(value, 'coordinate'));
  if (command === 'alert create') {
    requireFinite(values.price, '--price');
    alertCondition(values.condition);
  }
}

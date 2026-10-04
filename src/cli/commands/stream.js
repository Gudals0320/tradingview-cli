import { register } from '../router.js';
import * as core from '../../core/stream.js';

// Streams return without a result so router cleanup runs without an extra JSONL record.

register('stream', {
  description: 'Monitor your local TradingView chart for changes (JSONL output)',
  subcommands: new Map([
    ['quote', {
      description: 'Stream real-time price ticks (OHLCV per bar)',
      options: {
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 300)' },
      },
      handler: async (opts) => {
        await core.streamQuote({ interval: opts.interval ? Number(opts.interval) : undefined });
        return; // unreachable unless stopped
      },
    }],
    ['bars', {
      description: 'Stream last bar updates (emits on new bar or price change)',
      options: {
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 500)' },
      },
      handler: async (opts) => {
        await core.streamBars({ interval: opts.interval ? Number(opts.interval) : undefined });
        return;
      },
    }],
    ['values', {
      description: 'Stream indicator values (RSI, MACD, etc.)',
      options: {
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 500)' },
      },
      handler: async (opts) => {
        await core.streamValues({ interval: opts.interval ? Number(opts.interval) : undefined });
        return;
      },
    }],
    ['lines', {
      description: 'Stream Pine Script line.new() price levels',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name' },
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 1000)' },
      },
      handler: async (opts) => {
        await core.streamLines({ interval: opts.interval ? Number(opts.interval) : undefined, filter: opts.filter });
        return;
      },
    }],
    ['labels', {
      description: 'Stream Pine Script label.new() annotations',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name' },
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 1000)' },
      },
      handler: async (opts) => {
        await core.streamLabels({ interval: opts.interval ? Number(opts.interval) : undefined, filter: opts.filter });
        return;
      },
    }],
    ['tables', {
      description: 'Stream Pine Script table.new() data',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name' },
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 2000)' },
      },
      handler: async (opts) => {
        await core.streamTables({ interval: opts.interval ? Number(opts.interval) : undefined, filter: opts.filter });
        return;
      },
    }],
    ['ohlcv', {
      description: 'Observe owned SYMBOL@TIMEFRAME panes as JSONL until interrupted; feed failures keep polling, success only when all feeds are ok; partial_success preserves healthy feeds, failed feeds have status/code without stale OHLCV',
      options: {
        'allow-reassign-target': { type: 'string', multiple: true, description: 'Explicit target IDs whose existing panes may be reassigned' },
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 250, minimum 100)' },
      },
      handler: async (opts, positionals) => {
        if(opts['allow-reassign-target']?.length)throw Object.assign(new Error('Cross-target reassignment is removed. Select dedicated workspaces and prepare their panes explicitly.'),{code:'WORKSPACE_TARGET_MISMATCH'});
        await core.streamOwnedFeeds({ feedSpecs: positionals, interval: opts.interval });
        return;
      },
    }],
    ['all', {
      description: 'Stream all panes at once (multi-symbol monitoring)',
      options: {
        interval: { type: 'string', short: 'i', description: 'Poll interval in ms (default 500)' },
      },
      handler: async (opts) => {
        await core.streamAllPanes({ interval: opts.interval ? Number(opts.interval) : undefined });
        return;
      },
    }],
  ]),
});

import { register } from '../router.js';
import * as core from '../../core/data.js';

register('quote', {
  description: 'Get latest chart bar snapshot; current DOM bid/ask fields are experimental',
  handler: (opts, positionals) => core.getQuote({ symbol: positionals[0] }),
});

register('ohlcv', {
  description: 'Get latest loaded OHLCV bars, with truncation and insufficient-history flags',
  options: {
    count: { type: 'string', short: 'n', description: 'Number of bars (default 100, max 500)' },
    summary: { type: 'boolean', short: 's', description: 'Return summary stats instead of all bars' },
  },
  handler: (opts) => core.getOhlcv({
    count: opts.count ? Number(opts.count) : undefined,
    summary: opts.summary,
  }),
});

register('values', {
  description: 'Get current indicator values from data window',
  handler: () => core.getStudyValues(),
});

register('data', {
  description: 'Advanced data tools (lines, labels, tables, boxes, strategy, trades, equity, depth)',
  subcommands: new Map([
    ['lines', {
      description: 'Get Pine Script line.new() price levels',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name substring' },
        verbose: { type: 'boolean', short: 'v', description: 'Include raw line data' },
      },
      handler: (opts) => core.getPineLines({ study_filter: opts.filter, verbose: opts.verbose }),
    }],
    ['labels', {
      description: 'Get Pine Script label.new() annotations',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name substring' },
        max: { type: 'string', short: 'n', description: 'Max labels per study (default 50)' },
        verbose: { type: 'boolean', short: 'v', description: 'Include raw label data' },
      },
      handler: (opts) => core.getPineLabels({ study_filter: opts.filter, max_labels: opts.max ? Number(opts.max) : undefined, verbose: opts.verbose }),
    }],
    ['tables', {
      description: 'Get Pine Script table.new() data',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name substring' },
      },
      handler: (opts) => core.getPineTables({ study_filter: opts.filter }),
    }],
    ['boxes', {
      description: 'Get Pine Script box.new() price zones',
      options: {
        filter: { type: 'string', short: 'f', description: 'Filter by study name substring' },
        verbose: { type: 'boolean', short: 'v', description: 'Include raw box data' },
      },
      handler: (opts) => core.getPineBoxes({ study_filter: opts.filter, verbose: opts.verbose }),
    }],
    ['strategy', {
      description: 'Get verified owned Strategy Tester metrics; dead owners require explicit recovery and absent strategy IDs fail without waiting',
      options: { 'strategy-id': { type: 'string', description: 'Exact current-session strategy study ID' } },
      handler: (opts) => core.getStrategyResults({ strategy_id: opts['strategy-id'] }),
    }],
    ['trades', {
      description: 'Get verified owned backtest order events; dead owner and absent/foreign strategy IDs cannot be adopted',
      options: {
        max: { type: 'string', short: 'n', description: 'Requested order count (default 20, capped at 20)' },
        'strategy-id': { type: 'string', description: 'Exact current-session strategy study ID' },
      },
      handler: (opts) => core.getTrades({ max_trades: opts.max ? Number(opts.max) : undefined, strategy_id: opts['strategy-id'] }),
    }],
    ['ledger', {
      description: 'Get verified owned closed/open ledger; preserve revision across pages, reconcile dead owners and refresh absent strategy IDs',
      options: {
        offset: { type: 'string', description: 'First trade ordinal (default 0)' },
        limit: { type: 'string', description: 'Page size (default 100, max 500)' },
        'strategy-id': { type: 'string', description: 'Exact current-session strategy study ID' },
        'report-revision': { type: 'string', description: 'Revision from first page; reject changed reports with REPORT_CHANGED' },
      },
      handler: (opts) => core.getTradeLedger({ offset: Number(opts.offset || 0), limit: Number(opts.limit || 100), strategy_id: opts['strategy-id'], report_revision: opts['report-revision'] }),
    }],
    ['equity', {
      description: 'Collect finite pages from an explicit verified native strategy.equity plot; direct expression and native PnL checks required',
      options: { 'strategy-id': { type: 'string', description: 'Exact current-session strategy study ID' },'plot-id':{type:'string',description:'Explicit plot_N for an existing direct plot(strategy.equity); no source injection'},offset:{type:'string',description:'First loaded bar ordinal (default 0)'},limit:{type:'string',description:'Page size 1..500 (default 100)'},'report-revision':{type:'string',description:'Equity revision from the first page'},mode:{type:'string',description:'normal only; Deep is explicitly unsupported'},'list-plots':{type:'boolean',description:'List exact native plot IDs and auxiliary source candidates; no curve values'},export:{type:'string',description:'Export the full validated loaded snapshot as CSV to a new file after ownership verification'} },
      handler: (opts) => core.getEquity({ strategy_id: opts['strategy-id'],plot_id:opts['plot-id'],offset:Number(opts.offset||0),limit:Number(opts.limit||100),report_revision:opts['report-revision'],mode:opts.mode||'normal',list_plots:opts['list-plots'],export_all:Boolean(opts.export) }),
    }],
    ['depth', {
      description: 'Experimental current DOM/depth panel snapshot; no historical order book',
      handler: () => core.getDepth(),
    }],
    ['indicator', {
      description: 'Get indicator info and inputs by entity ID',
      handler: (opts, positionals) => {
        if (!positionals[0]) throw new Error('Entity ID required. Usage: tv data indicator eFu1Ot');
        return core.getIndicator({ entity_id: positionals[0] });
      },
    }],
  ]),
});


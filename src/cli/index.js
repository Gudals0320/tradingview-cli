#!/usr/bin/env node

/**
 * tv — CLI for TradingView Desktop via Chrome DevTools Protocol.
 * Outputs JSON to stdout. Errors to stderr.
 * Exit codes: 0 success, 1 error, 2 connection failure.
 *
 * Pipe-friendly: every command outputs JSON for use with jq.
 */

// Import failures (including invalid environment configuration) use the same
// structured error contract as command failures.
try {
  if (process.argv.length === 3 && ['--version', '-V'].includes(process.argv[2])) {
    const { readFileSync } = await import('node:fs');
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    console.log(version);
  } else {
    for (const name of ['health', 'chart', 'data', 'pine', 'capture', 'replay', 'drawing',
      'alerts', 'watchlist', 'layout', 'indicator', 'ui', 'pane', 'tab', 'stream', 'session', 'workspace', 'strategy','backtest', 'help']) {
      await import(`./commands/${name}.js`);
    }
    const { run } = await import('./router.js');
    await run(process.argv);
  }
} catch (error) {
  console.error(JSON.stringify({ success: false, code: error.code || 'CLI_INITIALIZATION', error: error.message }));
  process.exitCode = 1;
}

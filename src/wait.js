import { evaluate } from './connection.js';
import { readChartContext, normalizeTimeframe, symbolMatches } from './chart-context.js';

const DEFAULT_TIMEOUT = 10000;
const POLL_INTERVAL = 200;

export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT, _deps = {}) {
  const inspect = _deps.evaluate || evaluate;
  const sleep = _deps.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = _deps.now || Date.now;
  const start = now(); let signature = null, stable = 0, last = null;
  while (now() - start < timeout) {
    last = await inspect(`(${readChartContext.toString()})(window)`);
    if (last?.feed_error) throw new Error(`Chart feed failed: ${last.feed_error}`);
    if (last && !last.loading && last.bar_count === 0 && (!expectedSymbol || last.symbol === expectedSymbol)) {
      throw new Error(`No chart bars are available for ${expectedSymbol || last.symbol}.`);
    }
    const ready = last && !last.loading && last.bar_count > 0 && symbolMatches(expectedSymbol, last)
      && (!expectedTf || normalizeTimeframe(last.resolution) === normalizeTimeframe(expectedTf));
    if (ready) {
      const next = [last.symbol, last.resolution, last.bar_count, last.last_bar_time].join('|');
      if (next === signature) stable++; else { signature = next; stable = 0; }
      if (stable >= 2) return true;
    } else { stable = 0; signature = null; }
    await sleep(POLL_INTERVAL);
  }
  return false;
}

/**
 * Wait for the chart to finish (re)rendering — used before screenshots so a
 * capture right after chart_set_symbol / chart_set_timeframe doesn't grab a
 * stale frame (issue #144). Waits for any loading spinner to clear, then for
 * the symbol/resolution/canvas signature to hold stable across 3 polls.
 */
export async function waitForChartRender(timeout = 5000) {
  const start = Date.now();
  let lastSignature = null;
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        var canvas = document.querySelector('[data-name="pane-canvas"] canvas')
          || document.querySelector('[data-name="pane-canvas"]')
          || document.querySelector('canvas');
        var rect = canvas ? canvas.getBoundingClientRect() : null;
        var symbol = '', resolution = '';
        try {
          var chart = window.TradingViewApi._activeChartWidgetWV.value();
          symbol = chart.symbol();
          resolution = chart.resolution();
        } catch(e) {}
        var spinner = document.querySelector('[class*="loader"]')
          || document.querySelector('[class*="loading"]')
          || document.querySelector('[data-name="loading"]');
        return {
          symbol: symbol,
          resolution: resolution,
          isLoading: !!(spinner && spinner.offsetParent !== null),
          canvasWidth: rect ? Math.round(rect.width) : 0,
          canvasHeight: rect ? Math.round(rect.height) : 0
        };
      })()
    `);

    if (!state || state.isLoading || !state.canvasWidth || !state.canvasHeight) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    const signature = [state.symbol, state.resolution, state.canvasWidth, state.canvasHeight].join('|');
    if (signature === lastSignature) stableCount++;
    else { stableCount = 0; lastSignature = signature; }

    if (stableCount >= 3) return true;
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  return false;
}

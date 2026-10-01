// S01 setup workaround: inspect/restore the TradingView Desktop window state via CDP Browser domain.
// Usage: node qa/pine/scenarios/s01-mtf-trend/window-state.mjs TARGET_ID [restore]
import CDP from 'chrome-remote-interface';
const [target, action] = process.argv.slice(2);
const browser = await CDP({ host: '127.0.0.1', port: 9222, target: (await (await fetch('http://127.0.0.1:9222/json/version')).json()).webSocketDebuggerUrl });
try {
  const { windowId, bounds } = await browser.Browser.getWindowForTarget({ targetId: target });
  const out = { windowId, before: bounds };
  if (action === 'restore') {
    if (bounds.windowState === 'minimized') await browser.Browser.setWindowBounds({ windowId, bounds: { windowState: 'normal' } });
    await new Promise(r => setTimeout(r, 1500));
    out.after = (await browser.Browser.getWindowBounds({ windowId })).bounds;
  }
  console.log(JSON.stringify(out));
} finally { await browser.close(); }


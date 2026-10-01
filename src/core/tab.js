/**
 * Core tab management logic.
 *
 * TradingView Desktop's tab bar lives in a separate Electron shell window
 * (app/window/index.html), not in the chart pages themselves. CDP-level
 * activation (/json/activate) and synthesized Ctrl+T/Ctrl+W key events do
 * not drive it (Electron accelerators don't fire from CDP input), so tab
 * switching/creation/closing click the shell window's DOM directly:
 * `.tabs-container .tab`, its close button, and `create-new-tab-button`.
 * (Approach from issue #155 and PR #163, verified on Desktop 3.1.0.)
 */
import CDP from '../cdp.js';
import { getDesktopInventory, inspectTarget, bindShellTab, readShellState } from '../desktop.js';
import { isLandingTarget, clickNewTabButton, landingTabResult } from './desktop-dom.js';
import { getClient, getTargetInfo, reconnectTo, CDP_HOST, CDP_PORT, configuredTarget } from '../connection.js';
import { assertSessionAccess, nativeCheckpoint } from '../session.js';

/**
 * List all open chart tabs (CDP page targets).
 */
export async function list() {
  const inventory = await getDesktopInventory();
  return { success: true, tab_count: inventory.tabs.length, tabs: inventory.tabs };
}

/**
 * Run fn with a CDP client attached to the Electron shell window that owns
 * the tab bar. There can be several app/window/index.html targets; the shell
 * is the one whose DOM actually contains `.tabs-container .tab`.
 */
async function withShell(fn) {
  assertSessionAccess();
  const inventory = await getDesktopInventory();
  let candidates = inventory.shells;
  if (candidates.length > 1) {
    const target = await getTargetInfo();
    const tab = inventory.tabs.find(item => item.id === target.id);
    candidates = candidates.filter(shell => shell.id === tab?.shell_target_id);
  }
  if (candidates.length !== 1) throw new Error('Desktop shell window is unavailable or ambiguous; select an explicit --target.');
  const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: candidates[0].id });
  try {
    return await fn(async (expression, { mutation = false } = {}) => {
      if (mutation) nativeCheckpoint(null, configuredTarget() || inventory.tabs.find(tab => tab.active)?.id);
      const result = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Shell operation failed');
      return result.result?.value;
    });
  } finally { await client.close(); }
}

/** Find an open new-tab landing page target (shows the layout picker). */
async function findLandingTarget() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`, { signal: globalThis.AbortSignal.timeout(15000) });
  const targets = await resp.json();
  return targets.find(isLandingTarget) || null;
}

export async function waitForLandingTarget(
  find = findLandingTarget,
  { attempts = 60, interval = 500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const target = await find();
    if (target) return target;
    if (attempt < attempts - 1) await sleep(interval);
  }
  return null;
}

/** Run fn with an eval helper attached to a specific target. */
async function withTarget(targetId, fn) {
  let c = null;
  try {
    c = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
    return await fn(async (expression, { mutation = false } = {}) => {
      if (mutation) nativeCheckpoint(null, targetId);
      const response = await c.Runtime.evaluate({ expression, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Target evaluation failed');
      return response.result?.value;
    });
  } finally {
    try { if (c) await c.close(); } catch { /* already gone */ }
  }
}

/**
 * Open a new chart tab by clicking the shell window's new-tab button.
 * With `layout`, also picks from the landing page's layout list:
 *   layout: 'new'    -> click "Create new layout" (blank chart, saved as Unnamed)
 *   layout: '<name>' -> open the saved layout whose title contains <name>
 * Reuses an already-open landing tab instead of opening another one.
 */
export async function newTab({ layout, name, reconnect = true } = {}) {
  let landing = await findLandingTarget();
  if (!landing) {
    await withShell(async (evalIn) => {
      const clicked = await evalIn(`(${clickNewTabButton.toString()})(document)`, { mutation: true });
      if (!clicked) throw new Error('New-tab button not found in shell window.');
      await new Promise(r => setTimeout(r, 1500));
    });
    landing = await waitForLandingTarget();
  }
  if (!layout) return landingTabResult(await list(), landing);

  if (!landing) throw new Error('New tab opened but its landing page target was not found.');

  // Snapshot existing chart targets so we can spot the one the pick creates.
  const beforeResp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`, { signal: globalThis.AbortSignal.timeout(15000) });
  const chartIdsBefore = new Set(
    (await beforeResp.json())
      .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
      .map(t => t.id)
  );

  const wantNew = String(layout).trim().toLowerCase() === 'new';
  const layoutName = name || 'New layout';
  const picked = await withTarget(landing.id, async (evalIn) => {
    if (wantNew) {
      // "Create new layout" opens a naming dialog; the Create button stays
      // disabled until the name input is filled (React controlled input, so
      // the native value setter + input event are required).
      await evalIn(`(function(){ var b = document.querySelector('.create-new-layout-button'); if (b) b.click(); })()`, { mutation: true });
      for (let wait = 0; wait < 30; wait++) {
        const ready = await evalIn(`Boolean(document.querySelector('input[placeholder="My layout"], input[placeholder="나의 레이아웃"]'))`);
        if (ready) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const filled = await evalIn(`
        (function() {
          // The dialog's name field (not the landing page's Search box).
          var inp = document.querySelector('input[placeholder="My layout"], input[placeholder="나의 레이아웃"]');
          if (!inp) {
            var dlg = document.querySelector('[class*="dialog"], [role="dialog"]');
            if (dlg) inp = dlg.querySelector('input');
          }
          if (!inp) return 'no-dialog-input';
          var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(inp, ${JSON.stringify(name || 'New layout')});
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return 'filled';
        })()
      `);
      if (filled !== 'filled') throw new Error(`Create-layout dialog did not open as expected (${filled}).`);
      await new Promise(r => setTimeout(r, 400));
      const created = await evalIn(`
        (function() {
          var scope = document.querySelector('[class*="dialog"], [role="dialog"]') || document;
          var btns = scope.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            var t = (btns[i].innerText || btns[i].textContent || '').trim().toLowerCase();
            if ((t === 'create' || t === '만들기') && !btns[i].disabled) { btns[i].click(); return true; }
          }
          return false;
        })()
      `, { mutation: true });
      if (!created) throw new Error('Create button not found or still disabled in the layout dialog.');
      return layoutName;
    }
    const clickByTitle = `
      (function() {
        var q = ${JSON.stringify(String(layout).toLowerCase())};
        var items = document.querySelectorAll('.layout-list-item');
        var rows = Array.from(items).map(item => ({ item, title: item.querySelector('.layout-list-item-title')?.textContent.trim() || '' }));
        var exact = rows.filter(row => row.title.toLowerCase() === q);
        var matches = exact.length ? exact : rows.filter(row => row.title.toLowerCase().includes(q));
        if (matches.length > 1) throw new Error('Ambiguous layout name: ' + q + '. Use the exact unique name.');
        if (matches.length === 1) { matches[0].item.click(); return matches[0].title; }
        return null;
      })()
    `;
    let foundTitle = await evalIn(clickByTitle, { mutation: true });
    if (!foundTitle) {
      // Not in the recents — expand the full layout list and retry.
      await evalIn(`(function(){ var b = document.querySelector('.layout-list-expand-button'); if (b) b.click(); })()`, { mutation: true });
      await new Promise(r => setTimeout(r, 800));
      foundTitle = await evalIn(clickByTitle, { mutation: true });
    }
    return foundTitle;
  });

  if (!picked) throw new Error(`Layout matching "${layout}" not found in the layout list.`);

  // The chart loads under a NEW CDP target: the file:// landing -> https://
  // chart navigation swaps renderer processes, so the target id changes.
  // Wait for a chart target that wasn't there before the pick.
  let chartTarget = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`, { signal: globalThis.AbortSignal.timeout(15000) });
    const targets = await resp.json();
    chartTarget = targets.find(x =>
      x.type === 'page' && /tradingview\.com\/chart/i.test(x.url) && !chartIdsBefore.has(x.id)
    ) || targets.find(x => x.id === landing.id && /tradingview\.com\/chart/i.test(x.url)) || null;
    if (chartTarget) break;
  }
  if (!chartTarget) throw new Error(`Picked "${picked}" but no new chart target appeared.`);

  // Give the chart a moment to boot, then follow it.
  await new Promise(r => setTimeout(r, 2000));
  let resolved;
  for (let attempt = 0; attempt < 30; attempt++) {
    const inventory = await getDesktopInventory();
    resolved = inventory.tabs.find(tab => tab.id === chartTarget.id);
    if (resolved?.resolved) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!resolved?.resolved) throw new Error('Layout opened, but its Desktop tab identity is not ready. Inspect tab list before retrying.');
  await bindShellTab(chartTarget.id, resolved.shell_tab_id);
  if (reconnect) await reconnectTo(chartTarget.id);
  return {
    success: true,
    action: wantNew ? 'new_layout_created' : 'layout_opened_in_new_tab',
    layout: picked,
    chart_id: chartTarget.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
  };
}

/**
 * Close the currently active tab by clicking its close button in the shell.
 */
export async function closeTab() {
  const initialTargets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  const before = await withShell((evalIn) => evalIn(`document.querySelectorAll('.tabs-container .tab').length`));
  if (before <= 1) {
    throw new Error('Cannot close the last tab. Use `tv launch` to restart TradingView instead.');
  }

  const result = await withShell(async (evalIn) => {
    const clicked = await evalIn(`
      (function() {
        var active = document.querySelector('.tabs-container .tab.active');
        if (!active) return false;
        // The close container div has no handler — the real clickable is the button inside it.
        var close = active.querySelector('[class*="close"] button') || active.querySelector('button[class*="close"]') || active.querySelector('[class*="close"]');
        if (!close) return false;
        close.click();
        return true;
      })()
    `, { mutation: true });
    if (!clicked) throw new Error('Close button not found on the active tab.');
    await new Promise(r => setTimeout(r, 1000));
    return evalIn(`document.querySelectorAll('.tabs-container .tab').length`);
  });

  // Our cached CDP client may have been attached to the closed tab — re-resolve.
  try { await getClient(); } catch { /* next tool call will reconnect */ }

  const success = result < before;
  let confirmationRequired = false;
  let dialogDismissed = false;
  if (!success) {
    const targets = await CDP.List({host:CDP_HOST,port:CDP_PORT});
    const dialogs = targets.filter(target => /dialog-window/.test(target.url || '') && !initialTargets.some(old => old.id === target.id));
    for (const target of dialogs) {
      const ownedCloseDialog = await inspectTarget(target, `(() => {
        const text=document.body.innerText;
        if(!/탭을 닫|close (this )?tab/i.test(text)) return false;
        const close=[...document.querySelectorAll('button')].find(button=>button.innerText.trim()==='close-dialog-window');
        if(close){close.click();return true;} return false;
      })()`);
      if (ownedCloseDialog) { confirmationRequired = true; dialogDismissed = true; }
    }
    if (!confirmationRequired) confirmationRequired = targets.some(target => /dialog-window/.test(target.url || ''));
  }
  return { success, action: success ? 'tab_closed' : 'tab_close_pending', tabs_before: before, tabs_after: result,
    ...(!success && { confirmation_required: confirmationRequired, dialog_dismissed: dialogDismissed,
      error: confirmationRequired ? 'Desktop requires a save/discard decision; no changes were discarded.' : 'The tab did not close.' }) };
}

/**
 * Switch to a chart tab by index (from tab_list). Clicks the corresponding
 * tab in the shell window so the switch is visible, verifies the desired
 * chart target actually became visible, then re-attaches the CDP client so
 * subsequent reads follow it.
 */
export async function switchTab({ index, target_id, _deps } = {}) {
  const inventory = await (_deps?.inventory || getDesktopInventory)();
  const idx = target_id ? inventory.tabs.findIndex(tab => tab.id === target_id) : Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= inventory.tabs.length) throw new Error('Tab index/target is out of range.');
  const target = inventory.tabs[idx];
  if (!target.resolved || !target.id) throw new Error('Tab target is ambiguous; close duplicate layouts or select a resolved target.');
  const inspect = _deps?.inspect || inspectTarget;
  const reconnect = _deps?.reconnect || reconnectTo;
  const sleep = _deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  if (target.shell_target_id) {
    const clicked = await inspect({ id: target.shell_target_id }, `(() => {
      const tab = document.getElementById(${JSON.stringify(target.shell_tab_id)});
      if (!tab || !tab.classList.contains('tab')) return false;
      tab.click(); return true;
    })()`);
    if (!clicked) throw new Error('The selected shell tab disappeared.');
    let shell;
    for (let attempt = 0; attempt < 20; attempt++) {
      shell = await inspect({ id: target.shell_target_id }, `(${readShellState.toString()})(document, window)`);
      if (shell?.tabs.find(tab => tab.shell_tab_id === target.shell_tab_id)?.active) break;
      if (attempt === 19) throw new Error('Desktop did not select the requested tab.');
      await sleep(100);
    }
    await (_deps?.bind || bindShellTab)(target.id, target.shell_tab_id);
    await reconnect(target.id);
    return { success: true, action: 'switched', index: idx, tab_id: target.id,
      shell_tab_id: target.shell_tab_id, chart_id: target.chart_id, shell_active_verified: true,
      visually_switched: shell.visibility === 'visible' };
  }
  throw new Error('Desktop shell is not available; use --target for browser-only CDP sessions.');
}

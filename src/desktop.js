import CDP from 'chrome-remote-interface';
import { CDP_HOST, CDP_PORT } from './config.js';
import { assertSessionAccess, currentWorkspaceSession } from './session.js';

/** These functions are serialized and executed without captured Node variables. */
export function readShellState(document, window) {
  const nodes = Array.from(document.querySelectorAll('.tabs-container .tab'));
  if (!nodes.length) return null;
  const rows = nodes.map((node) => {
    let fiber = node[Object.keys(node).find((key) => key.startsWith('__reactFiber$'))];
    let title = null, chart = null;
    for (let depth = 0; depth < 20 && fiber; depth++, fiber = fiber.return) {
      for (const branch of [fiber, fiber.alternate]) {
        const instance = branch?.stateNode;
        if (!title && instance?.state?.title) title = instance.state.title;
        if (chart === null && typeof branch?.memoizedProps?.isChart === 'boolean') chart = branch.memoizedProps.isChart;
      }
    }
    return { shell_tab_id: node.id, active: node.classList.contains('active'),
      layout_name: title?.name || node.querySelector('.layout-name')?.textContent?.trim() || null,
      is_chart: chart };
  });
  return { window_id: window.initialRemoteServiceInstanceId || null,
    visibility: document.visibilityState, tabs: rows };
}

export function readPageIdentity(document, window) {
  const button = document.querySelector('[data-qa-id="save-load-button"]');
  let tabId = window.__tvCliShellTabId || null;
  try { tabId ||= JSON.parse(new URL(window.location.href).searchParams.get('rendererInitialData') || '{}').tabId || null; } catch { /* ordinary chart */ }
  return { window_id: window.remoteServiceInstanceId || null, shell_tab_id: tabId,
    layout_name: (button?.innerText || '').split('\n')[0].trim() || (/\/new-tab\/index\.html/.test(window.location.href) ? document.title : null) };
}

export function resolveInventory(targets, shells, identities) {
  const pages = targets.filter((target) => target.type === 'page' && /tradingview\.com\/chart|\/new-tab\/index\.html/.test(target.url || ''));
  const identity = (id) => identities[id] || {};
  const nativeIds = new Set(shells.flatMap(shell => shell.state.tabs.map(tab => tab.shell_tab_id)));
  const bound = new Set(pages.filter((page) => nativeIds.has(identity(page.id).shell_tab_id)).map((page) => page.id));
  const tabs = [];
  for (const shell of shells) {
    for (const native of shell.state.tabs) {
      const direct = pages.filter((page) => identity(page.id).shell_tab_id === native.shell_tab_id);
      let candidates = direct;
      if (!direct.length) candidates = pages.filter((page) => !bound.has(page.id)
        && (identity(page.id).window_id === shell.state.window_id || (!identity(page.id).window_id && shells.length === 1))
        && native.layout_name && identity(page.id).layout_name === native.layout_name);
      const duplicate = !direct.length && shell.state.tabs.filter((row) => row.layout_name === native.layout_name
        && row.is_chart !== false && !pages.some((item) => identity(item.id).shell_tab_id === row.shell_tab_id)).length > 1;
      const page = !duplicate && candidates.length === 1 ? candidates[0] : null;
      tabs.push({ id: page?.id || null, shell_tab_id: native.shell_tab_id, shell_target_id: shell.id,
        window_id: shell.state.window_id, active: native.active, resolved: Boolean(page),
        title: page?.title || native.layout_name || 'Unresolved tab', url: page?.url || null,
        chart_id: page?.url?.match(/\/chart\/([^/?]+)/)?.[1] || null,
        is_chart: page ? /tradingview\.com\/chart/.test(page.url) : Boolean(native.is_chart),
        candidates: candidates.map((candidate) => candidate.id), shell_visibility: shell.state.visibility });
    }
  }
  if (!shells.length) for (const page of pages) tabs.push({ ...page, active: pages.length === 1, resolved: true,
    shell_tab_id: null, shell_target_id: null, chart_id: page.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
    is_chart: /tradingview\.com\/chart/.test(page.url) });
  return tabs.map((tab, index) => ({ ...tab, index }));
}

export async function inspectTarget(target, expression, { _deps } = {}) {
  if (!_deps) assertSessionAccess();
  if (!_deps && currentWorkspaceSession()) { const error = new Error('Workspace operations cannot inspect or control Desktop shell/other targets.'); error.code = 'WORKSPACE_COMMAND_UNSUPPORTED'; throw error; }
  const create = _deps?.createClient || CDP;
  const client = await create({ host: CDP_HOST, port: CDP_PORT, target: target.id });
  try {
    const result = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Desktop inspection failed');
    return result.result?.value;
  } finally { await client.close(); }
}

export async function getDesktopInventory({ _deps } = {}) {
  const targets = _deps?.targets || await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  const inspect = _deps?.inspect || inspectTarget;
  const shells = [], identities = {};
  for (const target of targets.filter((item) => item.type === 'page' && /\/window\/index\.html/.test(item.url || ''))) {
    const state = await inspect(target, `(${readShellState.toString()})(document, window)`);
    if (state) shells.push({ id: target.id, state });
  }
  for (const target of targets.filter((item) => item.type === 'page' && /tradingview\.com\/chart|\/new-tab\/index\.html/.test(item.url || ''))) {
    identities[target.id] = await inspect(target, `(${readPageIdentity.toString()})(document, window)`);
  }
  return { targets, shells, tabs: resolveInventory(targets, shells, identities) };
}

export function activeTarget(inventory) {
  const active = inventory.tabs.filter((tab) => tab.active);
  if (active.length !== 1 || !active[0].resolved || !active[0].is_chart) {
    const error = new Error('Active Desktop chart is unavailable or ambiguous. Close duplicate layouts or use an explicit --target ID.');
    error.code = 'TARGET_AMBIGUOUS';
    throw error;
  }
  return inventory.targets.find((target) => target.id === active[0].id);
}

export async function bindShellTab(targetId, shellTabId) {
  await inspectTarget({ id: targetId }, `window.__tvCliShellTabId = ${JSON.stringify(shellTabId)}`);
}

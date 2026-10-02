import CDP from './cdp.js';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireSession } from './session.js';
import { findPineController } from './core/desktop-dom.js';
import { LAYOUT_PAGE_CODE, layoutOperationDetails } from './layout-state.js';
import { readChartContext } from './chart-context.js';

export async function verifyStableRebind(probe, { samples=5, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)), interval=200 }={}) {
  let signature=null,last;
  for(let index=0;index<samples;index++) {
    last=await probe();
    const current=JSON.stringify([last.loader_id,last.layout_id]);
    if(!last.ready||!last.loader_id||!last.layout_id||last.layout_id==='undefined'
      ||last.chart_same!==true||last.controller_same!==true||(signature&&current!==signature))return {ready:false,details:last,unstable:true};
    signature=current;
    if(index<samples-1)await sleep(interval);
  }
  return {ready:true,details:last};
}

// Serialized with the DOM/layout helpers. Inactive panes are native resources too.
export function sessionPageQuiescence(window, document, expectedGeneration, expectedPanes) {
  const controller = findPineController(document);
  const requests = Object.keys(controller?._editorStore?.getStore?.().getState()?.ui?.pendingRequests || {});
  const compile = window.__tvCliPineCompile, save = window.__tvCliSave;
  const registry = Object.entries(window.__tvCliNativeOperations || {}).filter(([, op]) => op.pending).map(([token]) => token);
  const collection = window.TradingViewApi?._chartWidgetCollection;
  const panes = collection?.getAll?.();
  const loading = [], unreadable = [], calculating = [];
  if (!Array.isArray(panes) || !panes.length) unreadable.push('collection');
  if (Array.isArray(expectedPanes)) {
    for (const index of expectedPanes) if (!Number.isInteger(index) || index < 0 || !panes?.[index]) unreadable.push(index);
  } else if (expectedPanes !== undefined && expectedPanes !== '*') unreadable.push('recorded_panes');
  for (const [index, pane] of (Array.isArray(panes) ? panes : []).entries()) {
    try {
      const model = pane._chartWidget?.model?.() || pane.model?.();
      const series = model?.mainSeries?.();
      const sources = model?.model?.()?.dataSources?.();
      if (!series || typeof series.isLoading !== 'function' || !Array.isArray(sources)) { unreadable.push(index); continue; }
      let pending = series.isLoading();
      if (typeof pending?.value === 'function') pending = pending.value();
      if (typeof pending !== 'boolean') { unreadable.push(index); continue; }
      if (pending) loading.push(index);
      for (const source of sources) {
        let status = source.status?.();
        if (typeof status?.value === 'function') status = status.value();
        if (status?.type === 0 || status?.type === 1) calculating.push({ pane_index: index, id: source.id?.() });
      }
    } catch { unreadable.push(index); }
  }
  const context = readChartContext(window);
  const layout = layoutOperationDetails(window, document);
  const blockers = { compile: Boolean(compile && !compile.actionDone), save: Boolean(save?.pending), registry_tokens: registry,
    layout_switch_unverified: Boolean(layout?.pending || (expectedGeneration && window.__tvCliPageGeneration !== expectedGeneration)),
    pending_requests: requests, calculating, context_loading: !context || Boolean(context.loading), pane_loading: loading, unreadable_panes: unreadable };
  const uid = collection?.metaInfo?.uid;
  return { ready: !Object.values(blockers).some(value => Array.isArray(value) ? value.length : value), blockers,
    layout_operation: layout, layout_id: String(typeof uid?.value === 'function' ? uid.value() : uid),
    pane_count: Array.isArray(panes) ? panes.length : 0, generation: window.__tvCliPageGeneration || null };
}

export async function recoverSession({ runId, targetId, _deps } = {}) {
  const lease = (_deps?.acquireSession || acquireSession)({ recover: true, command: 'session recover' });
  const clients = [], remoteObjects = [];
  let primaryError;
  try {
    const pending = lease.pending();
    if (!runId || pending?.run_id !== runId || !pending.native_quiescence_required) {
      throw Object.assign(new Error('Pass the exact native recovery run ID. Batch journals use pine-batch --recover.'), { code: 'RUN_ID_MISMATCH' });
    }
    const target = pending.target_id || targetId;
    if (!target || (pending.target_id && targetId && pending.target_id !== targetId)) {
      throw Object.assign(new Error('Recovery requires the exact recorded target, or --target-id if dispatch did not identify it.'), { code: 'TARGET_REQUIRED' });
    }
    const targets = [...new Set([...(pending.targets || []), target])];
    const states = [];
    let invalidated = false;
    for (const id of targets) {
      try {
        const client = await (_deps?.connect || CDP)({ host: CDP_HOST, port: CDP_PORT, target: id });
        clients.push(client);
        const observedLoader = id === target ? pending.page_loader_id : null;
        const loaderId = observedLoader ? (await client.Page.getFrameTree()).frameTree?.frame?.loaderId : null;
        const pageInvalidated = Boolean(observedLoader && loaderId && loaderId !== observedLoader);
        const generation = id === target && !pageInvalidated ? pending.layout_generation : null;
        const probe = async () => {
          const result = await client.Runtime.evaluate({ returnByValue: true, expression: `(() => {
            ${LAYOUT_PAGE_CODE}; ${findPineController.toString()}; ${readChartContext.toString()};
            return (${sessionPageQuiescence.toString()})(window,document,${JSON.stringify(generation || null)},${JSON.stringify(pending.target_panes?.[id])});
          })()` });
          if (result.exceptionDetails) throw new Error('Native quiescence probe is unreadable.');
          return result.result?.value || { ready: false };
        };
        let state = await probe();
        if (pageInvalidated && !pending.layout_page_local) throw new Error('Old operation is not verified page-local; invalidation cannot prove external callbacks ended.');
        if (pageInvalidated) {
          const remote = (await client.Runtime.evaluate({ returnByValue: false, expression: `({chart:window.TradingViewApi?._activeChartWidgetWV?.value(),panes:window.TradingViewApi?._chartWidgetCollection?.getAll?.(),controller:(${findPineController.toString()})(document)})` })).result?.objectId;
          if (!remote) throw new Error('Changed generation could not be rebound safely.');
          remoteObjects.push({ client, remote });
          const stable = await verifyStableRebind(async () => {
            const current = await probe();
            const frame = (await client.Page.getFrameTree()).frameTree?.frame?.loaderId;
            const identities = await client.Runtime.callFunctionOn({ objectId: remote, returnByValue: true, functionDeclaration: `function(){const panes=window.TradingViewApi?._chartWidgetCollection?.getAll?.();return {chart_same:this.chart===window.TradingViewApi?._activeChartWidgetWV?.value()&&Array.isArray(panes)&&this.panes?.length===panes.length&&panes.every((pane,index)=>pane===this.panes[index]),controller_same:this.controller===(${findPineController.toString()})(document)}}` });
            return { ...current, ready: current.ready && frame === loaderId && !identities.exceptionDetails, loader_id: frame, ...identities.result?.value };
          });
          if (!stable.ready) throw Object.assign(new Error('Invalidated page identities are not stable.'), { details: stable });
          state = stable.details;
          invalidated = true;
        }
        states.push({ target_id: id, ...state });
        if (state.ready !== true) throw Object.assign(new Error('Native work or a pane remains pending/unreadable.'), { details: state });
      } catch (error) {
        throw Object.assign(new Error('Every recorded target and pane must be readable and quiescent; fence retained.'),
          { code: 'NATIVE_BUSY', details: { target_id: id, reason: error.message, state: error.details, verified_targets: states } });
      }
    }
    lease.release({ restored: true });
    return { success: true, recovered: true, incomplete: true, restored: false, generation_invalidated: invalidated, verified_target_count: targets.length,
      note: 'All recorded targets and panes are quiescent. The interrupted outcome remains unknown; inspect state before retrying.' };
  } catch(error) { primaryError=error; throw error; }
  finally {
    for (const {client,remote} of remoteObjects) { try { await client.Runtime.releaseObject({objectId:remote}); } catch { /* Keep state evidence. */ } }
    for (const client of clients) { try { await client.close(); } catch { /* Keep state evidence. */ } }
    try { lease.release(); } catch(error) { if(primaryError)primaryError.details={...primaryError.details,cleanup_warning:error.message}; else throw error; }
  }
}

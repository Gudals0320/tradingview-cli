import CDP from './cdp.js';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireSession, sourceHash } from './session.js';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  const loading = [], unreadable = [], calculating = [], unknownSources = [], sourceStates = [];
  if (!Array.isArray(panes) || !panes.length) unreadable.push('collection');
  if (Array.isArray(expectedPanes)) {
    for (const index of expectedPanes) if (!Number.isInteger(index) || index < 0 || !panes?.[index]) unreadable.push(index);
  } else if (expectedPanes !== undefined && expectedPanes !== '*') unreadable.push('recorded_panes');
  for (const [index, pane] of (Array.isArray(panes) ? panes : []).entries()) {
    if (Array.isArray(expectedPanes) && !expectedPanes.includes(index)) continue;
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
        const detail = { pane_index: index, id: source.id?.() };
        let status, sourceLoading, info;
        try {
          status = source.status?.(); if (typeof status?.value === 'function') status = status.value();
          sourceLoading = source.isLoading?.(); if (typeof sourceLoading?.value === 'function') sourceLoading = sourceLoading.value();
          info = source.metaInfo?.();
        } catch { unknownSources.push(detail); sourceStates.push({ ...detail, state: 'unknown', basis: 'unreadable' }); continue; }
        const pine = Boolean(info?.isTVScript || info?.isTVScriptStrategy || info?.is_strategy);
        let state, basis;
        if (pine) {
          state = sourceLoading === true || status?.type === 0 || status?.type === 1 ? 'busy' : status?.type === 2 ? 'idle' : status?.type === 3 ? 'terminal_error' : 'unknown';
          basis = 'Pine status 0/1 pending, 2 completed, 3 terminal execution error';
        } else if (sourceLoading === true) { state = 'busy'; basis = 'source isLoading'; }
        else if (info || typeof source.status === 'function' && typeof status !== 'number') {
          state = status?.type === 2 && sourceLoading !== true ? 'idle' : 'unknown';
          basis = 'auxiliary completion status; type 0/1 with false loading is unverified';
        }
        else if (sourceLoading === false) { state = 'idle'; basis = 'non-study source isLoading'; }
        else if (info || typeof source.status === 'function') { state = status?.type === 2 ? 'idle' : 'unknown'; basis = 'completion status or unknown source'; }
        else { state = 'not_applicable'; basis = 'no calculation interface'; }
        sourceStates.push({ ...detail, kind: pine ? 'pine' : 'auxiliary', state, status_type: status?.type ?? null, loading: typeof sourceLoading === 'boolean' ? sourceLoading : null, basis });
        if (state === 'busy') calculating.push(detail);
        if (state === 'unknown') unknownSources.push(detail);
      }
    } catch { unreadable.push(index); }
  }
  const context = readChartContext(window);
  const layout = layoutOperationDetails(window, document);
  const blockers = { compile: Boolean(compile && !compile.actionDone), save: Boolean(save?.pending), registry_tokens: registry,
    layout_switch_unverified: Boolean(layout?.pending || (expectedGeneration && window.__tvCliPageGeneration !== expectedGeneration)),
    pending_requests: requests, calculating, unknown_sources: unknownSources, context_loading: expectedPanes === undefined || expectedPanes === '*' ? !context || Boolean(context.loading) : false, pane_loading: loading, unreadable_panes: unreadable };
  const uid = collection?.metaInfo?.uid;
  return { ready: !Object.values(blockers).some(value => Array.isArray(value) ? value.length : value), blockers,
    layout_operation: layout, layout_id: String(typeof uid?.value === 'function' ? uid.value() : uid),
    source_states: sourceStates, pane_count: Array.isArray(panes) ? panes.length : 0, generation: window.__tvCliPageGeneration || null };
}

export function auxiliaryUnknownOnly(state) {
  const blockers = state?.blockers;
  const unknown = state?.source_states?.filter(source => source.state === 'unknown') || [];
  return Boolean(blockers?.unknown_sources?.length && !Object.entries(blockers).some(([key, value]) => key !== 'unknown_sources' && (Array.isArray(value) ? value.length : value))
    && unknown.length === blockers.unknown_sources.length && unknown.every(source => source.kind === 'auxiliary' && blockers.unknown_sources.some(item => item.id === source.id && item.pane_index === source.pane_index)));
}

export async function recoverSession({ runId, targetId, directory, acknowledgeUnknown, _deps } = {}) {
  const lease = (_deps?.acquireSession || acquireSession)({ recover: true, shared:true, command: 'session recover',...(directory?{directory}:{}) });
  const clients = [], remoteObjects = [], probes = [];
  let primaryError, validatedRunId = null;
  try {
    const pending = lease.pending();
    if (!runId || pending?.run_id !== runId || !pending.native_quiescence_required) {
      throw Object.assign(new Error('Pass the exact native recovery run ID. Batch journals use pine-batch --recover.'), { code: 'RUN_ID_MISMATCH' });
    }
    const target = pending.target_id || targetId;
    if (!target || (pending.target_id && targetId && pending.target_id !== targetId)) {
      throw Object.assign(new Error('Recovery requires the exact recorded target, or --target-id if dispatch did not identify it.'), { code: 'TARGET_REQUIRED' });
    }
    validatedRunId = pending.run_id;
    const targets = [...new Set([...(pending.targets || []), target])];
    if (!_deps?.connect || _deps?.list) {
      let inventory;
      try { inventory=await (_deps?.list||CDP.List)({host:CDP_HOST,port:CDP_PORT}); }
      catch(cause) {throw Object.assign(new Error('CDP is unreachable; recorded targets are not proven lost.'),{code:'WORKSPACE_DISCONNECTED',cause});}
      const missing=targets.filter(id=>!inventory.some(row=>row.id===id));
      if(missing.length)throw Object.assign(new Error('CDP is reachable but recorded targets are absent. Archive the exact journal using session discard --target-lost --run-id.'),{code:'RECOVERY_TARGET_LOST',details:{targets:missing,run_id:runId,target_state:'target_lost',outcome:'unknown',journal_preserved:true,confirmation_required:true,next_commands:[`tv session discard --target-lost --run-id ${runId}`],next_commands_note:'After human confirmation, archive the exact journal. Target absence does not verify server-side save/alert effects; inspect account state first.'}});
    }
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
        probes.push({ id, probe });
        if (state.ready !== true && !auxiliaryUnknownOnly(state)) throw Object.assign(new Error('Native work or a pane remains pending/unreadable.'), { details: state });
      } catch (error) {
        throw Object.assign(new Error('Every recorded target and pane must be readable and quiescent; fence retained.'),
          { code: 'NATIVE_BUSY', details: { target_id: id, target_state: error.details?.blockers && !error.details.blockers.unreadable_panes?.length && !error.details.blockers.unknown_sources?.length ? 'running' : 'unreadable', reason: error.message, state: error.details, verified_targets: states, journal_preserved: true, outcome: 'unknown' } });
      }
    }
    if (states.some(auxiliaryUnknownOnly)) {
      const journalHash = sourceHash(readFileSync(lease.paths.journal));
      const proof = values => sourceHash(JSON.stringify({ run_id: runId, journal_hash: journalHash,
        targets: values.map(state => ({ target_id: state.target_id, layout_id: state.layout_id, generation: state.generation, blockers: state.blockers,
          unknown: state.source_states?.filter(source => source.state === 'unknown') })) }));
      const hash = proof(states), details = { target_state: 'unknown', blocker_class: 'auxiliary_unknown', unknown_hash: hash,
        verified_targets: states, journal_preserved: true, outcome: 'unknown', confirmation_required: true,
        next_commands: [`tv session recover --run-id ${runId}`, `tv session recover --run-id ${runId} --acknowledge-unknown ${hash}`],
        next_commands_note: 'Wait and inspect source status first. Only after human confirmation, acknowledge this exact auxiliary-only unknown set to archive the journal without asserting completion/restoration.' };
      if (!acknowledgeUnknown) throw Object.assign(new Error('Only auxiliary source states remain unknown; fence retained pending explicit confirmation.'), { code: 'NATIVE_BUSY', details });
      if (acknowledgeUnknown !== hash) throw Object.assign(new Error('Unknown blocker set changed or acknowledgement hash mismatches.'), { code: 'UNKNOWN_ACK_MISMATCH', details });
      for (let sample = 0; sample < 3; sample++) {
        await (_deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(50);
        const current = [];
        for (const { id, probe } of probes) current.push({ target_id: id, ...await probe() });
        if (proof(current) !== hash || current.some(state => state.ready !== true && !auxiliaryUnknownOnly(state))) throw Object.assign(new Error('Native state changed during auxiliary acknowledgement; fence retained.'), { code: 'UNKNOWN_ACK_MISMATCH', details });
      }
      if (sourceHash(readFileSync(lease.paths.journal)) !== journalHash) throw Object.assign(new Error('Journal changed during acknowledgement.'), { code: 'UNKNOWN_ACK_MISMATCH', details });
      const backup = `${lease.paths.journal}.${randomUUID()}.unknown-acknowledged`;
      renameSync(lease.paths.journal, backup);
      try { if (existsSync(`${lease.paths.journal}.diagnostics.json`)) renameSync(`${lease.paths.journal}.diagnostics.json`, `${backup}.diagnostics.json`); } catch { /* The archived journal remains intact; optional diagnostics stay preserved. */ }
      lease.release();
      return { success: true, recovered: false, restoration_abandoned: true, unknown_acknowledged: true,
        unknown_hash: hash, incomplete: true, restored: false, outcome: 'unknown', journal_archived: true, backup_path: backup,
        note: 'Exact stable auxiliary-only unknown set explicitly acknowledged; no native completion or external effects were inferred. Inspect Desktop/account state before retrying.' };
    }
    if (acknowledgeUnknown) throw Object.assign(new Error('There is no matching auxiliary-only unknown set to acknowledge.'), { code: 'UNKNOWN_ACK_MISMATCH' });
    lease.release({ restored: true });
    return { success: true, recovered: true, incomplete: true, restored: false, generation_invalidated: invalidated, verified_target_count: targets.length,
      note: 'All recorded targets and panes are quiescent. The interrupted outcome remains unknown; inspect state before retrying.' };
  } catch(error) {
    primaryError=error;
    if (validatedRunId && !['RUN_ID_MISMATCH', 'TARGET_REQUIRED', 'UNKNOWN_ACK_MISMATCH'].includes(error.code) && lease.paths?.journal) try {
      const diagnostic = { journal_hash: sourceHash(readFileSync(lease.paths.journal)), code: error.code,
        blocker_class: error.details?.target_state || (error.code === 'WORKSPACE_DISCONNECTED' ? 'disconnected' : 'unreadable'),
        unknown_hash: error.details?.unknown_hash || null, next_commands: error.details?.next_commands || [`tv session recover --run-id ${validatedRunId}`],
        confirmation_required: Boolean(error.details?.confirmation_required) };
      writeFileSync(`${lease.paths.journal}.diagnostics.json`, JSON.stringify(diagnostic), { mode: 0o600 });
    } catch { /* Preserve the original error and journal even if diagnostics cannot be saved. */ }
    throw error;
  }
  finally {
    for (const {client,remote} of remoteObjects) { try { await client.Runtime.releaseObject({objectId:remote}); } catch { /* Keep state evidence. */ } }
    for (const client of clients) { try { await client.close(); } catch { /* Keep state evidence. */ } }
    try { lease.release(); } catch(error) { if(primaryError)primaryError.details={...primaryError.details,cleanup_warning:error.message}; else throw error; }
  }
}

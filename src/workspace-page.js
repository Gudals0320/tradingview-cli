import { findPineEditor, findPineController } from './core/desktop-dom.js';
import { readChartContext, normalizeTimeframe, symbolMatches } from './chart-context.js';

/** Serialized page functions have no captured Node state. */
export function readWorkspacePage(window, document) {
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  const controller = findPineController(document), editor = findPineEditor(document);
  const meta = window.TradingViewApi?._chartWidgetCollection?.metaInfo;
  const unwrap = value => typeof value?.value === 'function' ? value.value() : value;
  const layout = unwrap(meta?.uid);
  if (!chart || !layout || !controller || !editor) throw new Error('WORKSPACE_NOT_READY: Saved chart and mounted Pine document required.');
  const identity = controller.getScriptIdVersion();
  const studies = chart._chartWidget.model().model().dataSources().flatMap(source => {
    const info = source.metaInfo?.();
    if (!info?.isTVScript) return [];
    const inputs = chart.getStudyById(source.id()).getInputValues();
    let status = source.status?.(); status = unwrap(status);
    return [{ id: source.id(), pine: inputs.find(input => input.id === 'pineId')?.value || null,
      strategy: Boolean(info.isTVScriptStrategy || info.is_strategy), inputs: JSON.parse(JSON.stringify(inputs)), status: status?.type }];
  });
  const context = readChartContext(window);
  const pending_action = Object.keys(controller._editorStore?.getStore?.().getState()?.ui?.pendingRequests || {}).length > 0
    || Boolean(window.__tvCliSave?.pending) || Boolean(window.__tvCliPineCompile && !window.__tvCliPineCompile.actionDone)
    ;
  const calculating = studies.some(study => study.status === 0 || study.status === 1);
  return { layout: String(layout), pine: identity?.scriptIdPart || null, version: identity?.version,
    source: editor.editor.getValue().replace(/\r\n/g, '\n'), modified: controller.isModified?.(),
    context: { symbol: context.symbol, aliases: context.aliases, resolution: normalizeTimeframe(context.resolution), chart_type: context.chart_type,
      session: chart.symbolExt?.()?.session || null },
    studies, pending: pending_action || calculating, pending_action, calculating,
    viewport: { width: window.innerWidth, height: window.innerHeight }, visibility: document.visibilityState };
}

export function bindWorkspacePage(window, document, resource, nonce) {
  const snapshot = readWorkspacePage(window, document);
  if (snapshot.layout !== resource.layout || snapshot.pine !== resource.pine) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Saved resources do not match registration.');
  if (snapshot.studies.some(study => study.pine !== resource.pine) || snapshot.studies.length > 1) throw new Error('WORKSPACE_STUDY_CONFLICT: Use one owned Pine study only.');
  if (snapshot.pending) throw new Error('WORKSPACE_NATIVE_BUSY: Native action or calculation is pending.');
  const chart = window.TradingViewApi._activeChartWidgetWV.value();
  window.__tvCliWorkspace?.dispose?.();
  window.__tvCliWorkspace = { id: resource.id, token: resource.token, nonce, chart,
    controller: findPineController(document), baseline: snapshot, operation: null, permit: {} };
  return { nonce, snapshot };
}

export async function restoreWorkspaceDocument(window, document, resource) {
  const before = readWorkspacePage(window, document), controller = findPineController(document);
  const chart = window.TradingViewApi._activeChartWidgetWV.value();
  if (before.layout !== resource.layout) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Cannot restore a document on a different layout.');
  if (before.pending) throw new Error('WORKSPACE_NATIVE_BUSY: Wait for native quiescence before restoring a document.');
  if (before.pine !== resource.pine) {
    if (controller.isModified?.() !== false) throw new Error('WORKSPACE_FOREIGN_DRAFT: Refusing to discard an unowned modified document.');
    const version = resource.binding?.snapshot?.version;
    if (!version) throw new Error('WORKSPACE_VERSION_REQUIRED: Recorded owned document version is unavailable.');
    await controller.openScript({ scriptIdPart: resource.pine, version });
    if (chart !== window.TradingViewApi._activeChartWidgetWV.value()) throw new Error('WORKSPACE_GENERATION_CHANGED: Chart changed during document restore.');
  }
  const after = readWorkspacePage(window, document);
  if (after.layout !== resource.layout || after.pine !== resource.pine) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Restored document did not match the registered resources.');
  return { restored_document: before.pine !== resource.pine };
}

export function guardWorkspacePage(window, document, owner) {
  const bound = window.__tvCliWorkspace;
  if (!bound || bound.nonce !== owner.nonce || bound.id !== owner.id || bound.token !== owner.token
    || bound.chart !== window.TradingViewApi?._activeChartWidgetWV?.value()
    || bound.controller !== findPineController(document)) throw new Error('WORKSPACE_GENERATION_CHANGED: Target page or controller changed; explicit recovery required.');
  const actual = readWorkspacePage(window, document), before = bound.baseline, permit = bound.permit;
  const fail = () => { throw new Error('WORKSPACE_EXTERNAL_CHANGE: Workspace source, context or studies changed outside the requested operation.'); };
  if (actual.layout !== before.layout || actual.pine !== before.pine) fail();
  if (actual.source !== before.source) {
    if (actual.source !== permit.source) fail();
    before.source = actual.source; delete permit.source;
  }
  for (const field of ['symbol', 'resolution', 'chart_type', 'session']) {
    if (actual.context[field] === before.context[field]) continue;
    const allowed = field === 'symbol' ? permit.symbol && symbolMatches(permit.symbol, actual.context)
      : permit[field] !== undefined && actual.context[field] === permit[field];
    if (!allowed) fail();
    before.context[field] = actual.context[field];
    // A symbol may normalize twice while the feed initializes; keep its aliases.
    if (field !== 'symbol') delete permit[field];
  }
  if (actual.studies.length > 1 || actual.studies.some(study => study.pine !== actual.pine)) fail();
  const old = before.studies[0], current = actual.studies[0];
  if (JSON.stringify(old?.inputs) !== JSON.stringify(current?.inputs) || old?.id !== current?.id || actual.version !== before.version) {
    if (permit.compile) {
      if (old && current && old.id !== current.id) fail();
    } else if (permit.inputs && old && current && old.id === current.id) {
      const expected = old.inputs.map(input => Object.hasOwn(permit.inputs, input.id) ? { ...input, value: permit.inputs[input.id] } : input);
      if (JSON.stringify(current.inputs) !== JSON.stringify(expected)) fail();
      delete permit.inputs;
    } else if (permit.save && old?.id === current?.id) {
      // Native save may retranslate the same study. Preserve all ordinary inputs.
      const stable = inputs => inputs?.filter(input => !['text', 'pineVersion', 'pineFeatures'].includes(input.id));
      if (JSON.stringify(stable(old?.inputs)) !== JSON.stringify(stable(current?.inputs))) fail();
    } else fail();
    before.studies = actual.studies; before.version = actual.version;
  }
  return actual;
}

export function startWorkspacePage(window, document, owner, operation, permit) {
  const snapshot = guardWorkspacePage(window, document, owner);
  if (snapshot.pending_action) throw new Error('WORKSPACE_NATIVE_BUSY: Native action is pending.');
  const bound = window.__tvCliWorkspace;
  if (bound.operation) throw new Error('WORKSPACE_PAGE_BUSY: Previous page operation must be reconciled.');
  bound.operation = operation; bound.permit = permit;
  bound.events = []; bound.dispose?.();
  const source = bound.chart._chartWidget.model().model().dataSources().find(source => source.id() === snapshot.studies[0]?.id);
  const status = source?.onStatusChanged?.(), reports = source?.reportChanged?.();
  if (status?.subscribe && reports?.subscribe) {
    const record = event => {
      if (bound.operation !== operation) return;
      let state = source.status?.(); if (typeof state?.value === 'function') state = state.value();
      const inputs = bound.chart.getStudyById(source.id()).getInputValues().filter(input => input.id !== 'text');
      bound.events.push({ event, at: Date.now(), status: state?.type, inputs });
      if (bound.events.length > 100) bound.events.shift();
    };
    const onStatus = () => record('status'), onReport = () => record('report');
    status.subscribe(bound, onStatus); reports.subscribe(bound, onReport);
    bound.dispose = () => { status.unsubscribe(bound, onStatus); reports.unsubscribe(bound, onReport); };
  }
  return snapshot;
}

export function finishWorkspacePage(window, document, owner, operation) {
  const snapshot = guardWorkspacePage(window, document, owner), bound = window.__tvCliWorkspace;
  if (bound.operation !== operation) throw new Error('WORKSPACE_OWNERSHIP_LOST: Page operation changed.');
  if (snapshot.pending_action) throw new Error('WORKSPACE_NATIVE_BUSY: Native actions remain pending.');
  bound.operation = null; bound.permit = {}; bound.baseline = snapshot;
  bound.dispose?.();
  const epoch = window.__tvCliCompilation;
  return { snapshot, events: bound.events, calculation: epoch ? { token: epoch.token, source_hash: epoch.source_hash, phase: epoch.phase,
    strategy_id: epoch.strategy_id, accepted_cycle: epoch.accepted_cycle, cycle: epoch.calculation?.cycle,
    events: epoch.calculation?.events, completed: epoch.calculation?.completed,
    report_verified: epoch.report_verified, inputs_fingerprint: epoch.inputs_fingerprint } : null };
}

export const WORKSPACE_PAGE_CODE = [findPineEditor, findPineController, readChartContext, normalizeTimeframe, symbolMatches,
  readWorkspacePage, bindWorkspacePage, restoreWorkspaceDocument, guardWorkspacePage, startWorkspacePage, finishWorkspacePage].map(fn => fn.toString()).join('\n');

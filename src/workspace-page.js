import { findPineEditor, findPineController } from './core/desktop-dom.js';
import { readChartContext, normalizeTimeframe, symbolMatches } from './chart-context.js';
import { layoutConfirmationRoot, layoutConfirmationVisible, layoutOperationPending } from './layout-state.js';
import { trackNativeOperation } from './native-operation.js';
import { canonicalPineSource } from './pine-source.js';

/** Serialized page functions have no captured Node state. */
export function readWorkspacePage(window, document, options = {}) {
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  const includePine = options.pine === true || (options.pine !== false && window.__tvCliWorkspace?.pine !== null);
  const controller = includePine ? findPineController(document) : null, editor = includePine ? findPineEditor(document) : null;
  const meta = window.TradingViewApi?._chartWidgetCollection?.metaInfo;
  const unwrap = value => typeof value?.value === 'function' ? value.value() : value;
  const layout = unwrap(meta?.uid);
  if (!chart || !layout) throw new Error('WORKSPACE_NOT_READY: A saved chart is required.');
  if (options.pine === true && (!controller || !editor)) throw new Error('WORKSPACE_PINE_REQUIRED: Mount the owned Pine editor before binding a Pine workspace.');
  const identity = controller?.getScriptIdVersion();
  const studies = chart._chartWidget.model().model().dataSources().flatMap(source => {
    const info = source.metaInfo?.();
    if (!info?.isTVScript) return [];
    const inputs = chart.getStudyById(source.id()).getInputValues();
    let status = source.status?.(); status = unwrap(status);
    return [{ id: source.id(), pine: inputs.find(input => input.id === 'pineId')?.value || null,
      strategy: Boolean(info.isTVScriptStrategy || info.is_strategy), inputs: JSON.parse(JSON.stringify(inputs)), status: status?.type }];
  }).filter(study => !includePine || !identity?.scriptIdPart || study.pine === identity.scriptIdPart);
  const context = readChartContext(window);
  const pending_action = Object.keys(controller?._editorStore?.getStore?.().getState()?.ui?.pendingRequests || {}).length > 0
    || Boolean(window.__tvCliSave?.pending) || Boolean(window.__tvCliPineCompile && !window.__tvCliPineCompile.actionDone)
    || Object.values(window.__tvCliNativeOperations || {}).some(operation => operation.pending)
    || layoutOperationPending(window, document)
    ;
  const calculating = studies.some(study => study.strategy && (study.status === 0 || study.status === 1));
  return { layout: String(layout), pine: identity?.scriptIdPart || null, version: identity?.version,
    source: editor ? canonicalPineSource(editor.editor.getValue()) : '', modified: controller?.isModified?.() ?? null,draft:controller?.isDraft?.()??null,
    context: { symbol: context.symbol, aliases: context.aliases, resolution: normalizeTimeframe(context.resolution), chart_type: context.chart_type,
      session: chart.symbolExt?.()?.session || null },
    studies, pending: pending_action || calculating, pending_action, calculating,
    viewport: { width: window.innerWidth, height: window.innerHeight }, visibility: document.visibilityState };
}

export function bindWorkspacePage(window, document, resource, nonce) {
  const snapshot = readWorkspacePage(window, document, { pine: Boolean(resource.pine) });
  if (snapshot.layout !== resource.layout || snapshot.pine !== resource.pine) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Saved resources do not match registration.');
  if(resource.pine&&snapshot.draft===true)throw new Error('WORKSPACE_SAVED_DOCUMENT_REQUIRED: Drafts cannot be reserved as saved Pine documents.');
  if (resource.pine && (snapshot.studies.some(study => study.pine !== resource.pine) || snapshot.studies.length > 1)) throw new Error('WORKSPACE_STUDY_CONFLICT: Pine workspaces require a single owned study.');
  if (snapshot.pending) throw new Error('WORKSPACE_NATIVE_BUSY: Native action or calculation is pending.');
  const chart = window.TradingViewApi._activeChartWidgetWV.value();
  for(const epoch of new Set([window.__tvCliCompilation,...(window.__tvCliVerifiedStrategies?.values?.()||[])]))epoch?.dispose?.();
  delete window.__tvCliCompilation;delete window.__tvCliVerifiedStrategies;
  window.__tvCliWorkspace?.dispose?.();
  window.__tvCliWorkspace = { id: resource.id, token: resource.token, nonce, chart, pine: resource.pine,
    controller: resource.pine ? findPineController(document) : null, baseline: snapshot, operation: null, permit: {} };
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
    if(typeof controller._initScriptVersion!=='function')throw new Error('WORKSPACE_PINE_OPEN_UNSUPPORTED: Exact-version native controller unavailable; editor_changed:false.');
    await trackNativeOperation(window, `${resource.id}-restore-document`, () => controller._initScriptVersion({ scriptIdPart: resource.pine, version }));
    if (chart !== window.TradingViewApi._activeChartWidgetWV.value()) throw new Error('WORKSPACE_GENERATION_CHANGED: Chart changed during document restore.');
  }
  const after = readWorkspacePage(window, document);
  if (after.layout !== resource.layout || after.pine !== resource.pine || String(after.version)!==String(resource.binding?.snapshot?.version)) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Restored document identity/version did not match the registered resources.');
  const recorded = resource.binding?.snapshot;
  let restoredDraft = false;
  if (recorded?.modified === true && typeof recorded.source === 'string' && after.source !== recorded.source) {
    if (after.modified !== false) throw new Error('WORKSPACE_FOREIGN_DRAFT: Refusing to overwrite a different modified source.');
    if (typeof controller.setScript !== 'function') throw new Error('WORKSPACE_NOT_READY: Draft restore action is unavailable.');
    await trackNativeOperation(window, `${resource.id}-restore-source`, () => controller.setScript(recorded.source));
    const verified = readWorkspacePage(window, document);
    if (verified.pine !== resource.pine || verified.source !== recorded.source) throw new Error('WORKSPACE_IDENTITY_MISMATCH: Private draft source did not restore exactly.');
    restoredDraft = true;
  }
  return { restored_document: before.pine !== resource.pine, restored_draft: restoredDraft };
}

export function guardWorkspacePage(window, document, owner, { observe = false } = {}) {
  const bound = window.__tvCliWorkspace;
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
  if(bound&&bound.chart!==chart&&bound.permit?.pane_layout) {
    const type=window.TradingViewApi?._chartWidgetCollection?._layoutType;
    const actual=typeof type?.value==='function'?type.value():type;
    if(actual===bound.permit.pane_layout&&!observe) {
      const snapshot=readWorkspacePage(window,document);
      if(snapshot.pine!==bound.baseline.pine||snapshot.source!==bound.baseline.source)throw new Error('WORKSPACE_EXTERNAL_CHANGE: Editor changed during layout transition.');
      bound.chart=chart;bound.controller=bound.pine?findPineController(document):null;bound.baseline=snapshot;
      for(const epoch of new Set([window.__tvCliCompilation,...(window.__tvCliVerifiedStrategies?.values?.()||[])]))epoch?.dispose?.();
      delete window.__tvCliCompilation;delete window.__tvCliVerifiedStrategies;
    }
  }
  if(bound&&bound.chart!==chart&&bound.permit?.pane_index!==undefined) {
    const pane=window.TradingViewApi?._chartWidgetCollection?.getAll?.()[bound.permit.pane_index];
    if(pane&&(chart===pane||chart?._chartWidget===pane)) {
      if(!observe){bound.chart=chart;bound.baseline=readWorkspacePage(window,document);delete bound.permit.pane_index;}
    }
  }
  if (!bound || bound.nonce !== owner.nonce || bound.id !== owner.id || bound.token !== owner.token
    || bound.chart !== window.TradingViewApi?._activeChartWidgetWV?.value()
    || (bound.pine && bound.controller !== findPineController(document))) throw new Error('WORKSPACE_GENERATION_CHANGED: Target page or controller changed; explicit recovery required.');
  const actual = readWorkspacePage(window, document);
  // Observation validates the same contract using local copies. It must never
  // consume another invocation's permit or advance its baseline.
  const before = observe ? { ...bound.baseline, context: { ...bound.baseline.context } } : bound.baseline;
  const permit = observe ? { ...bound.permit } : bound.permit;
  const fail = () => { throw new Error('WORKSPACE_EXTERNAL_CHANGE: Workspace source, context or studies changed outside the requested operation.'); };
  if (actual.layout !== before.layout || actual.pine !== before.pine) fail();
  if (actual.source !== before.source) {
    if (actual.source !== permit.source) fail();
    before.source = actual.source; delete permit.source;
  }
  for (const field of ['symbol', 'resolution', 'chart_type', 'session']) {
    if (actual.context[field] === before.context[field]) continue;
    const allowed = field === 'symbol' ? (permit.symbol && symbolMatches(permit.symbol, actual.context)) || permit.symbols?.some(symbol=>symbolMatches(symbol,actual.context))
      : permit[field] !== undefined && actual.context[field] === permit[field];
    if (!allowed) fail();
    before.context[field] = actual.context[field];
    // A symbol may normalize twice while the feed initializes; keep its aliases.
    if (field !== 'symbol') delete permit[field];
  }
  if (bound.pine && (actual.studies.length > 1 || actual.studies.some(study => study.pine !== actual.pine))) fail();
  if(!bound.pine) {
    const stable=study=>JSON.stringify([study.id,study.inputs]);
    const same=(a,b)=>a.length===b.length&&a.every(study=>b.some(other=>stable(study)===stable(other)));
    if(!same(before.studies,actual.studies)) {
      if(permit.add_study&&actual.studies.length===before.studies.length+1&&before.studies.every(study=>actual.studies.some(other=>stable(study)===stable(other))))delete permit.add_study;
      else if(permit.remove_study&&same(before.studies.filter(study=>study.id!==permit.remove_study),actual.studies))delete permit.remove_study;
      else if(permit.inputs&&permit.study_id) {
        const expected=before.studies.map(study=>study.id===permit.study_id?{...study,inputs:study.inputs.map(input=>Object.hasOwn(permit.inputs,input.id)?{...input,value:permit.inputs[input.id]}:input)}:study);
        if(!same(expected,actual.studies))fail();delete permit.inputs;
      } else fail();
      before.studies=actual.studies;
    }
    return actual;
  }
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
    } else if(permit.remove_study===old?.id&&!current) {
      delete permit.remove_study;
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
  if (permit.quote_symbol) { permit.symbols = [permit.quote_symbol, snapshot.context.symbol]; delete permit.quote_symbol; }
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

/** Presence only: never expose another document's source, inputs or report. */
export function workspaceStrategyPresent(window, document, requested) {
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  if (!chart) throw new Error('WORKSPACE_NOT_READY: Chart is unavailable.');
  return chart._chartWidget.model().model().dataSources().some(source => {
    if (source.id?.() !== requested) return false;
    const info = source.metaInfo?.();
    return Boolean(info?.isTVScriptStrategy || info?.is_strategy);
  });
}

export function finishWorkspacePage(window, document, owner, operation, {allowIncomplete=false}={}) {
  const snapshot = guardWorkspacePage(window, document, owner), bound = window.__tvCliWorkspace;
  if (bound.operation !== operation) throw new Error('WORKSPACE_OWNERSHIP_LOST: Page operation changed.');
  if (snapshot.pending_action) throw new Error('WORKSPACE_NATIVE_BUSY: Native actions remain pending.');
  if(bound.permit.pane_layout) {
    const type=window.TradingViewApi?._chartWidgetCollection?._layoutType;
    if((typeof type?.value==='function'?type.value():type)!==bound.permit.pane_layout)throw new Error('WORKSPACE_LAYOUT_UNVERIFIED: Requested pane layout did not settle.');
  }
  if (!allowIncomplete && bound.permit.compile && snapshot.calculating) throw new Error('WORKSPACE_NATIVE_BUSY: Owned compilation calculation remains pending.');
  if (!allowIncomplete && bound.permit.compile && snapshot.studies.length !== 1) throw new Error('WORKSPACE_STUDY_MISSING: Compilation cannot complete without its single owned study.');
  bound.operation = null; bound.permit = {}; bound.baseline = snapshot;
  bound.dispose?.();
  const epoch = window.__tvCliCompilation;
  return { snapshot, events: bound.events, calculation: epoch ? { token: epoch.token, source_hash: epoch.source_hash, phase: epoch.phase,
    strategy_id: epoch.strategy_id, accepted_cycle: epoch.accepted_cycle, cycle: epoch.calculation?.cycle,
    events: epoch.calculation?.events, completed: epoch.calculation?.completed,
    report_verified: epoch.report_verified, inputs_fingerprint: epoch.inputs_fingerprint } : null };
}

export const WORKSPACE_PAGE_CODE = [canonicalPineSource, findPineEditor, findPineController, readChartContext, normalizeTimeframe, symbolMatches, layoutConfirmationRoot, layoutConfirmationVisible, layoutOperationPending, trackNativeOperation,
  readWorkspacePage, bindWorkspacePage, restoreWorkspaceDocument, guardWorkspacePage, startWorkspacePage, workspaceStrategyPresent, finishWorkspacePage].map(fn => fn.toString()).join('\n');

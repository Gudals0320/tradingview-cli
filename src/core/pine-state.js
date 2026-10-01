/** Observe Redux request transitions so a fast compile cannot be missed by polling. */
export function observePineCompilation(window, controller, token) {
  const store = controller?._editorStore?.getStore?.();
  if (!store?.subscribe || !store?.getState) return false;
  if (Object.keys(store.getState()?.ui?.pendingRequests || {}).length) {
    throw new Error('Pine editor already has a pending request. Wait before compiling.');
  }
  window.__tvCliPineCompile?.dispose?.();
  const operation = window.__tvCliPineCompile = { token, started: false, completed: false, actionDone: false, diagnostics: [] };
  const seen = new Set(store.getState()?.console?.messages || []);
  const observe = () => {
    const requests = store.getState()?.ui?.pendingRequests;
    if (!requests || typeof requests !== 'object') return;
    if (Object.keys(requests).length) operation.started = true;
    operation.completed = operation.started && operation.actionDone && Object.keys(requests).length === 0;
    for (const message of store.getState()?.console?.messages || []) {
      if (seen.has(message)) continue;
      seen.add(message);
      if (['error', 'warning'].includes(message.level)) operation.diagnostics.push({
        line: message.start?.line, column: message.start?.column, message: message.text,
        severity: message.level === 'error' ? 8 : 4,
      });
    }
  };
  operation.dispose = store.subscribe(observe);
  operation.refresh = observe;
  return true;
}

export function pineCompilationStatus(window, token, finish = false) {
  const operation = window.__tvCliPineCompile;
  if (operation?.token !== token) return { replaced: true, completed: false };
  if (finish) operation.dispose?.();
  operation.refresh?.();
  return { started: operation.started, completed: operation.completed, error: operation.error,error_code:operation.error_code,
    diagnostics: operation.diagnostics, identity: operation.controller?.getScriptIdVersion?.(),
    modified: operation.controller?.isModified?.(),
    validation: operation.actionDone ? operation.check?.() : null };
}

export function pineStudySnapshot(window) {
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  if (!chart) throw new Error('Pine chart targets are unavailable.');
  return chart._chartWidget.model().model().dataSources().flatMap(source => {
    const info = source.metaInfo?.();
    if (!info?.isTVScript) return [];
    const inputs = chart.getStudyById(source.id()).getInputValues();
    return [{ id: source.id(), pine_id: inputs.find(input => input.id === 'pineId')?.value,
      version:inputs.find(input => input.id === 'pineVersion')?.value,
      compiled_identity: JSON.stringify(inputs.filter(input => ['text','pineId','pineVersion'].includes(input.id))) }];
  });
}

export function planPineCompilation(window, controller) {
  const identity = controller?.getScriptIdVersion?.();
  let before;
  try { before = pineStudySnapshot(window); } catch (error) {
    return {code:'TARGETS_UNREADABLE',error:'Could not read Pine chart targets: ' + error.message};
  }
  const matches = identity?.scriptIdPart ? before.filter(item => item.pine_id === identity.scriptIdPart) : [];
  if (matches.length > 1) return { error:'More than one chart study uses this Pine document.', code:'AMBIGUOUS_TARGET', target_count:matches.length,before };
  return { method:matches.length === 1 ? 'updateOnChart' : 'addToChart', before,
    script_id:identity?.scriptIdPart || null, target_id:matches[0]?.id || null,target_version:matches[0]?.version };
}

/** Reapply a persisted source to its existing study without writing a version. */
export async function refreshSavedPine(window, controller, plan) {
  const identity=controller.getScriptIdVersion();
  if(identity?.scriptIdPart!==plan.script_id)throw new Error('TARGET_MISMATCH: saved document changed.');
  if(typeof controller._replaceStubByStudy!=='function'||typeof controller._editorStore.translateScript!=='function') {
    throw new Error('CLEAN_UPDATE_UNSUPPORTED: native saved-source refresh is unavailable.');
  }
  const store=controller._editorStore,request='tv-cli-refresh-'+Date.now();
  for(const method of ['addPendingRequest','removePendingRequest','pushScriptError'])if(typeof store[method]!=='function')throw new Error('CLEAN_UPDATE_UNSUPPORTED: native '+method+' is unavailable.');
  store.addPendingRequest(request);
  store.resetStatus?.();
  try {
    const translated=await store.translateScript({scriptIdPart:identity.scriptIdPart,scriptVersion:identity.version});
    if(!translated.success){
      const raw=translated.compileErrors,entries=Array.isArray(raw)?raw:raw?.errors||raw?.errors2||[];
      for(const e of entries)window.__tvCliPineCompile?.diagnostics?.push({line:e.start?.line||e.line,column:e.start?.column||e.column,
        message:String(e.message||e.error||'Saved-source compilation error').replace(/\{([^}]+)\}/g,(t,k)=>e.ctx?.[k]==null?t:String(e.ctx[k])),severity:8});
      try{store.pushScriptError(raw,store.getStore().getState().script.scriptName);}catch{/* Normalized diagnostics remain available. */}
      const error=new Error('Saved source failed native compilation.');error.code='PINE_COMPILE_ERROR';throw error;
    }
    // The native updater requires its explicit update branch (no loading stub).
    // These arguments select that branch; they do not alter editor draft state.
    await controller._replaceStubByStudy({metaInfo:translated.metaInfo,compileErrors:translated.compileErrors,
      pineId:identity.scriptIdPart,pineVersion:identity.version,oldPineVersion:plan.target_version},null,true,true);
  } finally {store.removePendingRequest(request);}
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
  let target;
  for(let attempt=0;attempt<50;attempt++){
    target=chart?._chartWidget.model().model().dataSources().find(s=>s.id()===plan.target_id);
    if(target&&typeof target.restart==='function')break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!target||typeof target.restart!=='function')throw new Error('CLEAN_UPDATE_UNSUPPORTED: target cannot start a verified calculation.');
  if(window.__tvCliCompilation?.target_study_id===plan.target_id)window.__tvCliCompilation.rebind?.();
  target.restart(true);
}

export function verifyPineCompilation(window, operation) {
  const { plan, controller } = operation;
  const currentId = controller.getScriptIdVersion()?.scriptIdPart;
  if (!currentId || (plan.script_id && plan.script_id !== currentId)) return {
    code:'TARGET_MISMATCH',error:'Pine document identity changed during compilation.' };
  let after;
  try { after = pineStudySnapshot(window); } catch (error) {
    return {code:'TARGETS_UNREADABLE',error:'Could not verify Pine chart targets: ' + error.message};
  }
  const matches = after.filter(item => item.pine_id === currentId);
  if (matches.length > 1) return {code:'DUPLICATE_ADDED',target_count:matches.length,error:'Compilation created or retained multiple studies for this Pine document.'};
  if (matches.length === 0) return {pending:true};
  if(String(matches[0].version)!==String(controller.getScriptIdVersion()?.version))return {pending:true,reason:'APPLIED_VERSION_PENDING'};
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
  const native=chart?._chartWidget.model().model().dataSources().find(s=>s.id()===matches[0].id);
  let status=native?.status?.();if(status?.value)status=status.value();
  if(status?.type===0||status?.type===1)return {pending:true,reason:'CALCULATION_PENDING'};
  if (plan.target_id && matches[0].id !== plan.target_id) return {code:'TARGET_MISMATCH',error:'Compilation replaced the target chart study.'};
  const oldOther = plan.before.filter(item => item.id !== plan.target_id);
  const newOther = after.filter(item => item.id !== matches[0].id);
  if (oldOther.length !== newOther.length || oldOther.some(old => !newOther.some(item =>
    item.id === old.id && item.compiled_identity === old.compiled_identity))) return {
    code:'TARGET_MISMATCH',error:'Compilation changed an unrelated Pine study.' };
  return {verified:true,script_id:currentId,target_id:matches[0].id};
}

/** Await the controller's complete action, including saved-version translation. */
export function dispatchPineCompilation(window, controller, token) {
  const operation = window.__tvCliPineCompile;
  if (operation?.token !== token) throw new Error('Pine compile observer was replaced.');
  const plan = planPineCompilation(window, controller);
  if (plan.error) throw new Error(plan.code + ': ' + plan.error);
  const refresh=plan.method==='updateOnChart'&&controller.isModified?.()===false;
  const saveRefresh=plan.method==='updateOnChart'&&controller.isModified?.()===true
    && String(controller.getScriptIdVersion()?.version)!==String(plan.target_version);
  const method = refresh?'refreshSavedOnChart':saveRefresh?'saveThenRefreshOnChart':plan.method;
  if (saveRefresh && (typeof controller.saveScript!=='function'||typeof controller._replaceStubByStudy!=='function')) throw new Error('Pine saved-version reconciliation action unavailable.');
  if (!refresh && !saveRefresh && typeof controller?.[method] !== 'function') throw new Error('Pine native compilation action unavailable.');
  operation.controller = controller;
  operation.plan = plan;
  operation.check = () => verifyPineCompilation(window, operation);
  Promise.resolve().then(async () => {
    if(saveRefresh){
      // A reloaded layout can retain an older study than the saved editor.
      // Save the requested edits once, then target the actual applied version.
      await controller.saveScript();
      if(controller.isModified?.()!==false)throw new Error('SAVE_FAILED: Edited source was not saved before applying it.');
      return refreshSavedPine(window,controller,plan);
    }
    return refresh?refreshSavedPine(window,controller,plan):controller[method]();
  }).then(() => {
    operation.actionDone = true; operation.refresh();
  }, error => {
    operation.error = error?.message || String(error);operation.error_code=error?.code||null; operation.actionDone = true; operation.refresh();
  });
  return method;
}

export function pineCompileContext(window, controller) {
  const plan = planPineCompilation(window, controller);
  if (plan.error) return {...plan,identity:controller?.getScriptIdVersion?.(),draft:controller?.isDraft?.(),modified:controller?.isModified?.()};
  const identity = controller?.getScriptIdVersion?.();
  const modified = controller?.isModified?.();
  const saveRequired = Boolean(identity?.scriptIdPart && modified && !controller.isDraft?.());
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value();
  let unchanged = false, pending = false, runtimeError = null;
  if (identity?.scriptIdPart && modified === false && chart) {
    for (const source of chart._chartWidget.model().model().dataSources()) {
      try {
        const info = source.metaInfo?.();
        if (!info?.isTVScript || info.isTVScriptStrategy || info.is_strategy) continue;
        const inputs = chart.getStudyById(source.id()).getInputValues();
        if (inputs.find(input => input.id === 'pineId')?.value !== identity.scriptIdPart
          || String(inputs.find(input => input.id === 'pineVersion')?.value) !== String(identity.version)) continue;
        const status = source.status?.();
        if (status?.type === 2) unchanged = true;
        else if (status?.type === 3) runtimeError = status.errorDescription?.error || 'Indicator execution failed.';
        else pending = true;
      } catch { /* unavailable source */ }
    }
  }
  return { save_required: saveRequired, unchanged, pending:pending && !unchanged, runtime_error:runtimeError, identity,
    draft:controller?.isDraft?.(),before:plan.before,
    target_id:plan.target_id,target_version:plan.target_version,
    same_version_refresh:Boolean(plan.target_id && modified===false && String(plan.target_version)===String(identity?.version)) };
}

/** Current diagnostics and target state, independent of native Promise rejection. */
export function readPineOutcome(window, controller, monaco, token) {
  const identity=controller?.getScriptIdVersion?.();
  const model=monaco?.editor.getModel();
  const markers=model?monaco.env.editor.getModelMarkers({resource:model.uri}).map(m=>({
    line:m.startLineNumber,column:m.startColumn,message:m.message,severity:m.severity})):[];
  const all=pineStudySnapshot(window);
  const targets=all.filter(s=>s.pine_id===identity?.scriptIdPart);
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value();
  const runtime=[];
  for(const target of targets){
    const source=chart._chartWidget.model().model().dataSources().find(s=>s.id()===target.id);
    let status=source?.status?.();if(status?.value)status=status.value();
    target.status_type=status?.type;
    if(status?.type===3){
      const detail=status.errorDescription||{};
      const message=String(detail.error||status.errorMessage||status.error||'Pine study execution failed.')
        .replace(/\{([^}]+)\}/g,(t,k)=>detail.ctx?.[k]==null?t:String(detail.ctx[k]));
      runtime.push({message,context:detail.ctx||{},native_description:detail,native_code:detail.code||detail.ctx?.code||status.errorCode||null,
        version:target.version});
    }
  }
  return {identity,modified:controller?.isModified?.(),draft:controller?.isDraft?.(),markers,targets,runtime_diagnostics:runtime,
    native_diagnostics:window.__tvCliPineCompile?.token===token?window.__tvCliPineCompile.diagnostics:[]};
}

export const PINE_TARGET_PAGE_CODE = [pineStudySnapshot,planPineCompilation,verifyPineCompilation,refreshSavedPine,readPineOutcome].map(fn => fn.toString()).join('\n');

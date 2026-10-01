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
  return { started: operation.started, completed: operation.completed, error: operation.error,
    diagnostics: operation.diagnostics };
}

/** Await the controller's complete action, including saved-version translation. */
export function dispatchPineCompilation(window, controller, token, document) {
  const operation = window.__tvCliPineCompile;
  if (operation?.token !== token) throw new Error('Pine compile observer was replaced.');
  // Desktop uses the same QA id for add and update. Read the native handler's
  // referenced action instead of inferring behavior from the icon or caption.
  const button = Array.from(document.querySelectorAll('button[data-qa-id="add-script-to-chart"],button[data-qa-id="update-script-on-chart"]'))
    .find(button => button.offsetParent !== null && !button.disabled);
  const propsKey = button && Object.keys(button).find(key => key.startsWith('__reactProps$'));
  const update = controller.isModified?.() !== false && /\.updateOnChart\(/.test(String(button?.[propsKey]?.onClick || ''));
  const method = update ? 'updateOnChart' : 'addToChart';
  if (typeof controller?.[method] !== 'function') throw new Error('Pine native compilation action unavailable.');
  Promise.resolve().then(() => controller[method]()).then(() => {
    operation.actionDone = true; operation.refresh();
  }, error => {
    operation.error = error?.message || String(error); operation.actionDone = true; operation.refresh();
  });
  return method;
}

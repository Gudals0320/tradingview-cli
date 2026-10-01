export function layoutConfirmationRoot(document) {
  const buttons = Array.from(document.querySelectorAll('button[data-qa-id="dontSave-btn"][name="dontSave"]'));
  return buttons.find(button => button.offsetParent !== null && button.parentElement?.parentElement
    ?.querySelector('button[data-qa-id="cancel-btn"][name="cancel"]'))?.parentElement?.parentElement || null;
}
export function layoutConfirmationVisible(document) { return Boolean(layoutConfirmationRoot(document)); }

export function startLayoutOperation(window, document, options) {
  const prior = window.__tvCliLayoutSwitch;
  if (prior?.pending) throw new Error('LAYOUT_UNVERIFIED: Previous layout operation is still pending.');
  prior?.dispose?.();
  const uid = () => {
    const value = window.TradingViewApi?._chartWidgetCollection?.metaInfo?.uid;
    return String(typeof value?.value === 'function' ? value.value() : value);
  };
  const chart = () => window.TradingViewApi?._activeChartWidgetWV?.value();
  const loading = () => {
    try {
      const series = chart()?._chartWidget?.model()?.mainSeries();
      if (!series) return true;
      const value = series.isLoading?.();
      return Boolean(typeof value?.value === 'function' ? value.value() : value);
    } catch { return true; }
  };
  const operation=window.__tvCliLayoutSwitch={token:options.token,generation:options.generation,original_id:uid(),
    expected_id:String(options.expected),pending:true,request_at:Date.now(),grace_ms:options.grace||30000,
    supported_native:options.supportedNative===true,dispatch_observed:false,promise_settled:false,promise_rejected:false,
    confirmation_seen:false,dialog_action:null,state:'pending',stable_count:0,current_uid:uid(),chart:chart()};
  const schedule=window.setInterval?.bind(window)||setInterval;
  const cancel=window.clearInterval?.bind(window)||clearInterval;
  let timer, dialog = null, click;
  operation.terminal_promise = new Promise(resolve => { operation.resolve_terminal = resolve; });
  operation.dispose = () => {
    if (timer !== undefined) cancel(timer);
    if (dialog && click) dialog.removeEventListener?.('click', click, true);
  };
  const finish = state => {
    operation.pending = false;
    operation.state = state;
    operation.dispose();
    operation.resolve_terminal(state);
  };
  operation.update = () => {
    if (window.__tvCliLayoutSwitch !== operation) { operation.dispose(); return; }
    const current = uid(), root = layoutConfirmationRoot(document);
    operation.current_uid = current;
    operation.dialog_visible = Boolean(root);
    operation.loading = loading();
    if (root) {
      operation.confirmation_seen = true;
      if (root !== dialog) {
        if (dialog && click) dialog.removeEventListener?.('click', click, true);
        dialog = root;
        click = event => {
          const button = event.target?.closest?.('button') || event.target;
          if (!root.contains?.(button)) return;
          const name = button.getAttribute?.('name'), qa = button.getAttribute?.('data-qa-id');
          if (name === 'cancel' && qa === 'cancel-btn') operation.dialog_action = 'cancel';
          else if (name === 'dontSave' && qa === 'dontSave-btn') operation.dialog_action = 'dontSave';
          else if ((name === 'ok' && qa === 'ok-btn') || (name === 'save' && qa === 'save-btn')) operation.dialog_action = 'save';
        };
        root.addEventListener?.('click', click, true);
      }
    }
    if (current === operation.stable_uid && !operation.loading) operation.stable_count++;
    else { operation.stable_uid = current; operation.stable_count = operation.loading ? 0 : 1; }
    // Grace is diagnostic only. It is never a cancellation or terminal signal.
    operation.unverified = Date.now() - operation.request_at >= operation.grace_ms;
    if (operation.stable_count < (options.samples || 3) || operation.loading || root) return;
    if (!operation.dispatch_observed || ((operation.supported_native || operation.promise) && !operation.promise_settled)) return;
    if (current === operation.expected_id && (operation.supported_native || current !== operation.original_id)) {
      finish(operation.promise_rejected ? 'failed' : 'switched'); return;
    }
    if (current === operation.original_id) {
      if (operation.supported_native && operation.result === true && !operation.promise_rejected) return;
      if (operation.supported_native && operation.promise_settled) {
        finish(operation.promise_rejected ? 'failed' : operation.dialog_action === 'cancel' ? 'cancelled' : 'not_switched');
        return;
      }
      if (operation.dialog_action === 'cancel') finish('cancelled');
    }
  };
  timer = schedule(operation.update, options.interval || 100);
  operation.update();
  return operation;
}

export function observeLayoutPromise(window, operation, result) {
  const registry=Object.values(window.__tvCliNativeOperations||{}).find(entry=>entry.pending);
  const thenable=result&&typeof result.then==='function';
  operation.supported_native=operation.supported_native&&Boolean(thenable);
  operation.dispatch_observed=true;
  if(thenable){
    operation.promise=Promise.resolve(result).then(value=>{operation.promise_settled=true;operation.result=value;operation.stable_uid=null;operation.stable_count=0;operation.update();},
      error=>{operation.promise_settled=true;operation.promise_rejected=true;operation.error=error?.message||String(error);operation.stable_uid=null;operation.stable_count=0;operation.update();});
  }
  // Extend the existing registry entry rather than creating a nested entry.
  if(registry)registry.tail_promise=operation.supported_native?operation.promise:Promise.all([operation.promise,operation.terminal_promise]);
}
export function layoutOperationPending(window) { return Boolean(window.__tvCliLayoutSwitch?.pending); }
export function layoutOperationDetails(window, document) {
  const op=window.__tvCliLayoutSwitch;if(!op)return null;
  const uid=window.TradingViewApi?._chartWidgetCollection?.metaInfo?.uid;
  return {token:op.token,generation:op.generation,pending:op.pending,state:op.state,
    original_id:op.original_id,expected_id:op.expected_id,current_id:String(typeof uid?.value==='function'?uid.value():uid),
    dialog_visible:layoutConfirmationVisible(document),dialog_action:op.dialog_action,confirmation_seen:op.confirmation_seen,
    supported_native:op.supported_native,promise_settled:op.promise_settled,promise_rejected:op.promise_rejected,
    error:op.error,unverified:op.unverified,stable_count:op.stable_count};
}
export const LAYOUT_PAGE_CODE=[layoutConfirmationRoot,layoutConfirmationVisible,startLayoutOperation,observeLayoutPromise,layoutOperationPending,layoutOperationDetails].map(fn=>fn.toString()).join('\n');

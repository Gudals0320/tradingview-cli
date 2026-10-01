import CDP from './cdp.js';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireSession } from './session.js';
import { findPineController } from './core/desktop-dom.js';
import { layoutConfirmationVisible, layoutOperationPending } from './layout-state.js';
import { readChartContext } from './chart-context.js';

export async function recoverSession({ runId, targetId, _deps } = {}) {
  const lease = (_deps?.acquireSession || acquireSession)({ recover: true, command: 'session recover' });
  let client;
  try {
    const pending = lease.pending();
    if (!runId || pending?.run_id !== runId || !pending.native_quiescence_required) {
      throw Object.assign(new Error('Pass the exact native recovery run ID. Batch journals use pine-batch --recover.'), { code: 'RUN_ID_MISMATCH' });
    }
    const target = pending.target_id || targetId;
    if (!target || (pending.target_id && targetId && pending.target_id !== targetId)) {
      throw Object.assign(new Error('Recovery requires the exact recorded target, or --target-id if dispatch did not identify it.'), { code: 'TARGET_REQUIRED' });
    }
    client = await (_deps?.connect || CDP)({ host: CDP_HOST, port: CDP_PORT, target });
    const result = await client.Runtime.evaluate({ returnByValue: true, expression: `(() => {
      ${layoutConfirmationVisible.toString()};${layoutOperationPending.toString()};
      const controller = (${findPineController.toString()})(document);
      const requests = controller?._editorStore?.getStore?.().getState()?.ui?.pendingRequests;
      const compile = window.__tvCliPineCompile, save = window.__tvCliSave;
      const genericPending = Object.values(window.__tvCliNativeOperations || {}).some(operation => operation.pending);
      const context = (${readChartContext.toString()})(window);
      const sources = window.TradingViewApi?._activeChartWidgetWV?.value()?._chartWidget.model().model().dataSources();
      return { ready: Boolean(sources) && !context?.loading && !layoutOperationPending(window,document) && !genericPending && !(compile && !compile.actionDone) && !save?.pending
        && !Object.keys(requests || {}).length && !sources.some(source => {
          let status = source.status?.(); if (status?.value) status = status.value();
          return status?.type === 0 || status?.type === 1;
        }), compile_token: compile?.token, save_token: save?.token };
    })()` });
    if (result.exceptionDetails || result.result?.value?.ready !== true) {
      throw Object.assign(new Error('Native execution or calculation is still pending or unreadable; fence retained.'), { code: 'NATIVE_BUSY' });
    }
    lease.release({ restored: true });
    return { success: true, recovered: true, incomplete: true, restored: false,
      note: 'Native quiescence verified. The interrupted command outcome remains unknown; inspect state before retrying.' };
  } finally {
    try { if (client) await client.close(); } catch { /* Native state/error takes precedence over transport cleanup. */ }
    lease.release();
  }
}

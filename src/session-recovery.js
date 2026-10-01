import CDP from './cdp.js';
import { CDP_HOST, CDP_PORT } from './config.js';
import { acquireSession } from './session.js';
import { findPineController } from './core/desktop-dom.js';
import { LAYOUT_PAGE_CODE } from './layout-state.js';
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

export async function recoverSession({ runId, targetId, _deps } = {}) {
  const lease = (_deps?.acquireSession || acquireSession)({ recover: true, command: 'session recover' });
  let client,remote,primaryError;
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
    let loaderId=null;
    if(pending.page_loader_id)loaderId=(await client.Page.getFrameTree()).frameTree?.frame?.loaderId||null;
    const invalidated=Boolean(pending.page_loader_id&&loaderId&&loaderId!==pending.page_loader_id);
    const probe=async()=>{
      const result = await client.Runtime.evaluate({ returnByValue: true, expression: `(() => {
        ${LAYOUT_PAGE_CODE};
        const controller = (${findPineController.toString()})(document);
        const requests = Object.keys(controller?._editorStore?.getStore?.().getState()?.ui?.pendingRequests||{});
        const compile = window.__tvCliPineCompile, save = window.__tvCliSave;
        const registry = Object.entries(window.__tvCliNativeOperations||{}).filter(([,operation])=>operation.pending).map(([token])=>token);
        const context = (${readChartContext.toString()})(window);
        const sources = window.TradingViewApi?._activeChartWidgetWV?.value()?._chartWidget.model().model().dataSources();
        const calculating=(sources||[]).filter(source=>{let status=source.status?.();if(status?.value)status=status.value();return status?.type===0||status?.type===1;}).map(source=>source.id?.());
        const layout=layoutOperationDetails(window,document);
        const missingGeneration=${Boolean(pending.layout_generation&&!invalidated)}&&window.__tvCliPageGeneration!==${JSON.stringify(pending.layout_generation||null)};
        const blockers={compile:Boolean(compile&&!compile.actionDone),save:Boolean(save?.pending),registry_tokens:registry,
          layout_switch_unverified:Boolean(layout?.pending||missingGeneration),pending_requests:requests,calculating,context_loading:Boolean(context?.loading)};
        const meta=window.TradingViewApi?._chartWidgetCollection?.metaInfo?.uid;
        return {ready:Boolean(sources)&&!Object.values(blockers).some(value=>Array.isArray(value)?value.length:value),blockers,
          layout_operation:layout,layout_id:String(typeof meta?.value==='function'?meta.value():meta),generation:window.__tvCliPageGeneration||null};
      })()` });
      if(result.exceptionDetails)throw Object.assign(new Error('Native quiescence probe is unreadable.'),{code:'NATIVE_BUSY'});
      return result.result?.value||{ready:false};
    };
    let state=await probe();
    if(invalidated&&!pending.layout_page_local)throw Object.assign(new Error('Old layout implementation was not verified page-local; generation destruction alone cannot prove its external callbacks ended. No unsafe override is provided.'),{code:'LAYOUT_UNVERIFIED'});
    if(invalidated){
      remote=(await client.Runtime.evaluate({returnByValue:false,expression:`({chart:window.TradingViewApi?._activeChartWidgetWV?.value(),controller:(${findPineController.toString()})(document)})`})).result?.objectId;
      if(!remote)throw Object.assign(new Error('Changed generation could not be rebound safely.'),{code:'NATIVE_BUSY'});
      const stable=await verifyStableRebind(async()=>{
        const current=await probe();
        const frame=(await client.Page.getFrameTree()).frameTree?.frame?.loaderId;
        const identities=await client.Runtime.callFunctionOn({objectId:remote,returnByValue:true,functionDeclaration:`function(){return {chart_same:this.chart===window.TradingViewApi?._activeChartWidgetWV?.value(),controller_same:this.controller===(${findPineController.toString()})(document)}}`});
        return {...current,ready:current.ready&&frame===loaderId&&!identities.exceptionDetails,loader_id:frame,...identities.result?.value};
      });
      if(!stable.ready)throw Object.assign(new Error('Page invalidation was observed, but the new layout/chart/controller was not stable; fence retained.'),{code:'NATIVE_BUSY',details:stable});
      state=stable.details;
    }
    if (state.ready !== true) throw Object.assign(new Error('Native execution is pending or layout completion remains unverified. Resolve the recorded action, then retry. A never-settling action requires explicit page recovery; no automatic reload occurs.'), { code: 'NATIVE_BUSY',details:state });
    lease.release({ restored: true });
    return { success: true, recovered: true, incomplete: true, restored: false,generation_invalidated:invalidated,
      note: 'Quiescence verified. The interrupted outcome remains unknown; inspect state before retrying.' };
  } catch(error){primaryError=error;throw error;}
  finally {
    try {if(remote)await client.Runtime.releaseObject({objectId:remote});if(client)await client.close();}catch{/* State evidence takes precedence over transport cleanup. */}
    try {lease.release();}catch(error){if(primaryError)primaryError.details={...primaryError.details,cleanup_warning:error.message};else throw error;}
  }
}

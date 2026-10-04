import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
const workspace = loadWorkspace(resolveWorkspace(process.argv[2]));
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  const result = await evaluate(`(() => {
    const panes=window.TradingViewApi._chartWidgetCollection.getAll();
    return panes.map((pane,index)=>{const model=pane.model?.()||pane._chartWidget.model();return {pane:index,loading:model.mainSeries().isLoading(),sources:model.model().dataSources().map(s=>{
      let status=s.status?.();status=typeof status?.value==='function'?status.value():status;
      const info=s.metaInfo?.();return {kind:s.constructor?.name,id:String(s.id?.()).startsWith('ESD$')?s.id():'redacted',
        flags:info?{isTVScript:info.isTVScript,isTVScriptStrategy:info.isTVScriptStrategy,is_strategy:info.is_strategy}:null,
        status_type:status?.type,status_kind:typeof status,status_value:typeof status==='object'?Object.keys(status||{}):status,status_error:Boolean(status?.error),isLoading:typeof s.isLoading==='function'?s.isLoading():null,
        isStudy:typeof s.isStudy==='function'?s.isStudy():null,isMainSeries:typeof s.isMainSeries==='function'?s.isMainSeries():null,
        methods:[...new Set([Object.getPrototypeOf(s),Object.getPrototypeOf(Object.getPrototypeOf(s))].flatMap(p=>Object.getOwnPropertyNames(p)))].filter(k=>/load|data|status|study|update|time|finish|pending|start|source/i.test(k))};})};});
  })()`);
  console.log(JSON.stringify(result));
}); } finally { await disconnect(); }

import { runInNewContext } from 'node:vm';
import { WORKSPACE_PAGE_CODE } from '../../src/workspace-page.js';
export function preparationPage(){
  let identity={},source='',modified=false,creates=0,openFailure=false;
  const saved=[];
  const model={mainSeries:()=>({symbolInfo:()=>({full_name:'FIXTURE:OWNED'}),bars:()=>({firstIndex:()=>0,lastIndex:()=>0,valueAt:()=>[1704067200,1,1,1,1,1]})}),model:()=>({dataSources:()=>[]})};
  const chart={_chartWidget:{model:()=>model},symbol:()=> 'FIXTURE:OWNED',resolution:()=> '60',chartType:()=>1};
  const controller={openNewScript(){},openScript(){},setScript(){},isModified:()=>modified,isDraft:()=>false,getScriptIdVersion:()=>identity,
    _initScriptVersion:async target=>{if(openFailure)throw Error('native open response unknown');const doc=saved.find(s=>s.scriptIdPart===target.scriptIdPart&&s.version===target.version);if(!doc)throw Error('missing');identity={scriptIdPart:doc.scriptIdPart,version:doc.version};source=doc.source;},
    _editorStore:{getStore:()=>({getState:()=>({ui:{pendingRequests:{}}})})},_editorRef:{current:{_editor:{getValue:()=>source,setValue(){},getModel:()=>({})},_monaco:{editor:{}}}}};
  const document={querySelectorAll:()=>[{offsetParent:{},__reactFiber$fixture:{memoizedProps:{value:controller}}}],querySelector:()=>null};
  const window={TradingViewApi:{_activeChartWidgetWV:{value:()=>chart},_chartWidgetCollection:{getAll:()=>[chart],metaInfo:{uid:'fixture-layout'}},_pineEditorApi:{saveNewScript:async({name,source})=>{creates++;saved.push({scriptIdPart:'QA;fixture',scriptName:name,version:'1.0',source});return {success:true};}}}};
  const fetch=async url=>({ok:true,status:200,json:async()=>url.includes('/list/')?saved:saved.find(s=>url.includes(encodeURIComponent(s.scriptIdPart)))||{}});
  const context={window,document,fetch,setTimeout,clearTimeout};
  const evaluate=expression=>runInNewContext(expression,context);
  const call=(fn,...args)=>evaluate(`(()=>{${WORKSPACE_PAGE_CODE};return ${fn}(window,document,${args.map(a=>JSON.stringify(a)).join(',')});})()`);
  return {evaluate,snapshot:()=>call('readWorkspacePage'),bind:ws=>call('bindWorkspacePage',ws,'fixture-generation'),creates:()=>creates,setModified:value=>{modified=value;},setOpenFailure:value=>{openFailure=value;}};
}

import {it} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers';
import {planPineCompilation,dispatchPineCompilation,verifyPineCompilation,pineCompileContext,refreshSavedPine,readPineOutcome} from '../src/core/pine-state.js';
import {smartCompile} from '../src/core/pine.js';

function fixture(items=[{id:'p',pine:'P',text:'old'}]) {
  const sources=items.map(item=>({...item,metaInfo:()=>({isTVScript:true,description:'Same title'}),status:()=>({type:2})}));
  const chart={_chartWidget:{model:()=>({model:()=>({dataSources:()=>sources.map(item=>({...item,id:()=>item.id}))})})},
    getStudyById:id=>({getInputValues:()=>{const item=sources.find(item=>item.id===id);return [
      {id:'pineId',value:item.pine},{id:'text',value:item.text},{id:'pineVersion',value:'1.0'},
    ];}})};
  const window={TradingViewApi:{_activeChartWidgetWV:{value:()=>chart}},__tvCliPineCompile:{token:'token',refresh:()=>{}}};
  let identity={scriptIdPart:'P',version:'1.0'},adds=0,updates=0;
  const controller={getScriptIdVersion:()=>identity,isModified:()=>true,isDraft:()=>false,
    updateOnChart:async()=>{updates++;sources.find(item=>item.pine==='P').text='new';},
    addToChart:async()=>{adds++;sources.push({id:'new',pine:'P',text:'new',metaInfo:()=>({isTVScript:true}),status:()=>({type:2})});identity={scriptIdPart:'P',version:'1.0'};},
  };
  return {window,controller,sources,counts:()=>({adds,updates}),setIdentity:value=>{identity=value;}};
}
it('updates the single Pine document after errors even when the UI suggests add',async()=>{
  const f=fixture([{id:'p',pine:'P',text:'old'},{id:'q',pine:'Q',text:'same-title-other-doc'},{id:'r',pine:'R',text:'other-strategy'}]);
  assert.equal(dispatchPineCompilation(f.window,f.controller,'token',{querySelectorAll:()=>[{__reactProps$qa:{onClick:()=>f.controller.addToChart()}}]}),'updateOnChart');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.counts(),{adds:0,updates:1});
  assert.equal(f.window.__tvCliPineCompile.check().verified,true);
  assert.equal(f.sources[1].text,'same-title-other-doc');assert.equal(f.sources[2].text,'other-strategy');
});
it('rejects duplicate targets before dispatch and before unchanged shortcuts',async()=>{
  const f=fixture([{id:'p',pine:'P',text:'old'},{id:'duplicate',pine:'P',text:'old'}]);
  assert.equal(planPineCompilation(f.window,f.controller).code,'AMBIGUOUS_TARGET');
  assert.throws(()=>dispatchPineCompilation(f.window,f.controller,'token'),/AMBIGUOUS_TARGET/);
  f.controller.isModified=()=>false;
  const context=pineCompileContext(f.window,f.controller);assert.equal(context.code,'AMBIGUOUS_TARGET');
  let inspections=0;const result=await smartCompile({_deps:{source:'strategy("Same title")',readOutcome:async()=>readPineOutcome(f.window,f.controller,null,'token'),evaluate:expression=>{if(expression.includes('return failCompilation('))return true;inspections++;return context;}}});
  assert.equal(result.code,'AMBIGUOUS_TARGET');assert.equal(inspections,1);assert.deepEqual(f.counts(),{adds:0,updates:0});
});
it('rejects native duplicate addition instead of choosing a report',()=>{
  const f=fixture();const plan=planPineCompilation(f.window,f.controller);
  f.sources.push({...f.sources[0],id:'duplicate'});
  assert.equal(verifyPineCompilation(f.window,{plan,controller:f.controller}).code,'DUPLICATE_ADDED');
});
it('rejects unrelated changes, target replacement, and document identity changes',()=>{
  const f=fixture([{id:'p',pine:'P',text:'old'},{id:'q',pine:'Q',text:'unrelated'}]);
  const plan=planPineCompilation(f.window,f.controller);
  f.sources[1].text='mutated';assert.equal(verifyPineCompilation(f.window,{plan,controller:f.controller}).code,'TARGET_MISMATCH');
  f.sources[1].text='unrelated';f.sources[0].id='replacement';assert.equal(verifyPineCompilation(f.window,{plan,controller:f.controller}).code,'TARGET_MISMATCH');
  f.setIdentity({scriptIdPart:'Q'});assert.equal(verifyPineCompilation(f.window,{plan,controller:f.controller}).code,'TARGET_MISMATCH');
});
it('draft add is verified only after it has exactly one assigned document study',async()=>{
  const f=fixture([{id:'q',pine:'Q',text:'unrelated'}]);f.setIdentity(null);
  assert.equal(dispatchPineCompilation(f.window,f.controller,'token'),'addToChart');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.window.__tvCliPineCompile.check().verified,true);assert.deepEqual(f.counts(),{adds:1,updates:0});
});
it('fails closed when a connected document has no native update action',()=>{
  const f=fixture();delete f.controller.updateOnChart;
  assert.throws(()=>dispatchPineCompilation(f.window,f.controller,'token'),/unavailable/);
  assert.deepEqual(f.counts(),{adds:0,updates:0});
});
it('reports unreadable chart targets without dispatching a mutation',()=>{
  const f=fixture();f.window.TradingViewApi._activeChartWidgetWV.value=()=>{throw new Error('calculating');};
  assert.equal(planPineCompilation(f.window,f.controller).code,'TARGETS_UNREADABLE');
  assert.throws(()=>dispatchPineCompilation(f.window,f.controller,'token'),/TARGETS_UNREADABLE/);
  assert.deepEqual(f.counts(),{adds:0,updates:0});
});
it('clean saved refresh translates the saved version but targets the old applied version without persistence',async()=>{
  const f=fixture();let restarted=0,translated=null;
  f.setIdentity({scriptIdPart:'P',version:'2.0'});
  f.sources[0].restart=()=>{restarted++;};
  f.controller.getSource=()=> 'indicator("P")\nplot(close)';
  f.controller._editorStore={getStore:()=>({getState:()=>({script:{scriptName:'P'}})}),
    addPendingRequest:()=>{},removePendingRequest:()=>{},pushScriptError:()=>{},translateScript:async opts=>{translated=opts;return {success:true,metaInfo:{}};}};
  f.controller._replaceStubByStudy=async (opts,stub,update,modified)=>{assert.equal(stub,null);assert.equal(update,true);assert.equal(modified,true);assert.equal(opts.oldPineVersion,'1.0');assert.equal(opts.pineVersion,'2.0');};
  const plan=planPineCompilation(f.window,f.controller);await refreshSavedPine(f.window,f.controller,plan);
  assert.deepEqual(translated,{scriptIdPart:'P',scriptVersion:'2.0'});assert.equal(restarted,1);
  assert.deepEqual(f.counts(),{adds:0,updates:0});
});
it('failed saved translation returns diagnostics without replacing or restarting any study',async()=>{
  const f=fixture();let replaced=0,restarted=0,diagnostics=0;
  f.sources[0].restart=()=>{restarted++;};
  f.controller._editorStore={getStore:()=>({getState:()=>({script:{scriptName:'P'}})}),addPendingRequest:()=>{},removePendingRequest:()=>{},
    pushScriptError:()=>{diagnostics++;},translateScript:async()=>({success:false,compileErrors:{errors:[{message:'syntax'}]}})};
  f.controller._replaceStubByStudy=async()=>{replaced++;};
  const plan=planPineCompilation(f.window,f.controller);
  await assert.rejects(refreshSavedPine(f.window,f.controller,plan),/failed native compilation/);
  assert.equal(replaced,0);assert.equal(restarted,0);assert.equal(diagnostics,1);assert.equal(f.sources[0].text,'old');
});

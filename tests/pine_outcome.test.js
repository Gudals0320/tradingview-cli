import {it} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {finalizePineCompile,save} from '../src/core/pine.js';
import {readPineOutcome,pineStudySnapshot} from '../src/core/pine-state.js';
import {readStrategyReport} from '../src/strategy-state.js';

function fixture({markers=[],runtime=false,version='2.0'}={}){
  const source={id:()=> 'study',metaInfo:()=>({isTVScript:true,isTVScriptStrategy:true,description:'QA'}),
    status:()=>runtime?{type:3,errorDescription:{code:'RE10045',error:'Error on bar {bar_index}: {funcName} index {index}, size {size}',ctx:{bar_index:18,funcName:'array.get',index:-1,size:0}}}:{type:2},
    reportData:()=>null};
  const chart={_chartWidget:{model:()=>({model:()=>({dataSources:()=>[source]})})},getStudyById:()=>({getInputValues:()=>[
    {id:'pineId',value:'P'},{id:'pineVersion',value:version},{id:'text',value:'new-code'}]})};
  const window={TradingViewApi:{_activeChartWidgetWV:{value:()=>chart}},__tvCliCompilation:{token:'run',phase:'pending',strategy_mode:true,target_study_id:'study'}};
  const controller={getScriptIdVersion:()=>({scriptIdPart:'P',version}),isModified:()=>false,isDraft:()=>false};
  const monaco={editor:{getModel:()=>({uri:'P'})},env:{editor:{getModelMarkers:()=>markers.map(m=>({startLineNumber:m.line,startColumn:m.column,message:m.message,severity:m.severity}))}}};
  const inspect=expression=>runInNewContext(expression,{window});
  const context={identity:{scriptIdPart:'P',version:'1.0'},before:[{...pineStudySnapshot(window)[0],compiled_identity:'old-code'}]};
  return {window,controller,context,inspect,_deps:{readOutcome:async()=>readPineOutcome(window,controller,monaco,'run'),readPersistence:async()=>({matches:true})}};
}
it('failed --save syntax responses report actual persistence, version, chart changes and terminal state',async()=>{
  const f=fixture({markers:[{line:3,column:8,message:'Missing function',severity:8}]});
  const r=await finalizePineCompile({success:false,compiled:false,error:'Rejected'},{...f,token:'run',source:'bad source',saveChanges:true});
  assert.equal(r.code,'PINE_COMPILE_ERROR');assert.equal(r.saved,true);assert.equal(r.version,'2.0');assert.equal(r.save_performed,true);assert.equal(r.chart_changed,true);
  assert.equal(r.errors[0].line,3);assert.equal(readStrategyReport(f.window).code,'PINE_COMPILE_ERROR');
});
it('runtime native descriptions remain actionable even with empty Monaco markers',async()=>{
  const f=fixture({runtime:true});const r=await finalizePineCompile({success:false,compiled:false,error:'Rejected'},{...f,token:'run',source:'runtime source'});
  assert.equal(r.code,'PINE_RUNTIME_ERROR');assert.equal(r.compiled,true);assert.match(r.runtime_error,/18.*array.get.*-1.*0/);
  assert.equal(r.runtime_diagnostics[0].native_code,'RE10045');assert.equal(r.runtime_diagnostics[0].context.index,-1);
  assert.equal(readStrategyReport(f.window).code,'PINE_RUNTIME_ERROR');
});
for(const code of ['TARGET_MISMATCH','DUPLICATE_ADDED','TARGETS_UNREADABLE','SAVE_NOT_CONFIRMED','COMPILATION_REPLACED','REPORT_TIMEOUT']){
  it(`finalizes ${code} without leaving a report epoch pending`,async()=>{
    const f=fixture();const r=await finalizePineCompile({success:false,compiled:false,code,error:'failure'},{...f,token:'run',source:'source',saveChanges:true});
    assert.equal(r.code,code);assert.equal(r.saved,true);assert.equal(f.window.__tvCliCompilation.phase,'failed');
  });
}
it('native refusal without diagnostics is explicit and reports unchanged persistence accurately',async()=>{
  const f=fixture({version:'1.0'});f.context.before=pineStudySnapshot(f.window);
  const r=await finalizePineCompile({success:false,compiled:false,error:'Rejected'},{...f,token:'run',source:'source',saveChanges:true});
  assert.equal(r.code,'NATIVE_ACTION_REJECTED');assert.match(r.error,/No diagnostics available/);assert.equal(r.save_performed,false);assert.equal(r.chart_changed,false);
});
it('persistence inspection failure reports uncertainty instead of a false rollback',async()=>{
  const f=fixture();f._deps.readPersistence=async()=>{throw new Error('network');};
  const r=await finalizePineCompile({success:false,compiled:false,code:'TARGET_MISMATCH',error:'failure'},{...f,token:'run',source:'source',saveChanges:true});
  assert.equal(r.saved,null);assert.equal(r.persistence_verified,false);assert.equal(r.version,'2.0');
});
it('save verification failure terminates its prepared strategy epoch',async()=>{
  const window={};let ticks=0;
  const result=await save({timeout:200,_deps:{source:'strategy("QA")',sleep:async()=>{ticks++;},now:()=>ticks*100,
    evaluate:expression=>{
      if(expression.includes('return failCompilation('))return runInNewContext(expression,{window});
      if(expression.includes('beginCompilation(window,"')){const token=expression.match(/beginCompilation\(window,"([^"]+)"/)?.[1];window.__tvCliCompilation={token,phase:'pending',strategy_mode:true};return true;}
      if(expression.includes('return {pending:operation.pending'))return {pending:false,error:'Canceled'};
      return true;
    },evaluateAsync:async()=>false,
  }});
  assert.equal(result.success,false);assert.equal(window.__tvCliCompilation.phase,'failed');assert.equal(window.__tvCliCompilation.failure_code,'SAVE_FAILED');
});
for(const failure of ['timeout','verification','exception']){
  it(`save ${failure} terminates its prepared report epoch`,async()=>{
    const window={};let ticks=0;
    const result=await save({timeout:200,_deps:{source:'strategy("QA")',sleep:async()=>{ticks++;},now:()=>ticks*100,
      evaluate:expression=>{
        if(expression.includes('return failCompilation('))return runInNewContext(expression,{window});
        if(expression.includes('beginCompilation(window,"')){window.__tvCliCompilation={token:expression.match(/beginCompilation\(window,"([^"]+)"/)?.[1],phase:'pending',strategy_mode:true};return true;}
        if(expression.includes('return {pending:operation.pending')){
          if(failure==='exception')throw new Error('Inspector failed');
          return failure==='timeout'?{pending:true}:{pending:false,identity:{scriptIdPart:'P',version:'2.0'},modified:false};
        }
        return true;
      },evaluateAsync:async()=>false,
    }});
    assert.equal(result.success,false);assert.equal(window.__tvCliCompilation.phase,'failed');assert.equal(window.__tvCliCompilation.failure_code,'SAVE_FAILED');
  });
}

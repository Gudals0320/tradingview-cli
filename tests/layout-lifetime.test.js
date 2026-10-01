import { it } from 'node:test';
import assert from 'node:assert/strict';
import { startLayoutOperation, observeLayoutPromise, layoutOperationPending, layoutOperationDetails } from '../src/layout-state.js';
import { trackNativeOperation } from '../src/native-operation.js';
import { verifyStableRebind } from '../src/session-recovery.js';
import { requestLayoutSwitch, layoutSwitch } from '../src/core/ui.js';
import { runInNewContext } from 'node:vm';

function fixture(supportedNative=false) {
  let uid='B',visible=false,listener,tick;
  const root={querySelector:()=>({}),contains:()=>true,addEventListener:(_,fn)=>{listener=fn;},removeEventListener:()=>{listener=null;}};
  const button=(name,qa)=>({offsetParent:{},parentElement:{parentElement:root},getAttribute:key=>key==='name'?name:qa});
  const document={querySelectorAll:()=>visible?[button('dontSave','dontSave-btn')]:[]};
  const chart={_chartWidget:{model:()=>({mainSeries:()=>({isLoading:()=>false})})}};
  const window={setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{},TradingViewApi:{_activeChartWidgetWV:{value:()=>chart},_chartWidgetCollection:{metaInfo:{uid:{value:()=>uid}}}}};
  const operation=startLayoutOperation(window,document,{token:'token',generation:'generation',expected:'A',supportedNative,samples:3,grace:10});
  const sample=(count=3)=>{for(let index=0;index<count;index++)tick();};
  operation.dispatch_observed=true;
  return {window,document,operation,sample,uid:value=>{uid=value;},dialog:value=>{visible=value;},click:action=>{listener?.({target:button(action,action==='cancel'?'cancel-btn':action==='dontSave'?'dontSave-btn':'ok-btn')});visible=false;}};
}
async function microtasks(){await Promise.resolve();await Promise.resolve();}

it('saved layout lookup failures do not enter mutation dispatch or create a native fence', async () => {
  let mutations=0;
  const result=await layoutSwitch({name:'missing',_deps:{evaluate:async()=>false,
    evaluateAsync:async(_,options)=>{if(options?.mutation)mutations++;return {success:false,code:'LAYOUT_NOT_FOUND',error:'missing'};}}});
  assert.equal(result.code,'LAYOUT_NOT_FOUND');assert.equal(mutations,0);
});

it('normal supported switch and late native settlement clear only after stable identity', async () => {
  const f=fixture(true);let resolve;
  await trackNativeOperation(f.window,'outer',async()=>{observeLayoutPromise(f.window,f.operation,new Promise(done=>{resolve=done;}));});
  f.operation.request_at=Date.now()-100;f.sample(10);assert.equal(f.operation.unverified,true);
  f.uid('A');f.sample(10);assert.equal(f.operation.pending,true);
  resolve(true);await microtasks();f.sample();
  assert.equal(f.operation.state,'switched');assert.equal(f.operation.pending,false);
  assert.equal(Object.keys(f.window.__tvCliNativeOperations).length,0);
});

it('serialized layout dispatch passes the saved chart object and verifies the supported path', async () => {
  const f=fixture(true),chart={id:123,url:'A',name:'QA'};
  f.operation.pending=false;
  f.window.TradingViewApi.getSavedCharts=cb=>cb([chart]);
  f.window.TradingViewApi._loadChartService={loadChart:()=>{}};
  f.window.TradingViewApi.loadChartFromServer=selected=>{assert.equal(selected.id,123);assert.equal(selected.url,'A');f.uid('A');return Promise.resolve(true);};
  const context={window:f.window,document:f.document,navigator:{userAgent:'TradingView/3.4.1 '},setTimeout,clearTimeout};
  const evaluate=async expression=>runInNewContext(expression,context);
  const result=await layoutSwitch({name:'123',_deps:{evaluate,evaluateAsync:evaluate,sleep:async()=>{await microtasks();f.sample();}}});
  assert.equal(result.success,true);assert.equal(result.layout_verified,true);assert.equal(result.layout_id,'A');
});

it('unknown void/no-op and absence past grace never retire the fence', () => {
  const f=fixture();f.operation.request_at=Date.now()-100;observeLayoutPromise(f.window,f.operation,undefined);f.sample();
  assert.equal(f.operation.unverified,true);assert.equal(layoutOperationPending(f.window),true);
});
it('same-layout void actions and an unreadable chart cannot falsely prove a native terminal outcome', () => {
  const f=fixture();f.operation.expected_id='B';observeLayoutPromise(f.window,f.operation,undefined);f.sample(10);
  assert.equal(f.operation.pending,true);
  f.window.TradingViewApi._activeChartWidgetWV.value=()=>null;assert.doesNotThrow(()=>f.sample());
  assert.equal(f.operation.pending,true);
});
it('an unknown thenable stays referenced until both native settlement and terminal identity', async () => {
  const f=fixture();let resolve;
  await trackNativeOperation(f.window,'outer',async()=>{observeLayoutPromise(f.window,f.operation,new Promise(done=>{resolve=done;}));});
  f.uid('A');f.sample(10);assert.equal(f.operation.pending,true);assert.equal(Object.keys(f.window.__tvCliNativeOperations).length,1);
  resolve();await microtasks();f.sample();await microtasks();
  assert.equal(f.operation.state,'switched');assert.equal(Object.keys(f.window.__tvCliNativeOperations).length,0);
});
it('late captured cancel settles; uncaptured disappearance stays fenced', () => {
  const f=fixture();f.operation.request_at=Date.now()-100;f.sample();f.dialog(true);f.sample();f.click('cancel');f.sample();
  assert.equal(f.operation.state,'cancelled');assert.equal(f.operation.pending,false);
  const unknown=fixture();unknown.dialog(true);unknown.sample();unknown.dialog(false);unknown.sample();assert.equal(unknown.operation.pending,true);
});
it('accept closes the dialog but remains fenced through delayed navigation', () => {
  const f=fixture();f.dialog(true);f.sample();f.click('dontSave');f.sample(10);assert.equal(f.operation.pending,true);
  f.uid('A');f.sample();assert.equal(f.operation.state,'switched');
  const never=fixture();never.dialog(true);never.sample();never.click('dontSave');never.operation.request_at=Date.now()-100;never.sample(10);
  assert.equal(never.operation.unverified,true);assert.equal(never.operation.pending,true);
});
it('supported promise true still requires stable expected identity and pending timeout holds one registry entry', async () => {
  const f=fixture(true);let resolveNative;
  const result=await trackNativeOperation(f.window,'outer',async()=>{
    observeLayoutPromise(f.window,f.operation,new Promise(resolve=>{resolveNative=resolve;}));return {dispatched:true};
  });
  assert.equal(result.dispatched,true);assert.equal(Object.keys(f.window.__tvCliNativeOperations).length,1);
  f.sample(5);assert.equal(f.operation.pending,true);resolveNative(true);await microtasks();f.sample(5);
  assert.equal(f.operation.pending,true);assert.equal(Object.keys(f.window.__tvCliNativeOperations).length,0);
  f.uid('A');f.sample();assert.equal(f.operation.state,'switched');
});
it('supported false/cancel, false/no capture and rejection settle only stable original/requested state', async () => {
  for(const action of ['cancel','none','reject']) {
    const f=fixture(true);if(action==='cancel'){f.dialog(true);f.sample();f.click('cancel');}
    observeLayoutPromise(f.window,f.operation,action==='reject'?Promise.reject(new Error('native refused')):Promise.resolve(false));
    await microtasks();f.sample();assert.equal(f.operation.pending,false);
    assert.equal(f.operation.state,action==='cancel'?'cancelled':action==='reject'?'failed':'not_switched');
  }
  const foreign=fixture(true);observeLayoutPromise(foreign.window,foreign.operation,Promise.resolve(false));await microtasks();foreign.uid('foreign');foreign.sample();assert.equal(foreign.operation.pending,true);
});
it('saved-chart object and required URL reach the loader, including numeric ID lookup', async () => {
  const chart={id:123,url:'A',name:'QA'},window={TradingViewApi:{getSavedCharts:cb=>cb([chart]),loadChartFromServer:value=>{assert.equal(value,chart);return Promise.resolve(false);}}};
  const result=await requestLayoutSwitch(window,'123',100);
  assert.equal(result.id,'A');assert.equal(result.native_thenable,true);
});
it('generation rebind needs stable loader/layout/chart/controller identity; surviving late switch fails it', async () => {
  let count=0;
  const stable=await verifyStableRebind(async()=>({ready:true,loader_id:'new',layout_id:'B',chart_same:true,controller_same:true}),{sleep:async()=>{}});
  assert.equal(stable.ready,true);
  const late=await verifyStableRebind(async()=>({ready:true,loader_id:'new',layout_id:++count<3?'B':'A',chart_same:true,controller_same:true}),{sleep:async()=>{}});
  assert.equal(late.ready,false);assert.equal(late.unstable,true);
  const unreadable=await verifyStableRebind(async()=>({ready:true,loader_id:'new',layout_id:'B'}),{sleep:async()=>{}});
  assert.equal(unreadable.ready,false,'Unreadable identity proof must not authorize recovery.');
});
it('layout status exposes actionable unverified blockers without private saved metadata', () => {
  const f=fixture();f.sample();const details=layoutOperationDetails(f.window,f.document);
  assert.equal(details.original_id,'B');assert.equal(details.expected_id,'A');assert.equal(details.pending,true);
  assert.equal(Object.hasOwn(details,'chart'),false);
});

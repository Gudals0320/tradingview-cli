import {it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {workspacePreflight,recoverySummary} from '../src/workspace-preflight.js';
import {reserveWorkspace,acquireWorkspace} from '../src/workspace-store.js';
import {ownerProcessState} from '../src/process-identity.js';
import {captureScreenshot} from '../src/core/capture.js';

function digest(directory) {
  const hash=createHash('sha256');
  const visit=dir=>{for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=join(dir,e.name);if(e.isDirectory())visit(path);else hash.update(path).update(readFileSync(path));
  }};
  visit(directory);return hash.digest('hex');
}
it('preflight reads connection, locks and recorded context without changing any state bytes or evaluating Desktop',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'tv-preflight-')),options={directory,host:'fixture',port:1};
  const ws=reserveWorkspace({file:join(directory,'handle.json'),target:'qa',layout:'saved'},options);
  const lease=acquireWorkspace(ws.file,options);
  lease.saveBinding({nonce:'generation',browser:'browser',snapshot:{context:{symbol:'QA',resolution:'60'},source:'PRIVATE_SOURCE'}});
  lease.finish({success:true});
  for(const disconnected of [false,true]){
    const before=digest(directory);
    const result=await workspacePreflight(ws.file,{...options,_deps:{inventory:async()=>{
      if(disconnected)throw Error('transport');return {targets:[{target:'qa',layout:'saved'}]};
    }}});
    assert.equal(result.connection.state,disconnected?'unknown':'connected');assert.equal(result.connection.generation_verified,false);
    assert.equal(result.affected_context.symbol,'QA');assert.equal(result.owner_state,'none');assert.equal(result.read_only,true);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SOURCE'),false);assert.equal(digest(directory),before);
  }
});
it('process diagnostics require matching start identity; PID existence and unreadable probes remain unknown',()=>{
  const owner={pid:999,start:'ignored',process_started_at:'2026-01-01T00:00:00Z'},kill=()=>{};
  assert.equal(ownerProcessState(owner,{kill,started:()=>owner.process_started_at}),'live');
  assert.equal(ownerProcessState(owner,{kill,started:()=> '2025-01-01T00:00:00Z'}),'dead');
  assert.equal(ownerProcessState(owner,{kill,started:()=>{throw Error('unreadable');}}),'unknown');
  assert.equal(ownerProcessState({pid:999},{kill}),'unknown');
  assert.equal(ownerProcessState(owner,{kill:()=>{throw Object.assign(Error(),{code:'ESRCH'});}}),'dead');
  assert.equal(ownerProcessState(owner,{kill:()=>{throw Object.assign(Error(),{code:'EPERM'});}}),'unknown');
});
it('recovery summary preserves incomplete independently of recovered and maps generation/context',()=>{
  const r=recoverySummary({before:'old',after:'new',context:{symbol:'QA'},adopted_changes:{context:true}});
  assert.equal(r.recovered,true);assert.equal(r.incomplete,true);assert.equal(r.generation_before,'old');assert.equal(r.generation_after,'new');
  assert.match(r.next_action,/remaining original work needs resumption/);
});
it('preflight unknown owner remains protected and changing operation is refused',async()=>{
  const state={success:true,workspace_id:'qa',target:'t',layout:'l',generation:'g',state:'running',operation:{id:'op',pid:999}};
  const deps={status:()=>state,load:()=>({}),locks:()=>({holders:[],queue:[]}),inventory:async()=>({targets:[]}),ownerState:()=> 'unknown'};
  const r=await workspacePreflight('unused',{_deps:deps});assert.equal(r.owner_state,'unknown');assert.match(r.next_action,/unknown process identity stays protected/);
  let call=0;deps.status=()=>++call===1?state:{...state,operation:{id:'changed'}};
  await assert.rejects(workspacePreflight('unused',{_deps:deps}),e=>e.code==='WORKSPACE_OBSERVATION_CHANGED');
});

function captureFixture(selector) {
  const calls=[],writes=[];
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(800,16);png.writeUInt32BE(600,20);
  const document={querySelector:value=>value===selector?{getBoundingClientRect:()=>({x:10,y:20,width:400,height:300}),closest:()=>({id:'pane-qa'})}:null};
  const window={scrollX:2,scrollY:3,devicePixelRatio:2,innerWidth:800,innerHeight:600};
  return {calls,writes,_deps:{evaluate:(expr,opts)=>{calls.push(opts);return runInNewContext(expr,{window,document});},
    getClient:async()=>({Page:{captureScreenshot:async params=>{calls.push(params);return {data:png.toString('base64')};}}}),
    writeFile:(path,bytes)=>writes.push({path,bytes})}};
}
it('CDP captures expose primary/alternate/no-selector crop metadata, pixel size and unknown axes',async()=>{
  for(const selector of ['[data-name="pane-canvas"]','[class*="chart-container"]','canvas',null]){
    const f=captureFixture(selector),r=await captureScreenshot({region:'chart',filename:'qa',_deps:f._deps});
    assert.equal(r.selector_used,selector);assert.equal(r.backend,'cdp');assert.equal(r.image_pixels.width,800);assert.equal(r.device_pixel_ratio,2);
    assert.equal(r.axes_included,'unknown');assert.equal(r.fallback,selector===null?'full_page':selector==='[data-name="pane-canvas"]'?null:'alternate_selector');
    assert.equal(r.coordinate_system,'page_css_pixels');assert.equal(f.writes.length,1);assert.equal(f.calls.some(c=>c?.mutation),false);
    if(selector){assert.equal(r.clip.x,12);assert.equal(r.clip.y,23);assert.equal(r.pane_id,'pane-qa');}else assert.equal(r.actual_region,'viewport');
  }
});
it('API capture reports trigger only, unknown region/no file and never falls back to another backend',async()=>{
  let calls=0;
  const deps={getChartCollection:async()=> 'owned',evaluate:async(expr,opts)=>{calls++;assert.equal(opts.mutation,true);},getClient:()=>assert.fail('no CDP fallback'),writeFile:()=>assert.fail('no file')};
  const r=await captureScreenshot({method:'api',region:'chart',_deps:deps});
  assert.equal(r.file_path,null);assert.equal(r.actual_region,'unknown');assert.equal(r.backend,'api');assert.equal(calls,1);
  deps.evaluate=async()=>{throw Error('API unavailable');};
  await assert.rejects(captureScreenshot({method:'api',_deps:deps}),e=>e.code==='SCREENSHOT_API_UNAVAILABLE');
});
it('multiple DOM pane matches explicitly report first match only, without claiming full chart coverage',async()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(300,16);png.writeUInt32BE(400,20);
  const el={getBoundingClientRect:()=>({x:0,y:0,width:300,height:400})},window={devicePixelRatio:1};
  const document={querySelector:()=>el,querySelectorAll:()=>[el,el]};
  const r=await captureScreenshot({region:'chart',_deps:{evaluate:expression=>runInNewContext(expression,{window,document}),
    getClient:async()=>({Page:{captureScreenshot:async()=>({data:png.toString('base64')})}}),writeFile:()=>{}}});
  assert.equal(r.matched_element_count,2);assert.equal(r.visible_match_count,2);assert.equal(r.selected_match_index,0);assert.equal(r.region_coverage,'first_match_only');
});
it('preflight distinguishes proven target absence, layout mismatch and duplicate saved layout',async()=>{
  const state={success:true,workspace_id:'w',target:'t',layout:'l',generation:'g',state:'idle'};
  for(const [targets,expected,duplicate] of [[[],'target_lost',false],[[{target:'t',layout:'other'}],'identity_mismatch',false],[[{target:'t',layout:'l'},{target:'u',layout:'l'}],'connected',true]]){
    const r=await workspacePreflight('unused',{_deps:{status:()=>state,load:()=>({}),locks:()=>({}),inventory:async()=>({targets})}});
    assert.equal(r.connection.state,expected);assert.equal(r.connection.duplicate_layout,duplicate);
  }
});

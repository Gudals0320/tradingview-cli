import { it } from 'node:test';
import assert from 'node:assert/strict';
import { preparePineDocument,preparationRequest,waitPineEditorMount } from '../src/pine-preparation.js';
const make=()=>{
  let state={mounted:true,modified:false,draft:false,identity:{},source:''},saved=[],intent=null,creates=0,opens=0;
  const request=preparationRequest({create:'QA',requestId:'stable',generation:'g',source:'//@version=6\nstrategy("QA")\n'});
  const journal={read:()=>intent,write:v=>{intent=structuredClone(v);}};
  const adapter={state:async()=>structuredClone(state),list:async()=>structuredClone(saved),get:async()=>({source:request.source}),create:async()=>{creates++;saved.push({id:'QA;1',name:'QA',version:'1'});},open:async d=>{opens++;state={...state,identity:{scriptIdPart:d.id,version:d.version},source:request.source};}};
  return {request,journal,adapter,available:async()=>{},counts:()=>({creates,opens}),setState:value=>{state={...state,...value};},saved, getIntent:()=>intent};
};
it('creation response loss reconciles exactly one new identity without creating again',async()=>{
  const h=make(),create=h.adapter.create;h.adapter.create=async r=>{await create(r);throw Error('response lost');};
  await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),/response lost/);
  const result=await preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});
  assert.equal(result.document.id,'QA;1');assert.equal(result.intent.stages.persistence_verified,true);assert.deepEqual(h.counts(),{creates:1,opens:1});
});
it('proven pre-dispatch rejection with no candidate can retry the same request safely',async()=>{
  const h=make(),create=h.adapter.create;let attempts=0;
  h.adapter.create=async r=>{if(attempts++===0)throw Object.assign(Error('plan rejected before dispatch'),{creation_rejected:true,code:'PINE_CREATION_REJECTED'});return create(r);};
  await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.details.creation_outcome==='rejected_known'&&e.details.replay_safe);
  assert.equal(h.getIntent().phase,'rejected_known');
  await preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});assert.equal(attempts,2);assert.equal(h.counts().creates,1);
});
it('ambiguous or absent creation stays unknown, never replayed or deleted',async()=>{
  for(const copies of [0,2]){
    const h=make();h.adapter.create=async()=>{for(let i=0;i<copies;i++)h.saved.push({id:`QA;${i}`,name:'QA',version:'1'});throw Error('lost');};
    await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}));
    await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.code==='PINE_CREATION_UNKNOWN');
    assert.equal(h.saved.length,copies);assert.equal(h.counts().opens,0);
  }
});
it('foreign draft, reservation and missing editor reject before creation or open',async()=>{
  for(const value of [{modified:true},{mounted:false}]){const h=make();h.setState(value);await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}));assert.deepEqual(h.counts(),{creates:0,opens:0});}
  const h=make();const request=preparationRequest({open:'foreign;1',requestId:'other',generation:'g'});
  await assert.rejects(()=>preparePineDocument(request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:async()=>{throw Error('reserved');}}),/reserved/);assert.deepEqual(h.counts(),{creates:0,opens:0});
});
it('matching names do not authorize adopting an existing document',async()=>{
  const h=make();h.saved.push({id:'preexisting',name:'QA',version:'1'});
  await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.code==='PINE_DOCUMENT_NAME_EXISTS');assert.deepEqual(h.counts(),{creates:0,opens:0});
});
it('exact-ID preparation verifies an already mounted saved document without a redundant native open',async()=>{
  const h=make();h.saved.push({id:'QA;existing',name:'QA',version:'1'});h.setState({identity:{scriptIdPart:'QA;existing',version:'1'},source:h.request.source});
  const request=preparationRequest({open:'QA;existing',requestId:'exact',generation:'g'});
  const result=await preparePineDocument(request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});assert.equal(result.intent.stages.created,false);assert.equal(result.intent.stages.opened,true);assert.equal(result.intent.open_dispatch,'not_needed');assert.equal(result.intent.reused_mounted,true);assert.deepEqual(h.counts(),{creates:0,opens:0});
});
it('same-ID source or version differences do not use the mounted-document shortcut',async()=>{
  for(const mismatch of ['version','source']){const h=make();h.saved.push({id:'QA;existing',name:'QA',version:'1'});h.setState({identity:{scriptIdPart:'QA;existing',version:mismatch==='version'?'0':'1'},source:mismatch==='source'?'different':h.request.source});
    const request=preparationRequest({open:'QA;existing',requestId:'exact',generation:'g'});const result=await preparePineDocument(request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});assert.equal(result.intent.reused_mounted,false);assert.deepEqual(h.counts(),{creates:0,opens:1});
  }
});
it('remote source mismatch refuses opening a response-loss candidate',async()=>{
  const h=make();h.adapter.get=async()=>({source:'foreign'});
  await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.code==='PINE_PERSISTENCE_UNVERIFIED');assert.deepEqual(h.counts(),{creates:1,opens:0});
});
it('changed remote version is not silently reopened or rolled back during resume',async()=>{
  const h=make();await preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});h.saved[0].version='2';
  await assert.rejects(()=>preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.code==='PINE_DOCUMENT_CHANGED');assert.deepEqual(h.counts(),{creates:1,opens:1});
});
it('native Redux completion waits for the actual editor commit without replaying open',async()=>{
  const h=make(),state=h.adapter.state,open=h.adapter.open;let pendingReads=0,opened=false,clock=0;
  h.adapter.open=async d=>{await open(d);opened=true;};
  h.adapter.state=async()=>{const actual=await state();return opened&&pendingReads++<3?{...actual,source:'previous saved source'}:actual;};
  const result=await preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available,now:()=>clock,sleep:async()=>{clock+=100;}});
  assert.equal(result.intent.stages.opened,true);assert.deepEqual(h.counts(),{creates:1,opens:1});assert.equal(clock,300);
});
it('editor readback timeout preserves the dispatch proof and resume never opens twice',async()=>{
  const h=make(),state=h.adapter.state,open=h.adapter.open;let clock=0,stall=true;
  h.adapter.open=async d=>{await open(d);};h.adapter.state=async()=>{const actual=await state();return actual.identity.scriptIdPart&&stall?{...actual,source:'old mounted source'}:actual;};
  const deps={journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available,timeout:300,now:()=>clock,sleep:async()=>{clock+=100;}};
  await assert.rejects(()=>preparePineDocument(h.request,deps),e=>e.code==='PINE_OPEN_UNVERIFIED'&&e.details.native_open_replayed===false);assert.equal(h.getIntent().phase,'open_wait');assert.equal(h.getIntent().open_dispatch,'completed');
  stall=false;await preparePineDocument(h.request,deps);assert.deepEqual(h.counts(),{creates:1,opens:1});
});
it('initial mount timeout is finite and dispatches no document action',async()=>{
  const h=make();let clock=0;h.setState({identity:{},draft:false,pending:true});
  await assert.rejects(()=>waitPineEditorMount(h.adapter,{timeout:300,now:()=>clock,sleep:async()=>{clock+=100;}}),e=>e.code==='PINE_EDITOR_SETTLE_TIMEOUT'&&e.details.document_action_dispatched===false);assert.equal(clock,300);assert.deepEqual(h.counts(),{creates:0,opens:0});
});
it('an actually empty idle editor settles without inventing a saved document or a timeout',async()=>{
  const h=make();h.setState({identity:{},source:'',draft:false,pending:false,open_status:'idle'});let sleeps=0;
  const state=await waitPineEditorMount(h.adapter,{sleep:async()=>{sleeps++;}});assert.equal(state.mounted,true);assert.equal(sleeps,0);assert.deepEqual(h.counts(),{creates:0,opens:0});
});
it('request ID conflict and full validation prevent replay; generation may change on explicit resume',async()=>{
  const h=make();await preparePineDocument(h.request,{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available});
  await assert.rejects(()=>preparePineDocument({...h.request,fingerprint:'different'},{journal:h.journal,adapter:h.adapter,assertDocumentAvailable:h.available}),e=>e.code==='PINE_REQUEST_CONFLICT');
  const resumed=preparationRequest({create:'QA',requestId:'stable',generation:'g2',source:h.request.source});assert.equal(resumed.fingerprint,h.request.fingerprint);
  for(const args of [{create:'a',open:'b'}, {create:'a',source:'\uFEFFwrong'},{open:'id',source:'wrong'},{create:'a',type:'bad'}])assert.throws(()=>preparationRequest({...args,requestId:'r',generation:'g'}));
});

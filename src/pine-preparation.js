import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evaluateAsync } from './connection.js';
import { sourceHash } from './session.js';
import { canonicalPineSource } from './pine-source.js';
import { secureDirectory } from './private-store.js';
import { findPineController, findPineEditor } from './core/desktop-dom.js';

const fail=(code,message,details)=>{throw Object.assign(new Error(message),{code,details});};

export function preparationRequest({create,open,type='strategy',source,requestId,generation}) {
  if(Boolean(create)===Boolean(open))fail('PINE_PREPARATION_INPUT','Choose exactly one --create NAME or --open DOCUMENT_ID.');
  if(!requestId||!/^[-a-zA-Z0-9_]{1,100}$/.test(requestId)||!generation)fail('PINE_PREPARATION_INPUT','Pass a stable --request-id and exact --generation from workspace show.');
  if(!['strategy','indicator','library'].includes(type))fail('PINE_PREPARATION_INPUT','type must be strategy, indicator or library.');
  if(create&&(!create.trim()||create.length>100))fail('PINE_PREPARATION_INPUT','Document name must be 1..100 characters.');
  if(open&&source!==undefined)fail('PINE_PREPARATION_INPUT','--file cannot replace an existing document during preparation.');
  const name=String(create||'');
  const template=type==='strategy'?`//@version=6\nstrategy(${JSON.stringify(name)}, overlay=true)\n`:type==='indicator'?`//@version=6\nindicator(${JSON.stringify(name)})\nplot(close)\n`:`//@version=6\nlibrary(${JSON.stringify(name)})\n`;
  const normalized=create?canonicalPineSource(source??template):null;
  if(create&&(!normalized||normalized.startsWith('\uFEFF')))fail('PINE_PREPARATION_INPUT','Source must be nonempty without a leading BOM.');
  const spec={create:create||null,open:open||null,type,source_hash:normalized?sourceHash(normalized):null,generation};
  const {generation: _generation,...identity}=spec;
  return {...spec,request_id:requestId,source:normalized,fingerprint:sourceHash(JSON.stringify(identity))};
}

export function preparationJournal(directory,requestId) {
  secureDirectory(directory);
  const path=join(directory,`pine-prepare-${sourceHash(requestId)}.json`);
  return {read:()=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null,write:value=>{
    const temporary=`${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);
  }};
}

/** Native saved-document API avoids locale-sensitive save dialogs and overwrite. */
export function pinePreparationAdapter(inspect=evaluateAsync) {
  const state=()=>inspect(`(()=>{const c=(${findPineController.toString()})(document),e=(${findPineEditor.toString()})(document);return {mounted:!!c&&!!e,modified:c?.isModified?.()??null,draft:c?.isDraft?.()??null,identity:c?.getScriptIdVersion?.()||null,pending:!!window.__tvCliPinePrepare?.pending,source:e?.editor.getValue()??null};})()`);
  return {state,
    list:()=>inspect(`fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved',{credentials:'include'}).then(async r=>{if(!r.ok)throw Error('PINE_LIST_FAILED: HTTP '+r.status);const rows=await r.json();if(!Array.isArray(rows))throw Error('PINE_LIST_FAILED: Invalid saved list');return rows.map(s=>({id:s.scriptIdPart,name:s.scriptName||s.scriptTitle,version:s.version}));})`),
    get:(id,version)=>inspect(`fetch('https://pine-facade.tradingview.com/pine-facade/get/'+encodeURIComponent(${JSON.stringify(id)})+'/'+encodeURIComponent(${JSON.stringify(version)}),{credentials:'include'}).then(async r=>{if(!r.ok)throw Error('PINE_DOCUMENT_NOT_FOUND: HTTP '+r.status);return r.json();})`),
    create:async request=>{try{return await inspect(`(async()=>{if(window.__tvCliPinePrepare?.pending)throw Error('WORKSPACE_NATIVE_BUSY: Document preparation pending');const c=(${findPineController.toString()})(document);if(!c||c.isModified?.())throw Error('PINE_FOREIGN_DRAFT: Preserve existing draft');const op=window.__tvCliPinePrepare={pending:true,request_id:${JSON.stringify(request.request_id)}};try{const saved=await window.TradingViewApi._pineEditorApi.saveNewScript({name:${JSON.stringify(request.create)},source:${JSON.stringify(request.source)}});op.saved=saved;return saved;}catch(e){op.error=e.message;throw e;}finally{op.pending=false;}})()`,{mutation:true});}catch(error){
      // Observed native paywall throws before saveNew is invoked. Other errors
      // (including compile diagnostics) cannot prove that no document exists.
      if(error.message.includes('Saving one more script is not available on the current plan')){error.code='PINE_CREATION_REJECTED';error.creation_rejected=true;}
      throw error;
    }},
    open:document=>inspect(`(async()=>{const c=(${findPineController.toString()})(document);if(!c||c.isModified?.())throw Error('PINE_FOREIGN_DRAFT: Preserve existing draft');const target={scriptIdPart:${JSON.stringify(document.id)},version:${JSON.stringify(document.version)}};if(typeof c._initScriptVersion!=='function')throw Error('PINE_OPEN_UNSUPPORTED: Exact-version native controller unavailable');await c._initScriptVersion(target);return true;})()`,{mutation:true}),
  };
}

/** Unknown creation is reconciled by exact before/after identities, never replayed. */
export async function preparePineDocument(request,{journal,adapter,assertDocumentAvailable,checkpoint=()=>{}}) {
  let intent=journal.read();
  if(intent&&intent.fingerprint!==request.fingerprint)fail('PINE_REQUEST_CONFLICT','Request ID already describes a different preparation.');
  const persist=()=>journal.write(intent);
  const before=await adapter.state();
  if(!before.mounted)fail('PINE_EDITOR_REQUIRED','Mount the Pine editor explicitly before preparing a document.');
  if(before.pending)fail('WORKSPACE_NATIVE_BUSY','Wait for the recorded document action; do not replay.');
  const ownOpened=intent?.document?.id===before.identity?.scriptIdPart;
  if(before.modified!==false)fail('PINE_FOREIGN_DRAFT','Modified or unverifiable editor draft is preserved; no save or replacement was dispatched.');
  const rows=await adapter.list();
  if(intent?.document){
    const latest=rows.find(s=>s.id===intent.document.id);
    if(!latest||String(latest.version)!==String(intent.document.version))fail('PINE_DOCUMENT_CHANGED','Saved document version changed; preparation will not reopen an older source.');
    if(intent.phase==='complete'&&(!ownOpened||String(before.identity?.version)!==String(intent.document.version)))fail('PINE_DOCUMENT_CHANGED','Completed preparation no longer matches the mounted document; use explicit detach/open instead of replay.');
  }
  if(!intent){
    if(request.open)await assertDocumentAvailable(request.open);
    if(request.create&&rows.some(s=>s.name===request.create))fail('PINE_DOCUMENT_NAME_EXISTS','An exact saved name already exists; use its document ID explicitly.');
    intent={schema:1,request_id:request.request_id,fingerprint:request.fingerprint,started_at:new Date().toISOString(),before_ids:rows.map(s=>s.id),name:request.create,source_hash:request.source_hash,previous_document:before.identity?.scriptIdPart||null,stages:{created:false,persistence_verified:false,opened:false,attached:false},phase:request.create?'planned':'opening'};persist();
  }
  let document=intent.document;
  if(!document&&request.create){
    if(intent.phase==='rejected_known'){
      if(rows.some(s=>!intent.before_ids.includes(s.id)&&s.name===request.create))fail('PINE_CREATION_UNKNOWN','A document appeared after rejection; inspect without replay.');
      intent.phase='planned';persist();
    }
    if(intent.phase==='planned'){
      intent.phase='creating';persist();checkpoint({phase:'pine-document-create',request_id:request.request_id});
      try{await adapter.create(request);}catch(error){
        let rejected=false;
        if(error.creation_rejected===true){const after=await adapter.list();rejected=!after.some(s=>!intent.before_ids.includes(s.id)&&s.name===request.create);}
        intent.phase=rejected?'rejected_known':'creating';intent.error_code=error.code||'PINE_CREATION_UNKNOWN';intent.rejection_verified=rejected;persist();
        throw Object.assign(error,{details:{...error.details,request_id:request.request_id,creation_outcome:rejected?'rejected_known':'unknown',replay_safe:rejected}});
      }
    }
    const after=await adapter.list();
    const candidates=after.filter(s=>!intent.before_ids.includes(s.id)&&s.name===request.create);
    if(candidates.length!==1)fail('PINE_CREATION_UNKNOWN','Cannot prove exactly one created document; preserve resources and resume the same request.',{request_id:request.request_id,candidate_count:candidates.length,replay_safe:false});
    document=candidates[0];intent.document=document;intent.stages.created=true;intent.phase='verifying';persist();
  }
  if(!document){
    const matches=rows.filter(s=>s.id===request.open);
    if(matches.length!==1)fail('PINE_DOCUMENT_NOT_FOUND','Exact saved document ID is absent.');
    document=matches[0];intent.document=document;persist();
  }
  await assertDocumentAvailable(document.id);
  const remote=await adapter.get(document.id,document.version);
  if(typeof remote.source!=='string'||!remote.source)fail('PINE_PERSISTENCE_UNVERIFIED','Remote saved source is unavailable.');
  const source=canonicalPineSource(remote.source),hash=sourceHash(source);
  if(request.create&&hash!==request.source_hash)fail('PINE_PERSISTENCE_UNVERIFIED','Created remote source differs from this exact request.');
  if(intent.verified_hash&&intent.verified_hash!==hash)fail('PINE_DOCUMENT_CHANGED','Saved document changed during preparation.');
  intent.verified_hash=hash;intent.stages.persistence_verified=true;intent.phase='opening';persist();
  const current=await adapter.state();
  if(current.modified!==false||current.pending)fail('PINE_FOREIGN_DRAFT','Editor became modified, unverifiable or busy; preserve it.');
  if(!ownOpened||String(current.identity?.version)!==String(document.version)){
    checkpoint({phase:'pine-document-open',document_id:document.id,request_id:request.request_id});await adapter.open(document);
  }
  const opened=await adapter.state();
  if(opened.modified||opened.draft||opened.identity?.scriptIdPart!==document.id||String(opened.identity?.version)!==String(document.version)||canonicalPineSource(opened.source||'')!==source)fail('PINE_OPEN_UNVERIFIED','Mounted document identity/version/source does not match the verified remote document.');
  intent.stages.opened=true;intent.phase='attaching';persist();
  return {intent,document,source,source_hash:hash};
}

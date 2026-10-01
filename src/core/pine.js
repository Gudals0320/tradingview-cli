/**
 * Core Pine Script logic for the CLI.
 * All functions accept plain options objects and return plain JS objects.
 * They throw on error (callers catch and format).
 */
import { evaluate, evaluateAsync } from '../connection.js';
import { findPineEditor, findPineController, readPineConsole, confirmPineSaveDialog, confirmPineCompileSaveDialog, requestPineEditor,pinePanelState } from './desktop-dom.js';
import { STRATEGY_PAGE_CODE, splitMarkers, formatDiagnostic } from '../strategy-state.js';
import { sourceHash } from '../session.js';
import { canonicalPineSource,pineDeclaration,libraryTitleDiagnostic } from '../pine-source.js';
import { randomUUID } from 'node:crypto';
import { observePineCompilation, pineCompilationStatus, dispatchPineCompilation, pineCompileContext, PINE_TARGET_PAGE_CODE } from './pine-state.js';

// Shared helpers execute unchanged in the page and in offline DOM regression tests.
const FIND_MONACO = `(${findPineEditor.toString()})(document)`;
const FIND_CONTROLLER = `(${findPineController.toString()})(document)`;

/** Open the Pine panel once, then wait for its editor to mount. */
export async function ensurePineEditorOpen({ _deps } = {}) {
  const evaluatePage = _deps?.evaluate || evaluate;
  const sleep = _deps?.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const ready = () => evaluatePage(`(() => {const m=${FIND_MONACO},c=${FIND_CONTROLLER};return Boolean(m&&c&&(${pinePanelState.toString()})(document,window).panel_visible);})()`);
  if (await ready()) return true;
  let requests=0,lastState,lastClickSignature=null,openingObserved=false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if(attempt%5===0&&requests<8){
      lastState=await evaluatePage(`(${pinePanelState.toString()})(document,window)`);
      if(lastState.viewport_width===0||lastState.viewport_height===0){const error=new Error('Pine target viewport is zero. Restore the TradingView window and make this tab visible, then retry.');error.code='PINE_VIEWPORT_UNAVAILABLE';error.details=lastState;throw error;}
      if(lastClickSignature!==null&&lastState.panel_signature!==lastClickSignature)openingObserved=true;
      const requested=await evaluatePage(`(${requestPineEditor.toString()})(document, window.TradingView,{suppressToggle:${openingObserved}})`);requests++;
      if(requested==='sidebar')lastClickSignature=lastState.panel_signature;
    }
    await sleep(200);
    if (await ready()) return true;
  }
  const error=new Error('Visible Pine Editor did not initialize before timeout. Open its panel in TradingView and retry.');
  error.code='PINE_EDITOR_NOT_READY';error.details={...lastState,requests,timeout_ms:30000};throw error;
}

// ── Pure / offline functions ──

export function analyze({ source }) {
  const lines = source.split('\n');
  // Keep offsets while hiding comments and string contents from code rules.
  const codeLines = source.replace(/("(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*')|\/\/[^\r\n]*/g,
    (text, literal) => literal ? '_'.repeat(text.length) : ' '.repeat(text.length)).split('\n');
  const diagnostics = [];

  let isV6 = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//@version=6')) { isV6 = true; break; }
    if (trimmed.startsWith('//@version=')) break;
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    break;
  }

  const arrays = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = codeLines[i];
    const fromMatch = line.match(/(\w+)\s*=\s*array\.from\(([^)]*)\)/);
    if (fromMatch) {
      const name = fromMatch[1].trim();
      const args = fromMatch[2].trim();
      const size = args === '' ? 0 : args.split(',').length;
      arrays.set(name, { name, size, line: i + 1 });
      continue;
    }
    const newMatch = line.match(/(\w+)\s*=\s*array\.new(?:<\w+>|_\w+)\((\d+)?/);
    if (newMatch) {
      const name = newMatch[1].trim();
      const size = newMatch[2] !== undefined ? parseInt(newMatch[2], 10) : null;
      arrays.set(name, { name, size, line: i + 1 });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = codeLines[i];
    const pattern = /array\.(get|set)\(\s*(\w+)\s*,\s*(-?\d+)/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const method = match[1];
      const arrName = match[2];
      const idx = parseInt(match[3], 10);
      const info = arrays.get(arrName);
      if (!info || info.size === null) continue;
      if (idx < 0 || idx >= info.size) {
        diagnostics.push({
          line: i + 1, column: match.index + 1,
          message: `array.${method}(${arrName}, ${idx}) — index ${idx} out of bounds (array size is ${info.size})`,
          severity: 'error',
        });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = codeLines[i];
    const firstLastPattern = /(\w+)\.(first|last)\(\)/g;
    let match;
    while ((match = firstLastPattern.exec(line)) !== null) {
      const arrName = match[1];
      if (arrName === 'array') continue;
      const info = arrays.get(arrName);
      if (info && info.size === 0) {
        diagnostics.push({
          line: i + 1, column: match.index + 1,
          message: `${arrName}.${match[2]}() called on possibly empty array (declared with size 0)`,
          severity: 'warning',
        });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = codeLines[i];
    const trimmed = line.trim();
    if (trimmed.includes('strategy.entry') || trimmed.includes('strategy.close')) {
      let hasStrategyDecl = false;
      for (const l of codeLines) {
        if (/^\s*strategy\s*\(/.test(l)) { hasStrategyDecl = true; break; }
      }
      if (!hasStrategyDecl) {
        diagnostics.push({
          line: i + 1, column: 1,
          message: 'strategy.entry/close used but no strategy() declaration found — did you mean to use indicator()?',
          severity: 'error',
        });
        break;
      }
    }
  }

  if (!isV6 && source.includes('//@version=')) {
    const vMatch = source.match(/\/\/@version=(\d+)/);
    if (vMatch && parseInt(vMatch[1]) < 5) {
      diagnostics.push({
        line: 1, column: 1,
        message: `Script uses Pine v${vMatch[1]} — consider upgrading to v6 for latest features`,
        severity: 'info',
      });
    }
  }

  return {
    success: true,
    issue_count: diagnostics.length,
    diagnostics,
    note: diagnostics.length === 0 ? 'No static analysis issues found. Use `tv pine compile` against the open editor or `tv pine check` for a server-side compilation check.' : undefined,
  };
}

export async function check({ source,_deps }) {
  const titleError=libraryTitleDiagnostic(source);
  if(titleError)return {success:true,compiled:false,code:'INVALID_LIBRARY_TITLE',error_count:1,warning_count:0,errors:[titleError],
    validation_scope:'local_library_title',desktop_validated:false};
  const formData = new URLSearchParams();
  formData.append('source', source);

  const response = await (_deps?.fetch||fetch)(
    'https://pine-facade.tradingview.com/pine-facade/translate_light?user_name=Guest&pine_id=00000000-0000-0000-0000-000000000000',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.tradingview.com/',
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`TradingView API returned ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  const errors = [];
  const warnings = [];
  const inner = result?.result;

  if (inner) {
    if (inner.errors2 && inner.errors2.length > 0) {
      for (const e of inner.errors2) {
        errors.push({
          line: e.start?.line, column: e.start?.column,
          end_line: e.end?.line, end_column: e.end?.column,
          message: formatDiagnostic(e.message, e.ctx),
        });
      }
    }
    if (inner.warnings2 && inner.warnings2.length > 0) {
      for (const w of inner.warnings2) {
        warnings.push({ line: w.start?.line, column: w.start?.column, message: formatDiagnostic(w.message, w.ctx) });
      }
    }
  }

  if (result.error && typeof result.error === 'string') {
    errors.push({ message: result.error });
  }

  const compiled = errors.length === 0;
  return {
    success: true,
    compiled,
    validation_scope:'light_server_translation',desktop_validated:false,
    source_type:pineDeclaration(source).kind,
    error_count: errors.length,
    warning_count: warnings.length,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    note: compiled ? 'Light server translation succeeded. Desktop execution, chart application, library publication and imports are not verified.' : undefined,
  };
}

// ── Functions requiring TradingView connection ──

export async function getPanelState() {
  return evaluate(`(() => { const editor=document.querySelector('.monaco-editor.pine-editor-monaco');
    return {open:Boolean(editor && editor.offsetParent!==null && editor.getBoundingClientRect().width>0)}; })()`);
}

export async function closePanel() {
  return evaluate(`(() => {
    const element=document.querySelector('.monaco-editor.pine-editor-monaco');
    if(!element) return {closed:true};
    let node=element,fiber;
    for(let i=0;i<20&&node;i++,node=node.parentElement){const key=Object.keys(node).find(name=>name.startsWith('__reactFiber$'));if(key){fiber=node[key];break;}}
    for(let i=0;i<30&&fiber;i++,fiber=fiber.return){for(const props of [fiber.memoizedProps,fiber.alternate?.memoizedProps]){
      const value=props?.value;if(value?.monacoEnv&&typeof value.close==='function'){value.close();return {closed:true};}
    }}
    return {closed:false,error:'Pine panel close control is unavailable.'};
  })()`);
}

export async function getSource() {
  const editorReady = await ensurePineEditorOpen();
  if (!editorReady) throw new Error('Could not open Pine Editor or Monaco not found in React fiber tree.');

  const source = await evaluate(`
    (function() {
      var m = ${FIND_MONACO};
      if (!m) return null;
      return m.editor.getValue();
    })()
  `);

  if (source === null || source === undefined) {
    throw new Error('Monaco editor found but getValue() returned null.');
  }

  return { success: true, source, line_count: source.split('\n').length, char_count: source.length };
}

export async function setSource({ source }) {
  const editorReady = await ensurePineEditorOpen();
  if (!editorReady) throw new Error('Could not open Pine Editor.');

  const escaped = JSON.stringify(source);
  const set = await evaluate(`
    (function() {
      var m = ${FIND_MONACO};
      if (!m) return false;
      m.editor.setValue(${escaped});
      return true;
    })()
  `);

  if (!set) throw new Error('Monaco found but setValue() failed.');
  return { success: true, lines_set: source.split('\n').length };
}

export async function compile() { return smartCompile(); }

export async function getErrors({ _deps } = {}) {
  const editorReady = _deps ? true : await ensurePineEditorOpen();
  if (!editorReady) throw new Error('Could not open Pine Editor.');

  const markers = await (_deps?.evaluate || evaluate)(`
    (function() {
      var m = ${FIND_MONACO};
      if (!m) return [];
      var model = m.editor.getModel();
      if (!model) return [];
      var markers = m.env.editor.getModelMarkers({ resource: model.uri });
      return markers.map(function(mk) {
        return { line: mk.startLineNumber, column: mk.startColumn, message: mk.message, severity: mk.severity };
      });
    })()
  `);

  const { errors, warnings } = splitMarkers(markers || []);
  return {
    success: true,
    has_errors: errors.length > 0,
    error_count: errors.length,
    warning_count: warnings.length,
    errors,
    warnings,
  };
}

export async function save({ timeout = 15000, _deps } = {}) {
  if (!_deps && !await ensurePineEditorOpen()) throw new Error('Could not open Pine Editor.');
  const inspect = _deps?.evaluate || evaluate;
  const inspectAsync = _deps?.evaluateAsync || evaluateAsync;
  const sleep = _deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = _deps?.now || Date.now;
  const token = randomUUID();
  const savedSource=!_deps?(await getSource()).source:_deps.source;
  const prepareStrategy=typeof savedSource==='string'&&/^\s*strategy\s*\(/m.test(savedSource);
  const finishSave=async result=>{if(!result.success&&prepareStrategy)await inspect(`(() => {${STRATEGY_PAGE_CODE};return failCompilation(window,${JSON.stringify(token+'-save')},${JSON.stringify(result.error||'Save failed.')},'SAVE_FAILED');})()`);return result;};
  try {
  if(prepareStrategy) await inspect(`(() => { ${PINE_TARGET_PAGE_CODE}; ${STRATEGY_PAGE_CODE};
    const operation=window.__tvCliSave;if(operation?.pending&&!operation.abandoned&&Date.now()<operation.expiresAt)return true;
    const c=${FIND_CONTROLLER},plan=planPineCompilation(window,c);
    if(!plan.error&&plan.target_id&&c.isModified()) beginCompilation(window,${JSON.stringify(token+'-save')},${JSON.stringify(sourceHash(canonicalPineSource(savedSource)))},true,null,plan.script_id,plan.target_id);
    return true;})()`);
  await inspect(`(() => {
    const controller = ${FIND_CONTROLLER};
    const m = ${FIND_MONACO};
    if (!controller || !m || typeof controller.saveScript !== 'function' || typeof controller.isModified !== 'function') {
      throw new Error('Pine save controller unavailable.');
    }
    if (window.__tvCliSave?.pending && !window.__tvCliSave.abandoned && Date.now() < window.__tvCliSave.expiresAt) {
      throw new Error('A Pine save is already pending.');
    }
    const operation = window.__tvCliSave = {token:${JSON.stringify(token)}, pending:true,
      expiresAt:Date.now()+${Number(timeout)}, source:m.editor.getValue(), dialogConfirmed:false};
    if (controller.getScriptIdVersion()?.scriptIdPart && !controller.isModified()) {
      operation.pending = false; return true;
    }
    Promise.resolve().then(() => controller.saveScript()).then(() => { operation.pending=false; },
      error => {operation.pending=false; operation.error=error?.message || String(error);});
    return true;
  })()`);
  const start = now(); let dialogHandled = false;
  do {
    await sleep(100);
    const state = await inspect(`(() => {
      const operation = window.__tvCliSave;
      if (operation?.token !== ${JSON.stringify(token)}) return {error:'Pine save operation was replaced.'};
      const controller = ${FIND_CONTROLLER};
      if (!controller) return {error:'Pine save controller disappeared.'};
      const clicked = operation.pending && !operation.dialogConfirmed
        ? (${confirmPineSaveDialog.toString()})(document) : false;
      if (clicked) operation.dialogConfirmed = true;
      return {pending:operation.pending,error:operation.error,clicked,
        identity:controller.getScriptIdVersion(),modified:controller.isModified()};
    })()`);
    dialogHandled ||= Boolean(state.clicked);
    if (state.error) return finishSave({ success:false, saved:false, error:state.error });
    if (!state.pending) {
      if (!state.identity?.scriptIdPart || state.modified) return finishSave({ success:false, saved:false,
        error:'Pine save finished without a saved document identity or with unsaved changes.' });
      const verified = await inspectAsync(`(async () => {
        const operation = window.__tvCliSave, controller = ${FIND_CONTROLLER};
        if (operation?.token !== ${JSON.stringify(token)}) return false;
        const identity = controller.getScriptIdVersion();
        const response = await fetch('https://pine-facade.tradingview.com/pine-facade/get/' +
          encodeURIComponent(identity.scriptIdPart) + '/' + encodeURIComponent(identity.version), {credentials:'include'});
        if (!response.ok) throw new Error('Could not verify persisted Pine source: HTTP ' + response.status);
        const data = await response.json();
        const normalize = value => value.replace(/\\r\\n/g, '\\n');
        return typeof data.source === 'string' && normalize(data.source) === normalize(operation.source)
          && normalize((${FIND_MONACO}).editor.getValue()) === normalize(operation.source);
      })()`);
      if(verified&&prepareStrategy) await inspect(`(() => {${STRATEGY_PAGE_CODE};const epoch=window.__tvCliCompilation;
        if(epoch?.token===${JSON.stringify(token+'-save')}){epoch.persistence_confirmed=true;epoch.saved_version=${JSON.stringify(state.identity.version)};compilationState(window);}return true;})()`);
      return finishSave(verified ? { success:true,saved:true,action:dialogHandled?'saved_with_dialog':'saved',
        script_id:state.identity.scriptIdPart,version:state.identity.version }
        : {success:false,saved:false,error:'Persisted Pine source did not match the editor source.'});
    }
  } while (now() - start < timeout);
  await inspect(`(() => { const operation=window.__tvCliSave;
    if (operation?.token === ${JSON.stringify(token)}) { operation.abandoned=true;operation.pending=false; }
    return true; })()`);
  return finishSave({ success:false,saved:false,error:'Pine save did not complete before timeout.' });
  } catch(error){return finishSave({success:false,saved:null,code:'SAVE_FAILED',error:error.message});}
}
export async function getConsole({ _deps } = {}) {
  if (!_deps && !await ensurePineEditorOpen()) throw new Error('Could not open Pine Editor.');
  const entries = await (_deps?.evaluate || evaluate)(`(() => {
    const controller = ${FIND_CONTROLLER};
    return (${readPineConsole.toString()})(document, controller);
  })()`);
  return { success: true, entries: entries || [], entry_count: entries?.length || 0 };
}

export async function finalizePineCompile(result, {source,token,context={},saveChanges=false,inspect,inspectAsync,_deps}={}) {
  let observed;
  try { observed=_deps?.readOutcome?await _deps.readOutcome():await inspect(`(() => {${PINE_TARGET_PAGE_CODE};
    return readPineOutcome(window,${FIND_CONTROLLER},${FIND_MONACO},${JSON.stringify(token)});})()`); }
  catch(error){observed={state_error:error.message};}
  const outcome={...result};
  if(observed?.state_error){outcome.state_error=observed.state_error;outcome.chart_changed=null;
    if(outcome.success){outcome.success=false;outcome.compiled=false;outcome.code='POST_COMPILE_STATE_UNREADABLE';outcome.error=observed.state_error;}}
  else {
    const diagnostics=splitMarkers([...(observed?.markers||[]),...(observed?.native_diagnostics||[])]);
    const unique=list=>[...new Map(list.map(d=>[JSON.stringify([d.line,d.column,d.message,d.severity]),d])).values()];
    outcome.errors=unique([...(result.errors||[]),...diagnostics.errors]);
    outcome.warnings=unique([...(result.warnings||[]),...diagnostics.warnings]);
    const currentRuntime=(observed?.runtime_diagnostics||[]).filter(d=>String(d.version)===String(observed.identity?.version));
    if(currentRuntime.length)outcome.runtime_diagnostics=currentRuntime;
    const protectedCode=/TARGET|DUPLICATE|SAVE_|AMBIGUOUS|LIBRARY|REPLACED/.test(result.code||'');
    if(outcome.errors.length){outcome.success=false;outcome.compiled=false;outcome.has_errors=true;
      if(!protectedCode){outcome.code='PINE_COMPILE_ERROR';outcome.error=outcome.errors[0].message;}}
    else if(currentRuntime.length&&!protectedCode){outcome.success=false;outcome.compiled=true;outcome.has_errors=false;
      outcome.code='PINE_RUNTIME_ERROR';outcome.runtime_error=currentRuntime[0].message;outcome.runtime_diagnostics=currentRuntime;outcome.error=currentRuntime[0].message;}
    else if(!outcome.success && !outcome.code){outcome.code='NATIVE_ACTION_REJECTED';outcome.native_action_error=result.error;
      outcome.error=(result.error||'Native action rejected.')+' No diagnostics available for the current saved version.';}
    const before=(context.before||[]).filter(s=>s.pine_id===context.identity?.scriptIdPart);
    const after=observed?.targets||[];
    outcome.applied=after.length===1&&String(after[0].version)===String(observed.identity?.version);
    outcome.calculation_ready=outcome.applied&&after[0].status_type===2;
    outcome.chart_changed=result.compile_performed===false?false:context.before?JSON.stringify(before.map(s=>[s.id,s.compiled_identity]))!==JSON.stringify(after.map(s=>[s.id,s.compiled_identity])):null;
    outcome.chart={target_count:after.length,studies:after.map(s=>({id:s.id,version:s.version,status_type:s.status_type}))};
    outcome.editor_modified=observed?.modified;
    if(observed?.runtime_diagnostics?.length&&!currentRuntime.length)outcome.previous_target_diagnostics=observed.runtime_diagnostics;
  }
  if(saveChanges){
    outcome.save_requested=true;outcome.script_id=observed?.identity?.scriptIdPart||null;outcome.version=observed?.identity?.version||null;
    outcome.save_performed=Boolean(outcome.script_id&&(context.identity?.scriptIdPart!==outcome.script_id||String(context.identity?.version)!==String(outcome.version)));
    try {
      const persisted=_deps?.readPersistence?await _deps.readPersistence():await inspectAsync(`(async()=>{
        const c=${FIND_CONTROLLER},id=c?.getScriptIdVersion?.();if(!id?.scriptIdPart)return {matches:false};
        const response=await fetch('https://pine-facade.tradingview.com/pine-facade/get/'+encodeURIComponent(id.scriptIdPart)+'/'+encodeURIComponent(id.version),{credentials:'include'});
        if(!response.ok)throw new Error('Saved source verification HTTP '+response.status);const data=await response.json();
        return {matches:typeof data.source==='string'&&data.source.replace(/\\r\\n/g,'\\n')===${JSON.stringify(canonicalPineSource(source))}};
      })()`);
      outcome.saved=Boolean(persisted.matches&&!observed?.draft);outcome.persistence_verified=true;
      outcome.source_persisted=Boolean(persisted.matches);outcome.persistence_kind=observed?.draft?'draft':'saved_document';
    }catch(error){outcome.saved=null;outcome.persistence_verified=false;outcome.persistence_error=error.message;}
  }
  if(!outcome.success){outcome.report_ready=false;
    if(outcome.code==='REPORT_TIMEOUT'&&result.calculation_pending)return outcome;
    await inspect(`(() => {${STRATEGY_PAGE_CODE};return failCompilation(window,${JSON.stringify(token)},${JSON.stringify(outcome.error||outcome.errors?.[0]?.message||'Compilation failed.')},${JSON.stringify(outcome.code||'COMPILATION_FAILED')});})()`);
  }
  return outcome;
}
export async function smartCompile({ timeout = 30000, save: saveChanges = false, _deps } = {}) {
  const inspect = _deps?.evaluate || evaluate;
  if (!_deps && !await ensurePineEditorOpen()) throw new Error('Could not open Pine Editor.');
  const source = _deps?.source || (await getSource()).source;
  const token=randomUUID();let activeToken=token,context;
  const finish=result=>finalizePineCompile(result,{source,token:activeToken,context,saveChanges,inspect,inspectAsync:_deps?.evaluateAsync||evaluateAsync,_deps});
  try {
  const declaration=pineDeclaration(source),titleError=libraryTitleDiagnostic(source);
  if(declaration.kind==='library')return finish({success:false,compiled:false,compile_performed:false,source_type:'library',
    code:titleError?'INVALID_LIBRARY_TITLE':'LIBRARY_NOT_APPLICABLE',has_errors:Boolean(titleError),errors:titleError?[titleError]:[],
    error:titleError?.message||'Library chart application is not supported by this CLI. Use pine check for scoped light-server validation.'});
  const contextExpression = `(() => { ${PINE_TARGET_PAGE_CODE}; const controller = ${FIND_CONTROLLER};
    return (${pineCompileContext.toString()})(window, controller); })()`;
  context = await inspect(contextExpression);
  if (context.error) return finish({success:false,compiled:false,report_ready:false,code:context.code,error:context.error,target_count:context.target_count});
  if (context.save_required && !saveChanges) return finish({ success:false,compiled:false,code:'SAVE_REQUIRED',
    error:'This saved script has unsaved changes. Run pine save first or compile with --save.' });
  const strategyMode = /^\s*strategy\s*\(/m.test(source);
  if (!strategyMode && context.pending) {
    const sleep = _deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const now = _deps?.now || Date.now, started = now();
    do { await sleep(200); context = await inspect(contextExpression); }
    while (context.pending && now() - started < timeout);
    if (context.pending) return finish({success:false,compiled:false,error:'Applied indicator calculation did not finish before timeout.'});
    if (!context.unchanged) return finish({success:false,compiled:false,error:context.runtime_error || 'Applied indicator identity could not be verified.'});
  }
  if (!strategyMode && context.unchanged) return finish({success:true,compiled:true,compile_performed:false,
    unchanged:true,has_errors:false,errors:[],warnings:[]});
  const literal = source.match(/^\s*strategy\s*\(\s*(?:title\s*=\s*)?("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/m)?.[1];
  const strategyName = literal ? literal.slice(1, -1).replace(/\\([\\"'nrt])/g, (_, ch) => ({ n: '\n', r: '\r', t: '\t' }[ch] || ch)) : null;
  const begun = await inspect(`(() => { ${STRATEGY_PAGE_CODE}; return beginCompilation(window, ${JSON.stringify(token)}, ${JSON.stringify(sourceHash(canonicalPineSource(source)))}, ${strategyMode}, ${JSON.stringify(strategyName)}, ${JSON.stringify(context.identity?.scriptIdPart || null)}, ${JSON.stringify(context.target_id || null)},${Boolean(context.same_version_refresh)}); })()`);
  if (begun?.phase === 'unchanged') return finish({ success: true, compiled: true, compile_performed: false, unchanged: true,
    has_errors: false, errors: [], warnings: [], strategy_id: begun.strategy_id, strategy_inputs: begun.inputs,
    compilation_token: begun.token, report_ready: true });
  const awaiting = begun?.phase === 'awaiting';
  activeToken = awaiting ? begun.token : token;
  if (!awaiting) {
    const observed = await inspect(`(() => {const controller = ${FIND_CONTROLLER};
      return (${observePineCompilation.toString()})(window, controller, ${JSON.stringify(token)}); })()`);
    if (!observed) throw new Error('Pine compile completion signals unavailable; cannot verify compilation.');
  }
  const button = awaiting ? null : await inspect(`(() => { ${PINE_TARGET_PAGE_CODE}; const controller = ${FIND_CONTROLLER};
    return (${dispatchPineCompilation.toString()})(window, controller, ${JSON.stringify(token)}, document); })()`);
  const sleep = _deps?.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = _deps?.now || Date.now; const start = now(); let markers = [], state = null, persistence = {};
  do {
    await sleep(200);
    let completed = awaiting, nativeMarkers = [];
    if (!awaiting) {
      const progress = await inspect(`(() => {
        if (${saveChanges}) (${confirmPineCompileSaveDialog.toString()})(document);
        return (${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)});
      })()`);
      if (progress.replaced) return finish({ success:false,compiled:false,code:'COMPILATION_REPLACED',error:'Pine compilation operation was replaced.' });
      if (progress.error) {
        await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
        return finish({success:false,compiled:false,error:progress.error,
          code:progress.error_code||undefined,native_action_error:progress.error});
      }
      completed = progress.completed;
      if (completed && progress.validation?.code) {
        await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
        return finish({success:false,compiled:false,report_ready:false,...progress.validation});
      }
      if (completed && progress.validation?.pending) continue;
      if (completed && progress.validation?.verified) await inspect(`(() => {
        const epoch=window.__tvCliCompilation;
        if(epoch?.token===${JSON.stringify(token)}) {epoch.script_id=${JSON.stringify(progress.validation.script_id)};epoch.target_study_id=${JSON.stringify(progress.validation.target_id)};}
        return true;
      })()`);
      if (completed && context.save_required && saveChanges) {
        if (!progress.identity?.scriptIdPart || progress.modified !== false) {
          await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
          return finish({success:false,compiled:false,saved:false,code:'SAVE_NOT_CONFIRMED',
            error:'Pine compilation finished without a confirmed saved identity and clean editor.'});
        }
        persistence = {saved:true,script_id:progress.identity.scriptIdPart};
      }
      nativeMarkers = progress.diagnostics || [];
      if (!completed) continue;
      await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
    }
    markers = await inspect(`(() => { const m = ${FIND_MONACO}; const model = m?.editor.getModel();
      return model ? m.env.editor.getModelMarkers({resource:model.uri}).map(marker => ({line:marker.startLineNumber,column:marker.startColumn,message:marker.message,severity:marker.severity})) : []; })()`);
    const uniqueMarkers = [...new Map([...nativeMarkers, ...(markers || [])].map(marker =>
      [JSON.stringify([marker.line,marker.column,marker.message,marker.severity]),marker])).values()];
    const diagnostics = splitMarkers(uniqueMarkers);
    if (diagnostics.errors.length) {
      if (!awaiting) await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
      return finish({ success: false, compiled: false, has_errors: true, ...diagnostics, compilation_token: activeToken });
    }
    if (!completed) continue;
    if (!strategyMode) return finish({ success: true, compiled: true, has_errors: false, ...diagnostics, ...persistence, button_clicked: button || 'keyboard_shortcut', compilation_token: token });
    state = await inspect(`(() => { ${STRATEGY_PAGE_CODE}; return compilationState(window); })()`);
    if (state.phase === 'failed') return finish({ success: false, compiled: true, has_errors: false, ...diagnostics, runtime_error: state.error, error: state.error });
    if (state.phase === 'ready') return finish({ success: true, compiled: true, has_errors: false, ...diagnostics, ...persistence,
      button_clicked: awaiting ? null : button || 'keyboard_shortcut', ...(awaiting && { compile_performed: false }),
      strategy_id: state.strategy_id, strategy_inputs: state.inputs, compilation_token: activeToken, report_ready: true });
  } while (now() - start < timeout);
  if (!awaiting) await inspect(`(${pineCompilationStatus.toString()})(window, ${JSON.stringify(token)}, true)`);
  return finish({ success: false, compiled: false, has_errors: false,code:'REPORT_TIMEOUT',calculation_pending:awaiting,...splitMarkers(markers || []),
    error: awaiting ? 'Strategy recalculation did not produce a verified report before timeout.' : 'Compilation did not produce a provably fresh report before timeout.',
    compilation_token: activeToken, report_ready: false, ...(awaiting && { compile_performed: false }) });
  }catch(error){const code=error.code||String(error.message||'').match(/\b([A-Z][A-Z_]+):/)?.[1]||'COMPILE_EXCEPTION';return finish({success:false,compiled:false,code,error:error.message});}
}

export async function newScript({ type, _deps }) {
  if (!['indicator', 'strategy', 'library'].includes(type)) {
    throw new Error(`Invalid Pine script type "${type}". Expected indicator, strategy, or library.`);
  }
  const editorReady = _deps ? true : await ensurePineEditorOpen();
  if (!editorReady) throw new Error('Could not open Pine Editor.');

  const typeMap = { indicator: 'indicator', strategy: 'strategy', library: 'library' };
  const templates = {
    indicator: '//@version=6\nindicator("My script")\nplot(close)',
    strategy: '//@version=6\nstrategy("My strategy", overlay=true)\n',
    library: '//@version=6\n// @description TODO: add library description here\nlibrary("MyLibrary")\n',
  };

  const template = templates[type] || templates.indicator;

  // Await the document transition before replacing the asynchronous template.
  const escaped = JSON.stringify(template);
  const set = await (_deps?.evaluateAsync || evaluateAsync)(`
    (async function() {
      var controller = ${FIND_CONTROLLER};
      if (!controller) throw new Error('Pine document controller unavailable; cannot safely create a script.');
      await controller.openNewScript(${JSON.stringify(type)});
      await controller.setScript(${escaped});
      var m = ${FIND_MONACO};
      return !controller.getScriptIdVersion()?.scriptIdPart && m?.editor.getValue() === ${escaped};
    })()
  `);

  if (!set) throw new Error('New Pine script identity/template verification failed.');

  return { success: true, type, action: 'new_script_created', template: typeMap[type] };
}

export async function openScript({ name, _deps }) {
  const editorReady = _deps ? true : await ensurePineEditorOpen();
  if (!editorReady) throw new Error('Could not open Pine Editor.');

  const escapedName = JSON.stringify(name.toLowerCase());

  const result = await (_deps?.evaluateAsync || evaluateAsync)(`
    (function() {
      var target = ${escapedName};
      return fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved', { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(scripts) {
          if (!Array.isArray(scripts)) return {error: 'pine-facade returned unexpected data'};
          var exactNames = scripts.filter(function(s) {return (s.scriptName || '').toLowerCase() === target;});
          if (exactNames.length > 1) return {error:'Ambiguous saved script name: ' + target};
          var match = exactNames[0];
          if (!match) {
            var exactTitles = scripts.filter(function(s) {return (s.scriptTitle || '').toLowerCase() === target;});
            var candidates = exactTitles.length ? exactTitles : scripts.filter(function(s) {
              return (s.scriptName || '').toLowerCase().includes(target) || (s.scriptTitle || '').toLowerCase().includes(target);
            });
            if (candidates.length > 1) return {error:'Ambiguous saved script title/partial name: ' + target + '. Use the exact saved name.'};
            match = candidates[0];
          }
          if (!match) return {error: 'Script "' + target + '" not found. Use pine_list_scripts to see available scripts.'};

          var id = match.scriptIdPart;
          var ver = match.version || 1;
          return fetch('https://pine-facade.tradingview.com/pine-facade/get/' + id + '/' + ver, { credentials: 'include' })
            .then(function(r2) { return r2.json(); })
            .then(function(data) {
              var source = data.source || '';
              if (!source) return {error: 'Script source is empty', name: match.scriptName || match.scriptTitle};
              var controller = ${FIND_CONTROLLER};
              if (!controller) throw new Error('Pine document controller unavailable; cannot safely open a script.');
              return controller.openScript({scriptIdPart:id, version:ver}).then(function() {
                var m = ${FIND_MONACO};
                if (controller.getScriptIdVersion()?.scriptIdPart !== id || !m ||
                    m.editor.getValue().replace(/\\r\\n/g, '\\n') !== source.replace(/\\r\\n/g, '\\n')) {
                  throw new Error('Pine document identity/source did not match the requested script.');
                }
                return {success:true,name:match.scriptName || match.scriptTitle,id:id,lines:source.split('\\n').length};
              });
            });
        })
        .catch(function(e) { return {error: e.message}; });
    })()
  `);

  if (result?.error) {
    throw new Error(result.error);
  }

  return { success: true, name: result.name, script_id: result.id, lines: result.lines, source: 'internal_api', opened: true };
}

export async function listScripts() {
  const scripts = await evaluateAsync(`
    fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!Array.isArray(data)) return {scripts: [], error: 'Unexpected response from pine-facade'};
        return {
          scripts: data.map(function(s) {
            return {
              id: s.scriptIdPart || null,
              name: s.scriptName || s.scriptTitle || 'Untitled',
              title: s.scriptTitle || null,
              version: s.version || null,
              modified: s.modified || null,
            };
          })
        };
      })
      .catch(function(e) { return {scripts: [], error: e.message}; })
  `);

  return {
    success: true,
    scripts: scripts?.scripts || [],
    count: scripts?.scripts?.length || 0,
    source: 'internal_api',
    error: scripts?.error,
  };
}

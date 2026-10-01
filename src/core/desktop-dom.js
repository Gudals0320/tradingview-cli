/** Page-context helpers. Keep each DOM function self-contained for CDP serialization. */
export function findPineEditor(document) {
  const containers = Array.from(document.querySelectorAll('.monaco-editor.pine-editor-monaco'));
  containers.sort((a, b) => Number(b.offsetParent !== null) - Number(a.offsetParent !== null));
  const usable = (editor) => editor && typeof editor.getValue === 'function'
    && typeof editor.setValue === 'function' && typeof editor.getModel === 'function'
    && Boolean(editor.getModel());
  for (const container of containers) {
    let element = container;
    let fiber;
    for (let depth = 0; depth < 20 && element; depth++, element = element.parentElement) {
      const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
      if (key) { fiber = element[key]; break; }
    }
    const wrappers = [];
    const environments = [];
    for (let depth = 0; depth < 30 && fiber; depth++, fiber = fiber.return) {
      for (const props of [fiber.memoizedProps, fiber.alternate?.memoizedProps]) {
        const value = props?.value;
        if (value?.monacoEnv) environments.push(value.monacoEnv);
        if (value?._editorRef?.current) wrappers.push(value._editorRef.current);
      }
    }
    for (const wrapper of wrappers) {
      const editor = wrapper._editor || wrapper;
      const env = wrapper._monaco || environments.find((candidate) => candidate.editor);
      try { if (usable(editor) && env?.editor) return { editor, env }; } catch { /* disposed editor */ }
    }
    for (const env of environments) {
      if (typeof env?.editor?.getEditors !== 'function') continue;
      const editors = env.editor.getEditors();
      for (const editor of editors) {
        const node = typeof editor.getDomNode === 'function' ? editor.getDomNode() : null;
        // Do not write into an unrelated editor when a page has several Monaco instances.
        if (node ? !container.contains(node) : editors.length !== 1) continue;
        try { if (usable(editor)) return { editor, env }; } catch { /* disposed editor */ }
      }
    }
  }
  return null;
}

export function requestPineEditor(document, tradingView) {
  const containers = Array.from(document.querySelectorAll('.monaco-editor.pine-editor-monaco'));
  if (containers.some((element) => element.offsetParent !== null)) return 'mounting';
  const buttons = Array.from(document.querySelectorAll('[data-name="pine-dialog-button"], [aria-label="Pine"]'));
  const button = buttons.find((element) => element.offsetParent !== null && !element.disabled);
  if (button) { button.click(); return 'sidebar'; }
  const bar = tradingView?.bottomWidgetBar;
  if (typeof bar?.activateScriptEditorTab === 'function') { bar.activateScriptEditorTab(); return 'bottom-bar'; }
  if (typeof bar?.showWidget === 'function') { bar.showWidget('pine-editor'); return 'bottom-bar'; }
  return null;
}

/** Controller owns script identity; Monaco.setValue only changes its text. */
export function findPineController(document) {
  for (const container of document.querySelectorAll('.monaco-editor.pine-editor-monaco')) {
    if (container.offsetParent === null) continue;
    let node = container, fiber;
    for (let depth = 0; depth < 20 && node; depth++, node = node.parentElement) {
      const key = Object.keys(node).find(name => name.startsWith('__reactFiber$'));
      if (key) { fiber = node[key]; break; }
    }
    for (let depth = 0; depth < 30 && fiber; depth++, fiber = fiber.return) {
      for (const props of [fiber.memoizedProps, fiber.alternate?.memoizedProps]) {
        const value = props?.value;
        if (typeof value?.openNewScript === 'function' && typeof value?.openScript === 'function'
          && typeof value?.setScript === 'function' && typeof value?.getScriptIdVersion === 'function' && value?._editorStore) return value;
      }
    }
  }
  return null;
}

/** Read actual message records/rows, never an editor or console container. */
export function readPineConsole(document, controller) {
  const messages = controller?._editorStore?.getStore?.().getState()?.console?.messages || [];
  const entries = messages.filter(item => typeof item.text === 'string' && item.text.trim()).map(item => ({
    timestamp: item.time || null, type: item.level || 'info', message: item.text,
  }));
  const rows = document.querySelectorAll('.widgetbar-widget-pine_logs [class*="logContainer-"]');
  for (const row of rows) {
    if (row.offsetParent === null) continue;
    const message = row.querySelector('[class*="msg-"]')?.textContent?.trim();
    if (!message) continue;
    entries.push({ timestamp: message.match(/^\[([^\]]+)\]/)?.[1] || null,
      type: /error/i.test(row.className) ? 'error' : /warn/i.test(row.className) ? 'warning' : 'info', message });
  }
  return entries;
}

export function confirmPineSaveDialog(document) {
  const buttons = document.querySelectorAll('button[data-qa-id="save-btn"][name="save"]');
  const button = Array.from(buttons).find(item => item.offsetParent !== null && !item.disabled
    && item.getAttribute('aria-disabled') !== 'true'
    && item.parentElement?.parentElement?.querySelector('input[data-qa-id="ui-lib-Input-input"]')
    && /스크립트 저장|save script/i.test(item.parentElement.parentElement.textContent || ''));
  if (!button) return false;
  button.click();
  return true;
}

export function confirmPineCompileSaveDialog(document) {
  const button = Array.from(document.querySelectorAll('button[data-qa-id="yes-btn"][name="yes"]'))
    .find(item => item.offsetParent !== null && !item.disabled
      && /추가하기 전에 이 스크립트를 저장|save (?:this |the )?script before adding/i.test(item.parentElement?.parentElement?.textContent || ''));
  if (!button) return false;
  button.click(); return true;
}

export function clickPineCompileButton(document) {
  const buttons = Array.from(document.querySelectorAll('button')).filter((button) =>
    button.offsetParent !== null && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
  const label = (button) => (button.innerText || button.textContent || '').trim();
  const stable = buttons.find((button) => ['add-script-to-chart', 'update-script-on-chart'].includes(button.getAttribute('data-qa-id')));
  if (stable) { stable.click(); return label(stable) || 'Add or update on chart'; }
  const combined = buttons.find((button) => /save and add to chart/i.test(label(button)));
  const add = buttons.find((button) => /^(add to chart|차트에 넣기)$/i.test(label(button)));
  const update = buttons.find((button) => /^(update on chart|차트에 업데이트)$/i.test(label(button)));
  const selected = combined || add || update;
  if (!selected) return null; // A save-only button must not masquerade as compilation.
  selected.click();
  return label(selected);
}

export function isLandingTarget(target) {
  return target.type === 'page' && (/\/new-tab\/index\.html(?:[?#]|$)/i.test(target.url || '') || target.title === 'New tab');
}

export function clickNewTabButton(document) {
  const button = document.querySelector('button.create-new-tab-button');
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

export function landingTabResult(state, landing) {
  return {
    ...state,
    success: Boolean(landing),
    action: 'new_tab_opened',
    note: landing
      ? 'Tab is on the layout picker. Open a chart layout before using chart commands.'
      : 'The TradingView new-tab landing page did not become ready before the timeout.',
  };
}

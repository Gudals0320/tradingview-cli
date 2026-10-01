// Read-only, targeted Pine UI evidence. Raw output may contain private source.
import { evaluate, disconnect } from '../../src/connection.js';
import { findPineEditor } from '../../src/core/desktop-dom.js';
try {
  console.log(JSON.stringify(await evaluate(`(() => {
    const m = (${findPineEditor.toString()})(document);
    const visible = e => e.offsetParent !== null;
    const describe = e => ({tag:e.tagName,text:e.textContent.trim().slice(0,500),
      name:e.getAttribute('data-name'),qa:e.getAttribute('data-qa-id'),
      aria:e.getAttribute('aria-label'),cls:typeof e.className === 'string' ? e.className : '',
      value:e.value,placeholder:e.getAttribute('placeholder')});
    return {uri:m?.editor.getModel()?.uri.toString(),
      dialogs:[...document.querySelectorAll('[role="dialog"]')].filter(visible).map(describe),
      inputs:[...document.querySelectorAll('input')].filter(visible).map(describe),
      controls:[...document.querySelectorAll('button,[role="menuitem"],[role="tab"]')]
        .filter(visible).filter(e=>e.closest('[class*="pine"],[class*="dialog"],[role="dialog"],[role="menu"]') || /script|pine|스크립트|저장|로그/i.test(e.textContent+' '+e.getAttribute('aria-label'))).map(describe),
      console:[...document.querySelectorAll('[class*="console"],[class*="log-"]')].filter(visible).map(describe).slice(-30)};
  })()`), null, 2));
} finally { await disconnect(); }

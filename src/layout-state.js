export function layoutConfirmationVisible(document) {
  const buttons = Array.from(document.querySelectorAll('button[data-qa-id="dontSave-btn"][name="dontSave"]'));
  return buttons.some(button => button.offsetParent !== null && button.parentElement?.parentElement
    ?.querySelector('button[data-qa-id="cancel-btn"][name="cancel"]'));
}

export function layoutOperationPending(window, document) {
  const operation = window.__tvCliLayoutSwitch;
  if (!operation?.pending) return false;
  const meta = window.TradingViewApi?._chartWidgetCollection?.metaInfo;
  const uid = typeof meta?.uid?.value === 'function' ? meta.uid.value() : meta?.uid;
  if (String(uid) === operation.expected_id) return false;
  if (operation.confirmation_seen && String(uid) === operation.original_id && !layoutConfirmationVisible(document)) return false;
  return true;
}

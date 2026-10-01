import { it } from 'node:test';
import assert from 'node:assert/strict';
import { getErrors } from '../src/core/pine.js';
import { readPineConsole } from '../src/core/desktop-dom.js';

it('console reads message records and scoped log rows without editor container text', () => {
  const source = 'indicator("private source")';
  const controller = { _editorStore: { getStore: () => ({ getState: () => ({ console: {
    messages: [{ level: 'error', text: 'Compiler error', time: '오전 10:00:00' }],
  } }) }) } };
  const log = { offsetParent: {}, className: 'logContainer-abc', textContent: source,
    querySelector: () => ({ textContent: '[2026-10-01T10:00:00]: QA log' }) };
  const document = { querySelectorAll: selector => {
    assert.equal(selector, '.widgetbar-widget-pine_logs [class*="logContainer-"]');
    return [log, { ...log, offsetParent: null }];
  } };
  const entries = readPineConsole(document, controller);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, 'error');
  assert.equal(entries[1].timestamp, '2026-10-01T10:00:00');
  assert.ok(entries.every(entry => !entry.message.includes(source)));
  assert.deepEqual(readPineConsole({ querySelectorAll: () => [] }, null), []);
});

it('errors keeps warning-only markers nonfatal', async () => {
  const result = await getErrors({ _deps: { evaluate: () => [{ severity: 4, message: 'warning' }] } });
  assert.equal(result.has_errors, false);
  assert.equal(result.error_count, 0);
  assert.equal(result.warning_count, 1);
});
it('errors separates mixed diagnostics and handles a clean editor', async () => {
  const result = await getErrors({ _deps: { evaluate: () => [
    { severity: 8, message: 'error' }, { severity: 4, message: 'warning' }, { severity: 2, message: 'info' },
  ] } });
  assert.equal(result.has_errors, true);
  assert.equal(result.error_count, 1);
  assert.equal(result.warning_count, 1);
  const clean = await getErrors({ _deps: { evaluate: () => [] } });
  assert.equal(clean.has_errors, false);
});

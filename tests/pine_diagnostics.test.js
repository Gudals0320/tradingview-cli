import { it } from 'node:test';
import assert from 'node:assert/strict';
import { getErrors } from '../src/core/pine.js';

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

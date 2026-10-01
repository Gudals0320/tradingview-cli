import { it } from 'node:test';
import assert from 'node:assert/strict';
import { newScript } from '../src/core/pine.js';

it('rejects invalid new types before connecting to or changing an editor', async () => {
  await assert.rejects(newScript({ type: 'typo' }), /Invalid Pine script type/);
  await assert.rejects(newScript({ type: 'toString' }), /Invalid Pine script type/);
});

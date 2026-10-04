import { it } from 'node:test';
import assert from 'node:assert/strict';
import { projectOutput } from '../src/cli/output.js';
import { sourceHash } from '../src/session.js';
it('output projection summarizes only internal text and keeps raw evidence and long user inputs', () => {
  const user = 'user-input-'.repeat(5000);
  for (const key of ['inputs', 'strategy_inputs']) {
    const raw = { [key]: [{ id: 'text', value: 'compiled'.repeat(100000) }, { id: 'in_0', value: user }] };
    const result = projectOutput(raw);
    assert.equal(raw[key][0].value.length, 800000);
    assert.equal(result[key][0].omitted, true);
    assert.equal(result[key][0].value, undefined);
    assert.equal(result[key][0].sha256, sourceHash(raw[key][0].value));
    assert.equal(result[key][1].value, user);
    const small = projectOutput({ [key]: [{ id: 'text', value: 'compiled' }, { id: 'in_0', value: user }] });
    assert.ok(JSON.stringify(result).length - JSON.stringify(small).length < 10);
  }
  assert.deepEqual(projectOutput({ rows: [{ id: 'text', value: user }] }), { rows: [{ id: 'text', value: user }] });
});

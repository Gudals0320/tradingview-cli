import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { requireFinite } from '../src/connection.js';
import { validateArguments } from '../src/cli/arguments.js';
import { create } from '../src/core/alerts.js';
import { setInputs } from '../src/core/indicators.js';
import { normalizeTimeframe } from '../src/chart-context.js';

it('CLI rejects incorrect arguments before lease or connection, even with a reserved workspace', () => {
  for (const args of [
    ['ohlcv', 'AAPL'], ['ohlcv', '--cout', '900'], ['data', 'lines', '--filer', 'x'],
    ['alert', 'delete', '--all=false'], ['pine', 'compile', '--save=false'],
    ['ohlcv', '--count', '0'], ['ohlcv', '--count', 'abc'], ['ohlcv', '--count', '10.5'],
    ['ohlcv', '--count', '20001'], ['stream', 'quote', '--interval', '-1'],
    ['range', '--from', '1'], ['alert', 'create', '--price', '', '--condition', 'above'],
  ]) {
    assert.throws(() => execFileSync(process.execPath, ['src/cli/index.js', ...args], {
      env: { ...process.env, TV_CDP_PORT: '65534' }, timeout: 3000, stdio: 'pipe',
    }), error => {
      assert.equal(error.status, 1, args.join(' '));
      assert.doesNotMatch(error.stderr.toString(), /SESSION_BUSY|CDP_CONNECTION|WORKSPACE_RESERVED/);
      return true;
    });
  }
});

it('only OHLCV count accepts up to 20000; other pagination limits remain 500', () => {
  for (const count of ['1', '500', '501', '20000']) {
    assert.doesNotThrow(() => validateArguments('ohlcv', { count }, []));
  }
  assert.throws(() => validateArguments('ohlcv', { count: '20001' }, []), /20000/);
  assert.throws(() => validateArguments('data ledger', { limit: '501' }, []), /500/);
  assert.throws(() => validateArguments('data equity', { limit: '501' }, []), /500/);
});

it('invalid alert condition and price do not invoke the adapter', async () => {
  let calls = 0;
  const _deps = { evaluate: () => calls++ };
  await assert.rejects(create({ price: 1, condition: 'greater_or_equal', _deps }), /Unknown alert condition/);
  await assert.rejects(create({ price: null, _deps }), /finite number/);
  assert.equal(calls, 0);
});

it('unknown indicator keys fail atomically before set or calculation invalidation', async () => {
  let mutations = 0;
  const inputs = [{ id: 'length', value: 10 }];
  const study = { getInputValues: () => inputs, setInputValues: () => mutations++ };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => ({ getStudyById: () => study }) } } };
  const _deps = { evaluate: expression => runInNewContext(expression, { window }) };
  await assert.rejects(setInputs({ entity_id: 'qa', inputs: { length: 20, typo: 30 }, _deps }), /Unknown input/);
  assert.equal(inputs[0].value, 10);
  assert.equal(mutations, 0);
  const result = await setInputs({ entity_id: 'qa', inputs: { length: 10 }, _deps });
  assert.equal(result.changed, false);
  assert.equal(mutations, 0);
});

it('rejects blank/null numeric values and malformed ports; keeps minute/month distinction', () => {
  for (const value of [null, '', ' ', false, [], {}]) assert.throws(() => requireFinite(value, 'n'));
  for (const port of ['abc', '0', '', '65536', '1.5']) {
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', 'import "./src/config.js"'], {
      env: { ...process.env, TV_CDP_PORT: port }, stdio: 'pipe',
    }));
    assert.throws(() => execFileSync(process.execPath, ['src/cli/index.js', 'status'], {
      env: { ...process.env, TV_CDP_PORT: port }, stdio: 'pipe',
    }), error => {
      assert.equal(error.status, 1);
      const result = JSON.parse(error.stderr.toString());
      assert.equal(result.success, false);
      assert.equal(result.code, 'INVALID_CONFIG');
      return true;
    });
  }
  for (const [request, applied] of [['1m', '1'], ['1M', '1M'], ['1h', '60'], ['1D', '1D']]) {
    assert.equal(normalizeTimeframe(request), applied);
  }
  assert.throws(() => validateArguments('indicator set', { inputs: '[]' }, ['qa']));
});

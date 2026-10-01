/**
 * CLI unit tests — no TradingView connection needed.
 * Tests: help output, pine analyze, pine check, error handling, exit codes.
 *
 * Run: node --test tests/cli.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync, unlinkSync } from 'fs';

function require_fs() { return { writeFileSync, unlinkSync }; }

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'src', 'cli', 'index.js');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      timeout: 15000,
      ...opts,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

describe('CLI — help and routing', () => {
  it('--help shows command list', () => {
    const { stdout, exitCode } = run(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
    assert.ok(stdout.includes('status'));
    assert.ok(stdout.includes('pine'));
    assert.ok(stdout.includes('quote'));
  });

  it('-h is same as --help', () => {
    const { stdout, exitCode } = run(['-h']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
  });

  it('no args shows help', () => {
    const { stdout, exitCode } = run([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
  });

  it('unknown command exits 1', () => {
    const { exitCode, stderr } = run(['nonexistent']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('Unknown command'));
  });

  it('pine --help shows subcommands', () => {
    const { stdout, exitCode } = run(['pine', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('get'));
    assert.ok(stdout.includes('set'));
    assert.ok(stdout.includes('compile'));
    assert.ok(stdout.includes('analyze'));
    assert.ok(stdout.includes('check'));
  });
  it('raw-compile help advertises its deprecated smart alias contract', () => {
    const { stdout, exitCode } = run(['pine', 'raw-compile', '--help']);
    assert.equal(exitCode, 0);
    assert.match(stdout, /Deprecated alias of compile/);
    assert.match(stdout, /unchanged strategies may skip dispatch/);
  });
  it('both real Pine command adapters use smart compilation and preserve unchanged results', () => {
    const adapter = join(__dirname, '..', 'src', 'cli', 'commands', 'pine.js');
    const script = `import {SourceTextModule,SyntheticModule} from 'node:vm';
      import {readFileSync} from 'node:fs';
      let registered,calls=0;
      const expected={success:true,compiled:true,unchanged:true,compile_performed:false};
      const router=new SyntheticModule(['register'],function(){this.setExport('register',(_,config)=>{registered=config});});
      const core=new SyntheticModule(['smartCompile'],function(){this.setExport('smartCompile',async()=>{calls++;return expected;});});
      const fs=new SyntheticModule(['readFileSync'],function(){this.setExport('readFileSync',readFileSync);});
      const adapter=new SourceTextModule(readFileSync(${JSON.stringify(adapter)},'utf8'));
      await adapter.link(name=>name.includes('router')?router:name.includes('core')?core:fs);
      await adapter.evaluate();
      const compile=await registered.subcommands.get('compile').handler();
      const raw=await registered.subcommands.get('raw-compile').handler();
      console.log(JSON.stringify({compile,raw,calls}));`;
    const result = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
    assert.equal(result.calls, 2);
    assert.deepEqual(result.raw, result.compile);
    assert.equal(result.raw.compile_performed, false);
  });

  it('stream help advertises multi-feed OHLCV syntax', () => {
    const { stdout, exitCode } = run(['stream', '--help']);
    assert.equal(exitCode, 0);
    assert.match(stdout, /ohlcv/);
    assert.match(stdout, /SYMBOL@TIMEFRAME/);
  });

  it('ohlcv --help shows options', () => {
    const { stdout, exitCode } = run(['ohlcv', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('--count'));
    assert.ok(stdout.includes('--summary'));
  });
});

describe('CLI — pine analyze (offline)', () => {
  it('analyzes clean v6 script', () => {
    const source = '//@version=6\nindicator("test")\nplot(close)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.issue_count, 0);
    assert.match(result.note, /tv pine compile/);
  });

  it('detects array out of bounds', () => {
    const source = '//@version=6\nindicator("test")\narr = array.from(1, 2, 3)\nval = array.get(arr, 5)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.issue_count, 1);
    assert.ok(result.diagnostics[0].message.includes('out of bounds'));
  });

  it('detects strategy.entry without strategy()', () => {
    const source = '//@version=6\nindicator("test")\nstrategy.entry("long", strategy.long)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.ok(result.diagnostics.some(d => d.message.includes('strategy()')));
  });

  it('errors without input', () => {
    // When stdin is a TTY (no pipe), analyze should error
    const { exitCode, stderr } = run(['pine', 'analyze']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('No source provided'));
  });

  it('reads --file flag', () => {
    const { writeFileSync, unlinkSync } = require_fs();
    const tmpFile = join(__dirname, '_test_script.pine');
    writeFileSync(tmpFile, '//@version=6\nindicator("test")\nplot(close)');
    try {
      const { stdout, exitCode } = run(['pine', 'analyze', '--file', tmpFile]);
      assert.equal(exitCode, 0);
      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe('CLI — pine check (server compile)', { skip: process.env.TRADINGVIEW_SKIP_NETWORK_TESTS === '1' }, () => {
  it('compiles valid Pine Script', () => {
    const source = '//@version=6\nindicator("test")\nplot(close)';
    const { stdout, exitCode } = run(['pine', 'check'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.compiled, true);
  });

  it('returns errors for invalid Pine Script', () => {
    const source = '//@version=6\nindicator("test")\nplot(nonexistent_var)';
    const { stdout, exitCode } = run(['pine', 'check'], { input: source });
    assert.equal(exitCode, 1);
    const result = JSON.parse(stdout);
    assert.equal(result.compiled, false);
    assert.ok(result.error_count > 0);
  });
});

describe('CLI operation result exit contract', () => {
  function simulated(handler) {
    const router = pathToFileURL(join(__dirname, '..', 'src', 'cli', 'router.js')).href;
    try {
      const stdout = execFileSync(process.execPath, ['--input-type=module', '-e',
        `import {register,run} from ${JSON.stringify(router)};register('fixture',{handler:${handler}});await run(['node','tv','fixture']);`], {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TV_CDP_HOST: 'tv-cli-unit-fixture', TV_CDP_PORT: '1' },
      });
      return { code: 0, stdout };
    } catch (error) { return { code: error.status, stdout: error.stdout, stderr: error.stderr }; }
  }
  it('returns 1 for structured operation failure', () => {
    const result = simulated('async()=>({success:false,error:"not ready"})');
    assert.equal(result.code, 1); assert.equal(JSON.parse(result.stdout).success, false);
  });
  it('returns 1 for an unverified strategy report without exposing metrics', () => {
    const result = simulated('async()=>({success:false,code:"REPORT_UNVERIFIED",error:"Compile or change an input before reading"})');
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.code, 'REPORT_UNVERIFIED');
    assert.equal(report.metrics, undefined);
  });
  it('returns 1 for failed compilation', () => {
    assert.equal(simulated('async()=>({success:true,compiled:false})').code, 1);
  });
  it('does not misclassify a generic message containing connection', () => {
    assert.equal(simulated('async()=>{throw new Error("connection field is invalid")}').code, 1);
  });
  it('returns 2 only for a typed connection failure', () => {
    assert.equal(simulated('async()=>{const e=new Error("offline");e.code="CDP_CONNECTION";throw e}').code, 2);
  });
});

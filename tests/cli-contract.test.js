import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSession, sessionPaths, sessionStatus } from '../src/session.js';
import { reserveWorkspace } from '../src/workspace-store.js';

const CLI = fileURLToPath(new URL('../src/cli/index.js', import.meta.url));

// Exercise the real entry point, parser, router and filesystem ownership code.
// An isolated HTTP endpoint counts unexpected Desktop access; no real Desktop,
// external API, user target, or user workspace is used by these tests.
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tv-cli-contract-'));
  const requests = [], sockets = new Set();
  let connections = 0;
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Content-Type', 'application/json');
    response.end('[]');
  });
  server.on('connection', socket => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const options = { host: '127.0.0.1', port: server.address().port, directory: join(root, 'tradingview-cli-sessions') };
  const env = { ...process.env, TEMP: root, TMP: root, TMPDIR: root,
    TV_CDP_HOST: options.host, TV_CDP_PORT: String(options.port), TV_CDP_TIMEOUT_MS: '1000' };
  delete env.TV_CDP_TARGET;
  function run(args, input = '') {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
      });
      let stdout = '', stderr = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
      child.once('close', (exitCode, signal) => {
        if (signal || exitCode === null) reject(new Error(`CLI did not finish: ${args.join(' ')} (${signal}) ${stderr}`));
        else resolve({ exitCode, stdout, stderr });
      });
      child.stdin.end(input);
    });
  }
  return { root, options, requests, run, get connections() { return connections; } };
}

function jsonResult(result, exitCode = 0) {
  assert.equal(result.exitCode, exitCode, result.stderr);
  assert.equal(result.stderr, '', 'A returned result belongs on stdout only.');
  const value = JSON.parse(result.stdout); // Also rejects banners or a second JSON object.
  assert.equal(typeof value.success, 'boolean');
  return value;
}

function jsonError(result, pattern, code) {
  assert.equal(result.exitCode, 1, result.stderr);
  assert.equal(result.stdout, '', 'Thrown input/ownership errors must not produce a stdout result.');
  const value = JSON.parse(result.stderr);
  assert.equal(value.success, false);
  assert.match(value.error, pattern);
  if (code) assert.equal(value.code, code);
  return value;
}

// Read bytes rather than calling ownership helpers that could modify a fixture.
function snapshot(directory) {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(directory, entry.name)) : readFileSync(join(directory, entry.name), 'hex')]));
}

it('real help honors text/JSON contracts and global selectors without acquiring a busy endpoint', async t => {
  const f = await fixture(t);
  const lease = acquireSession({ ...f.options, command: 'contract-test owner' });
  try {
    const before = snapshot(f.root);
    const catalog = jsonResult(await f.run(['help', '--json']));
    assert.equal(catalog.commands.find(command => command.name === 'help').output, 'conditional');
    const prefixes = [[], ['--target', 'fixture-target'], ['--workspace', join(f.root, 'missing.tvws.json')]];
    for (const prefix of prefixes) {
      const filtered = jsonResult(await f.run([...prefix, 'help', '--json', 'pine', 'compile']));
      assert.deepEqual(filtered.commands.map(command => command.name), ['pine compile']);
      const text = await f.run([...prefix, 'help', 'pine', 'compile']);
      const legacy = await f.run([...prefix, 'pine', 'compile', '--help']);
      for (const result of [text, legacy]) {
        assert.equal(result.exitCode, 0, result.stderr);
        assert.equal(result.stderr, '');
        assert.match(result.stdout, /^Usage: tv pine compile/);
        assert.throws(() => JSON.parse(result.stdout));
      }
      assert.equal(text.stdout, legacy.stdout);
      for (const option of filtered.commands[0].options) assert.ok(text.stdout.includes(option.name), option.name);
      jsonError(await f.run([...prefix, 'help', '--json', 'pine', 'not-a-command']), /Unknown command/, 'UNKNOWN_COMMAND');
    }
    assert.deepEqual(f.requests, []);
    assert.equal(f.connections, 0);
    assert.deepEqual(snapshot(f.root), before);
  } finally { lease.release(); }
});

it('offline result formats and exit codes agree with the catalog while another process owns the endpoint', async t => {
  const f = await fixture(t);
  const lease = acquireSession({ ...f.options, command: 'contract-test owner' });
  try {
    const before = snapshot(f.root);
    const catalog = jsonResult(await f.run(['help', '--json']));
    for (const name of ['session status', 'pine analyze']) {
      const entry = catalog.commands.find(command => command.name === name);
      assert.equal(entry.output, 'json');
      assert.equal(entry.desktop, 'none');
      assert.equal(entry.endpoint_lease, false);
    }
    const status = jsonResult(await f.run(['session', 'status']));
    assert.equal(status.success, true);
    assert.equal(status.locked, true);
    const clean = jsonResult(await f.run(['pine', 'analyze'], '//@version=6\nindicator("contract")\nplot(close)'));
    assert.equal(clean.success, true);
    assert.equal(clean.error_count, 0);
    const strict = jsonResult(await f.run(['pine', 'analyze', '--fail-on-error'], 'a = array.from(1, 2)\narray.get(a, 2)'), 1);
    assert.equal(strict.has_errors, true);
    assert.ok(strict.error_count > 0);
    jsonError(await f.run(['pine', 'analyze']), /No source provided/);
    assert.deepEqual(f.requests, []);
    assert.equal(f.connections, 0);
    assert.deepEqual(snapshot(f.root), before);
  } finally { lease.release(); }
});

it('invalid CLI options and positionals fail before touching a reserved workspace or CDP', async t => {
  const f = await fixture(t);
  const workspace = reserveWorkspace({ file: join(f.root, 'owned.tvws.json'), target: 'fixture-target',
    layout: 'fixture-layout', pine: 'fixture-document' }, f.options);
  const before = snapshot(f.root);
  const invalid = [
    { args: ['ohlcv', 'AAPL'], error: /positional arguments/ },
    { args: ['ohlcv', '--count', '0'], error: /--count must be an integer/ },
    { args: ['ohlcv', '--cout', '10'], error: /Unknown option/ },
    { args: ['pine', 'compile', '--save=false'], error: /does not take an argument/ },
    { args: ['indicator', 'get'], error: /positional arguments/ },
    { args: ['indicator', 'set', 'fixture-study', '--inputs', '[]'], error: /non-empty JSON object/ },
    { args: ['range', '--from', '1'], error: /requires both --from and --to/ },
  ];
  for (const prefix of [[], ['--target', workspace.target], ['--workspace', workspace.file]]) {
    for (const { args, error } of invalid) jsonError(await f.run([...prefix, ...args]), error);
  }
  // Positive control: the child really sees this reservation, not another temp store.
  jsonError(await f.run(['symbol', 'X:FIXTURE']), /Reserved local workspaces/, 'WORKSPACE_RESERVED');
  assert.deepEqual(f.requests, []);
  assert.equal(f.connections, 0);
  assert.deepEqual(snapshot(f.root), before);
});

it('an interrupted native operation stays fenced across real CLI failures and offline reads', async t => {
  const f = await fixture(t);
  const lease = acquireSession({ ...f.options, command: 'pine compile' });
  lease.checkpoint({ native_quiescence_required: true, target_id: 'fixture-target', phase: 'recovery_required' });
  lease.release();
  const paths = sessionPaths(f.options), before = readFileSync(paths.journal, 'utf8');
  jsonError(await f.run(['symbol', 'X:FIXTURE']), /Recover the interrupted native command/, 'RECOVERY_REQUIRED');
  jsonError(await f.run(['pine', 'compile', '--save=false']), /does not take an argument/);
  const status = jsonResult(await f.run(['session', 'status']));
  assert.equal(status.recovery_required, true);
  assert.equal(status.recovery_run_id, lease.run_id);
  jsonResult(await f.run(['help', '--json']));
  assert.equal(readFileSync(paths.journal, 'utf8'), before);
  assert.equal(sessionStatus(f.options).locked, false);
  assert.deepEqual(f.requests, []);
  assert.equal(f.connections, 0);
});

it('catalog HTTP-only inventory behavior reaches the endpoint even while its lease is held', async t => {
  const f = await fixture(t);
  const lease = acquireSession({ ...f.options, command: 'contract-test owner' });
  try {
    const before = snapshot(f.root);
    const entry = jsonResult(await f.run(['help', '--json', 'workspace', 'inventory'])).commands[0];
    assert.equal(entry.desktop, 'cdp_http');
    assert.equal(entry.endpoint_lease, false);
    assert.equal(entry.output, 'json');
    const result = jsonResult(await f.run(['workspace', 'inventory']));
    assert.equal(result.success, true);
    assert.deepEqual(result.targets, []);
    assert.deepEqual(f.requests, ['/json/list']);
    assert.equal(f.connections, 1);
    assert.deepEqual(snapshot(f.root), before);
  } finally { lease.release(); }
});

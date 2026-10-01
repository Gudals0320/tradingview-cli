import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reserveWorkspace, loadWorkspace, acquireWorkspace, markInterrupted, releaseWorkspace, abandonWorkspace, workspaceStatus } from '../src/workspace-store.js';
import { sessionPaths } from '../src/session.js';
import { rebindWorkspace } from '../src/workspace.js';

function legacyFixture() {
  const options = { host: 'privacy-fixture', port: 1, directory: mkdtempSync(join(tmpdir(), 'tv privacy 한글 ')) };
  const resource = reserveWorkspace({ file: join(options.directory, 'qa.tvws.json'), target: 'qa', layout: 'qa', pine: 'qa' }, options);
  const old = { ...resource, schema: 1, binding: { nonce: 'old', browser: 'old', snapshot: {
    source: 'private unsaved draft', version: 1, studies: [], context: { symbol: 'QA' }, modified: true,
  } } };
  writeFileSync(old.file, JSON.stringify(old));
  const rows = JSON.parse(readFileSync(sessionPaths(options).reservations)); rows[0].schema = 1;
  writeFileSync(sessionPaths(options).reservations, JSON.stringify(rows));
  return { options, old };
}

it('new public handles contain only identity; source and credentials remain in the private store', () => {
  const f = legacyFixture(), lease = acquireWorkspace(f.old.file, f.options);
  const handle = JSON.parse(readFileSync(f.old.file));
  assert.deepEqual(Object.keys(handle).sort(), ['endpoint_key', 'file', 'id', 'schema']);
  assert.equal(handle.schema, 2);
  assert.equal(loadWorkspace(f.old.file, f.options).token, f.old.token);
  assert.equal(loadWorkspace(f.old.file, f.options).binding.snapshot.source, 'private unsaved draft');
  lease.saveBinding(f.old.binding); lease.finish({ success: true });
  releaseWorkspace(acquireWorkspace(f.old.file, f.options), f.options);
});

it('legacy status is read-only; interrupt/recover migration preserves the old recovery journal and draft', () => {
  const f = legacyFixture(), bytes = readFileSync(f.old.file, 'utf8');
  workspaceStatus(f.old.file, f.options);
  assert.equal(readFileSync(f.old.file, 'utf8'), bytes);
  const rows = JSON.parse(readFileSync(sessionPaths(f.options).reservations));
  rows[0].operation = { id: 'old-op', pid: 99999999 };
  writeFileSync(sessionPaths(f.options).reservations, JSON.stringify(rows));
  const directory = join(f.options.directory, '.tv-workspaces', f.old.id); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'journal-old-op.json'), JSON.stringify({ phase: 'running', snapshot: f.old.binding.snapshot }));
  markInterrupted(f.old.file, 'old-op', f.options);
  const recovery = acquireWorkspace(f.old.file, { ...f.options, recover: true, recoveryOperation: 'old-op' });
  assert.equal(recovery.pending().snapshot.source, f.old.binding.snapshot.source);
  assert.equal(recovery.workspace.binding.snapshot.source, f.old.binding.snapshot.source);
  recovery.acknowledgeRecovery('old-op'); recovery.finish({ success: true });
  assert.equal(workspaceStatus(f.old.file, f.options).interrupted, null);
  abandonWorkspace(f.old.file, { workspaceId: f.old.id }, f.options);
});

it('schema-1 migration runs explicit rebind while retaining document and draft recovery binding', async () => {
  const f = legacyFixture();
  const result = await rebindWorkspace(f.old.file,f.old.id,{_deps:{options:f.options,
    checkLayout:async()=>{},browserIdentity:async()=>'rebound',getClient:async()=>({}),
    raw:async(_,expression)=>expression==='window.__tvCliWorkspace?.nonce'?'different':{nonce:'new',snapshot:f.old.binding.snapshot},
  }});
  assert.equal(result.rebound,true);
  const rebound = loadWorkspace(f.old.file, f.options);
  assert.equal(rebound.pine, f.old.pine); assert.equal(rebound.binding.snapshot.version, 1);
  assert.equal(rebound.binding.snapshot.source, f.old.binding.snapshot.source);
  assert.equal(rebound.binding.browser, 'rebound');
  const publicText=readFileSync(f.old.file,'utf8');
  assert.equal(publicText.includes(f.old.token),false);assert.equal(publicText.includes(f.old.binding.snapshot.source),false);
  abandonWorkspace(f.old.file, { workspaceId: f.old.id }, f.options);
});

it('Windows private store ACL is protected and permits only owner, SYSTEM and administrators', { skip: process.platform !== 'win32' }, () => {
  const f = legacyFixture();
  const literal = f.options.directory.replace(/'/g, "''");
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `$acl=[System.IO.Directory]::GetAccessControl('${literal}'); @{protected=$acl.AreAccessRulesProtected; sids=@($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })} | ConvertTo-Json -Compress`],
  { encoding: 'utf8', timeout: 10000, windowsHide: true }));
  const sid = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' }).match(/S-1-5-[\d-]+/)[0];
  assert.equal(result.protected, true);
  assert.deepEqual([...new Set(result.sids)].sort(), [sid, 'S-1-5-18', 'S-1-5-32-544'].sort());
  abandonWorkspace(f.old.file, { workspaceId: f.old.id }, f.options);
});

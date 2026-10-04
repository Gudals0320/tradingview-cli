import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifiedTabOwnership } from '../src/core/tab.js';
import { recordOwnedTab, ownedTabProof } from '../src/workspace-registry.js';
import { reserveWorkspace, acquireWorkspace, loadWorkspace, abandonWorkspace } from '../src/workspace-store.js';
const facts = { layout: 'saved', target: 'new-target', browser: 'browser-A', browserAfter: 'browser-A', landing: 'new-landing', createdLanding: true,
  createdShellTab: 'new-shell-tab', shellTab: 'new-shell-tab', initialTargets: ['GUI-target'], origin: 'open' };
it('create/open ownership requires actual fresh landing, shell tab, target and browser lifecycle', () => {
  for (const origin of ['create', 'open']) assert.equal(verifiedTabOwnership({ ...facts, origin }).owned, true);
  for (const patch of [{ createdLanding: false }, { createdShellTab: null }, { shellTab: 'other-tab' }, { initialTargets: ['new-target'] }, { initialTargets: ['new-landing'] }, { browserAfter: 'browser-B' }, { browser: null }]) assert.equal(verifiedTabOwnership({ ...facts, ...patch }).owned, false);
  assert.equal(verifiedTabOwnership({ ...facts, createdLanding: false }).reason, 'reused_landing');
  const replacement = { ...facts, origin: 'create', shellTab: 'replacement', initialShellTabs: ['GUI-tab'], finalShellTabs: ['GUI-tab', 'replacement'] };
  assert.equal(verifiedTabOwnership(replacement).owned, true);
  assert.equal(verifiedTabOwnership({ ...replacement, finalShellTabs: ['replacement'] }).owned, false);
  assert.equal(verifiedTabOwnership({ ...replacement, finalShellTabs: ['GUI-tab', 'replacement', 'unrelated-new-tab'] }).owned, false);
  assert.equal(verifiedTabOwnership({ ...replacement, origin: 'open' }).owned, false);
});
it('ownership registry accepts only verified exact results and does not promote existing/uncertain targets', () => {
  const options = { directory: mkdtempSync(join(tmpdir(), 'tv-tab-ownership-')), host: 'fixture', port: 1 };
  const tab_ownership = verifiedTabOwnership(facts), result = { success: true, chart_id: facts.layout, target: facts.target, tab_ownership };
  assert.equal(recordOwnedTab({ ...result, success: false }, options), false);
  assert.equal(recordOwnedTab({ ...result, target: 'wrong' }, options), false);
  assert.equal(recordOwnedTab({ ...result, tab_ownership: verifiedTabOwnership({ ...facts, createdLanding: false }) }, options), false);
  assert.equal(recordOwnedTab(result, options), true);
  assert.equal(ownedTabProof('saved', 'GUI-target', 'browser-A', options), null);
  assert.equal(ownedTabProof('saved', 'new-target', 'browser-B', options), null);
  assert.equal(ownedTabProof('saved', 'new-target', 'browser-A', options).origin, 'open');
});
it('reconnect to a GUI target drops exact ownership while proven CLI open targets can be reassigned', () => {
  const options = { directory: mkdtempSync(join(tmpdir(), 'tv-tab-reassign-')), host: 'fixture', port: 1 };
  const tab_ownership = verifiedTabOwnership(facts);
  const workspace = reserveWorkspace({ file: join(options.directory, 'owned.json'), target: facts.target, layout: facts.layout, owned_target: facts.target, tab_ownership, created_by_cli: true }, options);
  let lease = acquireWorkspace(workspace.file, options); lease.saveBinding({ nonce: 'generation', browser: 'browser-A' }); lease.finish({ success: true });
  lease = acquireWorkspace(workspace.file, options); lease.reassign({ target: 'GUI-target', expectedGeneration: 'generation', tab_ownership: null }); lease.finish({ success: true });
  let current = loadWorkspace(workspace.file, options); assert.equal(current.owned_target, null); assert.equal(current.created_by_cli, false);
  lease = acquireWorkspace(workspace.file, options); lease.saveBinding({ nonce: 'next', browser: 'browser-A' }); lease.finish({ success: true });
  const next = verifiedTabOwnership({ ...facts, target: 'CLI-reopen-target' });
  lease = acquireWorkspace(workspace.file, options); lease.reassign({ target: next.target, expectedGeneration: 'next', tab_ownership: next }); lease.finish({ success: true });
  current = loadWorkspace(workspace.file, options); assert.equal(current.owned_target, next.target); assert.equal(current.created_by_cli, true);
  abandonWorkspace(workspace.file, { workspaceId: current.id }, options);
});

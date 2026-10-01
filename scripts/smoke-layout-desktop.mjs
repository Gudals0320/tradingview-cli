import CDP from '../src/cdp.js';
import { CDP_HOST, CDP_PORT } from '../src/config.js';
import { getDesktopInventory, inspectTarget } from '../src/desktop.js';
import { withReadOnlySession } from '../src/session.js';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = resolve('results/issue-overhaul');
const summary = { evidence: 'Korean Windows Desktop natural QA switches and explicitly labeled injections', checks: [] };
const record = (name, evidence = 'live natural QA only') => { summary.checks.push({ name, evidence, passed: true }); console.log(name); };
const inventory = () => withReadOnlySession(() => getDesktopInventory());
async function layoutTab(name) {
  const state = await inventory();
  const tabs = await withReadOnlySession(() => Promise.all(state.tabs.filter(tab => tab.id && tab.is_chart).map(async tab => ({
    tab, name: await inspectTarget(tab, `document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`),
  }))));
  const matches = tabs.filter(item => item.name === name); assert.ok(matches.length <= 1, 'Duplicate QA layout target.');
  return matches[0]?.tab;
}
const a = await layoutTab('CLI-QA-I22-A'); assert.ok(a);
function run(target, args) {
  const raw = spawnSync(process.execPath, ['src/cli/index.js', '--target', target.id, ...args], { encoding: 'utf8', timeout: 60000 });
  writeFileSync(join(root, 'smoke-layout-private-last.json'), JSON.stringify(raw));
  return { exit: raw.status, value: raw.stdout.trim() ? JSON.parse(raw.stdout) : null, stderr: raw.stderr };
}
async function dialogsAfter(before) {
  const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  return targets.filter(target => /dialog-window/.test(target.url || '') && !before.some(old => old.id === target.id));
}
async function clickOwnedDialog(dialog, discard = false, inline = false) {
  return withReadOnlySession(() => inspectTarget(dialog, `(() => {
    const scope=${inline ? "document.querySelector('button[data-qa-id=cancel-btn][name=cancel]')?.parentElement?.parentElement" : 'document.body'};
    if(!scope)return false;
    const text=scope.innerText;
    if(!/저장|save/i.test(text)) return false;
    const wanted=${JSON.stringify(discard ? ['저장하지 않고 닫기', "Don't save", 'Close without saving'] : ['close-dialog-window', '취소', 'Cancel'])};
    const button=Array.from(scope.querySelectorAll('button')).find(button=>wanted.includes(button.innerText.trim()));
    if(!button) return false;button.click();return true;
  })()`));
}
let b = await layoutTab('CLI-QA-I22-B'), opened = false, originalSymbol;
try {
  if (!b) { assert.equal(run(a, ['tab', 'new', '--layout', 'CLI-QA-I22-B']).exit, 0); b = await layoutTab('CLI-QA-I22-B'); opened = true; }
  assert.ok(b);
  const ambiguous = run(a, ['tab', 'new', '--layout', 'CLI-QA-I22']);
  assert.equal(ambiguous.exit, 1); assert.match(ambiguous.stderr, /Ambiguous layout/);
  const afterAmbiguity = await inventory();
  const landing = afterAmbiguity.tabs.find(tab => tab.active && !tab.is_chart);
  if (landing) assert.equal(run(a, ['tab', 'close']).exit, 0);
  record('ambiguous A/B prefix is rejected by tab picker');
  const selected = (await inventory()).tabs.find(tab => tab.id === b.id);
  assert.equal(run(b, ['tab', 'switch', String(selected.index)]).exit, 0);
  const beforeNormal=await withReadOnlySession(()=>inspectTarget(b,`window.TradingViewApi._chartWidgetCollection.hasChanges().value()`));
  if(beforeNormal)assert.equal(run(b,['ui','eval','window.TradingViewApi._chartWidgetCollection.saveLayoutState()']).exit,0);
  const forward=run(b,['layout','switch','CLI-QA-I22-A']);assert.equal(forward.exit,0,forward.stderr);assert.equal(forward.value.layout_verified,true);
  const back=run(b,['layout','switch','CLI-QA-I22-B']);assert.equal(back.exit,0,back.stderr);assert.equal(back.value.layout_verified,true);
  record('normal saved-chart object switch B to A and back verifies URL identity');
  // Explicit QA-only invalidation test. Its layout was saved above; no personal
  // target is reloaded, and no user Pine edits are introduced by this fixture.
  await withReadOnlySession(()=>inspectTarget(b,`(()=>{window.__qaOriginalLayoutLoader=window.TradingViewApi.loadChartFromServer;window.TradingViewApi.loadChartFromServer=()=>undefined;return true;})()`));
  const noop=run(b,['layout','switch','CLI-QA-I22-A']);
  assert.equal(noop.exit,1);assert.equal(noop.value.code,'LAYOUT_UNVERIFIED');
  const noState=run(b,['session','status']).value;
  assert.equal(run(b,['session','recover','--run-id',noState.recovery_run_id]).exit,1);
  const reloadClient=await CDP({host:CDP_HOST,port:CDP_PORT,target:b.id});
  try {await reloadClient.Page.reload({ignoreCache:false});} finally {await reloadClient.close();}
  let rebound=false;
  for(let attempt=0;attempt<40;attempt++){
    const recovered=run(b,['session','recover','--run-id',noState.recovery_run_id]);
    if(recovered.exit===0){assert.equal(recovered.value.generation_invalidated,true);rebound=true;break;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(rebound,true,'Explicit QA generation destruction/stable rebind did not recover.');
  record('opaque no-op stays fenced until explicit QA reload invalidates generation and stable rebind verifies', 'live injected void loader + explicit QA-only reload');

  originalSymbol = run(b, ['state']).value.symbol;
  const changed = originalSymbol === 'BINANCE:SOLUSDT' ? 'BINANCE:BTCUSDT' : 'BINANCE:SOLUSDT';
  assert.equal(run(b, ['symbol', changed]).exit, 0);
  await withReadOnlySession(()=>inspectTarget(b,`(() => {window.__qaOriginalLayoutLoader=window.TradingViewApi.loadChartFromServer;
    window.TradingViewApi.loadChartFromServer=async function(chart){await new Promise(resolve=>setTimeout(resolve,6500));return await window.__qaOriginalLayoutLoader.call(this,chart);};return true;})()`));
  const before = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  assert.equal(await withReadOnlySession(() => inspectTarget(b, `document.querySelectorAll('[role=dialog]').length`)), 0);
  const switched = run(b, ['layout', 'switch', 'CLI-QA-I22-A']);
  assert.equal(switched.exit, 1); assert.equal(switched.value.code,'LAYOUT_UNVERIFIED');assert.equal(switched.value.recovery_required,true); assert.equal(switched.value.layout_verified, false);
  assert.equal((await layoutTab('CLI-QA-I22-B')).chart_id, b.chart_id);
  for(let attempt=0;attempt<40;attempt++) {
    const visible=await withReadOnlySession(()=>inspectTarget(b,`Boolean(document.querySelector('button[data-qa-id=dontSave-btn][name=dontSave]'))`));
    if(visible)break;
    assert.ok(attempt<39,'Late QA dialog did not appear.');await new Promise(resolve=>setTimeout(resolve,100));
  }
  await new Promise(resolve=>setTimeout(resolve,250));
  const dialogs = await dialogsAfter(before);
  if (dialogs.length === 1) assert.equal(await clickOwnedDialog(dialogs[0]), true);
  else {
    assert.equal(dialogs.length, 0, 'Only the QA switch confirmation may be cancelled.');
    const details=await withReadOnlySession(() => inspectTarget(b, `Array.from(document.querySelectorAll('button')).filter(button=>button.offsetParent!==null&&/저장|취소|save|cancel/i.test(button.innerText)).map(button=>({text:button.innerText,qa:button.getAttribute('data-qa-id'),name:button.getAttribute('name'),parent:button.parentElement?.parentElement?.innerText?.slice(0,300)}))`));
    writeFileSync(join(root,'smoke-layout-private-dialog.json'),JSON.stringify(details,null,2));
    assert.ok(details.some(button => button.qa === 'cancel-btn' && button.name === 'cancel'));
    assert.equal(await clickOwnedDialog(b, false, true), true);
  }
  await new Promise(resolve=>setTimeout(resolve,500));
  const terminal=await withReadOnlySession(()=>inspectTarget(b,`({pending:window.__tvCliLayoutSwitch?.pending,state:window.__tvCliLayoutSwitch?.state,action:window.__tvCliLayoutSwitch?.dialog_action})`));
  assert.equal(terminal.pending,false);assert.equal(terminal.state,'cancelled');assert.equal(terminal.action,'cancel');
  const recovery = run(b, ['session', 'status']).value;
  if (recovery.recovery_required) assert.equal(run(b, ['session', 'recover', '--run-id', recovery.recovery_run_id]).exit, 0);
  record('late Korean QA-B confirmation remains fenced, captured Cancel settles and recovery clears without reload', 'live injected 6500ms delay + natural Korean confirmation and captured Cancel');
} finally {
  if(b)await withReadOnlySession(()=>inspectTarget(b,`(()=>{if(window.__qaOriginalLayoutLoader){window.TradingViewApi.loadChartFromServer=window.__qaOriginalLayoutLoader;delete window.__qaOriginalLayoutLoader;}return true})()`));
  if (b && originalSymbol) assert.equal(run(b, ['symbol', originalSymbol]).exit, 0);
  if (b && opened) {
    const state = await inventory(), tab = state.tabs.find(tab => tab.id === b.id);
    if (tab) {
      assert.equal(run(b, ['tab', 'switch', String(tab.index)]).exit, 0);
      const before = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
      const clicked = await withReadOnlySession(() => inspectTarget({ id: tab.shell_target_id }, `(() => {
        const active=document.querySelector('.tabs-container .tab.active');
        if(active?.id!==${JSON.stringify(tab.shell_tab_id)})return false;
        const close=active.querySelector('[class*="close"] button')||active.querySelector('button[class*="close"]');
        if(!close)return false;close.click();return true;
      })()`));
      assert.equal(clicked, true);
      await new Promise(resolve => setTimeout(resolve, 500));
      for (const dialog of await dialogsAfter(before)) assert.equal(await clickOwnedDialog(dialog, true), true);
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.equal((await inventory()).tabs.some(tab => tab.id === b.id), false);
    }
  }
  const currentA = (await inventory()).tabs.find(tab => tab.id === a.id);
  if (currentA) assert.equal(run(a, ['tab', 'switch', String(currentA.index)]).exit, 0);
  writeFileSync(join(root, 'smoke-layout-summary.json'), JSON.stringify(summary, null, 2));
}

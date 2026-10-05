import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import CDP from 'chrome-remote-interface';
import { acquireSession, sessionPaths, sessionStatus } from '../src/session.js';
import { reserveWorkspace, acquireWorkspace, noteWorkspaceState, workspaceStatus, loadWorkspace,workspaceArtifactDirectory } from '../src/workspace-store.js';
import { registerWorkspaceName, recordCreatedLayout } from '../src/workspace-registry.js';
import { sourceHash } from '../src/session.js';
import { runInNewContext } from 'node:vm';
import { WORKSPACE_PAGE_CODE } from '../src/workspace-page.js';
import { beginCompilation } from '../src/strategy-state.js';
import { reportPage } from './fixtures/report-page.mjs';
import { resourceLockStatus } from '../src/resource-lock.js';
import { preparationPage } from './fixtures/preparation-page.mjs';
import { propertiesPage } from './fixtures/properties-page.mjs';
import { deepPage } from './fixtures/deep-page.mjs';
import { equityPage } from './fixtures/equity-page.mjs';
import {createHash} from 'node:crypto';

const CLI = fileURLToPath(new URL('../src/cli/index.js', import.meta.url));

it('real equity entry returns verified finite native plot pages and refuses fake plots, changed revisions and Deep fallback',async t=>{
  const page=equityPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('equity-entry-v2');page.refreshReport();page.completeInputs();
  const args=['--workspace','contract','data','equity','--plot-id','plot_0','--limit','1'];
  const first=jsonResult(await f.run(args));assert.equal(first.total_points,3);assert.equal(first.data.length,1);assert.equal(first.semantic_proof.verified,true);assert.equal(first.effective_properties.fingerprint.length,64);
  const second=jsonResult(await f.run([...args,'--offset','1','--report-revision',first.report_revision]));assert.equal(second.report_revision,first.report_revision);assert.equal(second.data[0].equity,1030);
  const catalog=jsonResult(await f.run(['--workspace','contract','data','equity','--list-plots']));assert.equal(catalog.plot_values_verified,false);assert.equal(catalog.plots[0].plot_id,'plot_0');
  const csv=join(f.root,'equity.csv'),exported=jsonResult(await f.run([...args,'--export',csv]));assert.equal(exported.export.rows,3);assert.equal(exported.export.report_revision,first.report_revision);assert.equal(exported._export_rows,undefined);assert.equal(readFileSync(csv,'utf8').trim().split(/\r?\n/).length,4);
  const previous=readFileSync(csv,'utf8');jsonError(await f.run([...args,'--export',csv]),/already exists/,'EQUITY_EXPORT_EXISTS');assert.equal(readFileSync(csv,'utf8'),previous);
  const wrong=jsonResult(await f.run(['--workspace','contract','data','equity','--plot-id','plot_9']),1);assert.equal(wrong.code,'EQUITY_PLOT_UNVERIFIED');
  const rejectedCsv=join(f.root,'rejected.csv');jsonResult(await f.run(['--workspace','contract','data','equity','--plot-id','plot_9','--export',rejectedCsv]),1);assert.equal(existsSync(rejectedCsv),false);
  const deep=jsonResult(await f.run(['--workspace','contract','data','equity','--plot-id','plot_0','--mode','deep']),1);assert.equal(deep.code,'EQUITY_DEEP_UNSUPPORTED');assert.equal(deep.data,undefined);
  assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});

it('real Deep CLI pins native source and response identity, pages one revision and rejects later foreign reports',async t=>{
  const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('deep-entry-compiled-v2');
  const args=['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','deep-entry'];
  const accepted=jsonResult(await f.run(args));assert.equal(accepted.mode,'deep');assert.equal(accepted.phase,'pending');assert.equal(page.dispatches(),1);
  await page.complete(10);const ready=jsonResult(await f.run(['--workspace','contract','backtest','wait','--run-id',accepted.run_id,'--timeout','1000']));assert.equal(ready.phase,'ready');
  const first=jsonResult(await f.run(['--workspace','contract','backtest','results','--run-id',accepted.run_id,'--limit','1']));assert.equal(first.performance.all.netProfit,10);assert.equal(first.ledger.rows.length,1);assert.equal(first.snapshot.period_validation,'once_per_snapshot');
  const repeated=jsonResult(await f.run(args));assert.equal(repeated.reused,true);assert.equal(page.dispatches(),1);
  await page.complete(999,99);const foreign=jsonResult(await f.run(['--workspace','contract','backtest','results','--run-id',accepted.run_id]),1);assert.equal(foreign.code,'DEEP_REPORT_UNVERIFIED');assert.equal(foreign.performance,undefined);
  const reset=jsonResult(await f.run(['--workspace','contract','backtest','normal']),1);assert.equal(reset.code,'DEEP_RUN_UNSETTLED');assert.ok(page.window.__tvCliDeepRun);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real Deep entry rejects stale manager kernel and tiny periods with zero native dispatch',async t=>{
  const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('deep-entry-compiled-v2');
  const before=snapshot(f.root),requests=f.requests.length;
  const timezone=jsonError(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--timezone','Asia/Seoul','--request-id','unsupported-zone']),/Only native UTC/,'DEEP_TIMEZONE_UNSUPPORTED');
  assert.equal(timezone.details.mutation_dispatched,false);assert.equal(f.requests.length,requests);assert.deepEqual(snapshot(f.root),before);assert.equal(page.dispatches(),0);
  const precision=jsonError(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-03-10T00:00:00-05:00','--to','2024-03-11T00:00:00-04:00','--request-id','unsupported-subday']),/UTC midnight/,'DEEP_PERIOD_PRECISION_UNSUPPORTED');assert.equal(precision.details.mutation_dispatched,false);assert.equal(f.requests.length,requests);assert.deepEqual(snapshot(f.root),before);
  jsonError(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00.100Z','--to','2024-01-01T00:00:00.900Z','--request-id','tiny']),/whole seconds/,'INVALID_DEEP_PERIOD');
  page.manager._activeStrategyInputs.value=()=>({studyName:'wrong',inputs:{text:'wrong',pineId:'foreign',pineVersion:9},dependencies:[]});
  const denied=jsonResult(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','stale']),1);assert.equal(denied.code,'DEEP_KERNEL_UNVERIFIED');assert.equal(denied.mutation_dispatched,false);assert.equal(page.dispatches(),0);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real Deep entry rejects independently mismatched symbol, interval and each native input field without dispatch',async t=>{
  const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('deep-matrix-compiled-v2');
  const symbol=page.manager._symbolString.value,resolution=page.manager._resolution.value,kernel=page.manager._activeStrategyInputs.value;
  const changes=[
    ['symbol',()=>{page.manager._symbolString.value=()=> 'FOREIGN';},'DEEP_CONTEXT_UNVERIFIED'],
    ['resolution',()=>{page.manager._resolution.value=()=>({value:()=> '240',isTicks:()=>false,isRange:()=>false});},'DEEP_CONTEXT_UNVERIFIED'],
    ...['text','pineId','pineVersion','prop_fee','prop_qty_type'].map(id=>[id,()=>{page.manager._activeStrategyInputs.value=()=>{const n=kernel();n.inputs[id]=typeof n.inputs[id]==='object'?{...n.inputs[id],v:'foreign'}:'foreign';return n;};},'DEEP_KERNEL_UNVERIFIED']),
  ];
  for(const [name,change,code] of changes){page.manager._symbolString.value=symbol;page.manager._resolution.value=resolution;page.manager._activeStrategyInputs.value=kernel;change();
    const denied=jsonResult(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','matrix-'+name]),1);assert.equal(denied.code,code,name);assert.equal(denied.mutation_dispatched,false,name);assert.equal(page.dispatches(),0,name);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null,name);
  }
});
it('real normal reset settles a known pre-wire refusal, clears its native loading state and preserves the private record',async t=>{
  const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('deep-normal-zero-v2');
  const original=page.manager._sendRequest;page.manager._sendRequest=function(method,args){const result=original.call(this,method,args);if(method==='history_create_session')this._sessionid='foreign';return result;};
  const args=['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','zero-normal'];
  jsonError(await f.run(args),/DEEP_REQUEST_CHANGED/);assert.equal(page.dispatches(),0);assert.equal(page.manager.activeStrategyStatus.value().type,1);
  const status=jsonResult(await f.run(['--workspace','contract','backtest','status']),1);assert.equal(status.no_history_dispatch_verified,true);
  const normal=jsonResult(await f.run(['--workspace','contract','backtest','normal']));assert.equal(normal.mode,'normal');assert.equal(page.window.__tvCliDeepRun,undefined);assert.equal(page.manager.activeStrategyStatus.value(),null);assert.equal(page.dispatches(),0);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real normal reset refuses unrecorded loading and old zero-history proof borrowed by a replaced native provider',async t=>{
  for(const kind of ['unrecorded','provider']){const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
    const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('normal-unrecorded-v2');
    if(kind==='provider'){const original=page.manager._sendRequest;page.manager._sendRequest=function(method,args){const result=original.call(this,method,args);if(method==='history_create_session')this._sessionid='foreign';return result;};
      jsonError(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','old-zero']),/DEEP_REQUEST_CHANGED/);
      page.window.__deepFacade={...page.facade,_deepBacktestingManager:{...page.manager}};page.evaluate('document.__deepRoot.__reactFiber$deep.memoizedProps.value=window.__deepFacade');
    }else{page.facade._isDeepBacktesting=true;page.manager.activeStrategyStatus.set({type:1});}
    const denied=jsonResult(await f.run(['--workspace','contract','backtest','normal']),1);assert.equal(denied.code,kind==='provider'?'DEEP_RUN_SUPERSEDED':'DEEP_RUN_UNSETTLED',kind);assert.equal(denied.mutation_dispatched,false,kind);assert.equal(page.manager.activeStrategyStatus.value().type,1,kind);assert.equal(page.facade._isDeepBacktesting,true,kind);assert.equal(page.dispatches(),0,kind);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null,kind);
  }
});
it('real normal reset permits exact completed history and refuses a later foreign completed GUI report',async t=>{
  for(const foreign of [false,true]){const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
    const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('completed-history-normal-v2');
    const accepted=jsonResult(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','owned-history']));await page.complete();
    if(foreign){page.manager.requestData(1704240000000,1704326400000);await page.complete(999,1);const denied=jsonResult(await f.run(['--workspace','contract','backtest','normal']),1);assert.equal(denied.code,'DEEP_RUN_SUPERSEDED');assert.equal(denied.mutation_dispatched,false);assert.equal(page.manager.activeStrategyStatus.value().type,2);assert.equal(page.facade._isDeepBacktesting,true);assert.equal(page.manager.activeStrategyReportData.value().performance.all.netProfit,999);}
    else{page.manager._wsConnection.connected=true;const reset=jsonResult(await f.run(['--workspace','contract','backtest','normal']));assert.equal(reset.mode,'normal');assert.equal(page.manager.activeStrategyStatus.value(),null);assert.ok(accepted.run_id);}
    assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
  }
});
it('superseded runs have an explicit offline record archive, preserving evidence without touching GUI work or trapping new requests',async t=>{
  const page=deepPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile('superseded-archive-v2');
  const accepted=jsonResult(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-01T00:00:00Z','--to','2024-01-02T00:00:00Z','--request-id','old-owned']));
  const pendingPath=join(workspaceArtifactDirectory(ws,f.options),'deep-request-'+createHash('sha256').update('old-owned').digest('hex')+'.json'),pendingBytes=readFileSync(pendingPath,'hex');
  jsonError(await f.run(['workspace','backtest-archive','contract','--request-id','old-owned','--run-id',accepted.run_id,'--acknowledge-no-adoption']),/pending\/unknown/,'DEEP_ARCHIVE_OUTCOME_UNKNOWN');assert.equal(readFileSync(pendingPath,'hex'),pendingBytes);
  jsonError(await f.run(['workspace','backtest-archive','contract','--request-id','old-owned','--run-id','wrong-id','--acknowledge-no-adoption']),/identity does not match/,'DEEP_ARCHIVE_ID_MISMATCH');assert.equal(readFileSync(pendingPath,'hex'),pendingBytes);
  await page.complete();
  page.manager.requestData(1704240000000,1704326400000);await page.complete(999,1);
  const status=jsonResult(await f.run(['--workspace','contract','backtest','status','--run-id',accepted.run_id]),1);assert.equal(status.code,'DEEP_RUN_SUPERSEDED');assert.equal(status.result_adopted,false);
  const recordPath=join(workspaceArtifactDirectory(ws,f.options),'deep-request-'+createHash('sha256').update('old-owned').digest('hex')+'.json'),store={read:()=>JSON.parse(readFileSync(recordPath,'utf8'))},before=store.read(),requests=f.requests.length;
  const archive=['workspace','backtest-archive','contract','--request-id','old-owned','--run-id',accepted.run_id,'--acknowledge-no-adoption'];
  jsonError(await f.run(archive.slice(0,-1)),/acknowledge-no-adoption/,'DEEP_ARCHIVE_CONFIRMATION_REQUIRED');assert.deepEqual(store.read(),before);
  const archived=jsonResult(await f.run(archive));assert.equal(archived.native_state_changed,false);assert.equal(archived.record_preserved,true);assert.equal(archived.result_adopted,false);assert.equal(f.requests.length,requests);assert.equal(page.manager.activeStrategyReportData.value().performance.all.netProfit,999);
  const preserved=store.read();assert.equal(preserved.phase,'archived_unadopted');assert.deepEqual(preserved.source_proof,before.source_proof);assert.deepEqual(preserved.result,before.result);
  assert.equal(jsonResult(await f.run(archive)).reused,true);
  const next=jsonResult(await f.run(['--workspace','contract','backtest','run','--mode','deep','--from','2024-01-05T00:00:00Z','--to','2024-01-06T00:00:00Z','--request-id','new-owned']));assert.equal(next.phase,'pending');assert.notEqual(next.run_id,accepted.run_id);assert.equal(page.dispatches(),3);
});

it('real typed Properties CLI rejects invalid patches and untyped bypass before mutation, then verifies one matching cycle',async t=>{
  const page=propertiesPage();
  const f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile();
  const invalid=jsonError(await f.run(['--workspace','contract','strategy','set-properties','--values','{"commission_value":0.1,"slippage":-1}']),/slippage/,'INVALID_STRATEGY_PROPERTIES');assert.equal(invalid.details.mutation_dispatched,false);assert.equal(page.mutations(),0);
  jsonError(await f.run(['--workspace','contract','indicator','set','owned-study','--inputs','{"prop_fee":0.1}']),/typed strategy Properties/,'STRATEGY_PROPERTY_COMMAND_REQUIRED');assert.equal(page.mutations(),0);
  const unsupported=jsonResult(await f.run(['--workspace','contract','strategy','set-properties','--values','{"slippage":1}']),1);assert.equal(unsupported.code,'STRATEGY_PROPERTY_UNSUPPORTED');assert.equal(unsupported.mutation_dispatched,false);assert.equal(page.mutations(),0);
  const changed=jsonResult(await f.run(['--workspace','contract','strategy','set-properties','--values','{"commission_value":0.2,"default_qty_value":2}']));assert.equal(changed.report_ready,true);assert.equal(changed.effective_properties.values.commission_value,0.2);assert.equal(changed.effective_properties.values.default_qty_value,2);assert.equal(changed.effective_properties.fingerprint.length,64);assert.equal(page.mutations(),1);
  const read=jsonResult(await f.run(['--workspace','contract','strategy','properties']));assert.equal(read.effective_properties.fingerprint,changed.effective_properties.fingerprint);
  const catalog=jsonResult(await f.run(['help','--json','strategy','set-properties'])).commands[0];assert.equal(catalog.invocation,'native');assert.deepEqual(catalog.locks,['layout','workspace','document']);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real Properties guard rejects an unrequested simultaneous native change instead of publishing success',async t=>{
  const page=propertiesPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile();page.extraChange();
  const result=jsonError(await f.run(['--workspace','contract','strategy','set-properties','--values','{"commission_value":0.2}']),/WORKSPACE_EXTERNAL_CHANGE/,'WORKSPACE_EXTERNAL_CHANGE');assert.equal(result.success,false);assert.equal(page.mutations(),1);assert.ok(workspaceStatus(ws.file,f.options).interrupted);
});
it('real Properties permission never adopts an unrequested Pine saved-version change',async t=>{
  const page=propertiesPage(),f=await fixture(t,expression=>page.evaluate(expression),{snapshotFactory:page.snapshot,epochFactory:page.epoch});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.compile();page.changeVersionDuringSetter();
  jsonError(await f.run(['--workspace','contract','strategy','set-properties','--values','{"commission_value":0.2}']),/WORKSPACE_EXTERNAL_CHANGE/,'WORKSPACE_EXTERNAL_CHANGE');assert.equal(page.mutations(),1);assert.ok(workspaceStatus(ws.file,f.options).interrupted);assert.notEqual(loadWorkspace(ws.file,f.options).binding.snapshot?.version,2);
});

it('real Pine preparation reassigns then binds, retains browser proof, and resumes without duplicate creation',async t=>{
  const page=preparationPage();
  const f=await fixture(t,expression=>page.evaluate(expression),{pine:null,snapshotFactory:page.snapshot});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);
  const args=['workspace','pine-prepare','contract','--create','QA fixture','--request-id','request-one','--generation','fixture-generation'];
  const first=jsonResult(await f.run(args));
  assert.equal(first.document.id,'QA;fixture');assert.equal(first.document.version,'1.0');assert.deepEqual(first.stages,{created:true,persistence_verified:true,opened:true,attached:true});assert.equal(first.residual_resources.tab_ownership_changed,false);
  const bound=loadWorkspace(ws.file,f.options);assert.equal(bound.binding.browser,'fixture-browser');assert.equal(bound.pine,'QA;fixture');assert.equal(bound.binding.nonce,first.generation);assert.equal(page.creates(),1);
  const stale=jsonError(await f.run(args),/current --generation/,'WORKSPACE_GENERATION_CHANGED');assert.equal(stale.details.preparation_phase,'complete');assert.equal(stale.details.current_generation,first.generation);
  const resumed=jsonResult(await f.run([...args.slice(0,-1),first.generation]));assert.equal(resumed.reused,true);assert.equal(resumed.generation,first.generation);assert.equal(page.creates(),1);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real Pine preparation refuses a foreign draft before saving and reports unchanged stages',async t=>{
  const page=preparationPage(),f=await fixture(t,expression=>page.evaluate(expression),{pine:null,snapshotFactory:page.snapshot});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.setModified(true);
  const result=jsonError(await f.run(['workspace','pine-prepare','contract','--create','QA fixture','--request-id','request-draft','--generation','fixture-generation']),/editor draft is preserved/,'PINE_FOREIGN_DRAFT');
  assert.equal(result.code,'PINE_FOREIGN_DRAFT');assert.equal(result.details.stages,null);assert.equal(result.details.residual_resources.saved_document,null);assert.equal(page.creates(),0);assert.equal(workspaceStatus(ws.file,f.options).interrupted,null);
});
it('real unknown open provides an exact new open request, which recovers without creating another document',async t=>{
  const page=preparationPage(),f=await fixture(t,expression=>page.evaluate(expression),{pine:null,snapshotFactory:page.snapshot});
  const ws=loadWorkspace(join(f.root,'contract.json'),f.options);page.bind(ws);page.setOpenFailure(true);
  const args=['workspace','pine-prepare','contract','--create','QA fixture','--request-id','unknown-open','--generation','fixture-generation'];
  const error=jsonError(await f.run(args),/native open response unknown/);
  assert.ok(error.details.next_commands.at(-1).includes("--open 'QA;fixture'"));assert.ok(error.details.next_commands.at(-1).includes('--request-id open-recovery-'));assert.equal(page.creates(),1);
  page.setOpenFailure(false);const opened=jsonResult(await f.run(['workspace','pine-prepare','contract','--open','QA;fixture','--request-id','safe-open-after-unknown','--generation','fixture-generation']));
  assert.equal(opened.stages.created,false);assert.equal(opened.stages.attached,true);assert.equal(opened.document.id,'QA;fixture');assert.equal(page.creates(),1);
});

// Exercise the real entry point, parser, router and filesystem ownership code.
// An isolated HTTP endpoint counts unexpected Desktop access; no real Desktop,
// external API, user target, or user workspace is used by these tests.
async function fixture(t, pageResult, { pine = 'owned-document', snapshotFactory, epochFactory, createdByCli = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tv-cli-contract-'));
  const requests = [], sockets = new Set();
  let connections = 0;
  const protocol = pageResult ? await CDP.Protocol({ local: true }) : null;
  let targets;
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(pageResult ? request.url === '/json/protocol' ? protocol : request.url === '/json/version' ? { webSocketDebuggerUrl: 'fixture-browser' }
      : targets || [{ id: 'fixture-target', type: 'page', url: 'https://www.tradingview.com/chart/fixture-layout/', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/fixture-target` }] : []));
  });
  const ws = pageResult ? new WebSocket.Server({ server }) : null;
  ws?.on('connection', socket => socket.on('message', async raw => {
    const message = JSON.parse(raw);
    try {
    const expression = message.params?.expression || '';
    const workspaceSnapshot = snapshotFactory?.() || { source: 'owned', modified: false, version: 1, context: { symbol: 'FIXTURE', resolution: '60' }, studies: [{ id: 'chosen-study', status: 2, inputs: [{id:'pineVersion',value:1}] }] };
    const value = expression.includes(';return (guardWorkspacePage(') ? workspaceSnapshot
      : expression.includes(';return (window.__tvCliCompilation') ? epochFactory?.() || { source_hash: sourceHash('owned'), report_verified: true, phase: 'ready', inputs_fingerprint: JSON.stringify(workspaceSnapshot.studies[0].inputs) }
      : expression === '1' ? 1 : await pageResult?.(expression);
    const result = message.method === 'Runtime.evaluate' ? { result: { type: 'object', value } } : {};
    socket.send(JSON.stringify({ id: message.id, result }));
    } catch (error) {
      socket.send(JSON.stringify({ id: message.id, result: { result: { type: 'undefined' }, exceptionDetails: { text: error.message, exception: { description: error.message } } } }));
    }
  }));
  server.on('connection', socket => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of ws?.clients || []) socket.terminate();
    if (ws) await new Promise(resolve => ws.close(resolve));
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const options = { host: '127.0.0.1', port: server.address().port, directory: join(root, 'tradingview-cli-sessions') };
  const env = { ...process.env, TEMP: root, TMP: root, TMPDIR: root, TV_STATE_DIR: options.directory,
    TV_CDP_HOST: options.host, TV_CDP_PORT: String(options.port), TV_CDP_TIMEOUT_MS: '1000' };
  delete env.TV_CDP_TARGET;
  delete env.TV_WORKSPACE;
  if (pageResult) {
    const workspace = reserveWorkspace({file:join(root,'contract.json'),target:'fixture-target',layout:'fixture-layout',pine,created_by_cli:createdByCli},options);
    const lease = acquireWorkspace(workspace.file,options); lease.saveBinding({nonce:'fixture-generation',browser:'fixture-browser'});lease.finish({success:true});
    registerWorkspaceName('contract',workspace.file,options);
  }
  function run(args, input = '', frameCount = 0) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
      });
      let stdout = '', stderr = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; if (frameCount && stdout.trim().split('\n').length >= frameCount) child.kill('SIGTERM'); });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
      child.once('close', (exitCode, signal) => {
        if ((signal || exitCode === null) && !frameCount) reject(new Error(`CLI did not finish: ${args.join(' ')} (${signal}) ${stderr}`));
        else resolve({ exitCode, stdout, stderr });
      });
      child.stdin.end(input);
    });
  }
  return { root, options, requests, run, set targets(value) { targets = value; }, get connections() { return connections; } };
}

it('real ledger CLI carries selectors and revisions, fails changed pages with exit 1 and leaves no recovery journal', async t => {
  let snapshot = 'first-native-ledger';
  const expressions = [];
  const f = await fixture(t, expression => {
    expressions.push(expression);
    return { success: true, strategy_id: 'chosen-study', offset: 0, limit: 1, trades: [], has_more: false, next_offset: null, _snapshot: snapshot };
  });
  const args = ['--workspace', 'contract', 'data', 'ledger', '--strategy-id', 'chosen-study', '--limit', '1'];
  const first = jsonResult(await f.run(args));
  assert.equal(first.report_revision.length, 64); assert.equal(first._snapshot, undefined);
  assert.ok(expressions.some(expression => expression.includes('"strategy_id":"chosen-study"')));
  jsonResult(await f.run([...args, '--report-revision', first.report_revision]));
  snapshot = 'changed-native-ledger';
  const changed = jsonResult(await f.run([...args, '--offset', '1', '--report-revision', first.report_revision]), 1);
  assert.equal(changed.success, false); assert.equal(changed.code, 'REPORT_CHANGED'); assert.equal(changed.trades, undefined);
  assert.equal(sessionStatus(f.options).recovery_required, false); assert.equal(sessionStatus(f.options).locked, false);
  const catalog = jsonResult(await f.run(['help', '--json', 'data', 'ledger'])).commands[0];
  assert.equal(catalog.read_only, true); assert.equal(catalog.output, 'json');
  assert.ok(catalog.options.some(option => option.name === '--report-revision'));
});

it('owned-feed real JSONL executes production guards and emits readiness changes without stale prices or active-pane TypeError', async t => {
  function pane(symbol) {
    const state = { symbol, loading: false, error: null, actual: symbol };
    const series = { symbol: () => state.symbol, interval: () => '60', symbolInfo: () => ({ full_name: state.actual }),
      isLoading: () => state.loading, status: () => 3, isStatusError: () => Boolean(state.error),
      bars: () => ({ firstIndex: () => 0, lastIndex: () => 0, valueAt: () => [1, 100, 110, 90, 105, 10] }) };
    const model = { mainSeries: () => series, model: () => ({ dataSources: () => [] }) };
    return { state, model: () => model, _chartWidget: { model: () => model }, symbol: () => state.symbol, resolution: () => '60', chartType: () => 1 };
  }
  const a = pane('EXCHANGE:AAA'), b = pane('EXCHANGE:BBB');
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => a }, _chartWidgetCollection: { getAll: () => [a, b], metaInfo: { uid: 'fixture-layout' } } } };
  const document = { querySelectorAll: () => [] }, context = { window, document };
  const snapshotFactory = () => runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return readWorkspacePage(window,document,{pine:false});})()`, context);
  let sampleCount = 0;
  const f = await fixture(t, async expression => {
    const value = await runInNewContext(expression, context);
    if (expression.includes('function readOwnedFeeds') && ++sampleCount === 1) { b.state.loading = false; b.state.error = null; b.state.actual = 'EXCHANGE:BBB'; }
    return value;
  }, { pine: null, snapshotFactory });
  const workspace = loadWorkspace(join(f.root, 'contract.json'), f.options);
  runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return bindWorkspacePage(window,document,${JSON.stringify(workspace)},'fixture-generation');})()`, context);
  b.state.loading = true; b.state.error = 'unavailable'; b.state.actual = 'EXCHANGE:OLD';
  const result = await f.run(['--workspace', 'contract', 'stream', 'ohlcv', 'EXCHANGE:AAA@60', 'EXCHANGE:BBB@60', '--interval', '100'], '', 2);
  const frames = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(frames[0].success, false); assert.equal(frames[0].partial_success, true);
  assert.equal(frames[0].feeds[1].code, 'DATA_FEED_ERROR'); assert.equal(frames[0].feeds[1].close, undefined);
  assert.equal(frames[1].success, true); assert.equal(frames[1].feeds[1].close, 105);
  assert.ok(!result.stderr.includes('TypeError')); result.stderr.trim().split('\n').forEach(line => JSON.parse(line));
  a.state.loading = true;
  const secondary = await f.run(['--workspace', 'contract', 'stream', 'ohlcv', 'EXCHANGE:BBB@60', '--interval', '100'], '', 1);
  assert.equal(JSON.parse(secondary.stdout.trim()).success, true);
});

it('layout list real CLI executes production lookup for empty/list/throw/timeout/malformed responses', async t => {
  let mode = 'empty', callbacks = 0;
  const f = await fixture(t, expression => runInNewContext(expression, {
    window: { TradingViewApi: { getSavedCharts(cb) {
      if (mode === 'throw') throw new Error('SYNTHETIC_LAYOUT_READ_FAILURE');
      if (mode === 'timeout') return;
      callbacks++;
      cb(mode === 'empty' ? [] : mode === 'malformed' ? {} : mode === 'missing-id' ? [{ name: 'broken' }] : [{ url: 'saved-id', name: 'saved' }]);
    } } }, setTimeout: fn => setTimeout(fn, 5), clearTimeout,
  }));
  for (mode of ['empty', 'list']) {
    const result = jsonResult(await f.run(['--target', 'fixture-target', 'layout', 'list']));
    assert.equal(result.layout_count, mode === 'empty' ? 0 : 1);
  }
  for (const [kind, code] of [['throw', 'LAYOUT_LIST_FAILED'], ['timeout', 'LAYOUT_LIST_TIMEOUT'], ['malformed', 'LAYOUT_LIST_MALFORMED'], ['missing-id', 'LAYOUT_LIST_MALFORMED']]) {
    mode = kind;
    const result = jsonError(await f.run(['--target', 'fixture-target', 'layout', 'list']), /getSavedCharts|SYNTHETIC_LAYOUT_READ_FAILURE/, code);
    if (kind === 'throw') assert.equal(result.error, 'SYNTHETIC_LAYOUT_READ_FAILURE');
  }
  assert.equal(callbacks, 4);
});

it('lost chart-only and Pine releases create no interruption and suggested named reset is executable', async t => {
  for (const pine of [null, 'owned-document']) {
    for (const variant of ['bound', 'interrupted', 'unbound']) {
    const f = await fixture(t, () => ({}), { pine });
    const file = join(f.root, 'contract.json');
    if (variant !== 'bound') {
      const lease = acquireWorkspace(file, f.options);
      if (variant === 'unbound') lease.saveBinding(null);
      lease.finish({ success: variant !== 'interrupted', interrupted: variant === 'interrupted', error: 'unknown dispatch' });
    }
    f.targets = [];
    noteWorkspaceState(file, 'target_lost', f.options);
    const before = jsonResult(await f.run(['workspace', 'show', 'contract']));
    assert.equal(before.state, variant === 'interrupted' ? 'interrupted' : 'target_lost');
    if (variant === 'interrupted') jsonError(await f.run(['--workspace', 'contract', 'workspace', 'release']), /recover/i, 'WORKSPACE_RECOVERY_REQUIRED');
    else jsonError(await f.run(['--workspace', 'contract', 'workspace', 'release']), /exact workspace target/, 'WORKSPACE_TARGET_LOST');
    const after = jsonResult(await f.run(['workspace', 'show', 'contract']));
    assert.equal(after.state, variant === 'interrupted' ? 'interrupted' : 'target_lost');
    assert.equal(after.next_commands.some(command => command.includes('workspace reconnect')), variant === 'bound');
    assert.equal(after.next_commands.some(command => command.includes('undefined')), false);
    if (variant === 'bound') assert.ok(after.next_commands.some(command => command.includes(`--generation fixture-generation`)));
    assert.equal(Boolean(workspaceStatus(file, f.options).interrupted), variant === 'interrupted');
    const reset = after.next_commands.find(command => command.startsWith('tv workspace reset'));
    const args = reset.slice(3).match(/'[^']*'|\S+/g).map(arg => arg.replace(/^'|'$/g, ''));
    const result = jsonResult(await f.run(args));
    assert.equal(result.artifacts_preserved, true); assert.equal(result.desktop_changed, false);
    }
  }
});

it('real wait/report CLI projects large compiled text after raw production freshness and revision checks', async t => {
  const testSource = readFileSync(new URL('./strategy_state.test.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = testSource.slice(testSource.indexOf('function fixture() {'), testSource.indexOf('\n\ndescribe('));
  const page = Function(body + ';return fixture();')();
  const chart = page.window.TradingViewApi._activeChartWidgetWV.value();
  const original = chart.getStudyById;
  chart.getStudyById = id => ({ getInputValues: () => [...original(id).getInputValues(), { id: 'pineId', value: 'owned-document' }, { id: 'pineVersion', value: 1 }] });
  page.source.metaInfo = () => ({ isTVScript: true, isTVScriptStrategy: true, description: 'Same title' });
  page.source.ordersData = () => [{ tm: 1 }];
  page.window.TradingViewApi._chartWidgetCollection = { metaInfo: { uid: { value: () => 'fixture-layout' } } };
  const controller = { openNewScript() {}, openScript() {}, setScript() {}, isModified: () => false,
    getScriptIdVersion: () => ({ scriptIdPart: 'owned-document', version: 1 }), _editorStore: {},
    _editorRef: { current: { _editor: { getValue: () => 'owned', setValue() {}, getModel: () => ({}) }, _monaco: { editor: {} } } } };
  const document = { querySelectorAll: () => [{ offsetParent: {}, __reactFiber$test: { memoizedProps: { value: controller } } }] };
  const context = { window: page.window, document };
  const snapshotFactory = () => runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return readWorkspacePage(window,document);})()`, context);
  const f = await fixture(t, expression => runInNewContext(expression, context), {
    snapshotFactory, epochFactory: () => page.window.__tvCliCompilation,
  });
  const workspace = loadWorkspace(join(f.root, 'contract.json'), f.options);
  runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return bindWorkspacePage(window,document,${JSON.stringify(workspace)},'fixture-generation');})()`, context);
  const user = 'long-user-input-'.repeat(1000);
  function compile(text) {
    runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return startWorkspacePage(window,document,${JSON.stringify({ ...workspace, nonce: 'fixture-generation' })},'compile-fixture',{compile:true});})()`, context);
    page.window.__tvCliCompilation?.dispose?.();
    delete page.window.__tvCliCompilation; delete page.window.__tvCliVerifiedStrategies;
    beginCompilation(page.window, 'same-token', sourceHash('owned'), true); page.compile(text); page.input(user); page.update();
    runInNewContext(`(() => {${WORKSPACE_PAGE_CODE};return finishWorkspacePage(window,document,${JSON.stringify({ ...workspace, nonce: 'fixture-generation' })},'compile-fixture');})()`, context);
  }
  const commands = [['workspace', 'wait'], ['data', 'strategy'], ['data', 'trades'], ['data', 'ledger', '--limit', '1']];
  const sizes = [], revisions = [];
  for (const text of ['compiled-small', 'private-compiled-'.repeat(30000)]) {
    compile(text);
    const row = [];
    for (const args of commands) {
      const result = await f.run(['--workspace', 'contract', ...args]);
      const value = jsonResult(result);
      assert.equal(value.success, true, value.error);
      const inputs = value.strategy_inputs || value.inputs;
      assert.equal(inputs.find(i => i.id === 'text').value, undefined);
      assert.equal(inputs.find(i => i.id === 'text').sha256, sourceHash(text));
      assert.equal(inputs.find(i => i.id === 'in_0').value, user);
      assert.ok(!result.stdout.includes(text));
      row.push(Buffer.byteLength(result.stdout));
      if (args[1] === 'ledger') revisions.push(value.report_revision);
    }
    sizes.push(row);
  }
  sizes[1].forEach((size, i) => assert.ok(Math.abs(size - sizes[0][i]) < 16));
  assert.notEqual(revisions[0], revisions[1]);
  const changed = jsonResult(await f.run(['--workspace', 'contract', 'data', 'ledger', '--limit', '1', '--report-revision', revisions[0]]), 1);
  assert.equal(changed.code, 'REPORT_CHANGED');
  page.compile('external-compiled');
  jsonError(await f.run(['--workspace', 'contract', 'data', 'strategy']), /outside the requested/, 'WORKSPACE_EXTERNAL_CHANGE');
});

it('BOM file and stdin fail at the real entry point before any Desktop access or new admission journal', async t => {
  const f = await fixture(t, () => ({}));
  const file = join(f.root, 'bom.pine');
  const source = '\uFEFF//@version=6\nstrategy("BOM")\n';
  writeFileSync(file, source);
  const before = snapshot(f.options.directory);
  for (const args of [['--file', file], []]) {
    const error = jsonError(await f.run(['--workspace', 'contract', 'pine', 'set', ...args], args.length ? '' : source), /BOM/, 'PINE_SOURCE_UNSUPPORTED_BOM');
    assert.equal(error.details.editor_changed, false); assert.equal(error.details.results_invalidated, false);
    assert.equal(f.requests.length, 0); assert.deepEqual(snapshot(f.options.directory), before);
    const state = workspaceStatus(join(f.root, 'contract.json'), f.options);
    assert.equal(state.operation, null); assert.equal(state.interrupted, null);
  }
});

async function reportFixture(t, onExpression) {
  const page = reportPage();
  const f = await fixture(t, async expression => { const value = await page.evaluate(expression); await onExpression?.(expression); return value; }, { snapshotFactory: page.snapshot, epochFactory: page.epoch });
  page.bind(loadWorkspace(join(f.root, 'contract.json'), f.options)); page.compile();
  return { ...f, page };
}
async function operationOwner(f, { resources = false, deferred = false } = {}) {
  const module = new URL('../src/workspace-store.js', import.meta.url).href;
  const resourceModule = new URL('../src/resource-lock.js', import.meta.url).href;
  const id = loadWorkspace(join(f.root, 'contract.json'), f.options).id;
  const script = `import {acquireWorkspace} from ${JSON.stringify(module)};import {acquireResources} from ${JSON.stringify(resourceModule)};
    const options={...${JSON.stringify(f.options)},command:'pine compile',workspace_id:${JSON.stringify(id)}};
    const resources=${resources ? `await acquireResources(['layout:fixture-layout'],options)` : 'null'};
    const lease=acquireWorkspace(${JSON.stringify(join(f.root, 'contract.json'))},options);console.log(JSON.stringify({id:lease.operation,pid:process.pid}));
    process.stdin.once('data',()=>{lease.finish({success:true,result:{success:true}});resources?.release();process.stdin.pause();});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stopped = once(child, 'close'); let buffer = '', stderr = '';
  child.stderr.on('data', chunk => stderr += chunk);
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', () => { if (!buffer.includes('\n')) reject(new Error(stderr)); });
    child.stdout.on('data', chunk => { buffer += chunk; if (buffer.includes('\n')) resolve(JSON.parse(buffer.trim())); });
  });
  let identity;
  const observed = ready.then(value => { identity = value; return value; });
  if (!deferred) await observed;
  return { child, ready: observed, get identity() { return identity; }, async kill() { child.kill('SIGKILL'); await stopped; }, async finish() { child.stdin.end('finish'); await stopped; } };
}

it('report/wait real entry points reject dead owners before or during production report evaluation without adopting/deleting records', async t => {
  for (const phase of ['before', 'during']) for (const args of [['workspace', 'wait', '--timeout', '1000'], ['data', 'strategy'], ['data', 'trades'], ['data', 'ledger'], ['data', 'equity'],['backtest','status'],['backtest','wait','--timeout','1000'],['backtest','results']]) {
    let owner, killed = false;
    const f = await reportFixture(t, async expression => {
      if (phase === 'during' && owner && !killed && (expression.includes('function readStrategyReport') || expression.includes('function compilationState'))) { killed = true; await owner.kill(); }
    });
    owner = await operationOwner(f);
    if (phase === 'before') { killed = true; await owner.kill(); }
    const records = snapshot(f.options.directory);
    const error = jsonError(await f.run(['--workspace', 'contract', ...args]), /terminated/, 'WORKSPACE_OWNER_DEAD');
    assert.equal(error.details.operation.id, owner.identity.id); assert.equal(error.details.result_adopted, false);
    assert.ok(error.details.next_commands.includes(`tv --workspace 'contract' workspace interrupt --operation ${owner.identity.id}`));
    assert.equal(workspaceStatus(join(f.root, 'contract.json'), f.options).operation.id, owner.identity.id);
    assert.deepEqual(snapshot(f.options.directory), records);
  }
});

it('real report observations preserve living-owner continuity and accept only its exact committed completion', async t => {
  const f = await reportFixture(t), owner = await operationOwner(f);
  const ready = jsonResult(await f.run(['--workspace', 'contract', 'data', 'strategy']));
  assert.equal(ready.success, true); assert.equal(workspaceStatus(join(f.root, 'contract.json'), f.options).operation.id, owner.identity.id);
  const waiting = f.run(['--workspace', 'contract', 'workspace', 'wait', '--timeout', '5000']);
  await new Promise(resolve => setTimeout(resolve, 300)); await owner.finish();
  assert.equal(jsonResult(await waiting).phase, 'ready');
  const live = await operationOwner(f);
  const other = reserveWorkspace({ file: join(f.root, 'other.json'), target: 'other-target', layout: 'other-layout' }, f.options);
  const lease = acquireWorkspace(other.file, f.options); lease.finish({ success: true });
  assert.equal(jsonResult(await f.run(['--workspace', 'contract', 'data', 'ledger'])).success, true);
  await live.finish();
});

it('real wait follows FIFO A-to-B live leases, discards transition samples and waits for B committed completion', async t => {
  let a, b, samples = 0, queueSeen = false, transitionSeen = false;
  const f = await reportFixture(t, async expression => {
    if (!expression.includes('function compilationState')) return;
    samples++;
    if (samples === 1) {
      assert.equal(resourceLockStatus(f.options).queue.length, 1); queueSeen = true;
      await a.finish(); await b.ready;
      assert.notEqual(a.identity.id, b.identity.id);
      assert.equal(workspaceStatus(join(f.root, 'contract.json'), f.options).operation.id, b.identity.id); transitionSeen = true;
    } else if (samples === 2) await b.finish();
  });
  a = await operationOwner(f, { resources: true }); b = await operationOwner(f, { resources: true, deferred: true });
  for (let i = 0; i < 100 && resourceLockStatus(f.options).queue.length !== 1; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const result = jsonResult(await f.run(['--workspace', 'contract', 'workspace', 'wait', '--timeout', '10000']));
  assert.equal(result.phase, 'ready'); assert.ok(samples >= 3); assert.equal(queueSeen, true); assert.equal(transitionSeen, true);
  const status = workspaceStatus(join(f.root, 'contract.json'), f.options);
  assert.equal(status.result_committed, true); assert.equal(status.result_operation_id, b.identity.id); assert.equal(status.operation, null);
  assert.equal(resourceLockStatus(f.options).queue.length, 0); assert.equal(resourceLockStatus(f.options).holders.length, 0);
});

it('four real report entry points distinguish unknown/removed/foreign/valid IDs and keep pending/zero/equity contracts', async t => {
  const f = await reportFixture(t); f.page.foreign();
  const endpoints = ['strategy', 'trades', 'ledger', 'equity'];
  for (const [id, code] of [['unknown-id', 'STUDY_NOT_FOUND'], ['other-workspace-id', 'STUDY_NOT_FOUND'], ['foreign-chart-study', 'WORKSPACE_STUDY_MISMATCH']]) for (const endpoint of endpoints) {
    const error = jsonError(await f.run(['--workspace', 'contract', 'data', endpoint, '--strategy-id', id]), /strategy/, code);
    assert.equal(error.details.requested_strategy_id, id); assert.equal(error.details.current_strategy_id, 'owned-study');
    assert.equal(error.details.calculation_pending, false); assert.ok(error.details.next_commands.includes("tv --workspace 'contract' state"));
  }
  f.page.replace('replacement-study'); f.page.compile('replacement-text');
  for (const endpoint of endpoints) jsonError(await f.run(['--workspace', 'contract', 'data', endpoint, '--strategy-id', 'owned-study']), /absent/, 'STUDY_NOT_FOUND');
  for (const endpoint of endpoints) {
    const result = jsonResult(await f.run(['--workspace', 'contract', 'data', endpoint, '--strategy-id', 'replacement-study']), endpoint === 'equity' ? 1 : 0);
    assert.equal(result.code, endpoint === 'equity' ? 'EQUITY_UNAVAILABLE' : undefined);
  }
  f.page.zero(); f.page.compile('zero-text');
  const ledger = jsonResult(await f.run(['--workspace', 'contract', 'data', 'ledger', '--strategy-id', 'replacement-study']));
  assert.equal(ledger.total_trades, 0); assert.deepEqual(ledger.trades, []);
  f.page.pending();
  for (const endpoint of endpoints) assert.equal(jsonResult(await f.run(['--workspace', 'contract', 'data', endpoint, '--strategy-id', 'replacement-study']), 1).code, 'REPORT_PENDING');
  for (const endpoint of endpoints) jsonError(await f.run(['--workspace', 'contract', 'data', endpoint, '--strategy-id', 'unknown-id']), /absent/, 'STUDY_NOT_FOUND');
});

it('existing GUI and legacy boolean/ledger workspaces fail close before Desktop access with preserved records', async t => {
  for (const legacy of [false, true]) {
    const f = await fixture(t, () => ({}), { pine: null, createdByCli: legacy });
    if (legacy) recordCreatedLayout({ chart_id: 'fixture-layout', target: 'fixture-target' }, f.options);
    const records = snapshot(f.options.directory);
    const error = jsonError(await f.run(['--workspace', 'contract', 'tab', 'close']), /creation proof/, 'WORKSPACE_TAB_NOT_OWNED');
    assert.equal(error.details.reason, legacy ? 'legacy_ownership_unverified' : 'tab_lifecycle_unverified');
    assert.ok(error.details.next_commands.includes("tv --workspace 'contract' workspace release"));
    assert.equal(f.requests.length, 0); assert.deepEqual(snapshot(f.options.directory), records);
  }
});

it('real extraction CLI returns structured error codes and study details on stderr with exit 1', async t => {
  let failure;
  const f = await fixture(t, () => ({ extraction_error: failure }));
  for (const [args, code] of [
    [['data', 'labels'], 'GRAPHICS_EXTRACTION_FAILED'],
    [['values'], 'VALUES_EXTRACTION_FAILED'],
    [['ohlcv'], 'OHLCV_EXTRACTION_FAILED'],
  ]) {
    failure = { code, message: code + ': native extraction failed', details: { study_id: 'bad-study', study_name: 'Built-in fixture', bar_index: 4 } };
    const result = jsonError(await f.run(['--workspace', 'contract', ...args]), /native extraction failed/, code);
    assert.equal(result.details.study_id, 'bad-study'); assert.equal(result.details.study_name, 'Built-in fixture');
    assert.equal(sessionStatus(f.options).recovery_required, false);
  }
});

function jsonResult(result, exitCode = 0) {
  assert.equal(result.exitCode, exitCode, result.stderr || result.stdout);
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
  jsonError(await f.run(['symbol', 'X:FIXTURE']), /Select a workspace/, 'WORKSPACE_REQUIRED');
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
  jsonError(await f.run(['symbol', 'X:FIXTURE']), /Select a workspace/, 'WORKSPACE_REQUIRED');
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


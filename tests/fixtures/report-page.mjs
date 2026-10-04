import { runInNewContext } from 'node:vm';
import { WORKSPACE_PAGE_CODE } from '../../src/workspace-page.js';
import { beginCompilation } from '../../src/strategy-state.js';
import { sourceHash } from '../../src/session.js';
export function reportPage() {
  const event = () => { const callbacks = []; return { subscribe: (_, fn) => callbacks.push(fn), unsubscribe: (_, fn) => { const i = callbacks.indexOf(fn); if (i >= 0) callbacks.splice(i, 1); }, fire: () => callbacks.slice().forEach(fn => fn()) }; };
  const reports = event(), statuses = event();
  let id = 'owned-study', inputs = [{ id: 'text', value: 'compiled-old' }, { id: 'pineId', value: 'owned-document' }, { id: 'pineVersion', value: 1 }], type = 2;
  let report = { performance: { all: { netProfit: 10, totalTrades: 1, numberOfWiningTrades: 1, numberOfLosingTrades: 0 } },
    settings: { dateRange: { backtest: { from: 1704067200000, to: 1704153600000 } } }, currency: 'USD', trades: [{ e: { tm: 1704067200 }, x: { tm: 1704153600 } }] };
  const source = { id: () => id, metaInfo: () => ({ isTVScript: true, isTVScriptStrategy: true, description: 'Owned fixture' }),
    reportData: () => ({ value: () => report }), ordersData: () => [], status: () => ({ type }), onStatusChanged: () => statuses, reportChanged: () => reports };
  let sources = [source];
  const series = { isLoading: () => false, bars: () => ({ firstIndex: () => 0, lastIndex: () => 1, valueAt: i => [1704067200 + i * 86400, 1, 1, 1, 1, 1] }), symbolInfo: () => ({ full_name: 'FIXTURE:OWNED' }) };
  const model = { mainSeries: () => series, model: () => ({ dataSources: () => sources }) };
  const chart = { _chartWidget: { model: () => model }, model: () => model, symbol: () => 'FIXTURE:OWNED', resolution: () => '60', chartType: () => 1,
    getStudyById: requested => ({ getInputValues: () => requested === id ? inputs : [{ id: 'pineId', value: 'foreign-document' }] }) };
  const controller = { openNewScript() {}, openScript() {}, setScript() {}, isModified: () => false, getScriptIdVersion: () => ({ scriptIdPart: 'owned-document', version: 1 }),
    _editorStore: { getStore: () => ({ getState: () => ({ ui: { pendingRequests: {} } }) }) },
    _editorRef: { current: { _editor: { getValue: () => 'owned', setValue() {}, getModel: () => ({}) }, _monaco: { editor: {} } } } };
  const document = { querySelectorAll: () => [{ offsetParent: {}, __reactFiber$fixture: { memoizedProps: { value: controller } } }] };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart }, _chartWidgetCollection: { getAll: () => [chart], metaInfo: { uid: 'fixture-layout' } } } };
  const context = { window, document };
  const evaluate = expression => runInNewContext(expression, context);
  const call = (fn, ...args) => evaluate(`(() => {${WORKSPACE_PAGE_CODE};return ${fn}(window,document,${args.map(x => JSON.stringify(x)).join(',')});})()`);
  let owner;
  return { window, evaluate, snapshot: () => call('readWorkspacePage'), epoch: () => window.__tvCliCompilation,
    bind(workspace) { owner = { ...workspace, nonce: 'fixture-generation' }; call('bindWorkspacePage', workspace, owner.nonce); },
    compile(text = 'compiled-new') {
      call('startWorkspacePage', owner, 'fixture-compile', { compile: true });
      window.__tvCliCompilation?.dispose?.(); delete window.__tvCliCompilation; delete window.__tvCliVerifiedStrategies;
      beginCompilation(window, 'fixture-token', sourceHash('owned'), true, null, 'owned-document');
      if (!sources.includes(source)) sources = [source, ...sources];
      inputs = inputs.map(input => input.id === 'text' ? { ...input, value: text } : input);
      report = { ...report }; reports.fire(); call('finishWorkspacePage', owner, 'fixture-compile');
    },
    foreign() { sources = [source, { ...source, id: () => 'foreign-chart-study' }]; },
    replace(next) { call('startWorkspacePage', owner, 'fixture-remove', { remove_study: id }); sources = sources.filter(item => item !== source);
      call('finishWorkspacePage', owner, 'fixture-remove'); id = next; },
    pending() { type = 1; statuses.fire(); },
    completeInputs() { type=2;report={...report};reports.fire(); },
    runtimeError() { type = 3; report = {}; },
    zero() { report = { ...report, performance: { all: { netProfit: 0, totalTrades: 0, numberOfWiningTrades: 0, numberOfLosingTrades: 0 } }, trades: [] }; },
  };
}

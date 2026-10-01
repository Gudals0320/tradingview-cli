import { symbolMatches } from '../chart-context.js';
/**
 * Core pane/layout management logic.
 * Controls multi-chart layouts (split panes) in TradingView.
 */
import { evaluate, evaluateAsync, safeString, KNOWN_PATHS } from '../connection.js';

const CWC = KNOWN_PATHS.chartWidgetCollection;

const LAYOUT_NAMES = {
  's': '1 chart',
  '2h': '2 horizontal',
  '2v': '2 vertical',
  '2-1': '2 top, 1 bottom',
  '1-2': '1 top, 2 bottom',
  '3h': '3 horizontal',
  '3v': '3 vertical',
  '3s': '3 custom',
  '4': '2x2 grid',
  '4h': '4 horizontal',
  '4v': '4 vertical',
  '4s': '4 custom',
  '6': '6 charts',
  '8': '8 charts',
  '10': '10 charts',
  '12': '12 charts',
  '14': '14 charts',
  '16': '16 charts',
};

/**
 * List all panes in the current layout with their symbols and index.
 */
export async function list() {
  const result = await evaluate(`
    (function() {
      var cwc = ${CWC};
      var layoutType = cwc._layoutType;
      if (typeof layoutType === 'object' && layoutType && typeof layoutType.value === 'function') layoutType = layoutType.value();
      var count = cwc.inlineChartsCount;
      if (typeof count === 'object' && count && typeof count.value === 'function') count = count.value();

      var all = cwc.getAll();
      var panes = [];
      for (var i = 0; i < all.length; i++) {
        try {
          var c = all[i];
          var model = c.model ? c.model() : null;
          var mainSeries = model ? model.mainSeries() : null;
          var sym = mainSeries ? mainSeries.symbol() : 'unknown';
          var res = mainSeries ? mainSeries.interval() : null;
          panes.push({ index: i, symbol: sym, resolution: res || null });
        } catch(e) { panes.push({ index: i, error: e.message }); }
      }

      // Check which pane is active
      var activeChart = window.TradingViewApi._activeChartWidgetWV.value();
      var activeIndex = null;
      for (var j = 0; j < all.length; j++) {
        try {
          if (all[j].model && activeChart._chartWidget && all[j] === activeChart._chartWidget) { activeIndex = j; break; }
        } catch(e) {}
      }

      return { layout: layoutType, chart_count: count, active_index: activeIndex, panes: panes };
    })()
  `);

  return {
    success: true,
    layout: result.layout,
    layout_name: LAYOUT_NAMES[result.layout] || result.layout,
    chart_count: result.chart_count,
    active_index: result.active_index,
    panes: result.panes,
  };
}

/**
 * Set the chart layout grid.
 * @param {string} layout - Layout code: s, 2h, 2v, 2-1, 1-2, 3h, 3v, 4, 6, 8, etc.
 */
export async function setLayout({ layout }) {
  const code = layout.toLowerCase().replace(/\s+/g, '');

  // Map friendly names to codes
  const aliases = {
    'single': 's', '1': 's', '1x1': 's',
    '2x1': '2h', '1x2': '2v',
    '2x2': '4', 'grid': '4', 'quad': '4',
    '3x1': '3h', '1x3': '3v',
  };
  const resolved = aliases[code] || code;

  if (!LAYOUT_NAMES[resolved]) {
    const available = Object.entries(LAYOUT_NAMES).map(([k, v]) => `  ${k} — ${v}`).join('\n');
    throw new Error(`Unknown layout "${layout}". Available layouts:\n${available}`);
  }

  await evaluateAsync(`${CWC}.setLayout(${safeString(resolved)})`, { mutation: true });
  await new Promise(r => setTimeout(r, 500));

  const state = await list();
  return {
    success: true,
    layout: resolved,
    layout_name: LAYOUT_NAMES[resolved],
    chart_count: state.chart_count,
    panes: state.panes,
  };
}

/**
 * Focus a specific pane by index.
 */
export async function focus({ index }) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) throw new Error('Pane index must be a non-negative integer.');
  const result = await evaluate(`
    (function() {
      var cwc = ${CWC};
      var all = cwc.getAll();
      if (${idx} >= all.length) return { error: 'Pane index ' + ${idx} + ' out of range (have ' + all.length + ' panes)' };
      var chart = all[${idx}];
      // Click the main div to activate it
      if (chart._mainDiv) chart._mainDiv.click();
      var active = window.TradingViewApi._activeChartWidgetWV.value();
      if (active?._chartWidget !== chart && active !== chart) return { error: 'Requested pane did not become active; no symbol change was dispatched.' };
      return { focused: ${idx}, total: all.length };
    })()
  `, { mutation: true });

  if (result?.error) throw new Error(result.error);
  return { success: true, focused_index: result.focused, total_panes: result.total };
}

/**
 * Set the symbol on a specific pane by index.
 * Works by focusing the pane, then using the active chart's setSymbol.
 */
export async function setSymbol({ index, symbol }) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) throw new Error('Pane index must be a non-negative integer.');
  if (typeof symbol !== 'string' || !symbol.trim()) throw new Error('A nonempty symbol is required.');
  await focus({ index: idx });
  await evaluateAsync(`(() => {
    const pane=${CWC}.getAll()[${idx}];
    if(!pane)throw new Error('Requested pane disappeared.');
    return pane.setSymbol(${safeString(symbol)},{});
  })()`,{mutation:true});
  let actual;
  for(let attempt=0;attempt<60;attempt++) {
    actual=await evaluate(`(() => {
      const pane=${CWC}.getAll()[${idx}];if(!pane)return null;
      const series=pane.model().mainSeries(),bars=series.bars(),info=series.symbolInfo?.()||{};
      let loading=series.isLoading?.();if(loading?.value)loading=loading.value();
      return {symbol:series.symbol(),aliases:[series.proSymbol?.(),info.full_name,info.pro_name,info.original_name].filter(Boolean),
        loading:Boolean(loading),has_bar:Boolean(bars.valueAt(bars.lastIndex()))};
    })()`);
    if(actual&&!actual.loading&&actual.has_bar&&symbolMatches(symbol,actual))return {success:true,index:idx,symbol,actual_symbol:actual.symbol,pane_verified:true};
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  return {success:false,index:idx,symbol,actual_symbol:actual?.symbol||null,pane_verified:false,recovery_required:true,error:'Requested pane symbol/readiness was not verified before timeout.'};
}

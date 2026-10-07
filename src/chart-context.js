export function normalizeTimeframe(value) {
  const original = String(value || '').trim();
  if (original === 'm') throw new Error('Bare m is ambiguous; use 1m for minutes or 1M for months.');
  const minutes = original.match(/^(\d+)m$/);
  if (minutes) return String(Number(minutes[1]));
  const text = original.toUpperCase();
  if (['D', 'W', 'M'].includes(text)) return `1${text}`;
  const hours = text.match(/^(\d+)H$/); if (hours) return String(Number(hours[1]) * 60);
  return text;
}

export function readChartContext(window) {
  const api = window.TradingViewApi?._activeChartWidgetWV?.value();
  if (!api) return null;
  const model = api._chartWidget.model();
  const series = model.mainSeries();
  const bars = series.bars();
  const first = bars.firstIndex(), last = bars.lastIndex();
  let info = {}, ext = {}, status = null, loading = false;
  try { info = series.symbolInfo?.() || {}; } catch { /* unavailable feed */ }
  try { ext = api.symbolExt?.() || {}; } catch { /* older API */ }
  try { status = series.status?.(); if (status?.value) status = status.value(); } catch { /* older API */ }
  try { const value = series.isLoading?.(); loading = Boolean(value?.value ? value.value() : value); } catch { /* older API */ }
  const valueAt = (index) => { try { return bars.valueAt(index)?.[0] ?? null; } catch { return null; } };
  const count = Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first + 1 : 0;
  let seriesId = null, paneId = null, paneIndex = null, more = null, loadingKnown = false;
  try { seriesId = series.id?.() ?? null; } catch { /* unknown identity */ }
  try { paneId = api._chartWidget.id?.() ?? null; } catch { /* unknown identity */ }
  try { const widgets = window.TradingViewApi._chartWidgetCollection?.getAll?.();
    const index = widgets?.findIndex(widget => widget === api || widget === api._chartWidget);
    if (index >= 0) paneIndex = index;
  } catch { /* unavailable collection */ }
  try { const value = series.isLoading?.(); loadingKnown = typeof (value?.value ? value.value() : value) === 'boolean'; } catch { /* unknown */ }
  try { const value = series.requestMoreDataAvailable?.(); if (typeof value === 'boolean') more = value; } catch { /* unknown */ }
  return { symbol: api.symbol(), resolution: api.resolution(), chart_type: api.chartType(),
    pane_id: paneId, pane_index: paneIndex, series_id: seriesId, time_unit: 'unix_seconds',
    timestamp_semantics: 'bar_open_time_inclusive', page_generation: window.__tvCliWorkspace?.nonce ?? null,
    session: ext.session ?? null, adjustment: ext.adjustment ?? null,
    aliases: [...new Set([ext.symbol, ext.pro_name, ext.full_name, info.name, info.full_name, info.pro_name, info.original_name].filter(v => typeof v === 'string'))],
    bar_count: count, first_bar_time: count ? valueAt(first) : null,
    last_bar_time: count ? valueAt(last) : null, loading, loading_known: loadingKnown, more_data_available: more,
    series_symbol: info.full_name || info.pro_name || null,
    feed_error: typeof status === 'object' ? status?.error || status?.errorMessage || null : null };
}

/** Identity only: ticks and newly appended bars are observations, not context changes. */
export function chartIdentity(context) {
  return Object.fromEntries(['symbol','resolution','chart_type','pane_id','pane_index','series_id',
    'page_generation','session','adjustment','target_id'].map(key => [key, context?.[key] ?? null]));
}

export function historyCoverage(context, requested, returned = null, termination = 'unknown') {
  const loaded = { from: context?.first_bar_time ?? null, to: context?.last_bar_time ?? null, bar_count: context?.bar_count ?? 0 };
  const satisfied = Boolean(requested && !context?.loading && !context?.feed_error && loaded.from !== null && loaded.to !== null && loaded.from <= requested.from && loaded.to >= requested.to);
  return { requested, loaded, returned, period_satisfied: requested ? satisfied : null,
    period_basis: 'loaded_bar_open_time_envelope; internal session gaps are unclassified',
    missing_edges: requested ? [
      ...(loaded.from === null || loaded.from > requested.from ? [{ from: requested.from, to: loaded.from === null ? requested.to : Math.min(loaded.from,requested.to), side:'before', reason:context?.more_data_available === false ? 'feed_end' : 'not_loaded_or_unknown' }] : []),
      ...(loaded.to !== null && loaded.to < requested.to ? [{ from:Math.max(loaded.to,requested.from),to:requested.to,side:'after',reason:'not_loaded_or_unknown' }] : [])] : [],
    loading_termination: satisfied ? 'satisfied' : termination,
    internal_gaps: 'unknown', last_bar_complete: 'unknown' };
}

export function symbolMatches(expected, context) {
  if (!expected) return true;
  const wanted = expected.toUpperCase();
  return [context.symbol, ...(context.aliases || [])].some(value => {
    const actual = String(value).toUpperCase();
    return actual === wanted || (!wanted.includes(':') && actual.split(':').pop() === wanted);
  });
}

export function contextMatches(expected, actual) {
  return Boolean(actual && symbolMatches(expected.symbol, actual)
    && normalizeTimeframe(actual.resolution) === normalizeTimeframe(expected.timeframe));
}

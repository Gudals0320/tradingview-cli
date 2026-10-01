export function normalizeTimeframe(value) {
  const original = String(value || '').trim();
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
  return { symbol: api.symbol(), resolution: api.resolution(), chart_type: api.chartType(),
    aliases: [...new Set([ext.symbol, ext.pro_name, ext.full_name, info.name, info.full_name, info.pro_name, info.original_name].filter(v => typeof v === 'string'))],
    bar_count: count, first_bar_time: count ? valueAt(first) : null,
    last_bar_time: count ? valueAt(last) : null, loading,
    series_symbol: info.full_name || info.pro_name || null,
    feed_error: typeof status === 'object' ? status?.error || status?.errorMessage || null : null };
}

export function symbolMatches(expected, context) {
  if (!expected) return true;
  const wanted = expected.toUpperCase();
  return [context.symbol, ...context.aliases].some(value => String(value).toUpperCase() === wanted);
}

export function contextMatches(expected, actual) {
  return Boolean(actual && symbolMatches(expected.symbol, actual)
    && normalizeTimeframe(actual.resolution) === normalizeTimeframe(expected.timeframe));
}

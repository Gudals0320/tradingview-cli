# History export and range diagnostics

`ohlcv --count N` keeps its latest-loaded-bars behavior and existing fields. It
does not fetch history. `insufficient_history` remains a count test, not a period
test. The maximum page size remains 20,000.

In period mode `truncated` means there are further matching loaded bars after the
page, and `insufficient_history` is null: a page size does not define the expected
period bar count. Use `coverage` for the loaded period envelope. In latest/count
mode both legacy flags retain their original meaning.

Load history first, then read an inclusive UTC-seconds bar-open-time window:

```sh
tv --workspace research range --from 1780963200 --to 1782633600
tv --workspace research ohlcv --from 1780963200 --to 1782633600 --count 500
```

Pass the exact `next_cursor` as `--cursor` for subsequent pages, without from/to.
The cursor uses a time boundary and a hash of the already returned historical
prefix, including its first timestamp and chart identity. New later bars and
ticks beyond the boundary are allowed. Past corrections, prepended history,
pane/series, symbol, resolution, chart type, target or generation changes require
restarting. Load history before paging; scrolling or range loading during paging
can invalidate a cursor. A final page including the newest bar has no next cursor;
its completion status is unknown. Summaries describe only the current page.
Reconnecting changes target/generation identity and invalidates old cursors.

`coverage` separates requested, loaded and returned envelopes. `period_satisfied`
only means the loaded first/last open timestamps bracket the request. It does not
prove every expected session bar exists. Daily and longer bars retain provider
session-aligned timestamps; no calendar conversion, interpolation or zero filling
is performed. Internal gaps and latest-bar completion remain unknown.

OHLCV reports `loading_attempted:false`; range reports attempts and termination:
`satisfied`, `feed_end` (observed false availability), `guard` (25 requests), or
`unknown`. An unreadable availability flag is never assumed true. Missing leading
history distinguishes observed feed end from not loaded/unknown. Count sufficiency
is independent of the period envelope. Empty/loading series and feed errors have
separate errors; range outside-data includes the actual loaded diagnosis.
Each history request waits 1.8s and polls a still-loading feed for up to 5s. A feed
still loading after that bound returns DATA_NOT_READY with guard termination.
At 25 requests, scheduled waits can total about 170s plus CDP/network overhead.
CDP timeouts apply to each evaluation, and admission timeouts apply to waiting for
ownership, not an overall operation deadline. No lease expiration is extended.
`scroll` now uses the same bounded history loading and diagnosis as `range`.

## OP investigation (#59)

The preserved failure began at 2026-10-06 10:43:41 UTC and ended in about 0.58s,
before a 1.8s paging wait could have completed. A later OHLCV response has 365
480-minute bars bracketing the request and reports no change during that read.
The old range loop stopped on an empty earliest bar and then classified its scan
as outside-data. Empty/loading state is a plausible cause, not a proven cause of
the historical incident: no atomic range-time pane/series snapshot was retained.
The new shared context diagnosis and synthetic overlap/outside/loading/empty
fixtures remove that misclassification path. Historical latest-N truncation is a
separate export limitation.

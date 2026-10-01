# Lead review — six sequential scenarios

Product baseline: 57ee8e7. Shared product source stays unchanged during this run.

## S01 — reviewed

- Read complete HANDOFF.md and evidence schema/defects; inspected independent
  comparison outputs and key command records. 150 recorded CLI calls.
- Three combinations (5m/60, 5m/240, 15m/240): 400 rows each confirmed HTF identity,
  no future HTF data, close/EMA independently checked with stated warmup/tolerance.
- OFF equals baseline; ON windows 15 crosses -> 4/11 pass/exclude, 15 -> 6/9,
  13 -> 4/9. One study retained through editing/error recovery; source hashes match.
- D1 is a reporting defect, not unauthorized persistence: explicit compile --save
  fails with diagnostics but omits that source/version was saved and chart changed.
  Worker independently repeated 3/3 and compared native save reporting.
- E1 minimized zero-viewport window caused editor-open timeout; restoring the window
  resolved it. Classify as environment limitation / diagnostic improvement.
- Required correction: A7 said realtime boundary observed while A9 said NOT TESTED.
  Worker amended it to one realtime-bar snapshot; live rollover remains NOT TESTED.
- No product fixes or worker commits; dedicated S01 layout retained, dialogs 0.

## S02 — reviewed after worker corrections

- Read full HANDOFF and independent_verification JSON, not only the final summary.
- Table versus 500-bar ETH OHLCV: 5 retained rows matched volume/high/low/range/count.
  Series checks at keep20 independently recomputed 24 sessions: one completion,
  reset at start, capped retention, last/average values matched.
- D1: plain save already applied invalid v2; subsequent compile/--save returned
  only Rejected. Real study state provides RE10045, array.get index -1, size0,
  bar_index18. Do not call the initial good v1 add failure the same repro.
- Required frequency correction: v2 labels44/48/91 = 3 CLI failures over two
  injection cycles; not 4/4 including an unrelated initial draft failure.
- Console/table comparison contains mismatches and console/OHLCV=false.
  Different captured date windows and display precision need explicit qualification;
  these failed comparisons are NOT passing evidence for aggregate numeric claims.
- Empty-history samples are already populated (hc20/rm171); assertions are false.
  Required correction: initial empty archive not directly observed in available
  extraction window, rather than claiming null values or Pine starts prefilled.
- Sandbox fetch failure is environment; computed array index analyze miss is a
  documented heuristic limitation, not a new functional regression.
- Raw log additionally disproved the first draft's claim that initial good v1
  add failed: label24 exited0/addToChart. Worker removed that claim and rebuilt
  evidence/generator. Product defect count is now one, runtime-diagnostic loss.
- Lead aggregate classification of C1 is partial evidence only, not proof of an
  observed initial empty archive. C9/C10 remain NOT TESTED. Logs rendered volume
  to fewer decimal places; exact numeric proof comes from table/series, not logs.
- Worker ended idle, own replay stopped and dialogs0; no product files changed.

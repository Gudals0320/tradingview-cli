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

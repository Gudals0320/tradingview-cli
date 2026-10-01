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
- Lead corrected two stale handoff summary cells after worker's metadata repair:
  C7 4/4 -> 3/3 and the concluding C9 BLOCKED -> NOT TESTED, matching its detailed
  sections/evidence. No further Desktop calls were made for editorial correction.

## S03 — reviewed

- Execution incident: early harness failed to pass target, then continued after
  failed open on the dedicated layout and overwrote S02 QA source. This is a
  worker/harness failure, not a CLI defect. Exclude commands001-055 from acceptance.
- Worker restored the original S02 saved ID and source; Lead inspected restoration
  JSON showing expected and reopened SHA eb174c78...b2251 identical, same study and
  settings/status. Saved/source version5->8 is a lasting, disclosed history change.
- Subsequent harness verifies target URL/native saved ID/title before/after calls,
  propagates unexpected child failures, and verifies report/study identity.
- Dedicated final evidence: 17 positions / 34 qty5 exit legs; 6 TP1R. Entry/exit R
  matches, 28 sampled MANAGE transitions nondecreasing, stop/order/ledger agree.
- maxBars3 run actually has 4 TIME exits (3 residual qty5); maxBars1 has 17 full
  qty10 time exits. Baseline time0 is not used as time-exit passing evidence.
- Direct corrected-source save->compile returned Rejected / REPORT_PENDING once.
  Comment edit + compile --save recovered. Keep direct FAIL separate from workaround.
- Reopen LF/CRLF compile Rejected observed once; raw versus normalized hashes and
  sourceHash code support a line-ending hypothesis, not an independently repeated
  root-cause proof. Final source/report equality and raw alias passed after refresh.
- Read full final HANDOFF and 147-command evidence/criteria; all numeric assertions
  true, with direct workflow FAIL and early isolation FAIL retained separately.
- A stray 50-byte root file named after the S03 target contained only the intended
  target.txt path (from early reversed shell arguments). Lead inspected it and
  moved it into S03 ignored results as misplaced-target-marker.txt. No user file
  was removed. Mandatory target/document/exit guards added to shared protocol.

## S04 — reviewed

- Read complete HANDOFF and 18 true assertions/118 command records; independently
  inspected TTL10 verification and log price/time checks. One invalid TTL0 run
  after a malformed JSON argument is marked INVALID and replaced by a successful run.
- 48/48 baseline pivot labels; strict-right tie distinction supported locally,
  left strict/loose not distinguishable in sample. Do not generalize beyond that.
- keep30 -> 30 of each object; keep5 -> 5; TTL0 ->3; restored TTL10 ->5. Loaded-window
  simulation created48/limit-delete18/TTL-delete25 with5 live, all matched.
- 24 CREATE log prices and confirm lag5, 11 BREAK closes match OHLC. Recompile
  shortcuts are explicitly not called forced recompilation. Error cleared old
  drawings; restore/save/open source and same study are verified.
- Indicator corrected-save and CRLF reopen compile passed (one each), unlike S03
  strategy failures. Bare Rejected on saved invalid source overlaps known class.
- O1 internal coordinate indexes and O2 visible-row-only logs are observability
  limitations, not newly proven regressions. Captured 30/40 log rows do NOT prove
  a fixed global ring-buffer capacity; aggregate will use captured-view wording.
- New layout inherited S03 document, but pre-fence stopped before any mutation;
  explicit new/reset preceded S04 source. No cross-document incident this run.

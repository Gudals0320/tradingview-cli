# S01 HANDOFF — 확정 상위시간대(HTF) 추세 필터 EMA 교차 지표

Worker: anthropic/claude-opus-5-5 (S01, 1/6). Date 2026-10-01 (UTC times below). No Git operations, no product-code edits.
Evidence: `evidence.json` (sanitized; 150 recorded CLI calls with args/exit/timing/summarized JSON, stage SHA-256, source checks, three independent analyses). Raw outputs: `results/pine-scenarios/s01-mtf-trend/raw/<label>.json` (ignored). Labels below refer to those files and to `evidence.json.commands[].label`.

## Overall outcome

**PASS with one reproduced CLI defect (D1) and one environment blocker that was worked around (E1).**
The indicator was built and functionally verified through baseline → HTF filter → verification-plot edit → injected function-name error → fix → input/timeframe changes, with independent numeric recomputation from raw bars at three HTF/chart combinations (5m/60, 5m/240, 15m/240). Direct observation of a realtime HTF bar rollover was not performed (Lead instruction; NOT TESTED).

## Isolation / target

| Item | Value |
|---|---|
| Layout | `CLI-QA-S01-20261001` created with `tab new --layout new` (label 01-tab-new), chart `XrSm3eti` |
| Pinned CDP target | `3D2E5C4CE6FF2209409B3094C7F0ABA2` (every command after 02 used `--target`) |
| Symbol | BINANCE:ETHUSDT (layout default; not changed) |
| Saved script | `CLI-QA-S01 MTF Trend 20261001` = `USER;d0059b19d02d4e4ebb29d64ad56728d8` |
| Chart study | `vJ6QON` (study1; the only instance throughout) |
| Repro script | `CLI-QA-S01 Repro SaveOnError` = `USER;c729aeacdfbd417f833d3bfecc41e49c` (study `xcOv5j` added then removed by me) |

The fallback QA layout `kdn7wAFi` and personal charts were not used (kdn7wAFi target was only the shell anchor for the `tab new` click).

## Sources (stage files in this directory; SHA-256 over CRLF-normalized text)

| Stage | File | SHA-256 | Chart/save result |
|---|---|---|---|
| 1 initial cross indicator | `v1-baseline.pine` | bc0e368e…a23c | save → v1.0 (dialog), compile → addToChart, study vJ6QON |
| 2 HTF confirmed filter | `v2-htf-filter.pine` | 4b954ca2…84bb | compile → SAVE_REQUIRED; save → v2.0; compile unchanged (save already applied it) |
| 2b verification plots (feature edit) | `v2b-verify-plots.pine` | 4b2a623b…8839 | compile --save → saved v3.0, updateOnChart |
| 3 function-name error `ta.crossovr` | `v3-error-injected.pine` | 8927fbdf…0e582 | errors line 13 col 13; compile → SAVE_REQUIRED; compile --save → errors, exit 1 (**but persisted v4.0, see D1**) |
| 4 fix (= v2b source) | `v2b-verify-plots.pine` | 4b2a623b…8839 | compile --save → saved v5.0, errors 0, 18 plots restored |
| 5 input change (HTF default 60→240) | `v5-input-change.pine` | fd742a0b…f42c | compile --save → saved v6.0; study input in_2 became "240" |

Final saved source = `v5-input-change.pine` (80 lines). Edit diffs: v1→v2 adds HTF inputs, a single `request.security(..., [close[1], ema[1], time[1], time_close[1]], lookahead_on)` call, trend/pass/excluded logic, counters, pass/bear/excluded shapes, data-window comparison plots and the dashboard table. v2→v2b adds data-window plots of the cumulative counters, `bar_index` and an **unconfirmed** HTF trend diagnostic (`lookahead_off`, no offset; not used by the filter). v3 changes only line 13 `ta.crossover`→`ta.crossovr`. v5 changes only line 7 default `"60"`→`"240"`.

Design: HTF trend = sign(confirmed HTF close − confirmed HTF EMA50). `[1]` + `lookahead_on` is TradingView's documented non-repainting form: every chart bar sees the HTF bar *before* the one containing it, on history and realtime.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| A1 | Filter OFF equals the original cross signals | **PASS** | analysis-htf60.filter_off_equals_raw_and_baseline: 400 OFF rows passCode==rawCross, excluded 0; 399 rows identical to baseline v1 study rawCross (27-extract-v1 vs 77-extract-v4-off). OFF dashboard 341/340 excluded 0; ON totals 167+104+410 = 681 = OFF 341+340. 15m/240: 399 rows, OFF 318/317, 0 excluded. |
| A2 | ON exclusion independently recalculated / comparison plots | **PASS** | All 3 analyses: pass/excluded codes recomputed from rawCross+htfTrend (0 mismatches); EMA12/36 recomputed in JS from raw chart bars (max rel err ≤6.5e-9, 100 converged bars) and cross reproduced (0 mismatches); HTF EMA50 recomputed from raw HTF bars (max rel err ≤1.0e-6). Window samples: 5m/60 15 crosses (4 pass, 11 excl), 5m/240 15 (6/9), 15m/240 13 (4/9). |
| A3 | Uses last *confirmed* HTF value, no future/unconfirmed HTF | **PASS** | For every row (400×3, incl. realtime bar) htfOpenTime = previous HTF bar of the bar containing the chart bar, and htfCloseTime ≤ chart-bar open (0 violations). HTF close equals raw HTF bar close (400/400) and the last chart-bar close inside that HTF bar (297/273/299 rows). Realtime bar 02:40 used 01:00–02:00 (60) / 20:00–00:00 (240), never the forming bar. Unconfirmed diagnostic differs from confirmed on 9/4/8 rows, and on 15m one cross would have flipped verdict → the filter demonstrably uses confirmed data. Live rollover across an HTF boundary: NOT TESTED (A9). |
| A4 | Dashboard confirmed HTF values and pass/excluded counts | **PASS** | counters_and_dashboard: dashboard text (HTF, confirmed bar time, close, Trend, counts) equals the last-row plots; counter deltas across the extracted window equal the per-bar flags (e.g. 1/3/11, 4/2/9, 4/0/9). |
| A5 | study1 preserved through normal edit, error recovery, recompile | **PASS (identity) / see D1** | `state` after every stage (labels 24,35,44,56,74,93,117,R41): exactly one `vJ6QON`, no duplicate. During the error stage the same study was switched to broken v4.0 (0 rows, "Plot") because of D1; recovered by fix. |
| A6 | Save/reopen full-source identity | **PASS** | Every `pine set` round-tripped via `pine get` with SHA match (source-checks). Persisted v3.0/v4.0 verified via pine-facade (label 60). After `pine new` then `pine open "CLI-QA-S01 MTF Trend 20261001"` (114/115 and 120/121), editor SHA = v5 file SHA, same script_id; server returns CRLF (4523 vs 4444 chars, identical after CRLF normalization). |
| A7 | Data-shortage limits recorded precisely | **PASS (documented)** | Chart exposes 300 main-series bars and 400 study rows (Pine computed ~21 057 bars, bar_index). Independent EMA checks skip 200 warm-up bars (100 compared); HTF EMA skips 200 HTF bars. Dashboard totals cover full history and are verified via window deltas, not absolute recount. Few crosses per window (13–15), one realtime-bar snapshot was observed (confirmed HTF bar used); live boundary rollover was not observed (A9 NOT TESTED). |
| A8 | Compile pass not overstated | **PASS** | Compile success was never used as functional proof; all functional claims come from per-bar extraction + independent recomputation. `pine analyze` missed the injected function error (heuristic, expected); `pine check` caught it (line 13 col 13). |
| A9 | Realtime HTF boundary observed live (before/after rollover, no repaint of the prior bar) | **NOT TESTED** | Lead instructed not to add the ~10 min wait. Confirmed-bar use on the realtime bar is covered by A3 at a single instant; history covers ~33 h (5m) / ~100 h (15m) of boundaries. |

## Realtime HTF rollover (03:00 UTC)

**NOT TESTED.** Planned (5m chart, in_2="60", snapshots at 02:58/03:00/03:05 UTC) but cancelled by Lead before any snapshot was taken. Covered instead: every historical HTF boundary in the 400-row windows (identity check) and the realtime bar at one instant (used the previous closed HTF bar). Not covered: a live tick crossing 03:00 and verifying the 02:55 bar's HTF values did not change afterwards.

## Defects and other findings

### D1 — `pine compile --save` error response omits saved/version/chart-change state (product, CLI reporting defect) — reproduced 3/3
- Trigger: saved indicator on chart; editor source with a compile error; `pine compile --save`.
- Minimal repro (`repro-ok.pine` / `repro-bad.pine`, labels R01–R38): save+add ok (v1.0, 1 plot, 400 rows) → `pine set` bad → `pine compile --save` → exit 1 `{success:false, compiled:false, has_errors:true, errors:[ta.smaa …]}` with **no `saved`/`version` field**; but `pine list` shows v2.0, pine-facade source = broken source, and the chart study is replaced by the broken version (pineVersion 2.0, title "Plot", 0 rows, red error badge — screenshot `results/.../screens/s01-after-v3-error.png`). Repeated: v4.0 (repro 2nd cycle) and main scenario v4.0 (labels 54, 57–61).
- Expected: `--save` explicitly authorizes saving and TradingView natively persists erroring source, so persistence itself is not the defect. The error response must still report the resulting state: `saved:true`, `script_id`, the new `version`, and that the on-chart study was updated to an erroring version. Actual: none of these fields are present, so a caller reading `success:false` reasonably concludes nothing changed. README (lines 148–150) documents only the success response.
- Contrast: plain `pine save` of an erroring source (R32) also persists (TradingView-native behavior) but transparently reports `saved:true, version:"6.0"`. So persistence itself is native; the defect is the compile --save error path not reporting it.
- Workaround: before `compile --save`, run `pine errors` (exit 1 when errors) or `pine check --file`; after a failure, check `pine list` version.
- Suspected component: `src/core/pine.js` `smartCompile` diagnostics branch: it returns the errors without the `persistence` fields, although `confirmPineCompileSaveDialog` has already confirmed the save.

### E1 — Minimized Desktop window makes Pine editor commands fail (environment; CLI message misleading)
- New layout `pine get` failed twice (03b, 05; 31.5 s each): "Could not open Pine Editor or Monaco not found in React fiber tree."
- Diagnosis (06): page `visibilityState=hidden`, innerWidth/Height 0, Pine button offsetParent null; OS check: TradingView window IsIconic=True.
- Workaround (clearly a setup action, not a product change): `ShowWindow(SW_SHOWNOACTIVATE)` via `winshow.ps1` (ignored dir) → IconicAfter False; same `pine get` then succeeded in 820 ms (08) and Monaco mounted (08b). Root cause = minimized window, not findPineEditor. Suggestion (low): detect zero viewport/hidden visibility and say "TradingView window is minimized" instead of the fiber-tree message after 30 s.

### Observations (not defects)
- `pine compile` on a saved script with unsaved changes returns SAVE_REQUIRED before diagnostics even when the source has errors (53); documented behavior.
- After `pine save` of v2, `pine compile` returned `unchanged:true, compile_performed:false`; extraction confirmed the chart study was already running v2.0 (save applies to chart).
- Source default change (v5) propagated to the study input because in_2 had not been overridden; later `indicator set in_2="60"` overrode it.
- `pine check`/`ui eval` network: `pine check` needs sandbox escalation (first attempt "fetch failed" = sandbox, label 10-*). `ui eval` does not await promises (used a two-step global read for pine-facade).
- `screenshot -o` always writes to repo `screenshots/`; I moved my file into the ignored results dir.

## Commands attempted (all recorded)
tab list/new; state; ui-state; ui eval; timeframe 5/60/240/15/5; pine new/set/get/save/compile/compile --save/errors/list/open/check/analyze; data tables; indicator set (in_4 off/on, in_2); indicator remove (repro study only); screenshot. Harness: `tv.mjs` (spawnSync, stdin input, 65 s timeout), `verify-src.mjs`, `extract-expr.mjs`, `analyze.mjs`, `build-evidence.mjs`, `window-state.mjs` (CDP Browser API attempt; unsupported by Electron — recorded).

## Remaining QA state

Captured at labels 130–135 (2026-10-01 ~02:51 UTC).
- Tabs: 4 — KHbeIfLo, DgZswbBE, kdn7wAFi (unchanged, inactive) and my `XrSm3eti` / layout `CLI-QA-S01-20261001` (active). No tab closed.
- Studies on XrSm3eti: `vJ6QON` CLI-QA-S01 MTF Trend 20261001 (1) + default Volume. Repro study `xcOv5j` removed.
- Saved QA documents: `CLI-QA-S01 MTF Trend 20261001` v6.0 (= v5-input-change.pine; versions 4.0 contains the broken D1 source as history) and `CLI-QA-S01 Repro SaveOnError` v7.0 (clean; 2.0/4.0/6.0 broken history). Not deleted.
- Active editor: CLI-QA-S01 MTF Trend 20261001, unmodified, SHA fd742a0b… = saved source.
- Pending dialogs: 0. Pine editor panel open on my tab.
- Changed chart settings (my layout only): timeframe 1 → 5; study inputs in_2 overridden to "60" (source default "240"), in_4 = true. Symbol unchanged.
- Desktop window: was minimized at start (E1); restored with SW_SHOWNOACTIVATE and **left restored** so the next scenario does not hit E1. Lead may minimize it again. Dashboard still live (e.g. Excluded 411 at 135 vs 410 earlier as new bars arrive).
- Ignored scratch files: `winq.ps1`, `winshow.ps1`, expression files, `screens/` in results dir.

## Next-worker notes
- If Pine commands fail with the fiber-tree message, check whether the Desktop window is minimized (page innerWidth 0) before suspecting the CLI.
- Never rely on `compile --save` failure output to mean "nothing saved" (D1).
- `ui eval` takes the expression as positional text; no promise awaiting.





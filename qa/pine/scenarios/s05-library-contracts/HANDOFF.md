# S05 — 계산 라이브러리 타입·경계·저장 계약 (CLI-QA-S05)

Outcome: **Functional PASS after recorded workarounds, with four scoped product observations.** The exported library (5 functions, final
v2 signature) compiles on the server, survives save/open with the full source, and the independent
verifier — carrying the final v2 bodies — returns the expected values on **33/33** boundary vectors
on the real chart. The type diagnostics behave as intended. Nothing here claims library import.

- Repo/cwd: C:/Codex/.worktrees/tradingview-cli-pinescript-qa (branch codex/pine-qa, baseline 57ee8e7)
- Target: 54DD1962670F7BDEC34DF88E58666AC6, QA layout **CLI-QA-S05-20261001**, chart **XUvlQKpS**
- All commands ran as `node src/cli/index.js --target <id> ...`; child exit code and parsed JSON both recorded.
- Raw records: `results/pine-scenarios/s05-library-contracts/raw/*.json` (ignored); sanitized bundle: [evidence.json](evidence.json)

## 1. Scenario and sources

| Fixture (qa/pine/scenarios/s05-library-contracts/) | Role | SHA-256 (CRLF-normalized) |
| --- | --- | --- |
| library-v2.pine | **final keeper**: exported library with `weighted_score(..., float scale = 1.0)` and identifier-safe title | 9da754638b48aacafe87b0f05d41d3d1ba336f74be91eb4fac83a79f6e4a641d |
| library-v1.pine | v1 function contract (no `scale`); current file has the corrected identifier-safe title, while the original spaced-title run is in raw evidence | ab1fac01c14652f497814a42c05a3f951797523bd42824eccc5e42fd5fddf5d0 |
| library-type-error.pine | negative control: `clamped + "px"`, `clamp(hi, lo, "wide")` | e879373cbbf62838c93add51068b8bfce1a4c4acc639b17eaccddc246e6e344e |
| verifier-indicator.pine | independent verifier: copy region equals the **final v2 body**, 33 literal probes | 3d70a31a510ea5590e5d4201fbf269ee96797103a5c693b2040f9da4d43e0494 |
| raw/verifier-spliced.pine | ignored body-mismatch variant built from a tampered library source | b776813f063cfdbcb118d29fba932a403234303b0f8d6f2e7f0cd593943aea7e |

Exported API (final v2): `clamp(value, lo, hi)`, `normalize(value, lo, hi, fallback = 0.0)`,
`weighted_score(values, weights, fallback = 0.0, scale = 1.0)`, `array_mean(values, fallback = 0.0)`,
`array_variance(values, fallback = 0.0)` — all `float` / `array<float>` typed, with the edge policies
documented in the file header: ordered clamp bounds; zero-width domain returns fallback and does **not**
clamp out-of-range input; empty array returns fallback; population variance (divide by n).

Saved documents (verified through `pine list` and the editor document fence):
- library **CLIQA S05 Math Lib 20261001** (`USER;96d5d636d91444b2bbd5595e8cc1da04`), versions 1.0 → 2.0 → 3.0,
  library title inside the source `CLIQAS05MathLib20261001`
- verifier **CLIQA S05 Verifier 20261001** (`USER;17a6e38619324bfeb6425cbe969c0cb3`), final version 9.0,
  chart study `3IwshQ` (pineVersion 9.0, runtime status 2)

Edit sequence actually performed (no product source touched): `pine new library` → set v1 → save (v1.0) →
set v2 (+scale) → save (v2.0) → `pine open` by name → set v2 (identifier-safe title) → save (v3.0) →
`pine new indicator` → set verifier (v1 body) → save → compile (+2 fixture fixes) → probes → set tampered →
compile rejected → restore → realign verifier to the v2 body (+3 scale probes) → save (v9.0) → update the chart
(own study remove + re-add) → 33 probes read back → open/get on both documents.

## 2. Acceptance criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Library server compile succeeds | **PASS** | raw/check-lib-net.json, check-v2.json, check-v1-final.json, check-v2-final.json (exit 0, compiled:true, 0 errors/warnings) |
| 2 | Intentional type error: location + argument diagnostics | **PASS** | raw/check-typeerr-exit1.json — line 14 col 15 `operator +` with "px"; line 20 col 48 `clamp` with "wide" |
| 3 | Recovery after the intentional error | **PASS** | raw/check-v1-final.json, check-v2-final.json, check-verifier-v2.json all compile clean |
| 4 | Signature edit (new argument) verified | **PASS** | library-v2 `scale` compiles (raw/check-v2.json) and the final verifier exercises it: weighted-scale-one/two/zero rows PASS (raw/tables-verifier-v2-final.json) |
| 5 | Independent expected values ([1,2,3] mean 2, population variance 2/3, empty, zero denominator, out-of-range) | **PASS** | 33/33 chart probes (raw/tables-verifier-v2-final.json) + Node oracle agreement (raw/vector-check.json) |
| 6 | save/reopen preserves exports and full source | **PASS** | raw/get-lib-reopened.json, get-lib-final.json — editor hash equals the fixture hash; fences show the same script id across open |
| 7 | Verifier computes the same values on the chart | **PASS** | raw/tables-verifier-v2-final.json, study `3IwshQ` status 2; `indicator get` confirms pineId/pineVersion 9.0 |
| 8 | No publishing / external import / account sharing | **PASS** | no publish command; no `import` in any fixture; only the two CLI-QA-S05 documents created |
| 9 | Library import integration not claimed | **PASS (as required)** | no import-based verification performed and none asserted |
| 10 | Desktop library chart-add support state recorded | **PASS (recorded)** | raw/compile-library.json, compile-library2.json, compile-library2b.json, state-lib.json |

## 3. Numerical cross-check (core of criterion 5, final v2)

Chart table (study `3IwshQ`, `data tables --filter "CLIQA S05 Verifier"`), header:
`CLIQA-S05 verifier | probes=33 | mismatch=0 | na-class=33 | matched=33` — 33 rows, 33 PASS, 0 MISMATCH.
Node oracle (`node s05.mjs --local vectors`): `probes 33, literal_mismatches 0, actual_mismatches 0, all_match true`.

| probe | oracle | chart expected | chart actual |
| --- | --- | --- | --- |
| mean-1-2-3 `[1,2,3]` | 2 | 2 | 2 |
| variance-1-2-3 `[1,2,3]` | 0.666666… (population) | 0.66666667 | 0.66666667 |
| variance-four-points `[1,3,5,7]` | 5 (sample would be 6.6667) | 5 | 5 |
| variance-two-points `[1,3]` | 1 (sample would be 2) | 1 | 1 |
| mean-empty / variance-empty `[]` | fallback 0, and −7 when given | 0 / −7 | 0 / −7 |
| normalize-zero-denom `3,2,2` | fallback 0, and −1 when given | 0 / −1 | 0 / −1 |
| normalize-oor-low `-3,0,3` / -high `6,0,3` | −1 / 2 (documented unclamped) | −1 / 2 | −1 / 2 |
| weighted-zero-weight-sum `[1,2,3] [0,0,0]` | fallback 0, and −9 when given | 0 / −9 | 0 / −9 |
| weighted-length-mismatch `[1,2,3] [1,2]` | fallback 0 | 0 | 0 |
| **weighted-scale-one** | 2.333333… | 2.33333333 | 2.33333333 (default-equal `scale = 1`) |
| **weighted-scale-two** | 4.666666… | 4.66666667 | 4.66666667 |
| **weighted-scale-zero** | 0 (weighted average times 0) | 0 | 0 |
| clamp-na-input | na | NaN | NaN (na-class 33/33) |

Body identity: the verifier copy region equals the **final library-v2 body** (50/50 lines after removing `export `
and normalizing the function name, which the verifier must rename because it cannot import) —
raw/hashes.json `body_exact_match_vs_final: true`, `body_exact_match_vs_v1: false`, body hash
`164e4d8f82e938645026e0526028562009694fc3f0423ad99688052e3a9932d9` on both sides.
Detector sensitivity (negative control): the final comparison reports one differing line —
the function-token `math.max` → `math.min` change inside `clamp` — recorded in
[evidence.json](evidence.json) under `body_identity.detector_sensitivity_negative_control`.

Note on superseded evidence: the earlier 30-probe capture (raw/tables-verifier3.json) came from the v1 body and
is **not** used as a v2 result. The v2 result is the 33-probe table above, produced by the v2-aligned verifier.

## 4. Commands, exits, diagnostics (selection)

| Stage | Command | Child exit | Key JSON |
| --- | --- | --- | --- |
| library check (network escalated) | `pine check --file library-v1.pine` | 0 | compiled:true, 0 errors |
| library check after edit | `pine check --file library-v2.pine` | 0 | compiled:true, 0 errors |
| verifier check (v2-aligned) | `pine check --file verifier-indicator.pine` | 0 | compiled:true, 0 errors |
| type-error control | `pine check --file library-type-error.pine` | 1 | 2 errors with line/column/argument |
| create + save library | `pine new library`, `pine set --file …`, `pine save` | 0/0/0 | saved_with_dialog → `USER;96d5…`, v1.0 |
| signature edit | `pine set --file library-v2.pine`, `pine save` | 0/0 | v2.0, same id, modified:false |
| reopen contract | `pine open "CLIQA S05 Math Lib 20261001"`, `pine get` | 0/0 | id matches; 66 lines / 2739 chars; hash equals fixture |
| verifier compile (first) | `pine compile` | 1 | `Cannot call "addProbe" with "na" as a value for a non-typified argument` (fixture fixed) |
| verifier compile+save | `pine compile --save` | 0 | compiled:true, `button_clicked:updateOnChart`, v5.0 |
| v2 verifier save | `pine save` | 0 | v8.0 → 9.0, `modified:false`, same id |
| v2 verifier chart update | `pine compile --save` | 1 | save OK; chart update `Rejected` (3/3 attempts, see §5) |
| own-study re-add | `indicator remove uPuwdk`, `pine compile --save` | 0/0 | compiled:true, `button_clicked:addToChart`, study `3IwshQ` |
| v2 probes | `data tables --filter "CLIQA S05 Verifier"` | 0 | 33/33 PASS |
| library chart-add | `pine compile` (library open, saved) | 1 | title diagnostic first; then ~30 s `Applied indicator calculation did not finish before timeout` |
| cleanup | `indicator remove` (library study), `indicator get 3IwshQ` | 0/0 | final studies: Volume + CLIQA S05 Verifier 20261001 |

Timings: `pine set` 0.15–0.18 s, `pine save` 0.25–3.0 s, `pine check` 0.3–0.6 s, `pine compile` 0.16–0.38 s
(long runs are only the library/no-series path at ~30 s), `data tables` 0.15 s.

Guards actually exercised (PROTOCOL "Mandatory guards learned during S03"):
- The brand-new layout **did** reopen another scenario document — the first guard probe read
  `USER;e4b6a39e8a79466bb3134287eb3713a0` / "CLI-QA-S04 Pivot Zones", `modified:false`. Nothing was mutated
  under it; the next editor action was `pine new library`.
- Every recorded command carries `fence_pre`/`fence_post` (QA target URL, native Pine document id, version,
  `modified`). A URL/id mismatch or page-evaluation failure aborts the harness with exit 3, and child exit/JSON
  failures are re-thrown instead of being reported as outer exit 0. Example abort:
  `DOC FENCE post: expected unsaved, got USER;96d5d636d91444b2bbd5595e8cc1da04` (raw/save-lib.json).

## 5. Failures, defects, and limits (separated)

**Fixture errors (mine, not product):**
1. `addProbe(id, vars, expected, actual)` with untyped parameters rejects the bare `na` expectation; fixed by
   `addProbe(string id, string varsText, float expected, float actual)` (raw/compile-verifier.json).
2. The `variance-four-points` expected literal 2 was wrong; the population variance of
   `[1,3,5,7]` is 5 — the library was right and the literal was fixed (raw/tables-verifier2.json).
3. Harness fixture bug: the spliced verifier did not apply the `Fn` rename, so the file that was set lost its
   definitions (raw/set-tampered.json, compile-tampered.json, errors-tampered.json). Fixed in the harness; the
   already-saved broken script was saved again unchanged (not published), so this also documents a set/save round trip of a broken
   fixture: the recompiled source was rejected by the Pine server (`Rejected`, 5× `Could not find function or
   function reference`), and the operator message list shows both the rejection and the "Compilation created or
   retained multiple studies for this Pine document." condition before the cleanup remove.

**Product observations (recorded, not fixed; no product source changed):**
1. **Library title with spaces passes `pine check` but fails Desktop compile.** `pine check --file library-v1.pine`
   with `library("CLIQA S05 Math Lib 20261001")` → `compiled:true`; the same source in the editor → 1 error
   `Invalid argument "title" in "library" call. It cannot contain spaces, special characters or begin with a digit.`
   (line 5 col 9). Frequency 1/1 check vs 1/1 Desktop. Minimal repro: run both on the same file. Workaround:
   identifier-safe title (now in the fixture). Suspected component: `pine check` uses `translate_light`, a different
   code path from the editor compiler.
2. **`pine compile` cannot apply/verify a library on the chart.** Recorded as three attempts: (1) `compile-library`
   on library-v1 → diagnostic only (invalid title, no chart change); (2) `compile-library2` on library-v2 →
   translation passed, Desktop attached the library as study `UtwwMx`, that study never calculated (runtime status 0,
   no error text), and `pine compile` reported `Applied indicator calculation did not finish before timeout` after
   ~30 s; (3) `compile-library2b` after re-saving v3.0 → identical timeout and identical status-0 study.
   So: 1 diagnostic + **2/2 valid-title attempts timed out**. The causal explanation (a library produces no series,
   so completion is never reported) is a **hypothesis**, not established — only the status-0 study and the timeout are
   observed. Workaround: do not use `pine compile` for libraries; verify library semantics from an importing script.
   Cleanup: study removed; the chart is back to Volume + verifier.
3. **`pine open` cannot reopen the Pine panel after a tab reload.** The editor container was gone
   (`controller:false, editor:false`); `pine open` retried for ~30 s and failed with `Could not open Pine Editor.`
   (raw/open-lib.json, exit 1). `ui panel pine-editor open` restored the panel and `pine open` then worked in 411–594 ms
   (raw/panel-open.json, raw/open-lib2.json). Frequency 1/1. Environment check: `document.visibilityState` visible,
   2560×1358, `hasFocus:false`, bottom panel height 0 — not the S01/S04 minimized-window (viewport 0) constraint.
4. **Updating an already-applied indicator study on the chart was rejected 3/3 times.**
   `pine compile --save` on the saved verifier (v9.0, editor clean, no editor errors, no console errors) returned
   `Rejected`; the previously applied version stayed running (study `uPuwdk`, status 2, 30-probe table). Retry after a
   tab reload reproduced it (raw/compile-verifier-v2.json, compile-verifier-v2b.json, compile-verifier-v2c.json).
   Workaround used: remove my own study and re-add → `addToChart` succeeded and the v2 study `3IwshQ` ran with
   33/33 probes. Cause not diagnosed (kept as an observation; no product investigation). Same class of
   non-calculating-study state was seen once earlier on the same study, where a tab reload restored calculation.

**Not verified / not claimed:** library import integration; publishing; account sharing; `indicator add` by name
(one diagnostic probe returned `new_study_count: 0`; recorded as chart-state context only).

## 6. Remaining QA state and next-worker notes

- Desktop: no pending modal, no dialog. Editor holds the saved verifier **CLIQA S05 Verifier 20261001** (v9.0, modified:false).
- Own chart XUvlQKpS studies: Volume (`4bOHpY`) and CLIQA S05 Verifier 20261001 (`3IwshQ`, status 2). The library
  chart study and the superseded study `uPuwdk` were removed; no other scenario asset was modified. The inherited S04 document was observed read-only.
- Chart settings: BINANCE:ETHUSDT, 15m, chart type 1 (defaults of the fresh layout, unchanged by this worker).
  The verifier is `overlay=true` and draws one table plus one label.
- Saved QA scripts: `CLIQA S05 Math Lib 20261001` (library, v3.0) and `CLIQA S05 Verifier 20261001` (indicator, v9.0).
- Suggested follow-up for the Lead aggregate issue: (a) library-title validation divergence between `pine check` and
  the Desktop compiler; (b) `pine compile` timeout semantics for a zero-series script (library); (c) `pine open`
  failing to reopen the Pine panel after a reload; (d) chart update of an applied study rejected while re-add works.
- No Git operations were performed by this worker; results/ stays ignored.

## 7. Overall

All original-scope goals were executed on the real Desktop/CLI path with independent numeric verification:
the final v2 library body is byte-identical to the verifier copy region, and the compiled verifier returned
33/33 expected values (including the three `scale` probes) with a Node oracle agreeing on every vector and every
displayed literal. The library import claim is deliberately absent, the four product observations are recorded
rather than fixed, and the recovery steps (tab reload, panel reopen, own-study re-add) are documented with their
environment checks and their limits.

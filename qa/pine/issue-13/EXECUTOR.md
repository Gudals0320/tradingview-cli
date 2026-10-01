# Issue 13 — executor verification and handoff

Date: 2026-10-01 KST. Workspace/branch remain the assigned checkout and
`codex/pine-qa`. Starting HEAD `0f10f4f`; original six-scenario fixtures, evidence
and QA assets were preserved. New work uses only `CLI-QA-I13-*` documents and the
new `CLI-QA-I13-20261001` layout. Raw URL/document IDs and response bodies are
ignored under `results/pine-issue-13/`.

## Resolution by requirement

| Requirement | Focused commits | Resolution and evidence |
| --- | --- | --- |
| R1 | c2fa969, 020890a, 6e7110d | Physical CRLF→LF only in compilation identity. Verified epochs/observers are retained per study and checked against document, study, compiled inputs, source hash, context and native calculation cycles. All conclusive failures are terminal; a new valid compile can recover. |
| R2 | 020890a, 6e7110d | Clean saved `updateOnChart` invokes saveScript and rejects/no-ops when there are no edits. Native refresh now translates the current saved version, explicitly updates the existing study/version, and restarts that same ID to observe a new calculation. No new save version, deletion, re-add or dummy edit is used. |
| R3a/R3b | 6e7110d, 461bf4f | Central finalization observes diagnostics, target state and saved source. Failure responses retain actual saved/version/chart changes, distinguish syntax/runtime/native refusal, preserve protected target codes, and mark unknown persistence as null. Save preparation failures also terminate their epochs. |
| R4 | 461bf4f | Deterministic literal library titles follow the official identifier rule. Light-check scope is explicit. Library chart application is unsupported by this CLI and is rejected before native dispatch/study creation; this is not a claim that TradingView itself cannot display library examples. |
| R5 | 68d0691, 053534b | Initialization requires usable Monaco, native controller and a visible pane; bounded late-control retries do not retoggle once pane/button state changes. Zero viewport and visible initialization timeout have distinct codes/details. |

## Confirmed causes and scope of inference

R1/R2 were independently reproduced in new owned state. A saved LF strategy
compiled and immediately retried successfully; after opening a sentinel and
reopening its CRLF source, raw compile returned Rejected and data strategy was
REPORT_PENDING. The source/version/compiled study were unchanged. A meaningful
period edit followed by ordinary save also reproduced Rejected. Physical EOL
hash divergence defeated the shortcut; clean saved updateOnChart/saveScript was
the separate no-op rejection. The native error path left an unfinalized epoch.

An initial clean-refresh implementation used the native compile wrapper with a
null stub and clean editor flags. The native `_replaceStubByStudy` body showed
that this branch does not update a study. The replacement uses its explicit
existing-study updater branch and waits for applied version match. A same-ID
native restart is observed before any same-version report becomes verified.
Translation failure is checked before replace/restart and cannot alter the target.

The original S05 session's naturally stale indicator state was not independently
recreated. Its state category was tested explicitly using the native version-menu
action: save v1/v2 without application, initially apply v1, then refresh v2.
Both an indicator and a strategy retained one ID and their saved v2. This is
controlled initial setup, not a removal/re-add recovery workaround.

R5's original S05 visible failure was not repeated in the fresh environment.
The first new layout did expose an actual 0×0 viewport and a pre-fix 31-second
open failure. Restoring the QA window permitted testing. Closed pane and visible
cold reload now open successfully. Two later attempts incorrectly expected a
zero viewport after a minimize-button experiment; the warm renderer actually
retained 1136×822 and open succeeded. Those expectation failures remain evidence,
not product failures or successful zero-viewport tests. Visible cold snapshots
were 2560×1358. The new zero-viewport gate is covered by an exported-function test
before any click. No independent Win32 IsIconic measurement is claimed.

## Live verification

- R1 fresh LF→sentinel→CRLF reopen: normal/raw both unchanged true, data strategy
  succeeds and the intended document has one study. Raw text is preserved;
  comparisons normalize physical CRLF only, not whitespace/trailing newlines.
- R2 meaningful edit→plain save→compile: passes with verified report. In these
  live captures save had already reached ready before the next CLI call, so the
  internal pending `awaiting` branch was not directly observed. Its exact
  target/version predicates and rejection of pre-save report are unit-tested.
- R2 no-cache clean strategy: refresh starts a new native calculation and returns
  a fresh report without another version/study. Controlled saved v2/applied v1
  indicator and strategy refresh to v2; save_performed false, chart_changed true,
  same study ID, one instance. Unrelated compiled identities are protected by
  the unchanged #12 postcondition checks on every native application.
- R3 syntax error compile --save: exit 1 / PINE_COMPILE_ERROR, line 3, saved true,
  version 2 and chart_changed true; stored source verification succeeds. Correct
  source version 3 compiles successfully.
- R3 empty-array execution: PINE_RUNTIME_ERROR / RE10045, array.get index -1,
  size 0, bar 0 and native stack information. compiled true but calculation not
  ready; retry --save still exposes the error, saved true and save_performed false.
- R4 valid library: scoped light check succeeds, chart compile refuses immediately
  with no added study. Spaced literal title fails both check/compile locally at
  line 2; original valid library source is restored. Library was not published
  or imported. Its saved file was seeded as an unapplied named indicator solely
  to assign an owned CLI-QA-I13 filename, then replaced with the library source.
- R5 closed pane auto-open and visible cold reload pass. Final repeated run:
  closed open 669ms, cold open 3121ms, then compile 1430ms with fresh report,
  same study and version. The pre-fix visible trial's harness hit partially
  initialized chart metadata before issuing the cold open; that is recorded as
  an inspection/harness limitation. UI-only open retains URL/document fencing;
  source/application mutations still abort if chart state cannot be read.

## Representative S01–S06 regression

`representative.mjs` clones the original final code under new I13 titles; no
original file or saved asset is modified. All six pass analyze/check/compile,
whole-source reopen comparison and unchanged raw alias. S03/S06 reports pass.
S02 tables, S04 drawing extraction and S05's 33-probe table (mismatch 0) are read.
Each document has one study. These are representative product/document tests,
not repeats of the six historical independent numerical oracles, realtime HTF
rollover or all time-exit paths. `representative-evidence.json` makes that scope
explicit. Existing source-identity/ambiguity and target protection unit tests pass.

## Tests, failure accounting and retained state

- `TRADINGVIEW_SKIP_NETWORK_TESTS=1 npm test`: 339 passed, 0 failed; lint and
  whitespace checks pass. Default tests include pine_outcome and pine_library.
- Epoch failure matrix covers diagnostic/validation/native/save failures;
  timeout is terminal except for an already verified input recalculation marked
  calculation_pending true, whose observer remains active until completion.
- Native refresh uses Desktop 3.4.1.8194 private APIs; missing capabilities fail
  closed. Broader OS/version behavior and the general E2E suite were not tested.
- The evidence retains baseline product failures, intermediate implementation
  failures and harness/setup problems. In particular direct saveNextVersion setup
  did not yield the assumed clean stale state; a retry lost a native Promise.
  That setup was abandoned. A transient evidence-file write lock also stopped a
  run; bounded file-write retries were added without discarding earlier records.
- New QA assets remain: the small strategy/sentinel/fresh strategy, controlled
  old-version indicator/strategy documents, syntax/runtime controls, library and
  six representative documents. The deliberate runtime-error study is retained.
  Prior scenario/personal assets were not changed; no automatic deletion occurs.
- Every source mutation is fenced by exact target URL/native document ID. New
  template/null ID is confirmed before source writes. Unexpected child exit,
  malformed JSON, failed open or inspection mismatch stops the harness.
- No merge, PR or push. Reviewer explicitly agreed **all R1–R5** at `103fc71`.
  The reviewer independently reran 339 tests, lint and whitespace checks,
  confirmed the original scenario directory is unchanged, and compared selected
  ignored raw records against the committed outcomes. Live Desktop runs were
  performed by Executor; Reviewer reviewed their evidence without taking GUI
  execution ownership. All limits above are included in the agreement.
  This later change only records that agreement, with the reviewer's permission
  to finish after a documentation-only commit and clean status.

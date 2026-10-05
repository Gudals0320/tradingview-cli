# Roadmap #46 execution and validation

On 2026-10-05 KST the human explicitly excluded webhook URL/options, HTTP
delivery/status, external receiver comparisons and QA endpoint infrastructure.
TradingView strategy order-fill/alert()/both server alerts, lifecycle and internal
real-time events remain in scope. No receiver was created and no account security
setting changed. This scope change is recorded in #46/#49/#50/#53, not counted as
implemented webhook functionality. No future release/tag or installed update is
authorized for this work; the installed stable 2.2.0 remains separate from the
development branch.

## Measurement rules fixed before comparison

- Use the owned synthetic `scripts/fixtures/roadmap-strategy.pine`, with percent
  commission 0.05 and slippage 1 tick. Cycle, zero, open and breakeven cases are
  explicit inputs; also test cash-per-order costs. A case that does not actually
  occur remains fixture-only, not a successful live claim.
- Compare each percentage field separately: net profit, maximum drawdown,
  profitable trades and buy-and-hold. Record raw fraction/percent, sign and
  currency without silently changing existing consumers' units.
- TV UI and official exports are ground truth. Tolerance is half the last
  displayed/exported digit for amounts, prices, quantities and percentages;
  record when native precision exceeds that display/export precision. Counts and
  timestamps at the stated export precision must agree exactly. Record chart and
  export timezone. UTC raw units, DST and session cases without actual live
  occurrences remain fixture-only.
- Record backtest/loaded/trade windows independently. A short loaded chart does
  not prove or disprove a longer native calculation. Coverage must have native
  evidence. Preserve changed revisions and failed samples privately.
- Large-ledger conditions, warming, ordering, accuracy checks and exclusions are
  fixed before timing; measure actual scale, never extrapolate a tested sample
  into a claim of maximum account limits.

## Current evidence stage

Baseline main/Latest/peeled v2.2.0 were `4226dea3` at start. Dependency preparation
and full catalog bootstrap preceded Desktop status (CDP/API connected). Dedicated
new layouts and named workspaces are used; previous five unowned QA tabs and
original user resources are preserved. Desktop 3.4.1/Electron 41.7.1, Windows,
Node 24.19.0, Korean UI. Private source/identity/journals and raw results are not
committed. Feature completion requires clean-SHA live evidence and final review.

First Pine preparation candidate `f36fbf0` passed lint and 528 offline tests,
independently reviewed. Native saveNewScript uses no-overwrite save, leaves the
prior editor document intact, and returns a new remote saved identity. A clean
fresh create saved and verified its source, but first open readback was refused
as PINE_OPEN_UNVERIFIED. Resuming the same request opened/attached that exact
document without a second create, and compile/report succeeded. This is recovery
evidence, not a one-call fresh-create success claim. An earlier dirty attachment
implementation accessed a binding cleared by reassign; its exact interrupted
operation was explicitly recovered/rebound after native quiescence. Records are
retained. Follow-up addresses initial mount restore and Redux/Monaco settling.

Initial general-report investigation found 2419 trades; native backtest started
2024-01-01 while loaded chart began 2026-09-22. UI net PnL -1302.48 USD (-13.02%),
drawdown 1426.22 USD (14.15%) and win rate 46.42% matched their individual raw
fractions/amounts within the specified display tolerance. These initial dirty
investigation readings are not final clean-SHA acceptance. Buy-and-hold,
commission/export/timestamp cases and other features still require completion.

Native metadata exposes strategy Properties through groupId strategy_props and
internalID mapping to typed current input values. General report.settings in this
build contains date ranges, not the full Properties. The separate Deep facade
and manager were found read-only; their existence alone is not execution proof.
General raw report lacks equity/equityHistory; buyHold is never adopted as equity.
Further native/official-export investigation continues.

Account plan reads pro_premium, alert list returns 26 entries (count only); these
are observations, not quota/feature guarantees. Native two-factor status returned
type:null, classified off by the loaded status parser. Webhook is excluded by
human scope change, so this is no longer an acceptance dependency. Server-alert
and Deep capabilities still require their own actual evidence.

## #47 clean acceptance receipts

Reviewer independently approved Pine-only `f04e8c5b2d20a1d78dbc85e3b8e3dd7e7466b5a2`
after isolated lint and 535/535 tests. Its source was exported with git archive,
left unmodified, and used the matching shared ancestor node_modules. Live commands
ran as the normal Desktop OS user, sharing the default protected LOCALAPPDATA
workspace state; archive/private paths are omitted here. The root checkout's
ongoing #48 changes were not used for these Pine-only claims.

- Clean `bab0f6d`: explicit B detach to chart-only, new saved B2 document prepare
  in one call (created/persistence_verified/opened/attached all true,
  reused:false), then compile/report and completed-request reuse passed.
- Clean `180d1e4`: wholly new layout C initially refused before document dispatch
  with PINE_VIEWPORT_UNAVAILABLE, viewport 0x0. Existing-window activation via
  Computer Use failed twice with access denied; browser getWindowForTarget was
  unsupported. No launch/reload, privilege workaround or extra C resource was
  used. The human restored the existing window. Exact C identity/generation and
  viewport 2560x1358/visible were reread, and the same request's first actual
  document dispatch completed mount/create/remote save/version/source/open/
  attach in one call, followed by compile and verified report. Request stages and
  private operation records preserve the earlier preflight refusals.
- Exact existing C open on 180d1e4 was initially refused PINE_OPEN_BUSY because
  the native version opener skipped an already mounted identical document. An
  early progress message incorrectly said this had succeeded before its tool
  result arrived; it was explicitly corrected. This refusal is not counted as a
  success. The Pine-only f04e8c5 fix verifies ID/version/canonical source plus
  unmodified/not-draft/not-pending and skips redundant native open.
- Clean f04e8c5 exact existing open returned created:false,
  persistence_verified/opened/attached:true, open_dispatch:not_needed and
  reused_mounted:true, with the expected saved version/source hash and a new
  attachment generation. Compile and report succeeded afterward.
- Same clean C, chart-only: nonexistent exact document ID returned exit 1 /
  PINE_DOCUMENT_NOT_FOUND. A's exact document, reserved by a different workspace,
  returned exit 1 / WORKSPACE_RESOURCE_RESERVED before open. Neither produced a
  saved document or interruption.
- Same clean C: an explicitly created synthetic QA modified draft was detached
  to chart-only. Prepare refused exit 1 / PINE_FOREIGN_DRAFT before save/open,
  residual saved_document:null and recovery_required:false. Explicitly attaching
  that same QA document allowed source readback: the draft was byte-identical
  before and after refusal. The original synthetic fixture source was then
  explicitly restored in its own workspace; compile/save/report succeeded. No
  user draft was used or modified.
- Clean f04e8c5, after the Desktop connection was restored under a maintained
  execution session: exact C saved-layout/document identities were reread in the
  new browser. Explicit chart-only reconnect and exact-ID preparation discarded
  old target/generation/report proofs; GUI-restored tab ownership remained null.
  Create with C's existing exact QA name returned exit 1 /
  PINE_DOCUMENT_NAME_EXISTS, stages:null and new saved_document:null.
- The prepared C document then received a genuinely different synthetic source
  via pine set (Cycle default 10 to 12), followed by pine compile --save and data
  strategy. Saved version changed 1.0 to 2.0. Both compile and report returned
  source hash `4af5c66f248abb53e3e4ebd0ac6ff62230b1c263b72fe68d748e8e1e35dda68e`,
  distinct from the preparation hash. Persistence and report verification were
  successful. The saved document remains the same exact C document.

Fixture coverage distinguishes known native pre-dispatch rejection plus an empty
candidate delta from unknown creation. Unknown create is never resent; one new
candidate still needs remote source proof. Zero/multiple candidates remain
unknown. Native open response loss retains its stage and offers an explicit new
exact-ID open request, or verifies an already completed identical mount. Entry
fixtures cover reassign/bind/browser-proof continuity, residual resources,
foreign draft, stale generation, duplicate prevention and explicit unknown-open
recovery. Locale-sensitive save dialogs are avoided by the observed native
no-overwrite saveNewScript API; existing save dialog failure/cancel regressions
remain fixtures. No plan/paywall state was altered to manufacture a live failure.

Dedicated saved documents/layouts A, B/B2 and C remain recorded privately for the
remaining roadmap QA. New owned tabs remain available; previous five unowned QA
tabs and user resources remain untouched. No document creation granted tab-close
rights. #47 implementation/live acceptance is separate from eventual main merge
and issue closure; the rest of #46 is still in progress.

## Deep development candidate and failed preparation

Candidate `6ac3d20689a74dc8aafa0d7739b7d24526ff276c` passed lint and all
570 offline tests. A Git archive of that exact commit shared the installed
immutable dependency tree and normal-user private state for live preparation.
Read-only B evidence matched the owned engine ID, all 32 input values/descriptors,
and main-series extended symbol (session/currency/adjustment) to the native Deep
manager. This verifies mapping, not a completed Deep job.

The A saved document was explicitly rebound in its restored saved layout and
compiled/saved successfully. Tab selection and report-panel activation started
a new normal calculation cycle. The next Deep attempt returned REPORT_PENDING
with mutation_dispatched:false; no Deep request was sent. Later native strategy
status was Completed with a complete report, while the CLI observer still had
cycle 2 active and only cycle 1 completed. The report-before-Completed-status
ordering is covered by the subsequent monitor correction, including negatives
for status-only old reports and changed input/ABA identity. The candidate archive
is unchanged. This attempt is failed preparation and is not Deep live acceptance.

## Accepted Deep and equity candidate evidence

- The exact a2b75c1 and 44e7d985 Git archives calculated the UTC week
  2018-01-01 to 2018-01-07 on A. Requested/computed bounds, source hash, target,
  page generation and request attribution matched. Closed trades 14, ledger rows
  15 (including one open trade), net PnL 33.25998 and open PnL 1.69 gave native
  total PnL 34.94998. UI total PnL 34.95, 10/14 profitable trades (71.43%), profit
  factor 4.932 and drawdown 8.84 matched their respective native fields. Net PnL
  and total PnL are distinct fields. A second a2b page had the identical revision.
  Reviewer independently projected stored receipts and verified the arithmetic;
  direct Desktop observation was by Executor.
- Exact 44e7d985 Seoul native calculation reached an attributed terminal report,
  but actual dates were 2017-12-31 to 2018-01-06 for requested Jan 1 to Jan 7.
  Outside trade evidence caused DEEP_PERIOD_MISMATCH; no metrics/ledger were
  adopted. Native UTC-only support subsequently rejects other calculation zones
  before dispatch. The failed raw experiment remains preserved.
- Exact a7e41f9 completed owned history had native status 2, manager/WS connected
  false, connecting false, socket null, counter before+1, cycle 1/ready and the
  temporary send guard released. Explicit normal reset succeeded. Reviewer
  accepted this stored live lifecycle evidence; fixture coverage also supports an
  identical retained connection and refuses foreign range/report/socket.
- Exact dd212573e761b2301cfcfcb53104f1bc014592c0 native equity collection on A
  returned 343 loaded points from the explicit strategy.equity plot. All 34
  applicable flat-close checkpoints and the final capital+net+open value matched.
  Maximum observed error was 3.64e-12 account units; fixed tolerance stayed
  max(1e-7, abs(expected)*1e-10), with reference arithmetic bound 8.33e-8.
  Returned points remained the raw native values. CSV contained all 343 points
  plus its header while the JSON preview had 10 rows. A later price update changed
  revision; page 2 correctly returned REPORT_CHANGED without points.
- Initial dirty equity audit against rounded native cp/TP fields failed the fixed
  tolerance and adopted no points. Independent whole-entry/exit fill prices,
  matched quantity, native entry valuation, same-currency point value and matched
  commission replaced that rounded primary reference; cp remains auxiliary.
  Partial exits/pyramiding/overlap, FX, unknown fields or partial checkpoints are
  unverified. This correction did not widen tolerance.

## Native day precision and zero-trade evidence

Exact dd21257 normalized a DST-local interval to 2024-03-10 05:00Z through
2024-03-11 04:00Z (23 hours). Native UTC produced midnight-to-midnight 24-hour
bounds and outside trade evidence; results were DEEP_PERIOD_MISMATCH with no
metrics/ledger adoption. A single non-DST control, Jan 1 12:00Z to Jan 2 12:00Z,
also produced Jan 1/2 midnight boundaries and the same refusal. Both controls
remain failed old-contract evidence. The current supported path requires both
normalized bounds at UTC midnight and refuses other precision before dispatch;
no date correction is applied. Original chart/display timezone is preserved.

The saved A source was unchanged while its previously read Case input was set to
zero and verified. Exact dd21257 UTC Deep returned net/total PnL 0, trades 0,
ledger rows 0, and the matching native Jan 1-7 window. Undefined ratios remained
null rather than manufactured zero. Coverage completeness remained unknown:
absence of trades does not prove bar coverage. Normal reset succeeded. Zero-trade
equity returned EQUITY_SEMANTICS_UNVERIFIED because no closed checkpoints existed.
Case was explicitly restored to cycle with a new verified input calculation.

## Bounded offline snapshot benchmark

Before measurements, the script fixed one 1,000-row warm-up, interleaved
10,000/25,000-row sizes with three trials each, 10 rows per page and 20 cached
pages per trial. Creation/decode cost is separate; correctness failure aborts and
no failed trial is silently discarded. Every page retained the exact full
snapshot reference/revision and expected native ordinals; period validation ran
once per snapshot. Windows x64 / Node v24.19.0 measurements: mean first snapshot
15.20 ms (10k) and 36.16 ms (25k); mean cached page 0.83/0.94 ms, maximum
2.24/2.85 ms. These are isolated fixture/VM timings, not live network timings or
the account's maximum bar/trade limits. Reproduce with
`node scripts/benchmark-deep-snapshot.mjs`; raw measurements remain private.

## Alert investigation and preserved resources

A native QA create-alert action was prepared and its dialog editor requested;
no submit action was invoked. The process later became unreachable and no
visible dialog was confirmed. After Lead restored Desktop with no-kill consent,
fresh authenticated list_alerts returned HTTP 200 / ok with 26 persisted alerts
(price 25, drawing 1) and no QA strategy document candidate. This is current
server readback, not proof derived merely from a missing submit click. The
captured editor branch creates local drafts and calls server create only on
submit; silent invocation would create a server alert and was not used as prefill.
Messages/webhook values were not collected in this reconciliation projection.
Quit cause remains undetermined. No alert was removed or changed.

Dedicated saved QA layouts/documents and private failed/unknown records remain.
B/C genuine unknown Deep intents were neither upgraded nor archived. Live raw
IDs, source, account data and ownership tokens are excluded from this public
receipt. Remaining roadmap live cases, server-alert implementation and combined
acceptance are still incomplete; these candidate receipts do not close #46.
# Review correction: replacement is not settlement

An observed GUI/native replacement does not establish the previous Deep outcome.
Archive eligibility requires an immutable, exactly attributed terminal response or
a known zero-history-dispatch outcome captured before replacement. Unknown and
pending records without that proof retain their phase and private bytes; status
reports replacement without persisting a superseded phase. Unit and real CLI
fixtures cover transport uncertainty and pending work followed by GUI replacement.

Equity review corrections validate each trade's entry/exit order, known native
exit schema and exact closed ledger count against totalTrades. Multiple entry/exit
events at one timestamp are unverified instead of netting their counts. Real CLI
negative fixtures publish neither points nor CSV. A subsequent working-tree live
observation retained 343 native points and 34 applicable flat-close checkpoints,
with maximum error 3.637978807091713e-12; immutable commit validation is separate.

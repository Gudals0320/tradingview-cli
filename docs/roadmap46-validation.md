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

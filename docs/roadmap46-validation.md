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

## Subsequent A2 acceptance (2026-10-05 KST)

The human confirmed accidental deletion of the original QA Pine document. This
was an external deletion, not a CLI defect. A new separately named QA document
was explicitly created, persistence-verified, mounted, attached and compiled;
old document IDs, alert creation proofs and unknown Deep records were preserved.
The new document initially used the same public fixture source, then a separately
saved source revision and Cycle input/timeframe were verified.

Environment: TradingView Desktop 3.4.1, Electron 41.7.1, Chrome 146.0.7680.216,
V8 14.6.202.34, Node 24.19.0, Windows NT 10.0 build 26200, Korean UI/Asia-Seoul.
Native observations and failed trials remain in ignored private results. Code
commits and dirty status are retained separately; fixture outcomes are not live
outcomes. No webhook, receiver, broker order, release or global install change
was performed.

At a83a13e, explicit active-create then pause succeeded with verified inactive
state and a 1,933 ms client confirmation window. It is non-atomic and could fire
before pause. At c6ef7f8, native settings modification changed the exact owned
alert's name while preserving its original strategy. The first immediate read
verified settings but still observed inactive; it correctly returned failure.
Same-operation reconciliation later verified active without another send.
Earlier update guard refusals dispatched zero mutations and are preserved.

Gap replacement verified pause-old/create-new with a 2,366 ms confirmation
window; overlap replacement verified create-new/pause-old with a 1,864 ms window.
Old alerts remained preserved, paused, and were not automatically deleted or
reactivated. A subsequent saved source, Cycle input and 1-to-2-minute timeframe
change left the old server wire unchanged and reported document/source/inputs/
context stale. The new replacement verified the new saved source. Three native
realtime events for that exact new alert had the expected QA Pine-event message
hash. Earlier original fills/alerts/both alerts also had actual internal fires;
finite log pages and native before cursor boundaries were verified.

All 16 typed Properties were applied/read back on A2 in one verified native input
calculation. This verifies their effective input values, not bar-magnifier lower
timeframe completeness or an independent FX conversion model.

An additional stable report with zero commission/slippage, realtime recalculation
off and the public breakeven Case yielded this actual TV screen comparison:

| Field | CLI native value | TV display | Interpretation |
| --- | --- | --- | --- |
| Net profit | 123.97999999999993 USD | +123.98 USD | Closed monetary net; open PnL was zero |
| Net percent | 0.006198999999999997 | +0.62% | Fraction times 100 |
| Maximum drawdown | 203.5600000000013 USD | 203.56 USD | Positive loss magnitude |
| Drawdown percent | 0.010176381955269178 | 1.02% | Fraction times 100 |
| Closed trades / winners / losers | 330 / 191 / 20 | 330 / 191 / 20 | Remaining 119 were displayed as breakeven |
| Win fraction | 0.5787878787878787 | 57.88% | Fraction times 100 |
| Gross profit / loss | 167.91999999999993 / 43.94 USD | 167.92 / 43.94 USD | Loss magnitude is positive |
| Profit factor | 3.8215748748293112 | 3.822 | Display precision 0.001 |
| Largest win / loss | 9.06 / 9.040000000000001 USD | 9.06 / 9.04 USD | Monetary magnitudes |
| Average trade | 0.3756969697 USD | 0.38 USD | Display precision 0.01 |

These display checks use half the last shown decimal place, plus floating-point
roundoff, only for UI rounding comparisons. They do not widen equity's independent
arithmetic tolerance. The earlier cost-bearing screen displayed commission as a
percentage of gross profit; that label is not the CLI's currency commission field.
UI total PnL can include open valuation and repaint asynchronously, so an unstable
realtime display was not used as a closed-net proof.

The A2 zero Case produced net/trades/ledger rows zero and undefined profit factor
null. Its open Case revealed native x.c empty with lx/time/price mark fields. The
existing ledger incorrectly labeled that row closed. The correction distinguishes
open valuation from exit: open=true, exit_time/exit_bar=null, mark_time/mark_bar
explicit, raw x preserved. trade_window ends at entry for an open tail, not at its
mark. Production page and actual-entry fixtures cover this observed native shape.

`scripts/smoke-roadmap-strategy.mjs` adds bounded read-only report/equity/alert
scenarios. Pass the exact dedicated workspace/document and a new private output
filename; report pages pin revision, refuse changes and disclose truncation.
The harness preserves SHA/dirty/time/Node/OS and all raw calls privately. It never
creates, updates or deletes server resources. Maximum account coverage, FX
arithmetic and lower-timeframe bar coverage remain explicitly unknown.

## Final native evidence and resource state

At fc6d861, the actual native open row was re-read successfully with open=true,
exit_time=null and a separate changing mark_time. Its raw empty exit comment and
valuation fields remained unchanged. Normal reports and normalized ledgers now
explicitly identify mode=normal, including when the separate UI displays Deep.

A2 UTC Deep Jan 1-7, 2018 completed with a verified decoded native window and
309 immutable ledger rows: 308 closed plus one native isOpen row. The UI showed
that exact Deep date range, total PnL 12.54 USD, drawdown 27.44 USD / 0.14%,
152/308 winners / 49.35%, gross profit 217.00 USD, gross loss 204.58 USD and
profit factor 1.061. Native closed net was 12.42 USD plus open PnL 0.12 USD,
matching UI total. The ordinary source still returned its different 2026 chart
report (closed net 114.96 USD, 1,460 closed trades), never the Deep metrics.
The exact native Deep request/counter/cycle/socket proof was ready, period
validation checked all 309 rows, and explicit normal reset succeeded. Loaded
coverage remained unknown, not inferred from the absence of outside trades.

Heikin-Ashi with fill_orders_on_standard_ohlc=true and EUR currency was applied
and report-ready after explicit compile. The first immediate property observation
after chart-type change was REPORT_PENDING with no property mutation; it was
preserved. Same-currency defaults/Candles were then restored. A separate EUR-only
curve attempt returned EQUITY_SEMANTICS_UNVERIFIED with no points because FX fill
PnL was not independently verified; NONE/USD was restored. An earlier combined
HA/EUR attempt stopped at incomplete bar mapping, before the FX proof check.

The A2 supported normal curve then returned 1,656 loaded raw points, all 118
applicable flat-close checkpoints and a full 1,656-row CSV beside a 10-row JSON
preview. Maximum observed error was 3.637978807091713e-12 account units; the
independent arithmetic error budget was 2.4462999145317e-8, below the original
fixed tolerance. No interpolation/downsampling, changed timestamp or broadened
tolerance was used. These interim smoke receipts declare dirty=true; clean final
smoke receipts are separate. The earlier immutable 343/344-point checks remain.

All six dedicated QA server alerts were explicitly deleted by exact owned
creation/operation IDs. Each fresh absence read verified deletion. A final full
list contained 26 alerts and its exact ID set matched the original 26-alert
baseline, with no missing or extra ID. All 26 messages, conditions, symbols,
resolutions and creation/expiration fields also matched the original baseline.
Dedicated layouts and QA documents remain; the human-deleted old
document is not recreated under its old ID. A2 saved source version 2 remains
normal/Candles, Cycle 14, 2 minutes, with the recorded original Properties restored.
B/C genuine unknown Deep records and all failed/partial private evidence remain.

One independent-review full-suite run on bf04 had an unidentified assertion
failure. It did not reproduce in ten exact-bf04 archive runs, ten checkout runs,
or 100 CDP transport stress runs. This is recorded as non-reproduction, not an
identified root-cause repair. New source changes have their own complete lint/test
results; repeatedly passing fixtures do not replace the native acceptance above.

| Issue | Implemented/verified acceptance | Conditional or unsupported boundary |
| --- | --- | --- |
| #47 | Exact saved document preparation, persistence, attach, compile and report on old A and new A2 | Foreign modified drafts and uncertain old outcomes remain protected |
| #48 | All 16 effective inputs, verified recalculation, USD/EUR and HA-specific input | Actual lower-timeframe coverage and independent FX arithmetic are unknown |
| #49 | Three strategy event modes, pinned source/settings, exact readback, native fires and non-atomic paused policy | Native initially-inactive create rejected on this account; explicit two-step policy reports active window |
| #50 | Owned get/pause/resume/update, gap/overlap replacement, stale snapshots, finite native fires and deletion | Unknown mutations reconcile by exact ID; internal stop cause is not invented from active=false |
| #51 | Distinct normal/Deep provider, UTC whole-day attributed results, native UI/ledger and boundary/zero cases | Subday/non-UTC unsupported; maximum account size not measured; large fixture costs labeled separately |
| #52 | Exact direct equity plot, dense loaded CSV, closed/final arithmetic and open PnL | No FX/partial/pyramided/ambiguous same-bar allocation or Deep fallback |
| #53 | Native UI values/units, closed/open/zero/breakeven, context changes and structured bounded smoke | UI repaint and loaded coverage are explicit; no external delivery or real broker fill claim |

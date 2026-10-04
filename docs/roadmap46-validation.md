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

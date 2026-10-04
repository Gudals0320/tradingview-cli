# Effective strategy Properties

`strategy properties` reads the exact owned strategy's current typed inputs via
native metadata groupId strategy_props/internalID. Values never come from Pine
defaults. `strategy set-properties --values JSON` validates the complete patch
before one setInputValues call, reads back the complete state and waits finitely
for the matching native calculation. A single invalid/unknown/unsupported field
refuses the entire patch before dispatch. Native setters are not claimed atomic:
partial failure, external changes and timeout report requested versus actual
values and preserve interrupted effects when workspace guards cannot reconcile.

The getter remains available for owned current inputs before verified compilation,
during calculation and after runtime failure. Its success means the native
Properties observation succeeded; report_verified/report_status separately say
whether a report is ready. Resolved effective_currency is null until the matching
report is verified; any older observed report currency is labeled separately.
Metrics from an unverified report are never adopted. The setter currently requires
a ready verified report baseline and refuses pending/failed/unverified baselines
before dispatch. Inspect the current settings with the getter, repair/compile the
owned Pine source (or explicitly correct settings in Desktop and acknowledge that
change) before retrying; a timeout does not authorize another uncertain mutation.

```powershell
tv --workspace research-a strategy properties
tv --workspace research-a strategy set-properties --values '{"commission_type":"percent","commission_value":0.1,"slippage":2}' --timeout 30000
tv --workspace research-a data strategy
```

| Field | Type | Native unit/meaning |
|---|---|---|
| initial_capital | number >= 0 | Report currency amount |
| currency | native code | Raw NONE follows symbol; effective_currency is the report's resolved currency |
| default_qty_type | enum | fixed, cash_per_order, percent_of_equity |
| default_qty_value | number >= 0 | Contracts/shares/lots, currency, or equity percentage according to the type; not converted |
| pyramiding | integer >= 0 | Entries |
| commission_type | enum | percent, cash_per_contract, cash_per_order |
| commission_value | number >= 0 | Percent, currency per contract, or currency per order; costs apply to entry and exit |
| slippage | integer >= 0 | Ticks |
| backtest_fill_limits_assumption | integer >= 0 | Ticks |
| margin_long / margin_short | number >= 0, native bounds if exposed | Percent; values above 100 are valid, including 200 |
| calc_on_order_fills | boolean | Additional calculation after fills |
| calc_on_every_tick | boolean | Realtime only; not restored historical ticks |
| process_orders_on_close | boolean | Additional fill attempt at bar close |
| use_bar_magnifier | boolean | Native applied input is read back; actual lower-timeframe coverage is separately unknown unless proved |
| fill_orders_on_standard_ohlc | boolean | Relevant to Heikin Ashi fills |

Each field reports supported/unsupported/unknown, native input ID, options/bounds
when exposed and mutation_supported. Unsupported fields must be set explicitly
in Pine strategy() source; no source replacement is performed. In this build
report.settings exposes dates rather than all Properties, so
report_settings_properties is not_exposed. That does not turn a requested value
into report proof. Dialog/native/result comparisons remain required live evidence.

These Properties already occur inside native getInputValues. The shared effective
fingerprint is a derived view of that same state, not a second source of truth.
It participates in calculation keys/accepted epochs, report revisions and
workspace guards, and will be reused by server-alert and Deep identity. GUI ABA
cycles and pending calculations cannot reuse an earlier report. `indicator set`
refuses native strategy_props IDs and directs callers to this typed interface.

Existing page bindings created before this contract may need explicit reconnect
with their exact generation to acknowledge a Properties baseline, then compile.
No automatic adoption of external edits or stale proofs is performed. This
development interface is not evidence that the installed stable CLI was updated.

Sources for units and relevant behavior: [TradingView Properties](https://www.tradingview.com/support/solutions/43000628599-strategy-properties/).

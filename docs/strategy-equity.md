# Explicit native per-bar equity

`data equity` collects an existing native `strategy.equity` plot from the exact
owned, saved/applied strategy. It never inserts a plot into the user's source.
Without an explicit plot ID it returns EQUITY_UNAVAILABLE. Untyped report arrays,
closed cumulative PnL, buy-and-hold and broker account history are not accepted as
per-bar strategy equity. Deep equity is explicitly unsupported with no fallback.

The user may add this direct expression to their own Pine source, then compile
and save it. Optional arguments must be named; dynamic offsets and unsupported
plot mappings refuse. Additional ordinary plots affect the native plot ID.

```pine
plot(strategy.equity, title="Equity", display=display.data_window)
```

```powershell
tv --workspace research-a data equity --list-plots
tv --workspace research-a data equity --plot-id plot_1 --offset 0 --limit 100
tv --workspace research-a data equity --plot-id plot_1 --offset 100 --limit 100 --report-revision EXACT_REVISION
tv --workspace research-a data equity --plot-id plot_1 --export results/equity.csv
```

`--list-plots` exposes exact compiled native IDs and auxiliary direct-expression
attestation. Titles are labels, not identities; a plot called Equity may still
be `close`. Only the explicit ID is selected. A source expression, native metadata
mapping, current source/document/compiled/full-input/Properties proof, and runtime
numeric checks are all required. Numeric agreement is evidence of equity shape,
not a proof of the entire Pine program's semantics.

Returned points are the raw native plot values, never reconstructed equity. The
audit independently checks every applicable flat-close checkpoint in the loaded
window and the final value against capital plus verified net/open PnL. At least
two distinct checkpoints are required. Same-currency fill prices, matched trade
quantity, native entry valuation, owned point value and complete entry/exit
commission allocation must agree. Long and short direction is explicit. Other
open positions or reentry on a liquidation bar, ambiguous partial exits/reused
entries, overlap/pyramiding, currency conversion, unknown point value, missing
timestamps or incomplete numeric fields are UNVERIFIED. Zero-trade curves and
insufficient checkpoints remain unverified; an available array is not sufficient.
Each exit/mark timestamp must follow its own entry, and native exit kinds must
match the entry direction. A present string exit comment distinguishes closed
records from empty-comment open marks; missing comments remain unknown. Closed
record count must equal native totalTrades. Multiple entry/exit events at one
timestamp are refused because netting their counts hides intrabar ordering.

The fixed tolerance is `max(1e-7 account-currency units, abs(expected)*1e-10)`.
Before acceptance, the reference arithmetic bound
`gamma_(6*closed_records+4) * (abs(capital)+absolute gross/fee flow)`, where
`gamma_k = k*Number.EPSILON/(1-k*Number.EPSILON)`, must fit that tolerance.
Native `cp`/trade-PnL rounding is reported as auxiliary evidence and does not
widen tolerance. Audit output includes checkpoint count/coverage, maximum
observed error, arithmetic bound and final comparison. A partial audit cannot
publish verified points.

Coverage is loaded chart bars and is explicitly partial relative to the full
native backtest. Every returned raw bar index/time/value must match one loaded
bar; missing/NaN/ambiguous timestamps fail rather than interpolate. Render offset
is separate from raw bar timestamps. No downsampling or silent row cap occurs.
The current collector verifies the whole loaded plot/ledger for each page; it
does not claim O(page-size) collection cost. Snapshot/source/report changes
require restarting at offset 0 with the new revision.

`--export` writes every validated loaded point from the same immutable snapshot,
even when the JSON preview is a small page. It runs only after workspace
observation/ownership validation, refuses existing files, and reports exact CSV
row count and revision. It does not claim full-backtest or Deep coverage. A write
failure reports a possible partial file explicitly. No broker connection or
order API is used.

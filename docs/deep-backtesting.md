# Native Deep Backtesting

This development interface uses the owned Strategy Report's separate native Deep
manager. `data strategy` still collects the normal chart study; a Deep UI label
never turns a chart report into Deep results. Explicitly open the owned report,
compile/save the owned source, then run a new stable request ID.

```powershell
tv --workspace research-a pine compile --save
tv --workspace research-a ui panel strategy-tester open
tv --workspace research-a backtest run --mode deep --from 2018-01-01T00:00:00Z --to 2018-01-07T00:00:00Z --timezone UTC --request-id historical-week-1
tv --workspace research-a backtest status --run-id EXACT_RUN_ID
tv --workspace research-a backtest wait --run-id EXACT_RUN_ID --timeout 30000
tv --workspace research-a backtest results --run-id EXACT_RUN_ID --offset 0 --limit 100
tv --workspace research-a backtest results --run-id EXACT_RUN_ID --offset 100 --limit 100 --report-revision EXACT_REPORT_REVISION
tv --workspace research-a backtest normal
```

Periods require real ISO-8601 timestamps with explicit UTC offset and whole-second
precision. Empty floored periods and impossible dates refuse before dispatch.
Native calculation supports `UTC`/`Etc/UTC` only, both pinning `Etc/UTC`.
An explicit different native calculation timezone fails DEEP_TIMEZONE_UNSUPPORTED
before Desktop access or dispatch. A strongly attributed Seoul trial shifted the
computed dates by one day and is retained as failed evidence. No date correction
or chart-result fallback is applied. Explicit ISO input offsets still normalize
to UTC instants: DST offsets in from/to may therefore describe a 23/25-hour
interval, independently of native calculation timezone. Naive datetimes, invalid
dates, empty/subsecond intervals and unsupported calculation zones refuse at
input validation. The original chart/display timezone stays unchanged.
Requested/normalized absolute bounds, actual transmitted timezone/bounds,
native report window and trade window are separate. Results containing trades
outside the requested bounds are DEEP_PERIOD_MISMATCH and never adopted. A native
report date range is the available coverage evidence; full bar coverage and
maximum account limits are not inferred from it.

The native client first reports accepted, then pending when its request is sent.
Only an exact native request/session/decoded response and fresh report cycle can
be ready. Server errors, finite wait timeout and unknown outcomes are distinct.
Timeout is not cancellation. Reads never mount panels, select dates or execute
calculations. Normal reset requires exact native settlement and preserves
uncertain persistent intents; it never implicitly cancels or abandons a job.

Source verification pins saved/applied document version, canonical editor hash,
verified compilation token/protected identity, full input fingerprint, effective
Properties, semantic symbol/session/timezone/chart type and page generation.
Asynchronous hashing rereads all of these before returning. The actual native
payload is separately matched to the current chart's protected/full inputs;
unsupported/dependency mappings are refused rather than assumed owned.

The adapter fixes the following independent baseline-to-wire contract. Unknown
fields refuse; reading an expected value from the same manager that sends it is
not verification.

| Field | Owned authority and comparison | Missing/unsupported handling |
| --- | --- | --- |
| Source/document | Saved unmodified editor, canonical SHA, verified compile token, protected `text`/`pineId`/`pineVersion`; exact current values | Zero history dispatch |
| Engine | Owned source `_getStudyIdWithLatestVersion()`; exact native engine ID (different from document-bearing meta ID) | Zero history dispatch |
| All inputs/Properties | Current owned `getInputValues()` and metadata types; protected primitives, other exact `{v,f:true,t}` descriptors, identical key set | Unknown tags, extra keys and mismatched values refuse |
| Symbol/session/currency/chart representation | Owned main-series `getSymbolString()` including native extended-symbol fields; exact wire string | No alias guesses or manager-derived expected string |
| Resolution | Owned main-series `interval()`; exact native interval value | Tick/range mappings unsupported |
| Timezone/bounds | Explicit validated CLI timezone (UTC maps to Etc/UTC), whole-second absolute from/to; session timezone sent after creation and pinned | No date shift correction or implicit local timezone |
| Dependencies | Independently mapped empty list | Nonempty/unmapped lists unsupported |
| Session/request | Native connection handshake and admitted created-session frame, pinned connection/socket; timezone uses that exact session, with one captured request counter | Counter increment or the manager's void return never proves send |
| Browser/generation | Exact workspace nonce, provider and saved/applicable source/input/context snapshot | Changes invalidate dispatch/result |

After all asynchronous preparation, the actual `request_history_data` arguments
and current owned baseline are checked synchronously immediately before the
original native send. A send exception remains uncertain and is never replayed.
Send completion requires the exact serialized frame to reach the original native
transport on the pinned connected socket and its `send()` admission to return
true. It proves local transport admission only; server acceptance requires the
attributed decoded response. A pre-transport refusal has an explicit known-zero
history marker; transport invocation followed by false/exception remains unknown.
Exact terminal disconnected preparation with an unchanged counter and no history
send attempt can also be reconciled without replay; pending authentication cannot.
Stable response hooks use the current connection
and socket and ignore disposed callbacks or late replies from an old socket.

Native decoded report timestamps use milliseconds. Report bounds must be finite
and inside the requested absolute bounds; every applicable trade timestamp must
also be finite and inside them. Zero trades do not prove bar coverage; their
report window remains the available evidence and coverage completeness remains
unknown. Missing window/timestamps produce DEEP_PERIOD_UNVERIFIED.

Private write-ahead intents survive process/response loss. Repeated request IDs
only observe the exact existing native run and never resend unknown work. Native
GUI/unrecorded pending jobs are also protected before the native requestData
method can disconnect them. A lost page/provider cannot prove an old server
outcome; preserve its record and reconcile the exact work rather than recreating
it. Existing workspace dead-owner interrupt/recover admission remains in force.

Metrics and ledger pages share an immutable full snapshot. Native response/report
cycle changes invalidate it. Copy/hash and absolute-period validation run once
per snapshot; subsequent pages transmit only the requested slice. No rows are
silently downsampled. Large-scale benchmarks remain a separate measured claim.

Current native prerequisites include a supported report provider/decoder and
account permission. No plan purchase, authentication change or paywall bypass is
implemented. Initial dirty live investigations demonstrated a UTC native Deep
job and distinct chart/Deep metrics, but also exposed a chart-timezone/day-shift
case and listener lifetime failures. They are retained as investigations, not
final clean-SHA acceptance. See [validation](roadmap46-validation.md).

[TradingView's current Deep behavior](https://www.tradingview.com/support/solutions/43000666265-how-deep-backtesting-works/) is background execution after period selection; CLI run/normal are explicit mutations and status/wait/results are observations.

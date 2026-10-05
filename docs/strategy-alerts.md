# Owned strategy server alerts

`alert strategy-create` creates a server alert for the exact saved/applied strategy
in the named workspace. It requires a verified normal baseline, full inputs and
effective Properties, a matching saved document/version, and the current account.
SDK-derived targets are independently checked against the owned source's raw
state, metadata fullId/latest engine, and exact main series symbol/session/currency
and interval. These authorities are pinned again at the final request boundary.
The native modes are `fills`, `alerts` and `both`. The latter two require native
alert() capability. Dependency-bearing inputs and unsupported interval mappings
fail before dispatch. The Desktop's native permission/security checks remain on.

```powershell
tv --workspace research-a alert strategy-create --request-id strategy-week-1 --mode both --name 'Research QA' --message '{{strategy.order.alert_message}}' --expiration 2027-01-01T00:00:00Z
tv --workspace research-a alert strategy-get --request-id strategy-week-1
```

Names gain a unique `[tv:UUID]` suffix for exact request reconciliation. Text/JSON
and TV placeholders pass through unchanged. Outputs omit the message body and
return its SHA-256. Full native DTO/source/input evidence remains in the private
workspace artifact directory. Existing user alerts are never adopted by name alone:
only a previously recorded unique correlation and matching account/settings can
identify an uncertain creation. No arbitrary alert ID is accepted by these commands.

New creation requires a future ISO timestamp with an explicit offset. The same
recorded request can reconcile after expiration; its expiration and snapshot are
preserved and no new POST is sent. Native initial `--paused` creation was rejected
by the observed server and is not silently reinterpreted. Popup, sound, email, SMS and mobile notifications are
disabled; webhook is explicitly null. There is no webhook configuration or external
delivery claim. Native account/limit/server rejection codes remain distinct from
unknown transport/readback outcomes. Server messages are not printed as errors.

Before native transport, the full owned identity/account and generated wire fields
are checked again. The native request builder supplies its authenticated URL and
payload, while a scoped one-attempt transport prevents the SDK's create retry from
duplicating an uncertain request. The exact native collection/REST instance link
is required, and generated wire objects are normalized through their actual JSON
serialization before comparison. Native operation tracking retains unfinished
work after CDP timeout. A private intent is written before dispatch. Its stable request
ID is never blindly sent again: repetitions inspect the original server snapshot.
Changed parameters conflict. An unrelated new creation is refused while an earlier
creation intent is unknown. Exact fresh readback can reconcile a lost response.
An absent list result does not prove that creation failed or permit replay.

The supported native builder supplies POST, a string JSON payload, include
credentials, and optional signal/referrer fields without explicit headers. Other
option/body shapes and backend overrides refuse before transport. The exact
one-shot fetch imported by that native builder preserves its header/default
handling; the SDK retry composer is excluded only for the owned creation.
Unknown paths/methods never fall back to that retry composer. After the create
response, only exact native read paths/methods and shapes can pass through for
readback. Repeated cached factories must resolve to the same REST getter and fetch
dependency; their source text need not be byte-identical.

`strategy-get` performs a fresh native server read and never changes alerts or
private outcomes. It can inspect an uncertain creation through its private
correlation, but only repeated `strategy-create` persists a reconciled creation.
If native work remains pending after timeout, wait and use the exact existing
workspace recovery contract before resuming. Never clear ownership or discard the
creation intent to retry it.

The read separately compares a verified current normal baseline with the local
creation source/document/input/Properties/context proof. A changed baseline is
stale; an unverified current chart returns snapshot_stale:null, not a claim of
freshness. The server's settings remain the original snapshot in either case.

Readback verifies the type, mode, study/input snapshot, symbol, interval, name,
message, expiration and disabled notifications. Creation's active setting is
verified immediately; later reads report the current active state independently.
Server-added symbol attributes must independently match the main-series wire
symbol pinned in the original creation proof. They are explicitly returned as
server_added_symbol_fields; unknown or differing extras refuse readback. Serialized
symbol object key order is not an identity. Requested keys and all input values
remain exact.
Source hash and effective Properties provenance are explicitly local creation
evidence, not a claim that the server returned a Pine source hash. Creation success
means server configuration/readback, not a real-time event or broker execution.

Server alerts retain their creation snapshot when the chart/source changes. Events
occur on real-time bars, and strategy fills refer to the broker emulator.
[TradingView's official alert documentation](https://www.tradingview.com/pine-script-docs/concepts/alerts/)
describes these snapshot and event semantics. Lifecycle controls and internal fire
logs are separate roadmap work; their acceptance and live receipts are tracked
independently of these creation fixtures.

## Explicit owned controls

```powershell
tv --workspace research-a alert strategy-pause --request-id strategy-week-1 --operation-id stop-week-1
tv --workspace research-a alert strategy-resume --request-id strategy-week-1 --operation-id restart-week-1
tv --workspace research-a alert strategy-delete --request-id strategy-week-1 --operation-id delete-week-1
```

These controls resolve only an already verified local creation to its exact server
ID. Fresh settings/account readback precedes the mutation. GUI-edited settings
refuse; arbitrary user alerts cannot be adopted. Each stable operation ID records
its intent before one native request. Lost replies remain unknown and repeated
IDs inspect the desired active/deleted state without resending. The same operation
ID cannot change actions. A conflicting observed end state returns failure even
when the underlying read succeeded. Native security/session behavior is retained;
no native SDK retry fallback is used for the owned mutation.

Successful deletion preserves the creation record and marks verified deletion.
`strategy-get` still makes a fresh absence check; the old creation ID cannot create
again. A successful control means the observed server state, not absence of queued
events or broker execution. Update/replacement remain separate implementation work.

## Internal fire logs

```powershell
tv --workspace research-a alert strategy-fires --request-id strategy-week-1 --limit 50
tv --workspace research-a alert strategy-fires --request-id strategy-week-1 --limit 50 --before 123456
```

Only verified local creation IDs, including retained deleted records, can select
logs. The supported native listFires contract filters exact alert_ids and uses a
numeric fire-ID before cursor. It is not a time cursor.
IDs must be strictly descending and strictly below before; duplicate/equal/outside
IDs or invalid calendar timestamps fail without publishing events. The last ID of
a full page is therefore a strictly advancing next_before cursor. Pages expose the
observed time window, latest observation time and message hashes; message bodies and all
webhook/delivery fields are omitted. Empty success differs from unsupported API,
request errors or unverified row/account/time/ID schema. A full page leaves total
coverage unknown and returns next_before. A short page ends this server observation.
No log deletion or event replay is performed. Native log Date(value) semantics
interpret numbers as milliseconds and explicit-offset ISO strings as timestamps.
These fixtures do not substitute for a dedicated live server event receipt.

## Explicit two-step paused policy

```powershell
tv --workspace research-a alert strategy-create-then-pause --request-id paused-week-1 --mode both --name 'Research QA paused' --message '{{strategy.order.alert_message}}' --expiration 2027-01-01T00:00:00Z
```

This distinct opt-in command creates active, verifies creation, then pauses the
exact owned ID and verifies inactivity. It is not atomic initial paused creation.
The result includes both steps and measured create-confirmed to pause-confirmed
times; the alert could fire during that window and creation may predate the first
confirmation. A failed or unknown pause returns failure, an ACTIVE-until-verified
warning, the exact alert ID and next get/pause commands. The active field is null
when fresh state is unverified, true only after a fresh active observation, and
false only after verified inactivity. Guidance first reads state, then explicitly
uses a new persisted recovery operation ID with --after-operation-id if still
active. That deliberate new pause preserves the original unknown outcome; it does
not replay the original operation. It never auto-deletes or
blindly retries. Deletion requires explicit human confirmation. Stable requests
and pause-operation IDs reconcile their original steps rather than duplicate them.
An existing plain creation ID may be reused and paused by this opt-in policy;
reused_creation is reported.

## Explicit settings update and strategy replacement

`alert strategy-update --request-id OWNED --operation-id STABLE` changes any
explicit name, message or expiration. Native modify-and-restart makes the exact
alert active, including an alert previously paused. This activation is part of the
command contract. It preserves the original strategy/document/inputs/context;
source changes require replacement. Creation provenance and original wire remain
private and preserved; fresh readback validates the updated settings. The native
security check and SDK-generated client ID remain enabled. Only one modification
request is sent; unknown responses reconcile the desired settings without resend.
An expired alert requires an explicit new future expiration to restart.

`alert strategy-replace-plan` reads an exact owned old alert and presents old/new
request IDs and stage order without server changes. `alert strategy-replace`
uses the same explicit parameters with a distinct replacement creation ID and
stable workflow ID. `--policy gap` pauses old first, then creates and verifies the
new current strategy snapshot. `--policy overlap` creates and verifies new first,
then pauses old. The result includes exact old/new IDs, individual steps and the
client confirmation time window. Neither policy is atomic: gap can miss signals,
overlap can duplicate signals, and server transitions may predate confirmation.

The old alert is retained paused, never automatically deleted or reactivated.
Delete it explicitly with its original creation request ID after verifying the
replacement. Partial failures retain each stage and its exact child request ID.
Repeating the same workflow reconciles uncertain child requests, without duplicate
creation or blind rollback. GUI-edited old settings are refused. A replacement
must be observed active to complete; an expired/inactive replacement is incomplete.
Messages remain private and are projected as hashes. External delivery stays out
of scope for updates and replacement.

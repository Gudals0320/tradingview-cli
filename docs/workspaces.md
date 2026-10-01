# Independent CLI workspaces

A workspace reserves an exact CDP endpoint, target, saved layout and saved Pine
document between CLI calls. Prepare separate saved layouts and documents first.
Each layout must be open in only one target and have at most one Pine study,
belonging to that document. Registration never switches tabs or opens a document.
Results cover ordinary backtesting; Deep Backtesting is not supported here.

The initial supported environment is one local Desktop loopback endpoint. Known
localhost/IPv4/IPv6 loopback aliases share ownership. A configured hostname alias
cannot use legacy commands while local workspaces reserve that port. The short
metadata admission gate is shared within the session directory so registration,
hostname aliases and Desktop-wide launch leases cannot race; it is released before
any Desktop work. Launch/restart is
blocked by any registered workspace even if another port is configured.

```powershell
tv workspace inventory
tv workspace init --file worker-a.json --target TARGET_A --layout LAYOUT_A --pine 'USER;DOCUMENT_A'
tv workspace init --file worker-b.json --target TARGET_B --layout LAYOUT_B --pine 'USER;DOCUMENT_B'
tv --workspace worker-a.json symbol BITSTAMP:BTCUSD
tv --workspace worker-a.json timeframe 60
tv --workspace worker-a.json pine set --file strategy.pine
tv --workspace worker-a.json pine compile --save
tv --workspace worker-a.json indicator set STUDY_A --inputs '{"in_0":21}'
tv --workspace worker-a.json workspace wait
tv --workspace worker-a.json data strategy
tv --workspace worker-a.json data ledger --offset 0 --limit 100
tv workspace release --file worker-a.json
```

Run the corresponding B calls from another OS process concurrently. There is no
execution queue or endpoint execution lock between workspaces. A short admission
metadata transaction retries Windows filesystem/gate contention for up to two
seconds (finish up to three); a real resource/operation duplicate fails at once.
The configured endpoint must stay identical. `--target` and `TV_CDP_TARGET` cannot
override a workspace. Target loss, reload, document replacement and unexpected
source/context/input changes fail without selecting another target.

Legacy commands take an endpoint lease for the entire invocation. This fixes the
previous check-only admission race, so overlapping legacy invocations may return
`SESSION_BUSY`. While any workspace remains registered, online commands without
`--workspace` fail with `WORKSPACE_RESERVED`, including state/status/tab/UI/eval,
layout and launch commands and pine-batch. Use `workspace inventory` for HTTP-only
target IDs and `workspace status --file FILE` for filesystem ownership. Filesystem
session status and offline analysis remain available. Release reservations when
finished. Never launch/restart Desktop to bypass reservations.

Results, append-only history and per-operation journals are private files under
`.tv-workspaces/WORKSPACE_ID/`, beside the handle file. Results include workspace,
operation, target, layout, Pine ID, page generation, source hash, strategy inputs,
compiled identity, context and native calculation events. Only a result marked
`committed:true` is finalized. `workspace status` identifies its authoritative
operation-specific result file. Calculation freshness uses the existing verified
Pine/report lifecycle; repeating identical source does not require a new version.

An expected compile/validation error whose final state was read remains usable.
An unverified interruption preserves its reservation and journal and blocks new
commands on that workspace. Other workspaces can continue. Recovery explicitly
accepts the current isolated state; it does not restore shared Desktop state.

```powershell
tv workspace status --file worker-a.json
# Only after the recorded process has died:
tv workspace interrupt --file worker-a.json --operation EXACT_ACTIVE_OPERATION
tv workspace recover --file worker-a.json --operation EXACT_INTERRUPTED_OPERATION
# Same resources, new page generation; acknowledge the reload explicitly:
tv workspace recover --file worker-a.json --operation EXACT_INTERRUPTED_OPERATION --rebind
```

Recovery requires the exact interrupted operation, resource identity and native
quiescence. It retains the incomplete operation's journal/result. Failed recovery
keeps the original interrupted operation. `--rebind` requires the same exact target,
layout and Pine document; it cannot fall back to another tab. A reused/live PID is
never declared dead from age alone. PID reuse may require manual inspection rather
than unsafe automatic adoption. Stale endpoint batch journals must be recovered or
explicitly discarded through the existing session/pine-batch recovery flow first.

If a process dies inside the short admission transaction, inspect and explicitly
clear its exact dead gate; reservations are preserved:

```powershell
tv workspace gate-status
tv workspace gate-clear --token EXACT_GATE_TOKEN
```

A live/unverifiable PID or malformed gate is not cleared. Lost/copied/deleted
handles do not release their centralized reservations. Keep the original private
handle safe; resource IDs and owner tokens must not be edited by hand.

If a reload happens between commands, use `workspace rebind --file FILE --id
EXACT_WORKSPACE_ID` to acknowledge the same idle resources in a new generation.
Rebinding reports adopted source/context/input changes. It requires the registered
document to be mounted and the target still to exist. When a target or handle has
been lost, use the explicit offline escape hatch instead:

```powershell
tv workspace abandon --file FILE --id EXACT_WORKSPACE_ID --operation EXACT_INTERRUPTED_OPERATION
```

An idle reservation needs only the exact workspace ID. An active operation must
have a nonexistent PID and its exact operation ID; an interrupted operation also
requires its exact ID. Abandon preserves private journals/results and records
`incomplete:true`, releases only this workspace and does not touch Desktop. A new
workspace can then explicitly register newly provisioned resources. Initialization
checks HTTP inventory before reservation and rolls back a failed bind.

Desktop can reopen the globally most recent Pine document after a reload. If its
editor is mounted and unmodified, `workspace rebind --file FILE --id ID
--restore-document` explicitly reopens the registered document's recorded version
on that exact target. Modified foreign drafts and pending actions are refused.
Interrupted recovery uses `--rebind --restore-document` with the exact operation
ID. No tab is activated and another workspace's document is not saved or edited.
Recent-document selection is shared: after restoring A, a later reload of B may
open A's document. B rejects that identity and uses the same explicit restoration
procedure. Already loaded other workspaces keep their documents and sources.

Init, recover and rebind may read the user's own saved script versions from
pine-facade with the target's existing authenticated session. This verifies editor
source and the version actually applied to the chart, even when a saved layout
restores an older version. If the reads fail, there is no persisted-source proof;
verified compilation can still establish report identity. An edited document
whose chart study has an older version saves the requested edits once and applies
them explicitly to that study version.

Synchronous page expressions have guards in the same turn. Async expressions have
guards before dispatch and after completion; native actions run in between. During
compilation, changing the owned study's input schema/defaults can be a native
effect of changing source. Those changes are permitted along with compiled
identity changes. An external edit to that same study during compilation can be
indistinguishable from a native input change. Do not edit reserved resources in
the GUI during execution. Other document, source and context changes are checked;
the CLI cannot physically exclude external software from Desktop.

The allowlist is deliberately narrow. Shell, arbitrary eval, layout switching,
document creation/opening, alerts, watchlists, replay and other shared commands
are legacy-only. The policy coverage test requires explicit classification of
every new CLI adapter. The generated full command matrix is in
[workspace-commands.md](workspace-commands.md).

Dedicated target viewport/focus emulation can keep an already mounted editor
usable while its tab is inactive. Initial editor mounting may require selecting
the dedicated tab during preparation. Prepare before registration and keep the
same emulation on both targets; alternating tab focus during execution is not an
independent workflow. Validation must disclose preparation, saving and cleanup
costs as well as warmed calculation throughput.

# Independent CLI workspaces

A workspace reserves an exact CDP endpoint, target, saved layout and saved Pine
document between CLI calls. Prepare separate saved layouts and documents first.
Each layout must be open in only one target and have at most one Pine study,
belonging to that document. Registration never switches tabs or opens a document.
Results cover ordinary backtesting; Deep Backtesting is not supported here.

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

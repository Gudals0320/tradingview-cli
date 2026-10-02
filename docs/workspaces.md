# Named workspaces

Version 2 uses saved layout → named workspace → execution. Chart commands require
`--workspace NAME` or the calling PowerShell process's `TV_WORKSPACE` selection.
There is no active-tab fallback or global active-workspace setting.

## Prepare and select

```powershell
Import-Module .\scripts\TradingViewCli.psm1
tv status
tv layout create "Research A"
tv layout list
tv workspace create research-a --layout LAYOUT_URL_ID
tv workspace select research-a
tv state
tv symbol BITSTAMP:BTCUSD
tv timeframe 60
```

`layout create` creates a saved layout in a **new** tab. `layout open ID` opens an
existing saved layout in a new tab. Both return `previous_target` and
`foreground_changed:true`; they do not rename/replace the previous chart.
`layout list` exposes the URL layout ID as `id`, with the numeric cloud record ID
in `storage_id`. Duplicate names are rejected. One saved layout may be reserved by
only one workspace and must be open in exactly one target.

Create another dedicated layout/workspace in another terminal. Their chart
changes, calculations and streams can overlap. Explicit `--workspace` affects
only that invocation. Each invocation pins its target and page generation.
Another terminal's selection cannot retarget an operation. `tv layout select ID`
is a PowerShell-module operation: it clears selection only on layout mismatch.

The module changes Process environment only. Importing it does not edit the
profile or User/Machine environment. `Install-TvProfile` is an explicit,
idempotent opt-in that preserves existing profile content. Re-import with `-Force`
after updating. Without the module, `workspace select` fails with
`SELECTION_REQUIRES_MODULE`; use explicit names in scripts instead.

## Chart-only and Pine

Pine is optional at creation. Chart-only binding, observation and symbol/timeframe
changes do not access the editor. Create/open a dedicated saved Pine document in
the owned tab and attach it explicitly, or pass `--pine` during creation when it is
already mounted:

```powershell
tv workspace show research-a
tv workspace attach research-a --pine 'USER;DOCUMENT_A' --generation EXACT_GENERATION
tv --workspace research-a pine set --file strategy.pine
tv --workspace research-a pine compile --save
tv --workspace research-a pine errors
tv --workspace research-a workspace wait
tv --workspace research-a data strategy
tv --workspace research-a data ledger --offset 0 --limit 100
```

A document cannot be reserved by two workspaces. No implicit cloning occurs;
retain/delete explicit copies deliberately. Pine workspaces isolate the owned
document's study; unrelated built-ins do not become its result identity. Duplicate
owned studies are rejected. `workspace detach NAME --generation GEN` converts to
chart-only without editing/closing/saving the editor. `pine new/open` reject
replacement through a bound workspace and explain attach.

Editor/UI operations require a usable Desktop viewport. Minimization can yield
`PINE_VIEWPORT_UNAVAILABLE`; restore the existing window. Mounted editors can run
while another tab is selected. UI commands and CDP screenshots require the owned
tab selected (`FOREGROUND_REQUIRED`); `screenshot --method api` uses the background
chart API. Arbitrary UI commands do not promise background support. GUI edits are
outside CLI locks; foreign unsaved drafts are never silently replaced/saved.

## Locks, reads and streams

The admission gate covers short metadata transactions only. Resource sets are
acquired atomically: app, saved layout, document, workspace/chart. Independent
resources proceed independently. Conflicting writers queue FIFO within their
conflict scope, including requests spanning several resources. Default wait is
30 seconds, maximum 300 seconds, queue capacity 64. Override with
`--lock-timeout-ms MS`; Ctrl+C cancels/removes a waiting ticket. Timeout diagnostics
include command/workspace/PID/start time/token. Results publish
`provenance.locks.waited_ms`, resources and waited-for owners.

Identity probes run outside the gate and compare PID **and** process start time;
unverifiable owners stay protected. Windows delete-pending errors are retried.
Persistent write denial yields `ADMISSION_PERMISSION`; metadata contention yields
`ADMISSION_BUSY`. Dead waiters are reclaimed. Dead holders without incomplete
native records are reclaimed. `LOCK_HOLDER_DEAD` retains uncertain work: reconcile
the operation, then clear its exact token. Release failure is `LOCK_RELEASE_FAILED`.

```powershell
tv workspace locks
tv workspace lock-clear --token EXACT_DEAD_TOKEN
tv --workspace research-a stream quote --interval 500
tv --workspace research-a stream ohlcv BITSTAMP:BTCUSD@60
```

Pure observation/status/wait does not take mutation ownership or consume another
operation's permits. Changing data samples yield `WORKSPACE_OBSERVATION_CHANGED`;
wait can observe an acknowledged transition. Reports retain source/input/context/
completion checks. Ledger revisions must remain constant across pages. Interrupted
results are not adopted. Streams validate ownership/generation every tick and exit
on loss; samples identify workspace/target/generation.

`stream ohlcv` now observes requested **existing owned-layout panes**, emitting one
frame with `feeds`; it does not provision/reassign other targets. Prepare panes
with workspace pane commands, or use separate workspaces. The old reassignment
option fails with migration guidance. Stop streams yourself or impose a timeout.

## Lifetime and recovery

There is no daemon: each call checks browser generation, target and page nonce.
Idle/running/interrupted/disconnected/target_lost and external-change errors differ.
Only a successful CDP inventory with an absent target proves target loss.
Unreachable CDP is `WORKSPACE_DISCONNECTED` (exit 2). Neither condition automatically
launches/kills/reloads/recreates tabs. Release preserves saved resources and tabs.

```powershell
tv workspace show research-a
tv --workspace research-a workspace interrupt --operation EXACT_DEAD_OPERATION
tv --workspace research-a workspace recover --operation EXACT_INTERRUPTED_OPERATION
tv layout open LAYOUT_URL_ID
tv workspace reconnect research-a --target NEW_TARGET --generation OLD_GENERATION
```

Reconnect compares the exact old generation. The replacement must already show
the same saved layout/document. Competing reconnects cannot both commit. Old study
IDs, source proofs and report verification are invalidated; compile again. Rebind
acknowledges the same target's new generation. Recovery's
`--rebind --restore-document` restores recorded document/source only when it cannot
overwrite a foreign modified draft. Saved resources/CLI state remain available;
arbitrary unsaved GUI state after app/tab termination is not guaranteed.

`workspace reset NAME --id ID` explicitly releases a quiescent or proven-lost
workspace and removes its name while preserving artifacts. It never recreates
tabs and refuses disconnected endpoints/live owners. A dead preparation without
a workspace can be reset with its exact `--reservation-id` from list. Released
names remain visible as released until reset; reusing the name creates a fresh ID.

Incomplete journals/results are preserved. Recorded panes restrict recovery;
whole-layout effects retain broader validation. Unknown legacy effects fence app
operations; recorded targets also fence matching workspaces. Unrelated targets can
continue. Session recovery distinguishes absent targets from unreachable CDP.
Exact lost-target discard requires reachable CDP and all recorded targets absent.
Offline abandonment requires exact workspace/operation IDs and preserves artifacts.

```powershell
tv --workspace research-a workspace release
tv --workspace research-a workspace abandon --id EXACT_ID --operation EXACT_OPERATION
tv session status
tv session recover --run-id EXACT_RUN
tv session discard --target-lost --run-id EXACT_RUN
```

Do not reload/force-clear live ownership/repeat uncertain mutations. `tab switch`
selects the named target; an optional legacy index must match. `tab close` closes
only a CLI-created owned tab and refuses discard dialogs. Bound `layout switch`
is retired: open/select another workspace. Killing `launch` is blocked while
workspaces are registered; explicit `launch --no-kill` uses app ownership. No
automatic launch. Stopping a CLI process/stream does not close Desktop or resources.

## Persistent storage and migration

Default: `%LOCALAPPDATA%\tradingview-cli` on Windows, `$XDG_STATE_HOME/tradingview-cli`
(or `~/.local/state/tradingview-cli`) on Unix. `TV_STATE_DIR` overrides it. Names,
private bindings, ownership, journals/history/results survive TEMP cleanup. Public
schema-2 handles contain no credentials/source. Private Windows ACL grants only
the user, SYSTEM and Administrators; POSIX uses 0700/0600. This is not encryption.

Before upgrading, finish/recover old runs and **release the old reservation using
the old CLI**. Keep its handle/private artifacts. After updating:

```powershell
tv workspace import research-a --file worker-a.tvws.json
tv workspace show research-a
tv --workspace research-a workspace rebind --id EXACT_ID
```

Schema-1/2 import is idempotent and copies old artifacts without deleting/moving
the old TEMP store. Use `--legacy-state DIRECTORY` if needed. Imported proofs/
generation are invalidated. Unreleased old reservations are rejected. Old live
leases yield `LEGACY_CLI_ACTIVE`; old journals fence their recorded targets/app
effects. Update every terminal: old/new CLIs cannot share one live old reservation.

Reservation-only mirrors in the old temporary registry prevent ordinary old CLI
admission while modern workspaces are registered. They contain no modern owner
credential/source and preserve original old rows. Both registries use the old gate
before the persistent gate, only for short metadata registration. Lost mirrors are
resynchronized before execution. `session status` includes legacy diagnostics;
use `session recover/discard --legacy-state DIRECTORY` to reconcile an old journal
with the current scoped recovery code. All terminals should use the same state
directory for a Desktop endpoint.

File references remain a deprecated migration path with JSON result warnings. A
reference matching both a name and local file is rejected. `--target` and
`TV_CDP_TARGET` are preparation/migration selectors and cannot replace workspace
selection for chart work. Update scripts to names and replace the old active-tab
batch entry point with `examples/workspace-batch.mjs`.

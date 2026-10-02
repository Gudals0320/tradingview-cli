# Dispatch, completion and result evidence

Selection → ownership → dispatch → native completion → calculation completion →
result adoption are distinct. Calls pin saved resources and ephemeral generation.
Metadata registration is short; Desktop/OS identity probes and queue waits run
outside it. Conflicting writers queue by overlap; independent resources proceed.
Reads/streams retain target/nonce checks without consuming mutation permits.

| Operation | Allowed effect | Required evidence |
|---|---|---|
| symbol/timeframe/type | Normalized requested context | Matching chart/feed readiness |
| quote SYMBOL | Temporary owned-chart switch/restoration | Requested quote context and restored baseline |
| Pine set | Exact supplied source | Same document/controller, expected hash |
| inputs | Requested keys/values | Atomic validation, study/input fingerprint |
| indicator/pane operations | Requested owned-chart/pane effect | Existing identities retained; no other target |
| compile/save | Owned compiled identity/version | Source persistence, native/calculation completion, owned report |
| reconnect/recovery | Explicit generation/state adoption | Generation CAS, exact IDs, quiescence, invalidated old proofs |

Native work can outlive timeouts, failed progress reads or process termination.
Uncertain work retains a scoped journal and incomplete result. Recorded panes limit
recovery; whole-layout effects retain broader checks. Ordinary indicator status
0/1 alone is not proof of pending strategy calculation. Reachable CDP plus absent
target yields RECOVERY_TARGET_LOST; unreachable CDP yields WORKSPACE_DISCONNECTED.
Exact lost-target discard archives the unknown outcome.

Unknown legacy journals fence app effects; recorded targets also fence matching
workspaces. Other resources continue. Dead holders with incomplete native work
identify exact protected tokens. PID/start checks run outside metadata transactions;
unverifiable owners stay protected. Cancel/release cannot remove another token.

Reports require source identity, current inputs/context, native calculation and
report verification. `unchanged:true, compile_performed:false` succeeds only for
already verified current state. An epoch can acknowledge a later recalculation
without recompiling identical source. Strategy outputs carry revision and
calculation_pending; ledger pagination must pass a constant revision. Failed
sources, foreign inputs, incomplete reads and reconnects cannot inherit metrics.
Data samples reject concurrent changes; wait can observe acknowledged transitions.

Private persistent storage uses LOCALAPPDATA/XDG state, with TV_STATE_DIR override.
Public handles contain no source/owner credentials. Released schema-1/2 imports
preserve artifacts and invalidate old proofs. Foreign modified drafts remain
protected. Saved-resource restoration does not guarantee arbitrary unsaved GUI
draft recovery after app/tab loss.

There is no daemon. Cancel/stop ends that invocation, preserving Desktop/resources.
Streams check ownership each tick and stop on loss. UI/CDP screenshots require a
selected nonzero viewport; restore a minimized window without restarting it.
Editor initialization reports PINE_VIEWPORT_UNAVAILABLE immediately for zero viewport.

Tests cover real CLI/HTTP contracts, page guards, FIFO/cancel/lifetime, legacy
fences/migration and native/report faults. Live evidence separately records SHA,
dirty state, targets and timestamps. See [workspaces.md](workspaces.md) for commands.

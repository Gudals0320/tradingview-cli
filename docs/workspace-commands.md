# Execution and ownership contracts

Discover exact commands from `tv help --json COMMAND`. Catalog version 2 is built
from registered adapters/policy; generated catalog output must not be committed.
Policy coverage tests classify every adapter exactly once.

| Scope | Commands | Selection/ownership |
|---|---|---|
| Preparation | status, layout list/create/open, tab list, pine list, workspace create/select | Available before selection; native layout/tab creation takes app and endpoint journal ownership |
| Workspace | chart/state/info/quote/OHLCV/values, data, draw, indicator, pane, Pine, replay, stream, discover/ui-state, workspace wait | Named selection required; mutation owns layout/chart and document when compiling/saving; pure reads/streams observe |
| App/account shared | alert, watchlist, ui, tab new/close/switch, layout switch, launch | Alert/watchlist/UI/tab close/switch require a workspace target; shared changes own app plus affected resources; UI requires selected target |
| Offline/diagnostic | help/update/search, pine analyze/check, session status/recover/discard, workspace list/import/show/inventory/status/interrupt/abandon/locks/lock-clear/gate-status/gate-clear | Inventory/recovery/target-lost discard still contact CDP; recovery owns its operation |
| Workspace management | init/rebind/recover/release/reconnect/attach/detach/pine-prepare | Exact resource, token, generation and operation checks; Pine preparation owns app/layout/workspace and checks document reservations |

`workspace_required`, `locks` and `foreground` publish selection, resource kinds
and tab-selection requirements. Mixed reads depend on arguments. `endpoint_lease`
now describes only the remaining shared native/session lease: workspace mutations
use resource ownership even when it is false. Screenshot foreground depends on
method (selected nonzero viewport for CDP, owned chart for API).

Pine new/open and bound layout switch reject resource replacement. Attach a
dedicated document or open/select another workspace. `stream ohlcv` reads prepared
owned panes only. These restrictions prevent active-tab fallback and form the
migration contract. See [workspaces.md](workspaces.md) for the full workflow.

`strategy properties` is a pure observation. `strategy set-properties` owns
layout/workspace/document and applies a prevalidated complete typed patch via
native inputs, then verifies readback and recalculation. Strategy Properties
cannot be changed through the untyped indicator input interface.

# Pine phases, permits and evidence

Native request completion, calculation completion, report freshness and saved
source persistence are independent checks. The CLI must prove the checks required
by its command before returning success.

After attempted native dispatch, ordinary getter/progress errors and closed
transports retain the recovery fence until native termination is proved. The
error class alone cannot establish cancellation. Exact-token undispatched
compile observers can be canceled safely; unreadable or replaced state remains
unknown. Save dispatch is likewise considered attempted before awaiting CDP.

Multi-feed layout expansion aborts on unknown outcomes, including deadlines.
Fallback requires an explicit LAYOUT_CAPACITY_UNAVAILABLE error with
native_terminal:true and no recovery_required flag. The production adapter does
not infer that proof from error text; unclassified native rejection stays fenced.
Layout/symbol/resolution promises have page-local registry tokens. Read-back must
find every mutated target and readable, idle panes before clearing the journal.

Session recovery checks every recorded target, its registry/save/compile flags,
and every active or inactive pane's loading/calculation state. Missing targets,
recorded panes or unreadable state produce NATIVE_BUSY and preserve the journal.
All recorded chart targets must remain inspectable for this recovery path;
vanished targets are not silently treated as settled. Stable rebind also compares
the entire pane collection. Recovery acknowledges unknown outcome, not restoration.

CDP connection deadlines cover HTTP discovery/protocol and WebSocket upgrade.
Owned requests are aborted and an incomplete handshake's socket is reset and
terminated. This uses chrome-remote-interface's internal Chrome constructor and
ws transport fields; real loopback integration tests guard that dependency
boundary, including a peer that never drains or upgrades its socket. Connected
native request deadlines still do not cancel page actions.

| Phase | Entry | Exit / verification | Failure and ownership |
|---|---|---|---|
| Validate | Parsed arguments, expected document, unique target | All inputs accepted before native dispatch | No native fence; no partial input update |
| Observe | Subscribe to requests/calculation with operation token | Observer installed, old report/input identity retained | Pre-dispatch exceptions terminate only this observer |
| Dispatch | Actual native mutation on identified target | Native action promise settles | Journal/fence written here, never at command entry |
| Pending native | Promise / pendingRequests active | Matching actionDone and empty pending requests | Timeout/CLI exit preserves fence; duplicate dispatch refused |
| Pending calculation | Source/input identity changed | Exact owned study/version and ready status | No old report accepted merely because polling elapsed |
| Report verification | Complete report and provenance available | Current source hash, inputs, context, target, native freshness | Report pending/unverified is distinct from empty trades |
| Persistence verification | Save settled, clean document identity | Non-draft identity and server source match | saved:null if unknown; saved:false only on demonstrated failure |
| Commit | Guards and required postconditions pass | Operation result committed, own lease released | Cleanup warnings do not mask primary error or contradict output |
| Recovery | Exact interrupted operation/run ID | Native/calculation quiescence checked; generation/resources valid | Never clears busy solely on deadline, age or abandonment |

The strategy observer supports legitimate fast native updates and same-source
refresh. It does not impose an unobserved-cycle requirement on every successful
compile. GUI input changes during native schema replacement cannot always be
distinguished; GUI edits to reserved resources are outside the execution contract.

| Workspace command / phase | Permitted user-state change | Additional requirement |
|---|---|---|
| Pure observation | None | Observe guard uses local baseline/permit copies; stability checked before/after |
| pine set | Exact requested canonical source | Document, chart and unrelated studies remain fixed |
| symbol/timeframe/type set | Exact requested context (evidenced aliases allowed) | Integer/type validation and readiness |
| indicator set | Exact known input keys/values on owned study | Clone overrides after old baseline snapshot; unknown keys fail atomically |
| compile | Owned study compiled identity/schema/version | Existing owned ID preserved; exactly one owned study at final completion |
| save | Owned saved document version / native retranslation | Ordinary inputs preserved; source persistence verified; draft distinguished |
| release/rebind/recover | Metadata and explicitly acknowledged generation/document restore | Idle native state; exact operation/identity; foreign drafts never discarded |

Pure reads of a busy workspace do not take or consume its operation lease. A
changing source/context/input snapshot causes WORKSPACE_OBSERVATION_CHANGED;
pending report reads fail safely. Shell/navigation/shared commands are excluded.

## Private storage and migration

Schema-2 public handles contain schema, workspace ID, endpoint hash and original
handle path only. Owner credentials, document/source snapshots and new journals
reside under the same user's TEMP/tradingview-cli-sessions/private-workspaces.
POSIX directories use 0700 and files 0600. Windows explicitly removes inherited
directory access and grants the executing user, SYSTEM and local administrators;
the Windows regression reads the resulting ACL and checks these principals.
This is access control, not encryption or protection against that user/admins.

Use a *.tvws.json handle name (ignored by the repository). Source needed for draft
recovery is retained. Schema-1 reads/status remain read-only; the next authorized
operation migrates source and token into the private store before replacing the
public handle. Interrupted legacy journals remain readable at their recorded
path, and all new journals/results go to the private store. Preserve old private
evidence; do not publish it or assume a hash can restore a draft.

## Evidence retention

Retain raw failed and successful trials in ignored results/ or a private external
archive. Commit reusable fixtures/harnesses plus concise sanitized summaries and
hashes. Never commit tokens, account data, personal source or document/target IDs.
Historical qa/ evidence stays in existing Git history; this task does not rewrite
history. .rgignore hides large raw evidence from ordinary code search. New raw
evidence does not go into qa/. Natural live, live injection and offline VM/adapter
claims must remain separately labeled.

Phase and permit regression coverage: pine_compile, pine_lifecycle, pine_outcome,
pine_targets, strategy_state, workspace-page, workspace-runtime, lifetime and
workspace-privacy tests. The dedicated Desktop smoke supplies native compatibility
checks and protected-state hashes on the current build.


## Legacy artifact cleanup after migration

Migration deliberately keeps interrupted journal paths intact and restricts the
old .tv-workspaces/WORKSPACE_ID directory as well as the new private store. Source
bytes are not deleted during a recovery transaction. After successful recovery
and release, archive that exact old directory into a private recovery location,
verify the archive contents/hashes, and remove the old copy only after verification.
Never run a blanket delete of .tv-workspaces or add its contents to Git. The original
handle path and workspace ID identify the exact directory. This task preserved
preexisting ignored results/i22 evidence and did not move or delete it.

The layout service contract is based on local inspection of Desktop 3.4.1 only:
public loadChartFromServer awaits the page-local load service, which awaits the
warning decision, backend load and layout-state load. The complete saved-chart
object is required; chart.id is the numeric record ID, chart.url is the visible
layout UID. No proprietary service source or private saved-chart records are
published. Promise completion is paired with stable identity/readiness; rejection
is an ended action but still needs stable original/requested state. A captured
Cancel can prove cancellation, whereas disappearance/accept cannot.

Desktop 3.4.1's public loadChartFromServer awaits the complete service chain but
does not return its boolean result: a real Korean Cancel fulfilled with undefined.
On that verified path only, cancellation requires a captured Cancel on the exact
operation's scoped dialog, a fulfilled false/undefined outcome, stable original
UID, no loading/visible dialog and no outstanding tracked native work. Undefined
without that captured action, any other non-boolean, or an accepted dialog with
the original UID remains LAYOUT_UNVERIFIED. A false outcome with no captured
dialog decision can prove not_switched. Unknown/void implementations retain the
strict terminal-signal fence. No private service interception is performed.

A cap-one registry entry is extended across the underlying layout promise (or
unknown API terminal watcher), not nested. Watchers retain a bounded amount of
state and remove themselves on terminal outcome. Grace expiration exposes
LAYOUT_UNVERIFIED; it never retires the fence. Explicit generation recovery uses
CDP loaderId and repeated chart/controller/layout identity checks for the verified
page-local path. Unknown external callback paths remain unsupported/fenced.

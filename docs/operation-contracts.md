# Pine phases, permits and evidence

Native request completion, calculation completion, report freshness and saved
source persistence are independent checks. The CLI must prove the checks required
by its command before returning success.

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

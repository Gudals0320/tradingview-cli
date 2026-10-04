# Error codes and next actions

Inspect the affected resource/preserved result before retrying a mutation. These
codes never authorize reload, killing Desktop, deleting live ownership or replaying
an unknown native operation.

| Code | Next action |
|---|---|
| WORKSPACE_REQUIRED | Prepare saved layout/workspace; pass a name or select through the module. |
| SELECTION_REQUIRES_MODULE | Import TradingViewCli.psm1; a child cannot select its parent. Explicit names need no module. |
| MODULE_CLI_VERSION_MISMATCH | Update CLI and re-import its matching module. |
| WORKSPACE_NOT_FOUND / WORKSPACE_REFERENCE_AMBIGUOUS | Read list; use an unambiguous name/absolute legacy handle. |
| WORKSPACE_TARGET_MISMATCH / WORKSPACE_SELECTION_MISMATCH | Remove old target overrides and reselect matching workspace/layout. |
| WORKSPACE_CONFLICT / WORKSPACE_LAYOUT_SHARED | Use dedicated layouts/documents/targets or explicit copies. |
| WORKSPACE_PINE_REQUIRED / WORKSPACE_SAVED_DOCUMENT_REQUIRED | Mount/attach a dedicated saved document. Drafts are not saved ownership. |
| WORKSPACE_DISCONNECTED | Restore CDP, retaining binding. Exit2 does not prove target termination or authorize reset. |
| WORKSPACE_TARGET_LOST | Reachable CDP proved absence: follow named `workspace show` commands to explicitly open/reconnect the saved layout, or confirm exact reset to preserve artifacts and stop restoration. A release preflight failure creates no interrupted operation. |
| WATCHLIST_SELECTOR_REQUIRED / WATCHLIST_NOT_FOUND / WATCHLIST_AMBIGUOUS | Supply one exact list ID or unique exact name to `watchlist raw`; it never selects/changes the displayed list. |
| NATIVE_BUSY | `target_state:running` reports observable pending work; `unreadable` reports missing/unknown source or page signals. Keep the journal and wait/inspect; neither proves completion. |
| NATIVE_BUSY / auxiliary_unknown | `target_state:unknown` reports auxiliary-only unknown status. Wait, retry exact recover, then inspect those sources in Desktop. If all other native signals remain idle and the human explicitly accepts abandoning restoration, pass the current `unknown_hash` as `session recover --acknowledge-unknown HASH --run-id EXACT_RUN`. Three stable probes and exact journal hash are required; the journal is archived unchanged and outcome remains unknown. Pine-unknown, running, unreadable, disconnected or changed sets cannot use this path. Never automatically acknowledge. |
| NATIVE_BUSY / Pine unknown | Unknown Pine status may still represent calculation, so auxiliary acknowledgement cannot release it. Ask the human to inspect/resolve that exact source in Desktop, then retry recorded recovery after readable terminal status. If the exact page is explicitly closed by the human, use proven-target-lost archival with confirmation; no operation completion or external effect is inferred. Never auto-remove an unrelated study or close/reload a user tab. |
| PINE_SOURCE_UNSUPPORTED_BOM | Remove the leading BOM and retry. Rejected before editor write/admission; source and report state remain unchanged. |
| PINE_SOURCE_MISMATCH / WORKSPACE_EXTERNAL_CHANGE after setter | EOL-independent content differed after a real editor effect. Preserve the interrupted journal and inspect actual source; exact recover/rebind can explicitly adopt verified dedicated-resource state. Never overwrite a foreign draft to force recovery. |
| RECOVERY_TARGET_LOST | Only reachable inventory proves recorded targets absent. Exact `session discard --target-lost --run-id` requires confirmation and archives the journal unchanged; outcome remains unknown, including server-side save/alert effects. Inspect account resources before retrying. |
| WORKSPACE_GENERATION_CHANGED | Inspect show; acknowledge exact generation with reconnect/rebind, re-read IDs and compile. |
| WORKSPACE_EXTERNAL_CHANGE | Inspect source/context/inputs; explicitly acknowledge intended changes without overwriting foreign drafts. |
| WORKSPACE_OBSERVATION_CHANGED | Retry after the operation settles; discard the changing sample. |
| WORKSPACE_BUSY / WORKSPACE_PAGE_BUSY / WORKSPACE_OWNER_DEAD | Inspect exact owner/operation. Wait for live owner; mark/reconcile a proven-dead operation. |
| WORKSPACE_OWNER_DEAD during observation | All Desktop observations (including wait and four data reports) preserve the unreconciled operation and reject adoption before/after awaited reads. Follow exact named interrupt → native settlement/recover → locks → exact dead-token repair hints. No automatic interrupt or lease deletion. Unknown PID/liveness is never classified dead. Offline workspace show remains available. |
| WORKSPACE_OBSERVATION_CHANGED | Resource generation or operation identity changed during the read. Retry after settlement. Only exact committed completion of the initially observed operation can be adopted without a new attempt. |
| WORKSPACE_TAB_NOT_OWNED / legacy_ownership_unverified | 2.1-and-earlier boolean/created-layout records do not prove fresh landing/browser lifecycle. Release preserves the tab; save drafts and close manually if intended, then reset/reopen a fresh dedicated CLI tab. Never discard a foreign draft or claim a GUI/reused-landing tab. |
| WORKSPACE_RECOVERY_REQUIRED / WORKSPACE_OPERATION_MISMATCH | Use exact interrupted operation; never clear another operation. |
| WORKSPACE_OWNERSHIP_LOST / OWNERSHIP_UNREADABLE | Preserve private store/handle/artifacts; do not edit credentials or infer empty ownership. |
| FOREGROUND_REQUIRED | Select owned tab for UI/CDP capture; background API reads remain pinned. |
| DESKTOP_VIEWPORT_UNAVAILABLE / PINE_VIEWPORT_UNAVAILABLE | Restore the existing window; never restart/reload to bypass. |
| PINE_EDITOR_REQUIRED / WATCHLIST_PANEL_REQUIRED | Open required panel on owned target and retry its supported operation. |
| LOCK_TIMEOUT / LOCK_QUEUE_FULL | Read locks/owner details; wait/cancel or adjust bounded timeout. Capacity64. |
| LOCK_CANCELLED | Ticket cancelled; inspect state before a fresh operation. |
| LOCK_HOLDER_DEAD | Reconcile incomplete native operation, then clear exact dead token if still present. |
| LOCK_RELEASE_FAILED | Native work may be completed: read details.completed_result/result_committed and preserved result; repair ownership instead of replaying. |
| LOCK_TOKEN_MISMATCH / GATE_TOKEN_MISMATCH | Re-read exact proven-dead token; live/unverifiable owners cannot be cleared. |
| ADMISSION_BUSY | Short metadata contention did not clear; inspect gate/owner and wait. |
| ADMISSION_PERMISSION / PRIVATE_STORE_ACL | Inspect state directory owner/permissions as the same OS user. Denial is not occupancy. |
| LEGACY_CLI_ACTIVE | Wait for/update old CLI; mirrors protect modern reservations. |
| LEGACY_WORKSPACE_RESERVED | Release original reservation with old CLI before importing. |
| LEGACY_RECOVERY_REQUIRED | Read legacy diagnostics; reconcile exact old journal with --legacy-state. Its targets/app effects alone are fenced. |
| LEGACY_BRIDGE_WRITE_FAILED | Metadata committed but projection failed: inspect/synchronize/recover exact workspace before native retry. |
| SESSION_BUSY | Another legacy/shared owner is active. Wait/stop that invocation; no force-clear. |
| RECOVERY_REQUIRED | Inspect session status and reconcile exact run/journal; allowed reads remain available. |
| RECOVERY_TARGET_LOST | Reachable CDP proved targets absent; exact discard archives incomplete outcomes without claiming restoration. |
| RECOVERY_TARGET_UNCONFIRMED | No chart pages are inspectable; wait for Desktop startup and re-read inventory rather than inferring termination. |
| SAVE_REQUIRED | Save owned document or explicitly compile --save; unsaved source is not an applied report. |
| PINE_COMPILE_ERROR | Fix diagnostic locations and compile requested source. |
| REPORT_UNVERIFIED / REPORT_INVALIDATED | Compile owned source or perform verified input change; never adopt prior metrics. |
| REPORT_PENDING / REPORT_TIMEOUT / STRATEGY_CALCULATION_PENDING | Wait for existing calculation; normal waiting does not imply cancellation/manual recovery. |
| REPORT_CHANGED | Discard pages and restart offset0 with new revision. |
| STUDY_NOT_FOUND / WORKSPACE_STUDY_MISMATCH | Read current owned IDs; IDs do not survive reconnect. |
| STUDY_NOT_FOUND for strategy-id | Requested ID is absent (including removed/another-page ID), even if calculation is pending. Re-read the safe owned current_strategy_id using the exact state/wait hint; no fallback to another strategy. A same-page nonowned strategy yields WORKSPACE_STUDY_MISMATCH. |
| REPORT_AMBIGUOUS | More than one matching strategy; select the owned current ID rather than waiting. Runtime errors remain distinct even when the report is incomplete. |
| LAYOUT_UNVERIFIED / WORKSPACE_LAYOUT_UNVERIFIED | Inspect owned layout and preserve uncertain records before changes. |
| LAYOUT_LIST_FAILED / LAYOUT_LIST_TIMEOUT / LAYOUT_LIST_MALFORMED | Saved-layout lookup failed; no empty-list success or open dispatch is inferred. Retry only after resolving the cause. |
| LAYOUT_IDENTITY_MISMATCH | Opened URL differs from the requested saved ID. Inspect the reported new target; preserve it and do not assume the requested layout opened. |
| CDP_TIMEOUT | Native work was not cancelled. Inspect status; mutation journals need reconciliation, pure reads may retry without fabricating recovery. |
| LEGACY_BATCH_REMOVED | Use workspace-batch.mjs with names; reconcile old journals through migration route. |

Stream diagnostics accompany JSONL. Windows PowerShell5 can wrap native stderr in
NativeCommandError under `2>&1`; capture stdout/stderr separately and check LASTEXITCODE.

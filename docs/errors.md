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
| WORKSPACE_OBSERVATION_CHANGED | Reports saw a resource/generation or unrelated operation identity change; retry after settlement. Wait follows healthy FIFO transitions by discarding/re-observing samples, while dead/interrupted or resource/generation changes remain errors. |
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
| PINE_PREPARATION_INPUT | Choose create or exact-ID open, stable request ID and current generation; invalid input causes no Desktop mutation. |
| PINE_REQUEST_CONFLICT | This request ID describes other contents. Inspect its private intent and use a different request ID for new contents. |
| PINE_DOCUMENT_NAME_EXISTS | Existing exact name is not adopted by create. Select its exact saved ID explicitly. |
| PINE_CREATION_UNKNOWN | Preserve candidates and resume the same request; never blindly resend creation or infer ownership by name alone. |
| PINE_CREATION_REJECTED | Observed native pre-dispatch rejection plus no new candidate. Resolve the plan condition, then retry the same request. |
| PINE_FOREIGN_DRAFT | Modified editor remains unchanged. Save or decide its disposition yourself before preparation. |
| PINE_DOCUMENT_NOT_FOUND | Exact saved ID is absent; inspect the saved list without guessing a name match. |
| PINE_DOCUMENT_CHANGED / PINE_PERSISTENCE_UNVERIFIED / PINE_OPEN_UNVERIFIED | Saved source or mounted identity/version/source differs. Preserve artifacts, inspect the recorded stages and reconcile the exact operation if interrupted. |
| PINE_OPEN_UNSUPPORTED / WORKSPACE_PINE_OPEN_UNSUPPORTED | Exact-version native controller is unavailable. No fallback new/blank document is opened. |
| PINE_OPEN_FAILED | Native exact open failed; editor_changed and current_identity report observed side effects. |
| PINE_OPEN_BUSY | Native exact open was not admitted during another open transition. Wait for the editor to settle, then resume the same request; no new document is created. |
| PINE_EDITOR_SETTLE_TIMEOUT | Initial mount/restore exceeded its finite wait. No document create/open was dispatched. Wait/inspect, then resume the same request. |
| WORKSPACE_PINE_ALREADY_BOUND | Detach explicitly before preparing a different document; bound resource replacement is not implicit. |
| INVALID_STRATEGY_PROPERTIES | Entire patch is rejected before dispatch for unknown fields, types, units, enum options or bounds. |
| STRATEGY_PROPERTY_UNSUPPORTED | No verified native mapping/setter exists; use an explicit Pine source setting, never implicit replacement. |
| STRATEGY_PROPERTY_COMMAND_REQUIRED | indicator set cannot bypass typed Properties validation; use strategy set-properties. |
| STRATEGY_PROPERTIES_APPLY_FAILED | Inspect requested versus actual values; native setter atomicity is not guaranteed. Reconcile any exact interrupted workspace before replay. |
| STRATEGY_PROPERTIES_CHANGED | Complete actual readback differs from requested state. Preserve it; inspect external/partial changes instead of adopting a report. |
| STRATEGY_PROPERTIES_REPORT_FAILED | Values may be applied but the matching calculation failed. Inspect actual values and native diagnostics. |
| STRATEGY_PROPERTIES_TIMEOUT | Finite wait expired after dispatch; not cancellation. Inspect/wait for native completion before another change. |
| INVALID_DEEP_PERIOD / INVALID_DEEP_REQUEST | Invalid explicit period/precision/timezone/request ID; no native dispatch. |
| DEEP_TIMEZONE_UNSUPPORTED | Only native calculation UTC/Etc/UTC is verified; explicit other zones are refused before dispatch. ISO input offsets still normalize to UTC instants. |
| DEEP_SOURCE_UNVERIFIED / DEEP_KERNEL_UNVERIFIED | Current saved/applied/compiled/full-input proof or native payload mapping is missing; compile and inspect the exact owned strategy. |
| DEEP_NATIVE_PATH_UNAVAILABLE | Native report provider/decoder/monitor shape is unsupported; reads never mount or create it. |
| DEEP_CONTEXT_UNVERIFIED | Native extended symbol/session/currency or resolution differs from the owned main series; no history frame is sent. |
| DEEP_NOT_DISPATCHED | Exact terminal/disconnected preparation has unchanged request counter and no history send attempt; its preserved intent can be recorded as known rejection without replay. |
| DEEP_TRANSPORT_UNCONFIRMED | Native transport was invoked but frame admission/completion is unknown; preserve intent, never assume the manager's void return proves dispatch. |
| DEEP_NATIVE_JOB_PENDING / DEEP_RUN_PENDING / WORKSPACE_DEEP_JOB_PENDING | Inspect/wait for exact native work, including GUI jobs; no implicit disconnect, cancellation or overlapping mutation. |
| DEEP_RUN_UNKNOWN / DEEP_RUN_UNSETTLED | Preserve persistent intent after response/page/owner loss; do not resend or discard uncertain work. |
| DEEP_RUN_SUPERSEDED | Later GUI/native work owns the visible state; no reset/result adoption. Waiting does not repair this. Finish GUI work or explicitly retire only the preserved private record with workspace backtest-archive and exact IDs. |
| DEEP_ARCHIVE_CONFIRMATION_REQUIRED / DEEP_ARCHIVE_ID_MISMATCH | Explicit exact request/run IDs and --acknowledge-no-adoption are required; wrong/missing values leave the record unchanged. |
| DEEP_ARCHIVE_OUTCOME_UNKNOWN | Genuine pending/unknown outcome cannot be archived. Obtain exact superseded/settled evidence first; original record bytes and GUI/native work remain untouched. |
| DEEP_RUN_ARCHIVED | The original request evidence remains preserved without adoption; use a new request ID after current native/GUI work is idle. |
| DEEP_REQUEST_CONFLICT | Stable request ID describes different source/full inputs/context/settings/period; use an explicit new request after old work settles. |
| DEEP_RESULT_STALE / DEEP_REQUEST_CHANGED / DEEP_RESULT_GENERATION_CHANGED | Current source or native run/provider identity changed; no stale result adoption. |
| DEEP_REPORT_PENDING / DEEP_REPORT_UNVERIFIED | Native report is pending or its exact decoded response cycle cannot be proved; no chart/old-report fallback. |
| DEEP_SERVER_ERROR | Exact native server rejection is separate from an unknown transport outcome; inspect its request and observed error. |
| DEEP_WAIT_TIMEOUT | Original finite wait expired; server work was not cancelled. |
| DEEP_PERIOD_MISMATCH | Native trades fall outside requested absolute bounds; metrics/ledger are refused and the actual native window is reported. |
| DEEP_PERIOD_UNVERIFIED | Native decoded window or applicable trade timestamps are missing; no vacuous coverage proof or legacy timestamp-unit guessing. |
| PINE_COMPILE_ERROR | Fix diagnostic locations and compile requested source. |
| REPORT_UNVERIFIED / REPORT_INVALIDATED | Compile owned source or perform verified input change; never adopt prior metrics. |
| REPORT_PENDING / REPORT_TIMEOUT / STRATEGY_CALCULATION_PENDING | Wait for existing calculation; normal waiting does not imply cancellation/manual recovery. |
| REPORT_CHANGED | Discard pages and restart offset0 with new revision. |
| EQUITY_UNAVAILABLE | Select an explicit verified native strategy.equity plot; untyped arrays, buy-and-hold and closed cumulative PnL are not substitutes. |
| EQUITY_SOURCE_UNVERIFIED / EQUITY_PLOT_UNVERIFIED | Saved/applied/full-input proof or direct expression/native mapping is missing. Inspect --list-plots and explicitly compile the owned source. |
| EQUITY_DATA_INCOMPLETE / EQUITY_SEMANTICS_UNVERIFIED | Rows or currency/quantity/point-value/commission/checkpoint audit are incomplete; no points are adopted or interpolated. |
| EQUITY_DEEP_UNSUPPORTED | No verified native Deep per-bar plot path; no normal fallback. |
| EQUITY_EXPORT_EXISTS / EQUITY_EXPORT_WRITE_FAILED / EQUITY_EXPORT_UNVERIFIED | Choose a new destination. Export follows final ownership validation and reports partial-file possibility on I/O failure. |
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

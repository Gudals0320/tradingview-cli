# Named workspaces

Version 2 uses saved layout → named workspace → execution. Chart commands require
`--workspace NAME` or the calling PowerShell process's `TV_WORKSPACE` selection.
There is no active-tab fallback or global active-workspace setting.

## 2.2 observation admission and tab ownership

All Desktop observations reject a recorded operation whose owner is proven dead, before and after awaited page reads. `WORKSPACE_OWNER_DEAD` preserves journals and supplies exact named interrupt/recover/lock inspection/repair actions; no observation silently reconciles native work. Unknown process identity is treated conservatively as alive/unverifiable. Living-owner observations and independent-workspace work remain available without broad read mutation locks. Reports pin the initial operation identity and accept disappearance only when its exact result is committed. `workspace wait` deliberately follows healthy FIFO operation/queue transitions, discards transition samples, and re-observes until admitted work settles; its original timeout remains bounded. Dead/interrupted owners or resource/generation changes still fail immediately. Offline `workspace show` remains a diagnosis route.

An explicit missing/removed/other-page strategy ID is `STUDY_NOT_FOUND`, even while the current study calculates. A same-page nonowned strategy is `WORKSPACE_STUDY_MISMATCH`; hints expose only the owned current ID. Refresh IDs with state/wait, not retries of the old ID. Actual present-but-calculating studies remain `REPORT_PENDING`, ambiguous selection is `REPORT_AMBIGUOUS`, and runtime error is distinct from incomplete reports/zero trades.

Saved layout creation and tab ownership are separate. Create/open records exact target+browser lifecycle only after a fresh landing, actual new-tab button, unique native shell transition, absent pre-call CDP target and verified saved ID. Desktop 3.4.1 create replaces its new placeholder shell tab; that is accepted only when every old tab remains and one exact new shell tab replaces the fresh placeholder. Reused landing, existing GUI tabs, mismatches and unverified outcomes never receive close proof. Reconnect/attach recheck the new exact target, so a GUI reopen does not inherit an old CLI boolean.

Compatibility policy: pre-2.2 boolean-only ownership and the old created-layout ledger are not promoted because they cannot prove landing/browser lifecycle. `WORKSPACE_TAB_NOT_OWNED` with `legacy_ownership_unverified` offers exact release (tab/artifact preservation). Save drafts and manually close the intended tab if desired, or release/reset and open a fresh dedicated CLI tab. The CLI never automatically discards the unsaved dialog or a foreign draft.

## Prepare and select

Chart-only document preparation is explicit and separate from `pine new/open`.
Use the current generation and a stable request ID. `--mount` explicitly opens
the editor; a missing editor without it, foreign modified draft, another
workspace's document reservation, or stale generation refuses before replacing
or saving a document. An unmodified saved editor document may be switched and
its ID is reported as previous_document. Document creation never grants tab-close
ownership. New documents use the native no-overwrite save API, then exact remote
ID/version/source verification, exact version open, and attachment.
Open waits finitely for the native Redux result to reach Monaco; it never repeats
the native open during that wait. A mounting editor's initial saved-document
restore settles before a new document request is dispatched. Native skipped-open
admission is a busy error, not a successful open.

```powershell
tv workspace show research-a
tv workspace pine-prepare research-a --create 'Research A Strategy' --file strategy.pine --request-id research-a-document --generation EXACT_GENERATION --mount
tv workspace pine-prepare research-b --open 'USER;DOCUMENT_B' --request-id research-b-document --generation EXACT_GENERATION --mount
```

Private intent records retain the pre-call ID set, request fingerprint and stage
results. Unknown creation is never resent. Exactly one new named candidate must
also match the requested saved source hash before adoption; zero/multiple remain
unknown. A proven native pre-dispatch paywall rejection plus no candidate is
rejected_known and may safely retry the same request. Completed response-loss
retries with the old generation return current generation guidance; resume with
that generation for reused:true without a new document or calculation invalidation.
Changing a request's contents requires a new request ID. Partial attachment keeps
the exact native operation fenced until explicit recovery. Saved artifacts remain.
If native open outcome is unknown, the error provides an exact --open command
with a new request ID for the already verified saved document. Inspect/wait and
recover any interrupted native operation first. This explicit path creates no
second document and never implicitly replays the uncertain open.
Create cannot lock a not-yet-known document ID: app/layout/workspace locks plus
the final atomic reservation check protect that phase. Exact-ID open additionally
takes its document lock. Legacy `pine open` now refuses a modified draft and uses
the checked exact-version native method, avoiding silent new/blank fallback.

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

`layout open`은 정확한 저장 ID를 끝까지 유지하며 열린 URL ID를 검증합니다. 이름을 사용하면 정확히 일치하는 유일한 이름만 허용합니다. `new`/`NEW`도 저장 이름으로 열 수 있고 생성은 `layout create`로 지정합니다. 목록 조회 실패는 빈 목록으로 취급하지 않습니다.

FIFO 대기한 `quote`의 복원 종목은 잠금 획득 후 page guard가 확인한 실행 baseline에서 정합니다. 이전 CLI 종목 변경을 외부 편집으로 오인하지 않으며 실제 외부 변경/복원 실패 검사는 유지합니다.

`pine set`은 LF/CRLF/단독 CR/혼합 줄바꿈을 LF로 정규화해 전체 본문을 엄격 비교합니다. 공백·들여쓰기·마지막 개행은 보존하며, 실제 변경은 기존 전략 결과를 무효화합니다. Monaco가 제거하는 leading BOM은 `PINE_SOURCE_UNSUPPORTED_BOM`으로 쓰기 전에 거부합니다. 비교 불일치는 `PINE_SOURCE_MISMATCH`와 적용/무효화 여부를 보고합니다.

wait/compile/strategy/trades/ledger의 내부 input `text`는 CLI 출력에서 `{id,omitted,length,sha256}`로 요약합니다. 입력 원본은 compiled identity/fingerprint/revision/최신성 검증에 그대로 사용하며 사용자 input은 길이에 관계없이 보존합니다. 공개 raw 옵션은 제공하지 않습니다.

`stream ohlcv`는 요청 feed마다 `status:ok/loading/error`를 냅니다. 모든 feed가 정상일 때만 상단 `success:true`; 일부 정상은 `partial_success:true`로 정상 feed의 가격을 유지합니다. 실패 feed에는 code와 feed 식별자만 있고 OHLCV는 없습니다. `DATA_NOT_READY`, `DATA_FEED_ERROR`, `FEED_IDENTITY_MISMATCH`, `FEED_STATE_UNREADABLE`, `WORKSPACE_FEED_MISSING/AMBIGUOUS`는 다음 poll에서 재관찰하며 상태 변화도 dedupe에서 보존합니다. 요청하지 않은 활성 pane의 loading은 정상 보조 feed를 차단하지 않습니다. SIGINT/SIGTERM 정상 종료는 exit 0이며 feed 실패 프레임 자체는 프로세스를 종료하지 않습니다; ownership/transport 실패는 stream을 종료하고 exit 1/2 오류를 반환합니다. stderr의 lifecycle/sample 오류도 JSONL입니다.

`watchlist raw --list-id ID` 또는 `--list-name NAME`은 표시 목록을 바꾸지 않고 저장 원본 배열을 전체 읽습니다. 섹션·수식·거래소 표기·배율·순서·중복을 변형하지 않습니다. `raw_count`는 섹션을 포함한 전체 항목 수, `rendered_count`는 선택 목록이 현재 DOM에 표시될 때의 행 수이며 다른 목록/닫힌 패널은 null입니다. 기존 `watchlist get`은 표시 행의 가격값 계약을 유지합니다.

native recovery의 Pine indicator/strategy는 status 0/1을 busy, 2를 idle, 3을 terminal_error(계산 종료된 실패), 나머지/읽기 실패를 unknown으로 판정합니다. 보조 source는 이름 대신 명시적 `isLoading` 또는 완료 상태를 검사하며 unknown은 복구를 차단합니다. `source_states`는 판정 근거와 관측 status를 보이며 원문·token을 포함하지 않습니다. 대상 부재는 서버 저장/알림 결과의 완료 증명이 아니므로 discard/reset은 기록을 보존하고 결과를 unknown으로 남깁니다.

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

Owned strategy server alerts require explicit workspace names and private stable
creation records. `alert strategy-create` takes app/layout/workspace/document
resources and verifies the exact saved/applied snapshot before dispatch.
`alert strategy-get` is a pure server observation with no private outcome writes.
An unknown creation stays fenced against another creation; recovery does not
authorize replay. [Strategy alert contract](strategy-alerts.md).

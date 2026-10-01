# Open issues overhaul

## Scope and ownership

Resolve all problems in open issues [19](https://github.com/Gudals0320/tradingview-cli/issues/19), [20](https://github.com/Gudals0320/tradingview-cli/issues/20), [21](https://github.com/Gudals0320/tradingview-cli/issues/21), and [22](https://github.com/Gudals0320/tradingview-cli/issues/22), including comments and N1–N3. Do not stop at the suggested P1 subset. Unconfirmed hypotheses require investigation and an evidence-based disposition; absence of reproduction is not proof of absence.

- Baseline: `1780383fdfc5b72b2beaab08fb71b0555222817c`, latest origin/main when fetched on 2026-10-01 KST.
- Branch: `codex/open-issues-overhaul`.
- Fixed shared folder: `C:\Codex\.worktrees\tradingview-issue-comments`.
- Lead: `01a0f7a9-156c-7d80-9500-474cedfbb275`.
- Reviewer: `01a0f7aa-cb09-7af1-8ffd-2815f982bd05`, Claude Opus 5.5 / medium, read-only.
- Current Executor: `01a0f997-e5b3-7673-97ac-07a606312ed0`; sole code/Git writer after handoff, responsible through push and PR.
- Superseded Executor: `01a0f7ad-0713-7ce1-94b3-5bdf19384c67`, stopped after context-window overflow and failed remote compaction. Its intentional uncommitted work is preserved and continued by the current Executor.
- Requested Executor: GPT-6.1-Sol / high. Fast-mode controls are not exposed by the thread tool; no claim of application.
- Initial tracked/untracked Git status was clean. Existing ignored `results/i22/` contains prior reproduction code and potentially private recovery data: preserve it, do not commit it wholesale.
- Complete issue snapshots: ignored `results/issue-overhaul/issue-{19,20,21,22}.json`. Read every body and comment, especially corrected reproduction judgments in #22.

## Implementation order and completion criteria

| Group | Purpose / required output | Observable completion |
|---|---|---|
| A: input contracts | #19 input/range validation; #22 F01, H3/H4, M12, L5/L6/L9/L23 | Invalid options, positional/boolean/numeric/input keys fail before mutation; explicit range/truncation and alert condition semantics |
| B: ownership and operation lifetime | #20 all operational defects; #22 F02/F03, H1/H2/H7, L13/L14 | Streams release leases; dead owners handled under admission gate; cleanup does not contradict success or mask primary errors; bounded CDP work; timed-out native mutations remain fenced until safe recovery |
| C: preserve resources / identify targets | #22 F04/F05/F08, H5/H6, M3/M6/M8, L2/L3/L4/L17/L18 | Existing personal panes protected; explicit discard only; exact/ambiguous selection contract; verified postconditions; no late destructive callbacks or unbounded tabs/clients |
| D: trustworthy results | #19 context/provenance/filter/source proof; #22 F06/F07/F09/F10/F11, M2/M4/M5/M7/M9/M10/M11/M12, L7/L8/L10/L11/L12, N1/N2/N3 | Context and scope exposed; empty/missing/failure distinct; tables preserve cells; quote restore truthful; minute/month distinct; save unknown distinct from false; definite analysis errors justified |
| E: workspace support and privacy | #20 read access/recovery/support contracts; #22 F12/M13 | Useful safe workspace reads, owner-identifying conflicts, actionable recovery guidance, minimal public handles with private recovery retained and migration tested on Windows |
| F: maintenance / unresolved hypotheses | #21 all five sections; #22 F13/F14/F15 and remaining style items | Repeatable Desktop smoke; offline default tests discover all unit files; phase/permit contracts and tests; evidence retention policy; hygiene fixed; M1/L15/L16/L24/L25 and L20/L22 investigated with documented evidence |

Each item below needs its own disposition (implementation commit, regression evidence, live evidence where required, or justified non-defect/support-contract decision). Optional unrelated refactoring is out of scope. Do not replace a confirmed fix with documentation alone unless the original completion contract explicitly permits a support limitation and Reviewer agrees.

## Validation and delivery

- Executor first verifies local Desktop availability and safe QA resources, then implements the smallest useful path and expands coverage.
- Reuse prior QA reproduction knowledge, not prior pass claims. Prior comment reports Windows 11 / Node 24.19.0 / Desktop 3.4.1, Korean UI, 376 baseline tests; remeasure current environment.
- Prior saved QA layouts `CLI-QA-I22-A/B` and Pine indicator/strategy documents remain in the account; prior QA tabs were closed. Preserve the personal tab and all preexisting user state. Explicitly identify QA resources before mutating them.
- Do not delete real alerts, modify personal watchlists, restart Desktop, discard personal changes, or run a feed that repurposes personal panes. Use dedicated fixtures for relevant verification.
- Distinguish offline unit/VM fixtures, live fault injection, and naturally observed Desktop behavior. Record exact commands, commit, environment, failures, read-back, cleanup, and limitations.
- Test timeout continuation and recovery, forced/normal process exit, ambiguous selection, invalid arguments before side effects, compilation/report freshness, and private-handle migration.
- For performance claims establish comparison, workloads, correctness, warmup/order/repetition and exclusion rules before measurement. Retain failed trials. Do not optimize inventory caching speculatively without identity/invalidation checks.
- Keep large/raw/private evidence ignored or outside Git; commit concise summaries/manifests/hashes and reusable harnesses. Never publish owner credentials, personal Pine, account data, or raw private recovery material.
- Run focused checks per group, full offline tests/lint at integration/final candidate, and repeatable real Desktop smoke at least once. Network integration tests are separate from default unit tests.
- Request Reviewer review against explicit SHAs at design/first useful path/final candidate as appropriate. Resolve important findings by code or evidence and record agreement.
- Preserve meaningful intermediate commits. Push branch and create PR against main, attach PR to this chat. No merge or production deployment.
- Final report: completed scope, verification, limitations, cleanup, final Git status, branch/SHA/PR.

## Progress and decisions

- Lead: fetched origin, collected all four issue bodies/comments, inspected contribution rules/router/policy, created branch; no implementation changes yet.
- #22 comment corrections take precedence over speculative original claims: Korean H6 is false success rather than observed automatic discard; actual owner token is `workspace.token`; M1/L15/L24 not reproduced; do not blindly force calculation-cycle observation or convert all input types.
- Native timeout is not cancellation. Do not clear busy/fencing merely because the CLI timed out.
- Lead hands off sole write ownership after this planning commit and stops continuous polling once Executor confirms start; Executor coordinates directly with Reviewer and reports material scope/design questions and final delivery to Lead.

## Item ledger

Candidate dispositions below are reconciled against implementation, regression suites and retained evidence. Final validation and Reviewer agreement are recorded below; investigation is not proof of absence.
- [x] #19/1: 모르는 옵션과 남는 위치 인자를 조용히 무시함 — fixed+test (arguments.test.js)
- [x] #19/2: 데이터 조회 결과에 대상(context)이 없음 — fixed+test: same-turn context/target capture; data-contracts and extraction tests; live pure-read hashes.
- [x] #19/3: 범위를 조용히 보정하거나 잘라냄 — fixed+test: integer limits, requested/applied/clamped range and explicit truncation; arguments/chart_history/extraction tests.
- [x] #19/4: 필터와 일치하는 대상이 없어도 빈 성공을 반환함 — fixed+test: STUDY_NOT_FOUND differs from matching empty graphics; data-contracts tests.
- [x] #19/5: legacy Pine 컴파일 결과에 소스와 문서 증명이 없음 — fixed+test+live: source_hash and --expect-script-id; pine_lifecycle and QA legacy compile/save checks.
- [x] #20/1: workspace가 하나라도 예약되어 있으면 데이터 수집이 전면 차단됨 — fixed+test: invocation-specific observation allowlist; busy workspace observation leaves owner/permits byte-identical; command-policy/workspace-runtime tests.
- [x] #20/2: 장기 실행 legacy 명령이 lease를 계속 쥐고 있어 다른 명령이 모두 실패함 — fixed+test+live; exclusive legacy-stream endpoint contract accepted by Reviewer; signal cleanup and OS hard-kill fixtures, owner diagnostics.
- [x] #20/3: workspace 복구와 운영 절차의 부담 — fixed+test: exact recovery commands, blockers, no timeout cancellation, schema migration; session/workspace-runtime tests and operation contracts.
- [x] #20/4: workspace 경로의 세부 결함 — fixed+test: TTY preflight, admission rollback, cleanup warnings after primary result; workspace-runtime/session tests.
- [x] #20/5: #2에서 이관한 남은 한계 — support contracts: same user/TEMP, conservative PID reuse, prohibited GUI edits during reserved compile; exact-hash malformed-journal archival and native provenance tests. See child rows.
- [x] #21/1: 실제 Desktop 대상 회귀 검증 체계 (핵심) — fixed: repeatable dedicated Desktop smoke harnesses with protected-state hashes, natural/injected evidence separated; final run recorded below.
- [x] #21/2: 테스트 신호 정리 — fixed+test: automatic offline discovery, explicit network mode, named compile seams; test-unit harness and pine_compile tests.
- [x] #21/3: 복잡도 증가 — fixed: named native/Pine helpers and scoped applied-study wait, phase/permit tables and serialized regressions; no unrelated wholesale formatting.
- [x] #21/4: 레포 비대화 — fixed: raw/private trials ignored, concise summaries/harnesses retained, .rgignore excludes historical bulk without rewriting history; operation-contracts policy.
- [x] #21/5: 코드 위생 (P3) — fixed+test: upstream reference qualification, encoded Pine open, fail-closed list, declaration/constants cleanup and stream contracts; child rows and regression suites.
- [x] #22/H1: stream 종료 시 lease가 해제되지 않고, 남은 lock이 workspace 등록을 계속 막음 — prior verdict: 재현됨; disposition: fixed+test+live: stream return/signal cleanup and dead lease reclamation under admission; session/lifetime and Desktop hard-kill fixtures.
- [x] #22/H2: 실패한 compile·save가 남긴 page 상태 때문에 workspace가 영구적으로 `NATIVE_BUSY`가 될 수 있음 — prior verdict: 부분 재현; disposition: fixed+test+live injection: undispatched failures retire observers, dispatched promises stay fenced until authoritative quiescence; lifetime/pine_lifecycle/layout-lifetime tests.
- [x] #22/H3: `parseArgs({strict:false})` 때문에 인자 오류가 조용히 다른 동작으로 바뀜 — prior verdict: 부분 재현; disposition: fixed+test (arguments.test.js)
- [x] #22/H4: `indicator set`이 존재하지 않는 input id를 무시하고 성공을 반환함 — prior verdict: 재현됨; disposition: fixed+test (arguments.test.js)
- [x] #22/H5: `stream ohlcv`가 사용자의 기존 차트 pane과 레이아웃을 덮어씀 — prior verdict: 판단 불가; disposition: fixed+VM/adapter test: existing panes preserved by default, exact reassignment authorization required; multi_feed/data-contracts tests. Live provisioning intentionally unverified with personal tab present.
- [x] #22/H6: `layout switch`가 미저장 변경을 자동으로 폐기함 — prior verdict: 재현 안 됨; disposition: investigated: automatic discard was not reproduced; confirmed Korean false-success fixed under N1/X1. No production dialog dismissal; layout-lifetime tests and QA cancellation.
- [x] #22/H7: 모든 CDP 호출과 page 내 promise에 타임아웃이 없어, 하나의 hang이 전체 CLI를 막음 — prior verdict: 부분 재현; disposition: fixed+test+live injection: bounded connected CDP requests and strong native promise registry; timeout is not cancellation; lifetime/session/layout-lifetime tests.
- [x] #22/M1: 전략 컴파일에서 리포트 fingerprint 변화만으로 새 결과를 채택할 수 있음 — prior verdict: 재현 안 됨; disposition: investigated, no demonstrated early-ready defect: native compiled source/status/report trace (91 samples in prior QA fixture) and strategy_state/pine_targets regressions; retained legitimate fast/same-source behavior, no forced cycle.
- [x] #22/M2: `quote SYMBOL`의 차트 복원 실패를 삼키고, 거래소가 다른 같은 티커는 전환하지 않음 — prior verdict: 부분 재현; disposition: fixed+test+live: qualified exchange identity and truthful restore/read-back; data-contracts and QA quote restoration.
- [x] #22/M3: `pane symbol`이 focus 성공 여부를 확인하지 않고 "현재 활성 차트"를 바꿈 — prior verdict: 재현 안 됨; disposition: defensive fix+test: requested widget dispatch and verified focus/read-back; chart_indicator tests. Prior live focus itself worked; no claim of reproduced wrong-pane mutation.
- [x] #22/M4: `range`/`scroll`의 인덱스 계산 off-by-one과 범위 밖 요청 처리 — prior verdict: 재현됨; disposition: fixed+test: index-zero sentinel, no-overlap failure and explicit applied range; chart_history tests.
- [x] #22/M5: `data tables`가 빈 셀을 제거해 열 정렬이 깨짐 — prior verdict: 재현됨; disposition: fixed+test+live: cells[][] retains blank cells/rows; data-contracts and QA graphics fixture.
- [x] #22/M6: multi-feed의 심볼·시간봉 비교가 엄격하고, 복구할 때마다 CDP 클라이언트가 누적됨 — prior verdict: 부분 재현; disposition: fixed+VM/adapter test: canonical aliases/timeframes, retired/dead clients closed immediately; multi_feed tests. Live provisioning remains unverified.
- [x] #22/M7: 전략 리포트를 읽는 명령이 UI 상태를 바꿈 (workspace에서는 guard와 충돌할 가능성) — prior verdict: 부분 재현; disposition: fixed+test+live: report reads preserve hidden study/widgets; explicit panel preparation; QA state hashes and hidden-strategy check.
- [x] #22/M8: `tab new --layout NAME`이 부분 문자열로 첫 번째 일치 항목을 엶 — prior verdict: 재현됨; disposition: fixed+test+live: exact/unique saved-layout resolution; tab/data-contracts/layout-lifetime tests and ambiguous A/B prefix check.
- [x] #22/M9: `normalizeTimeframe`이 소문자 `m`(분)을 `M`(월)로 바꿈 — prior verdict: 재현됨; disposition: fixed+test (arguments.test.js)
- [x] #22/M10: `pine save`가 timeout 시 `saved:false`로 단정함 — prior verdict: 재현됨(지연 주입); disposition: fixed+test+live injection: unknown persistence is saved:null, native promise retained; pine_lifecycle/pine_outcome tests.
- [x] #22/M11: `pine analyze`의 배열 크기 휴리스틱이 흔한 패턴을 `error`로 오탐함 — prior verdict: 재현됨; disposition: fixed+test: dynamic mutations/reassignments cannot prove definite bounds; nested arguments parsed; pine_analyze/data-contracts tests.
- [x] #22/M12: 알림 생성·조회의 조용한 대체값 — prior verdict: 부분 재현; disposition: fixed+test: unknown alert conditions/list failures fail closed; arguments/data-contracts tests. No live alert creation/deletion.
- [x] #22/M13: workspace 핸들 파일에 owner token과 Pine 전문이 평문으로 저장됨 — prior verdict: 재현됨; disposition: fixed+test: minimal schema-2 handles, private source/token/journals, actual Windows ACL and schema-1 lifecycle migration; workspace-privacy tests.
- [x] #22/L1: `--file` 없이 TTY에서 `pine set`을 실행하면 EOF가 올 때까지 대기. legacy `readStdin`은 `isTTY`를 검사함 — prior verdict: 판단 불가†; disposition: fixed+test: TTY refusal before stdin consumption/admission; workspace-runtime and CLI source preflight.
- [x] #22/L2: 입력창 포커스를 확인하지 않고 `Input.insertText`를 보냄. 차트에 타이핑되어 심볼 검색과 Enter로 **차트 종목이 바뀔 수 있음**. 같은 bare 티커가 이미 있으면 verified로 오판 — prior verdict: 판단 불가; disposition: defensive fix+test: owned visible dialog focus/Enter/read-back before insertion; exchange-aware identity; watchlist race itself not reproduced and personal watchlist never written.
- [x] #22/L3: `exceptionDetails`를 무시해 page 예외가 `undefined` 결과로 처리됨 — prior verdict: 판단 불가†; disposition: fixed+test: CDP exceptionDetails becomes an error; desktop_targets/tab/lifetime tests.
- [x] #22/L4: 활성 탭을 못 찾으면 **첫 번째 탭**을 닫음. 대화 상자 닫기 버튼을 `innerText==='close-dialog-window'`로 찾는 부분이 의심스러움 — prior verdict: 재현 안 됨; disposition: fixed+test: no first-tab fallback; scoped actual close control retained; tab tests and QA close cleanup. Prior close-dialog-window selector was valid.
- [x] #22/L5: `interval || 300` accepts negative/tiny values (busy loop) — prior verdict: 판단 불가†; disposition: fixed+test (arguments.test.js)
- [x] #22/L6: `Number(null)`·`Number('')`가 0이라 null이나 빈 문자열이 0으로 통과 — prior verdict: 재현됨(함수 단독); disposition: fixed+test (arguments.test.js)
- [x] #22/L7: 도형이 생성되지 않았거나(`entity_id:null`) 삭제되지 않았어도(`removed:false`) `success:true` — prior verdict: 판단 불가†; disposition: fixed+test: drawing reports observed created/removed state; existing invalid-ID throw retained; extraction tests.
- [x] #22/L8: 날짜가 바뀌지 않아도(데이터 끝 등) `success:true` — prior verdict: 판단 불가†; disposition: fixed+test: replay distinguishes observed change from no change; replay tests.
- [x] #22/L9: `--count` 음수는 빈 결과가 되어 "loading" 오류로 오인됨. 소수는 `valueAt`에 소수 인덱스가 들어감 — prior verdict: 판단 불가†; disposition: fixed+test (arguments.test.js)
- [x] #22/L10: `--max`가 20을 넘으면 조용히 20으로 잘림. order 기록이 trades라는 이름으로 노출됨 — prior verdict: 판단 불가†; disposition: fixed+test: max validation, explicit total/limit/truncated and order-versus-trade semantics; extraction/arguments tests.
- [x] #22/L11: `s.inputs()` 전체를 출력하므로 Pine study의 `text`(컴파일 스크립트)까지 포함될 수 있음. 출력이 비대해지고 소스가 노출됨. `getIndicator`는 이를 필터링함 — prior verdict: 부분 재현; disposition: fixed+test+live: compiled text excluded from ordinary values; extraction and QA graphics fixture.
- [x] #22/L12: `slice(-limit)`이 Map 삽입 순서 기준이라 "최근 N개"를 보장하지 않음 — prior verdict: 부분 재현; disposition: fixed+test+live: deterministic x-descending order declared, not Map insertion recency; data-contracts and QA labels.
- [x] #22/L13: `finally`의 `unlinkSync`가 실패하면(Windows의 EPERM 등) 원래 오류가 가려지고 gate가 남음. `.repair` 파일이 남으면 이를 지울 도구가 없음 — prior verdict: 부분 재현; disposition: fixed+test: bounded Windows unlink retry preserves primary error; token/PID checked dead repair cleanup; session EPERM injection.
- [x] #22/L14: operation을 등록한 뒤 `mkdirSync`·`workspaceStatus`에서 예외가 나면 operation이 남아 이후 `WORKSPACE_BUSY`가 됨(`workspace interrupt`로만 해제) — prior verdict: 재현됨; disposition: fixed+test: setup failures roll back only newly registered operation; workspace-runtime tests.
- [x] #22/L15: guard는 `value === permit` 값을 엄격하게 비교. TradingView가 `"20"`을 `20`으로 강제 변환하면 정상 변경도 `EXTERNAL_CHANGE`(interrupted)로 처리됨 — prior verdict: 재현 안 됨; disposition: investigated, coercion not reproduced: live numeric-string input remained string and workspace completed; exact typed permits retained; no speculative Number conversion.
- [x] #22/L16: `permit.compile`이면 old study가 있고 current가 없는 경우(study 소멸)도 통과 — prior verdict: 부분 재현; disposition: fixed+instrumented VM test: legal transient compile absence allowed, absent/duplicate owned study rejected at final completion; workspace-page tests. Does not outlaw native transient replacement.
- [x] #22/L17: 5초 timeout으로 실패를 반환한 뒤 늦게 도착한 콜백이 `loadChartFromServer`를 실행할 수 있음 — prior verdict: 부분 재현; disposition: fixed+test: lookup callback canceled after deadline; dispatch lookup separated from mutation; data-contracts/layout-lifetime tests.
- [x] #22/L18: 새 탭의 inventory에 pane이 0개면 `missing`이 줄지 않아 탭을 계속 엶 — prior verdict: 부분 재현; disposition: fixed+VM/adapter test: bounded empty-pane provisioning/recovery; data-contracts/multi_feed tests.
- [x] #22/L19: `where` 결과가 여러 줄이면 첫 줄에 `\r`이 남아 경로 판정 실패. `LOCALAPPDATA`가 없으면 MSIX 복사본 경로가 cwd 기준 상대 경로가 되어 그 위치에 복사·삭제 — prior verdict: 판단 불가†; disposition: fixed+test: CRLF path split and absolute required LOCALAPPDATA before cache copy; launch tests.
- [x] #22/L20: 원격 lockfile이 바뀌면 `npm ci`를 install script까지 포함해 자동 실행(공급망) — prior verdict: 판단 불가†; disposition: fixed+test/support contract: updates skip lifecycle scripts by default, explicit allow-install-scripts; current lock needs no required scripts; update tests.
- [x] #22/L21: 파일명 정제가 `/ \ ..`만 처리. Windows의 `:`(ADS) 등이 남음 — prior verdict: 판단 불가†; disposition: fixed+test: Windows ADS/reserved/path filename rejection; sanitization tests.
- [x] #22/L22: 모든 legacy 연결(`findChartTarget`)마다 target 수만큼 새 CDP 연결을 순차로 엶. `tab new`에서는 최대 30회 반복 — prior verdict: 판단 불가†; disposition: measured+fixed+test: cap-four uncached probes, authoritative identity on every inventory; benchmark retained all trials, inventory-concurrency tests; F15 summary below.
- [x] #22/L23: `TV_CDP_PORT=abc`나 `0`이면 조용히 9222로 대체 — prior verdict: 재현됨(별도 프로세스); disposition: fixed+test (arguments.test.js)
- [x] #22/L24: 편집기는 숨겨진 컨테이너도 반환할 수 있지만 controller는 보이는 것만 찾음. 서로 다른 인스턴스를 짝지을 여지가 있음 — prior verdict: 재현 안 됨; disposition: investigated, mismatch not reproduced: prior live two-container fixture paired editor/controller; visible-first/disposed/alternate-fiber unit probes. Retained native lookup without unsupported replacement.
- [x] #22/L25: store 메시지와 DOM 로그 행을 합쳐 같은 로그가 중복될 수 있음 — prior verdict: 판단 불가; disposition: investigated, same native event equivalence unproven: readPineConsole combines store records and visible DOM rows; no reliable shared event ID. Retained records rather than deleting legitimate repeated logs; cross-view duplication remains an explicitly unverified hypothesis.
- [x] #22/L26: `'={"symbol":"' + sym + '"}'` 문자열 결합. `JSON.stringify`를 쓰는 편이 안전 — prior verdict: 판단 불가(코드만); disposition: fixed+test: JSON.stringify replaces symbol JSON concatenation; input/alert validation.
- [x] #22/N1: Korean layout switch false success — fixed+test+live: success requires stable requested UID and native terminal signal; QA Korean captured Cancel and B-A-B checks; layout-lifetime tests.
- [x] #22/N2: unmodified draft save false success — fixed+test+live: an unmodified draft does not prove a saved document; pine_lifecycle and QA draft fixture.
- [x] #22/N3: analyzer diagnostic/exit contract — fixed+test/support contract: analysis execution and diagnostics separated; --fail-on-error for CI; pine_analyze/CLI tests.
- [x] #22/style: compressed state-machine code, duplicate declarations/constants, stale references — fixed: named phases/helpers, shared declaration/API constants, dead fallback/duplicate removal, scoped readability cleanup; lint and operation contracts.
- [x] #22/X1: saved-chart loader object/UID mismatch — confirmed defect; fixed+test+live: complete object and URL UID, numeric ID lookup, and QA B-to-A-to-B switch. Local inspection limited to Desktop 3.4.1 methods; no proprietary native source published.

### Expanded subproblem ledger

All rows retain individual completion evidence; parent rows close only after every child is resolved.

- [x] #19/1a unknown option — fixed+test, strict parser.
- [x] #19/1b extra positional/boolean inline false — fixed+test, parser rejects before admission.
- [x] #19/3a count NaN/0/negative/fraction/clamp — fixed+test, 1..500 integer contract.
- [x] #19/3b shared trades max truncation — fixed+test: shared limit exposes total/limit/truncated; extraction tests.
- [x] #19/3c orders/trades semantics — fixed+test/support contract: ledger explicitly denotes order records; compatibility trades field documented; extraction tests.
- [x] #19/5a decision: add legacy source_hash and document expectation (option a) — fixed+test+live: option a implemented, source_hash and expected saved ID.
- [x] #20/2a stream endpoint serialization/support contract — support contract agreed with Reviewer: one legacy stream per endpoint; independent concurrency uses workspaces.
- [x] #20/2b real owner command/pid/run_id in conflicts — fixed+test: actual command/PID/run ID and exact recovery instruction in conflicts; session tests.
- [x] #20/4a TTY EOF — fixed+test: TTY preflight rejects before admission/EOF wait; workspace-runtime tests.
- [x] #20/4b release error after success JSON — fixed+test: cleanup warnings preserve primary output/error; session tests and router single-result flow.
- [x] #20/5a GUI input compile gap — support contract: GUI edits to reserved compile inputs prohibited; native schema replacement indistinguishable from edits; no speculative guard weakening.
- [x] #20/5b TEMP/user lock scope — support contract: cooperative locks require same OS user/TEMP/endpoint; documented and tested with isolated process fixtures.
- [x] #20/5c dead owner/PID reuse/process start identity — support contract+test: dead owner reclaimed under gate; live PID reuse conservatively refused instead of unproven cross-platform start-time identity.
- [x] #20/5d malformed recovery journal archival — fixed+test: exact-hash corrupt-journal archival preserves bytes; session tests.
- [x] #20/5e external replacement/same-source reapplication — investigated+test: document/source/native target identity and existing observer provenance reject foreign result; legitimate same-source reapplication remains supported; strategy_state/pine_targets tests.
- [x] #21/2a default offline unit tests — fixed+test, explicit test:network.
- [x] #21/2b unit test discovery — fixed+test, scripts/test-unit.mjs.
- [x] #21/2c brittle generated-expression mocks — fixed+test: named Pine stage seams replace generated-expression substring/UUID parsing in primary compile mock.
- [x] #21/3a state machine readability/line length — fixed: focused lifecycle/layout helper readability and named states; no unrelated formatter churn.
- [x] #21/3b smartCompile phase extraction — fixed: extracted applied-indicator wait and explicit compile phases; pine_compile regressions.
- [x] #21/3c phase/permit tables and tests — fixed+test: docs/operation-contracts.md phase/permit matrices; serialized workspace-page/runtime and Pine phase regressions.
- [x] #21/5a upstream issue references — fixed: references qualified as upstream issue numbers.
- [x] #21/5b stale PROBE_RESULTS reference — fixed, replaced by smoke reference.
- [x] #21/5c listScripts fail-closed — fixed+test: native list failure distinct from empty success; pine_lifecycle tests.
- [x] #21/5d openScript encoded identity/version — fixed+test: encode document ID/version, verify opened identity/source, fail ambiguity; pine_lifecycle tests.
- [x] #21/5e redundant typeMap/dead template fallback — fixed: redundant typeMap and unreachable template fallback removed.
- [x] #21/5f duplicate strategy declaration parsing — fixed: shared pineDeclaration parsing used for strategy title.
- [x] #21/5g wait alias consistency — fixed+test: shared wait alias policy and documented argument contracts; documented-arguments tests.
- [x] #21/5h stream EPIPE/port/shared path — fixed+test+live: stream returns after signal/EPIPE, validates port, reuses shared collectors; lifetime/arguments tests and Desktop stream fixtures.
- [x] #21/5i network test documentation — fixed: CONTRIBUTING describes offline/network discovery and dedicated smoke prerequisites.
- [x] #22/F01: resolved: strict pre-admission parser/input contracts; arguments tests; Group A.
- [x] #22/F02: resolved: lease/admission/cleanup lifetime; session/workspace-runtime tests and hard-kill fixtures; Group B.
- [x] #22/F03: resolved: native phase/observer terminal fences; lifetime/pine_lifecycle/layout-lifetime tests and injected recovery; Group B/E1.
- [x] #22/F04: resolved: resource preservation, explicit confirmations, late callback bounds; multi_feed/tab/layout-lifetime tests; Group C/E1.
- [x] #22/F05: resolved: exact target identity and verified UID/pane/tab outcomes; tab/chart_indicator/layout-lifetime tests and QA layout smoke.
- [x] #22/F06: resolved: context/exchange restoration/range/timeframe semantics; data-contracts/chart_history/arguments tests and QA quote/1m smoke.
- [x] #22/F07: resolved: table shape, limits/order semantics, compiled-text exclusion; extraction/data-contracts tests and QA graphics smoke.
- [x] #22/F08: resolved: bounded feed alias/provision/recovery client lifetime; multi_feed tests; VM-only under protected personal-tab policy.
- [x] #22/F09: resolved: pure observation, fail-closed lists and owned focus; command-policy/data-contracts tests and live read hashes; no personal watchlist writes.
- [x] #22/F10: resolved: verified persistence and draft distinction; pine_lifecycle/pine_outcome tests and QA save/draft smoke.
- [x] #22/F11: resolved: analyzer confidence and exit contract; pine_analyze/CLI tests.
- [x] #22/F12: resolved: private schema-2 store and schema-1 migration/ACL; workspace-privacy tests and documented legacy cleanup.
- [x] #22/F13: resolved: small drawing/replay/Windows/JSON safeguards; extraction/replay/launch/sanitization tests.
- [x] #22/F14: resolved: evidence-based dispositions for M1/L15/L16/L24/L25 above; no invented reproduction or global coercion/cycle requirement.
- [x] #22/F15: resolved: update lifecycle policy and measured uncached cap-four inventory probes; update/inventory-concurrency tests and retained baseline/candidate samples.

- Current environment remeasured: Node 24.19.0, Desktop 3.4.1, Electron 41.7.1, Chromium 146; current single personal tab has no Pine editor. Inventory inspected read-only; raw IDs retained only in ignored results.

### Group B implementation and validation

- Reviewer accepted exclusive legacy stream lease as #20.2 support contract with corrected examples, actual owner diagnostics, and normal signal cleanup. Streams now return and emit no extra JSONL line.
- Request deadlines bound every connected CDP domain through src/cdp.js; no timeout is treated as cancellation. Legacy router writes a recovery journal before dispatch, retains it on unknown native outcomes, and session recover verifies quiescence without reload. Workspace recover already rejects pending native work. Saved timeout is saved:null/persistence_verified:false; page pending remains true.
- Dispatch validation failure marks only that observer actionDone and disposes it. New observer/save rejects unfinished native work even after expiration or abandonment. Native completion remains responsible for pending clearance.
- Gate unlink retries preserve original errors; dead repair cleanup is token/PID checked. Dead leases are reclaimed under admission only, journals remain separate. Workspace operation setup rollback removes only its new operation.
- R1 shared-input baseline corrected with cloned overrides after prepareInputChange; VM regression preserves old fingerprint. R2 invalid configuration now emits JSON INVALID_CONFIG through CLI entry.
- Offline full suite: 381/381 pass, lint pass. Live Desktop 3.4.1/Electron 41.7.1, Korean UI: emitted child SIGINT handler exited 0, JSONL-only stream, no lock/journal, subsequent isolated workspace reservation successful. Protected personal chart hash unchanged. Harness scripts/smoke-desktop.mjs; raw evidence ignored. This is signal-handler validation, not physical Ctrl+C.
- #20.5 support choices: same-user/same-TEMP cooperating lock scope; conservative live-PID reuse rejection; malformed journal exact-hash archival preserves bytes. GUI compile input edits remain prohibited because native schema changes are indistinguishable (#20.5a); no speculative input coercion or cycle requirement introduced.
- Partial B commit also adds legacy Pine source_hash/--expect-script-id, draft save distinction and duplicated declaration/template cleanup; remaining validation stays open.

### Groups C/D and B review corrections

- B1: removed all eager router journals. Explicit native dispatch uses mutation:true after target binding; direct Input dispatch is marked too. Pure reads do not call panel preparation. Strategy reads no longer unhide or switch widgets. Feed preparation and quote restore clear their dispatch fence only after verified readiness/restoration.
- Actual Windows hard-kill of QA stream during pure polling: no journal, dead lock reclaimed by workspace admission. Live injected retained native promise: hard-kill leaves exact-target journal, recovery refuses pending action, then succeeds after resolve with no reload. Personal layout/source/modified/pane hash unchanged. Smoke evidence remains ignored.
- B2/B3: native-vs-batch guidance now chooses the correct recovery command; Korean stream/timeout documentation is in the README usage section. B4: dispatch method is computed once. B5 evidence: efd5e41 included source_hash/expected-ID, N2 and hygiene. pine_lifecycle tests now cover expected-ID mismatches with zero native calls, draft false persistence, and list failure vs empty list.
- Collection responses use same-turn context capture/validation, exact target, explicit limits and order semantics. Tables add cells[][] preserving gaps and empty rows; labels declare stable x-descending order; compiled text excluded. No matching study is STUDY_NOT_FOUND; matching empty graphics remains successful empty data.
- Quote uses exchange-aware identity, reports original restore/read-back and preserves failures. Range/scroll preserve first index 0, reject no-overlap requests and expose applied/clamped ranges.
- Layout lookup rejects ambiguous names/IDs, cancels its callback after lookup timeout, never discards automatically, and requires read-back of the requested saved ID. Tab picker uses exact/unique selection, page exceptions surface, and no first-tab close fallback remains. Pane focus verifies active widget before symbol dispatch. Watchlist typing verifies owned dialog focus, Enter focus and read-back without cross-exchange fallback.
- Feed default preserves existing panes/layouts; reassignment needs exact --allow-reassign-target IDs. Canonical symbol/timeframe comparisons, bounded empty-pane creation/recovery and immediate retired client close are covered by VM/adapters. Multi-feed live remains prohibited while the personal tab is present; no claim of live provisioning.
- Analyzer balances nested arguments and suppresses definite bounds conclusions after size mutations/reassignments. Default execution/diagnostics contract retained, --fail-on-error supports CI. Replay and drawing report observed change, Windows filename/env/CRLF guards added. Update installs skip lifecycle scripts by default; explicit allow-install-scripts is documented (current lockfile has none required).
- Pure workspace observation allowlist shares invocation predicates. It can observe a busy workspace without taking/consuming its operation; context/source/input instability fails closed. Serialized guard tests allow transient compile absence but reject absent owned study at final completion (new deterministic L16 evidence, not an unmodified guard policy change).
- Focused VM/data tests pass; full offline suite was 393/393 before final two regressions. One deliberately direct focused test invocation omitted the network-skip flag and produced three EACCES failures; raw failed trial retained. Repeated offline focused suite 64/64 passed. Final group count remeasured below.

### Group E and observation review

- C1 fixed: observing guards use local copies of baseline/context/permits. Both observer snapshots and connection evaluate wrapper use observe:true. VM test proves byte-identical active baseline and pending permits, then ordinary completion succeeds.
- C2 invocation policy now classifies every registered adapter separately from ownership scope; pure, mixed and native paths are explicit. The full QA read smoke runs each ordinary read and compares symbol/resolution/panes/study visibility/widgets/editor/modified/active-tab hash. Missing data/panels/reports remain explicitly failed results, not fabricated success.
- C3 shell tab switch marks its actual mutation target; C4 panel-required compatibility and explicit ui panel preparation documented.
- Schema-2 public handle is minimal (schema/id/path/endpoint hash). Tokens and complete draft/source binding move to an access-controlled private session store; new journals/results live there too. Schema-1 status/load remain read-only; operation migration preserves credential, source, old journal path and saved version. Migration regressions cover release, interrupt/recover, abandon and retained rebind/restore binding.
- Windows ACL tests validate protected directories granting only the executing user, SYSTEM and administrators. An initial actual-user run exposed the bundled PSModulePath preventing Windows PowerShell Get-Acl auto-load; the regression now uses the .NET ACL reader and passes. Sandbox and actual user have distinct OS SIDs: isolation is intentional, so unit runner uses a fresh TEMP and runtime fixtures their own roots. Raw failed trials retained. Full sandbox offline suite 400/400 passed, Windows actual-user ACL focused 4/4 passed, lint passed.
- Exact next-command suggestions added to read-only workspace status. Support scope remains same OS user/TEMP; private ACL is not encryption or protection from that user/admin.
- Operation phase/permit tables and evidence policy committed in docs/operation-contracts.md; *.tvws.json ignored, large historical raw QA files excluded by .rgignore without history rewrite.

### E integration follow-through (2026-10-02 KST)

- Real Korean layout switch now recognizes stable dontSave/cancel attributes, records original/requested identity and remains fenced while the confirmation/navigation is pending. No production Cancel/dontSave click is performed. The QA harness explicitly cancels only the prompt it raised; cleanup discards only its newly created QA-B close prompt. This historical recovery description is superseded by the native terminal-signal rules in f7a5c0d and the final review correction below: original identity alone never proves cancellation. Live N1/M8 completed; VM checks both quiescent outcomes and refuses unrelated identity.
- Generic native promise registry is capped at one entry per page, holds a strong promise reference, rejects overlap and removes settled entries only. No TTL retirement. Compile/save promises likewise remain referenced until settlement. A canceled undispatched compile token cannot dispatch later. Pre-start workspace CDP timeout is recoverably interrupted, including init admission; source/context recovery journals preserve original context and target history.
- Real permit-changing observer fixture initially exposed an input A-B-A rebase race: the cleanup release saw still-running calculation after a setter claimed ready. Failed trial retained privately; exact recovery/release and QA original source restoration succeeded. prepareInputChange now synchronizes the completed prior epoch and refuses unfinished calculation with STRATEGY_CALCULATION_PENDING/prior_token. Failed/invalidated prior epochs do not permanently block repair input. Deterministic regressions cover overlap, rebase and ended-error repair; ordinary fast compile semantics remain unchanged.
- Repeated live Pine smoke passed: expected document mismatch with no save, legacy set/compile/save source proof, unknown/valid input updates, preserved numeric-string type, hidden strategy read, 1m, qualified quote restoration, full workspace cycle including active changed-input permit observation, blank table column preservation, x-descending label order, compiled text exclusion and N2 draft result. Original QA source restored; workspace released.
- Schema-1 migration now exercises actual rebind as well as interrupt/recover/release/abandon. Public handle text excludes source/token. Windows ACL fixture path contains spaces and Korean characters and verifies only executing user/SYSTEM/admin access. Explicit restore-document can replay the exact private unsaved source without saving and refuses foreign modified source.
- Named Pine stage seams and extracted applied-indicator wait remove the primary compile mock's generated-JS substring/UUID parsing. New lifecycle/observation code is split into self-contained helpers. No broad formatter dependency or unrelated repository-wide formatting was introduced; serialized phase semantics are fixed by tables and real VM tests.
- Stream reads reuse the validated data collectors, preserve context/target and table shape, filter compiled text and report missing-study errors as distinct JSONL events. Cached dead clients and retired/unneeded feed clients are closed; source changes participate in stream event identity. Pane symbol dispatch addresses the requested widget directly and verifies its read-back.

### F and E1 implementation evidence

- New item #22/X1: local native inspection found layout loader requires a complete saved-chart object and URL UID, not the numeric id/string legacy supplied. Desktop 3.4.1 has an async page-local service await chain; proprietary source was read locally only, never committed. Matched object identity/URL/numeric-ID regression added.
- E1 now tracks the operation in the page after CLI return, records scoped Cancel/Save/Don't save action, native promise settlement and stable UID samples. No time/grace acknowledges quiescence. Unsupported void no-op, uncaptured disappearance and accepted-but-delayed navigation remain fenced. One registry entry extends over the native promise, and unknown void actions extend it to the terminal watcher. Both terminal and late-action cases are covered by deterministic tests.
- Invalidation recovery records CDP loaderId and generation. A user-performed destruction of the observed page-local operation must produce a new loader and stable repeated layout/chart/controller references. Surviving changes fail recovery. No CLI reload/force option was introduced; unsaved-state consequences and scope limits are documented. Recovery errors now include actual compile/save/registry/layout/pendingRequests/calculating blockers.
- E3 choice: keep old interrupted journal paths, apply private access to the old per-workspace artifact directory during migration, and document exact post-recovery/release archival/verification before removing that old copy. Existing ignored i22 evidence was preserved. E4 pending input error gives data strategy/workspace wait guidance; no-data feeds can remain genuinely unavailable.
- F15 inventory: baseline one warmup each, then four ABBA repetitions on 1/2 actual existing chart targets + shell, all samples retained and identity counts correct. Added bounded four-probe parallelism, no cache and no loss of authoritative target revalidation. Failed probes are all consumed/closed before deterministic error. Same workload/order measured after change; numbers are summarized in final validation document.

### Fresh Executor candidate and validation

- Native recovery commit: `f7a5c0d`; uncached inventory commit: `8c75ec4`. Lookup is read-only and only actual layout dispatch checkpoints recovery. Missing identity proof fails page rebind. Same-layout unknown void actions and unknown thenables remain fenced. No eager read/stream native checkpoint was introduced.
- #22/X1 (confirmed): Desktop 3.4.1 requires the full saved-chart object and URL UID. Object/numeric lookup regression and QA B-to-A-to-B smoke cover it; no native bundle or saved-chart record is published.
- Fresh candidate offline suite: 424/424, lint passed. Network suite before the final same-layout/unknown-thenable guards: 427/427 (422 offline plus five network tests); final network count is remeasured below.
- Final Desktop attempt initially refused CDP twice; process/port inspection confirmed Desktop was running without a debug listener. The user explicitly preserved unsaved work and authorized a debug restart on 2026-10-02 KST. Launch succeeded. The first restored smoke passed read/lifetime phases but failed its Pine fixture precondition (editor closed after restart); no source was overwritten. QA-A only was prepared with the exact saved strategy after checking no modified source. Every failed trial remains ignored evidence.
- Inventory protocol: baseline and candidate each one warmup per workload, four ABBA repetitions of one/two existing chart targets plus shell (eight measured samples per workload), no failed sample excluded. All 36 warmup/measured samples resolved the expected chart counts; no new target or cache. Baseline/candidate medians: one chart 25.374/23.027 ms (ranges 23.325–30.334/18.576–29.494); two charts 39.206/29.228 ms (35.157–57.727/26.030–43.733). These small local observations are not a general throughput claim. Harness and cap/cleanup test are committed, raw samples remain ignored.

Final code candidate `8c75ec4` (later edits only reconcile this ledger and label smoke evidence):

- Offline: `npm test`, 424/424; `npm run lint`, pass. Network: `npm run test:network`, 429/429 (the same 424 offline checks plus five Pine-server integration tests).
- Desktop: `npm run smoke:desktop`, pass on Windows / Node 24.19.0 / Desktop 3.4.1 / Electron 41.7.1 / Chromium 146 / Korean UI. Parent smoke recorded 42 successful checks, Pine phase 10, layout phase four. Parent counts include its child phase confirmations; they are not 56 independent tests.
- Live natural: pure reads preserve QA state, strict CLI rejection, source/document compile/save proof, typed inputs, hidden strategy reads, minute timeframe, qualified quote restoration, graphics shape/order/source exclusion, draft persistence distinction, exact/ambiguous layout selection and saved B-to-A-to-B switch. Current native freshness trace: 234 samples, pending observed and ready source identity matched. M1 fast compile behavior remains intact.
- Live injected: emitted SIGINT handler (not physical Ctrl+C), actual OS hard-kill during pure polling, retained native promise followed by exact recovery, deliberately held workspace operation/permit observation, opaque void loader, explicit QA-only generation invalidation, and 6500ms loader delay followed by a real Korean dialog/captured Cancel. Production does not click or reload these dialogs. Harness evidence labels now identify the injections explicitly.
- Offline VM/adapter only: multi-feed provisioning/recovery, failure/timeout and ambiguous-resource counterexamples, absent owned study at final completion, unknown/native promise outcomes, same-layout void actions, missing/stable/unstable rebind proof, input validation and private migration/ACL paths. H5/M6 live provisioning remains unverified while the protected personal tab is present.
- Cleanup: QA original source restored and workspace released; only fixture-created tabs/dialogs disposed. One protected personal tab had identical before/after hashes. No real alerts or personal watchlist writes; no native service bundle, raw account/document/target IDs, token or private source was added to Git. The debug restart was separately authorized by the user after unsaved work was preserved.
- Limitations: observed Desktop 3.4.1 page-local layout service only; unknown external callback implementations remain fenced. L25 native store/DOM event equivalence is unproven, so no destructive content-only deduplication was introduced. GUI edits during reserved native compile, cross-user/TEMP locks and live-PID reuse ambiguity remain explicit support contracts. Raw failed and successful trials remain ignored; historical qa/ content is not expanded or rewritten.

### Final Reviewer correction and native contract observation

- Reviewer agreed with the full a1d43a0 scope, clean-export 424/424 tests/lint, final network/QA evidence, X1, F15 and evidence-based no-change dispositions. Its one requested correction was to retain a stable-original fence for arbitrary fulfilled non-boolean native results.
- The strict-false candidate exposed new live natural evidence: the public Desktop 3.4.1 loadChartFromServer promise fulfilled with undefined after the real Korean Cancel. The exact scoped action was captured, the full chain had settled, and the registry was empty. Local inspection confirmed loadChartFromServer awaits the complete _loadChartService.loadChart chain without returning the service's boolean. Proprietary method text remains private/ignored and is not reproduced here.
- Lead and Reviewer agreed on composite authoritative cancellation: verified supported page-local promise fulfilled false/undefined, exact operation/dialog Cancel captured, stable original UID, no loading/visible dialog and no outstanding tracked native work. Undefined alone and other non-booleans never retire a fence; accepted-but-original state remains unverified. No private service wrapping or interception was added.
- Positive supported undefined+Cancel and negative no-capture, other non-boolean, wrong dialog/superseded token, unsettled chain and outstanding native-work regressions passed. Strict false/no-decision, switched and rejected outcomes remain tested. The older historical recovery description above is explicitly superseded.
- Failed strict-false live trial: ignored review-final-layout.log and review-cancel-outcome.json. An immediate retry encountered its old page watcher and retained journal; that failure remains in review-final-layout-rerun.log. Exact saved QA-B invalidation and stable recovery cleaned the old watcher, without manually clearing a fence or touching a personal tab. Cleanup evidence is review-trial-cleanup.log.
- Final correction validation: npm test 427/427, lint pass, npm run test:network 432/432 (427 offline plus five network checks). The fresh delayed-Cancel QA layout rerun passed all four checks, including natural B-to-A-to-B, injected opaque loader/invalidation and delayed real Korean Cancel with recovery without reload. Ignored agreed-final-{unit,network,layout}.log retain these trials; the prior full Desktop smoke on a1d43a0 remains valid evidence for unchanged Pine/read/lifetime phases.

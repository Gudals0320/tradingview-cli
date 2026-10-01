# Open issues overhaul

## Scope and ownership

Resolve all problems in open issues [19](https://github.com/Gudals0320/tradingview-cli/issues/19), [20](https://github.com/Gudals0320/tradingview-cli/issues/20), [21](https://github.com/Gudals0320/tradingview-cli/issues/21), and [22](https://github.com/Gudals0320/tradingview-cli/issues/22), including comments and N1–N3. Do not stop at the suggested P1 subset. Unconfirmed hypotheses require investigation and an evidence-based disposition; absence of reproduction is not proof of absence.

- Baseline: `1780383fdfc5b72b2beaab08fb71b0555222817c`, latest origin/main when fetched on 2026-10-01 KST.
- Branch: `codex/open-issues-overhaul`.
- Fixed shared folder: `C:\Codex\.worktrees\tradingview-issue-comments`.
- Lead: `01a0f7a9-156c-7d80-9500-474cedfbb275`.
- Reviewer: `01a0f7aa-cb09-7af1-8ffd-2815f982bd05`, Claude Opus 5.5 / medium, read-only.
- Executor: to be recorded after creation; sole code/Git writer after handoff, responsible through push and PR.
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

Pending: generated entries follow. Executor maintains this document as the single plan/status/decision record.
- [ ] #19/1: 모르는 옵션과 남는 위치 인자를 조용히 무시함 — pending
- [ ] #19/2: 데이터 조회 결과에 대상(context)이 없음 — pending
- [ ] #19/3: 범위를 조용히 보정하거나 잘라냄 — pending
- [ ] #19/4: 필터와 일치하는 대상이 없어도 빈 성공을 반환함 — pending
- [ ] #19/5: legacy Pine 컴파일 결과에 소스와 문서 증명이 없음 — pending
- [ ] #20/1: workspace가 하나라도 예약되어 있으면 데이터 수집이 전면 차단됨 — pending
- [ ] #20/2: 장기 실행 legacy 명령이 lease를 계속 쥐고 있어 다른 명령이 모두 실패함 — pending
- [ ] #20/3: workspace 복구와 운영 절차의 부담 — pending
- [ ] #20/4: workspace 경로의 세부 결함 — pending
- [ ] #20/5: #2에서 이관한 남은 한계 — pending
- [ ] #21/1: 실제 Desktop 대상 회귀 검증 체계 (핵심) — pending
- [ ] #21/2: 테스트 신호 정리 — pending
- [ ] #21/3: 복잡도 증가 — pending
- [ ] #21/4: 레포 비대화 — pending
- [ ] #21/5: 코드 위생 (P3) — pending
- [ ] #22/H1: stream 종료 시 lease가 해제되지 않고, 남은 lock이 workspace 등록을 계속 막음 — pending
- [ ] #22/H2: 실패한 compile·save가 남긴 page 상태 때문에 workspace가 영구적으로 `NATIVE_BUSY`가 될 수 있음 — pending
- [ ] #22/H3: `parseArgs({strict:false})` 때문에 인자 오류가 조용히 다른 동작으로 바뀜 — pending
- [ ] #22/H4: `indicator set`이 존재하지 않는 input id를 무시하고 성공을 반환함 — pending
- [ ] #22/H5: `stream ohlcv`가 사용자의 기존 차트 pane과 레이아웃을 덮어씀 — pending
- [ ] #22/H6: `layout switch`가 미저장 변경을 자동으로 폐기함 — pending
- [ ] #22/H7: 모든 CDP 호출과 page 내 promise에 타임아웃이 없어, 하나의 hang이 전체 CLI를 막음 — pending
- [ ] #22/M1: 전략 컴파일에서 리포트 fingerprint 변화만으로 새 결과를 채택할 수 있음 — pending
- [ ] #22/M2: `quote SYMBOL`의 차트 복원 실패를 삼키고, 거래소가 다른 같은 티커는 전환하지 않음 — pending
- [ ] #22/M3: `pane symbol`이 focus 성공 여부를 확인하지 않고 "현재 활성 차트"를 바꿈 — pending
- [ ] #22/M4: `range`/`scroll`의 인덱스 계산 off-by-one과 범위 밖 요청 처리 — pending
- [ ] #22/M5: `data tables`가 빈 셀을 제거해 열 정렬이 깨짐 — pending
- [ ] #22/M6: multi-feed의 심볼·시간봉 비교가 엄격하고, 복구할 때마다 CDP 클라이언트가 누적됨 — pending
- [ ] #22/M7: 전략 리포트를 읽는 명령이 UI 상태를 바꿈 (workspace에서는 guard와 충돌할 가능성) — pending
- [ ] #22/M8: `tab new --layout NAME`이 부분 문자열로 첫 번째 일치 항목을 엶 — pending
- [ ] #22/M9: `normalizeTimeframe`이 소문자 `m`(분)을 `M`(월)로 바꿈 — pending
- [ ] #22/M10: `pine save`가 timeout 시 `saved:false`로 단정함 — pending
- [ ] #22/M11: `pine analyze`의 배열 크기 휴리스틱이 흔한 패턴을 `error`로 오탐함 — pending
- [ ] #22/M12: 알림 생성·조회의 조용한 대체값 — pending
- [ ] #22/M13: workspace 핸들 파일에 owner token과 Pine 전문이 평문으로 저장됨 — pending
- [ ] #22/L1: `--file` 없이 TTY에서 `pine set`을 실행하면 EOF가 올 때까지 대기. legacy `readStdin`은 `isTTY`를 검사함 — pending
- [ ] #22/L2: 입력창 포커스를 확인하지 않고 `Input.insertText`를 보냄. 차트에 타이핑되어 심볼 검색과 Enter로 **차트 종목이 바뀔 수 있음**. 같은 bare 티커가 이미 있으면 verified로 오판 — pending
- [ ] #22/L3: `exceptionDetails`를 무시해 page 예외가 `undefined` 결과로 처리됨 — pending
- [ ] #22/L4: 활성 탭을 못 찾으면 **첫 번째 탭**을 닫음. 대화 상자 닫기 버튼을 `innerText==='close-dialog-window'`로 찾는 부분이 의심스러움 — pending
- [ ] #22/L5: `interval — pending
- [ ] #22/L6: `Number(null)`·`Number('')`가 0이라 null이나 빈 문자열이 0으로 통과 — pending
- [ ] #22/L7: 도형이 생성되지 않았거나(`entity_id:null`) 삭제되지 않았어도(`removed:false`) `success:true` — pending
- [ ] #22/L8: 날짜가 바뀌지 않아도(데이터 끝 등) `success:true` — pending
- [ ] #22/L9: `--count` 음수는 빈 결과가 되어 "loading" 오류로 오인됨. 소수는 `valueAt`에 소수 인덱스가 들어감 — pending
- [ ] #22/L10: `--max`가 20을 넘으면 조용히 20으로 잘림. order 기록이 trades라는 이름으로 노출됨 — pending
- [ ] #22/L11: `s.inputs()` 전체를 출력하므로 Pine study의 `text`(컴파일 스크립트)까지 포함될 수 있음. 출력이 비대해지고 소스가 노출됨. `getIndicator`는 이를 필터링함 — pending
- [ ] #22/L12: `slice(-limit)`이 Map 삽입 순서 기준이라 "최근 N개"를 보장하지 않음 — pending
- [ ] #22/L13: `finally`의 `unlinkSync`가 실패하면(Windows의 EPERM 등) 원래 오류가 가려지고 gate가 남음. `.repair` 파일이 남으면 이를 지울 도구가 없음 — pending
- [ ] #22/L14: operation을 등록한 뒤 `mkdirSync`·`workspaceStatus`에서 예외가 나면 operation이 남아 이후 `WORKSPACE_BUSY`가 됨(`workspace interrupt`로만 해제) — pending
- [ ] #22/L15: guard는 `value === permit` 값을 엄격하게 비교. TradingView가 `"20"`을 `20`으로 강제 변환하면 정상 변경도 `EXTERNAL_CHANGE`(interrupted)로 처리됨 — pending
- [ ] #22/L16: `permit.compile`이면 old study가 있고 current가 없는 경우(study 소멸)도 통과 — pending
- [ ] #22/L17: 5초 timeout으로 실패를 반환한 뒤 늦게 도착한 콜백이 `loadChartFromServer`를 실행할 수 있음 — pending
- [ ] #22/L18: 새 탭의 inventory에 pane이 0개면 `missing`이 줄지 않아 탭을 계속 엶 — pending
- [ ] #22/L19: `where` 결과가 여러 줄이면 첫 줄에 `\r`이 남아 경로 판정 실패. `LOCALAPPDATA`가 없으면 MSIX 복사본 경로가 cwd 기준 상대 경로가 되어 그 위치에 복사·삭제 — pending
- [ ] #22/L20: 원격 lockfile이 바뀌면 `npm ci`를 install script까지 포함해 자동 실행(공급망) — pending
- [ ] #22/L21: 파일명 정제가 `/ \ ..`만 처리. Windows의 `:`(ADS) 등이 남음 — pending
- [ ] #22/L22: 모든 legacy 연결(`findChartTarget`)마다 target 수만큼 새 CDP 연결을 순차로 엶. `tab new`에서는 최대 30회 반복 — pending
- [ ] #22/L23: `TV_CDP_PORT=abc`나 `0`이면 조용히 9222로 대체 — pending
- [ ] #22/L24: 편집기는 숨겨진 컨테이너도 반환할 수 있지만 controller는 보이는 것만 찾음. 서로 다른 인스턴스를 짝지을 여지가 있음 — pending
- [ ] #22/L25: store 메시지와 DOM 로그 행을 합쳐 같은 로그가 중복될 수 있음 — pending
- [ ] #22/L26: `'={"symbol":"' + sym + '"}'` 문자열 결합. `JSON.stringify`를 쓰는 편이 안전 — pending
- [ ] #22/N1: Korean layout switch false success — pending
- [ ] #22/N2: unmodified draft save false success — pending
- [ ] #22/N3: analyzer diagnostic/exit contract — pending
- [ ] #22/style: compressed state-machine code, duplicate declarations/constants, stale references — pending

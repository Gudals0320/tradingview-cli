# Issue #14 — Lead → Executor

## 시작점
- 작업폴더 고정: `C:\Codex\.worktrees\tradingview-cli-deep-backtesting-test`.
- 열린 브랜치: `codex/issue-14-independent-cli`; 최신 origin/main `fd1ce4123d294346c40d757c1237e4d6a1fcb6e9`에서 생성.
- Issue: https://github.com/Gudals0320/tradingview-cli/issues/14
- 상세 범위/완료 조건: [ISSUE.md](ISSUE.md). GitHub 본문과 이 파일은 Lead 인계 시 동일 내용.
- Lead는 제품 코드를 변경하지 않았다. 이 디렉터리의 재현 스크립트/증거/인계 문서만 추가했다.

## 역할과 연락
사용자가 명시적으로 요청한 역할:
- Lead: `01a0f582-c2a9-7843-b573-f607a64545f8`, GPT-6-Astra / Medium / fast off. 필요할 때 재현·범위 질문을 보낼 수 있다.
- Executor: GPT-6.1-Sol / High / fast on 요청. 코드 구현·검증·복구·중간 커밋 담당.
- Reviewer: `anthropic/claude-opus-5-5` / Medium / fast off 요청. 필요한 첫 리뷰 시점에만 별도 채팅을 만들고 이후 같은 Reviewer와 계속 소통한다.
- 사용자는 Executor가 Lead에 필요시 메시지를 보내고 Executor–Reviewer가 상호 소통하는 것을 직접 허용했다. Reviewer 생성 프롬프트에도 이 권한과 Executor의 실제 thread ID를 전달한다.
- 모든 채팅은 같은 프로젝트의 local 환경을 사용한다. 프로젝트 ID `fe13366c-a37e-4391-885f-6698391729a1`. worktree 모드/다른 checkout 금지.
- Reviewer는 검토를 기본으로 하며, 같은 작업폴더에서 동시 코드 쓰기/branch 전환을 하지 않는다. 리뷰할 커밋과 증거를 지정한다.
- 현재 create_thread 도구에는 fast/service-tier 옵션이 없다. 모델/effort는 지정 가능하지만 fast 설정이 적용됐다고 주장하지 않는다. UI에서 확인할 필요가 있으면 사용자에게 그 제한을 알려야 한다.
- Lead는 인계 이후 지속 폴링을 하지 않는다. Executor가 주도적으로 진행한다.

## 권장 실행 순서
1. status와 인계 커밋을 확인한다. 사용자 변경이 나타나면 덮어쓰지 않는다.
2. ISSUE.md를 읽고 현재 main의 session/router/connection/Pine 경로를 기준으로 설계를 구체화한다.
3. Dot 브랜치는 git show/diff로 참고만 한다. main에 없는 선행 코드와 최신 Pine 변경의 호환성을 개별 검토한다.
4. workspace/소유권 및 명령 라우팅을 작은 단위로 구현하고, 첫 설계/핵심 커밋이 준비되면 Reviewer를 생성하여 조기 검토를 받는다.
5. 테스트용 자원 2개에서 정확성·독립 진행을 검증하고 장애 격리·벤치마크를 진행한다.
6. Reviewer 지적 수정 후 동일 Reviewer에게 재검토를 요청한다.
7. 의미 있는 여러 커밋을 유지한다. 전체 squash/단일 최종 커밋 금지. PR/merge 금지. 합의된 clean branch로 대기한다.

## 실환경 접근 경계
- 사용자 보고: 별도 포트/프로필 로그인 실험에서 기존 클라이언트 세션 끊김 발생. multi-port/다중 인스턴스 재시도 금지.
- 9222 HTTP inventory에 차트 target 1개가 있었음. 계정 플랜과 연결/로그인 정상 여부는 이번 Lead 단계에서 확인하지 않았다.
- 이전 사용자 작업과 차트·문서·레이아웃을 임의로 변경하지 않는다. 기존 차트에 대한 명령이나 재시작 없이 작업했다.
- 별도 테스트 자원을 안전하게 준비할 수 있는지 확인한다. 불가능하면 필요한 target/레이아웃/문서 또는 테스트 가능 시점만 사용자에게 묻고 독립적인 오프라인 구현은 계속한다.
- `tv launch --no-kill`도 안전하다고 가정하지 말 것: main health.js의 WindowsApps fallback에는 killExisting 호출 경로가 있다. 이 이슈 작업에서 launch/restart를 실행하지 않는다.
- 9333 실험 인스턴스나 기존 프로필/쿠키를 복사하거나 다시 로그인하지 않는다.

## Lead의 재현 결과
`node qa/parallel/issue-14/reproduce-admission.mjs`
- 실제 session.js와 두 자식 프로세스, 테스트 전용 TEMP 디렉터리와 연결하지 않는 가상 endpoint 사용.
- 두 일반 접근 검사가 동시에 통과하며 소유권은 생성되지 않음.
- endpoint lease 보유 중 외부 프로세스는 SESSION_BUSY.
- 재현은 기준 main의 admission 동작을 보이는 스크립트다. 변경 후 회귀 테스트 역할로 그대로 유지해야 한다는 뜻은 아니다. 수정 후 동작에 맞는 별도 테스트를 구현하라.
- `baseline-admission.json`은 기준 SHA의 원시 출력이다. 수정 후 결과로 덮어쓰지 않는다.
- CDP 페이지 Runtime/DOM/소스 변경 없음. Windows 실제 병렬 계산/차트 오염/처리량 증거 없음.

## 기준 검사
- Node v24.19.0, Windows, Desktop 3.4.1 / Electron 41.7.1.
- npm ci --ignore-scripts --no-audit --no-fund 완료(node_modules 준비됨, tracked 변경 없음).
- PowerShell: `$env:TRADINGVIEW_SKIP_NETWORK_TESTS='1'; npm test` → 339 passed, 0 failed (외부 Pine 서버 검사 제외).
- npm run lint → 통과.
- 테스트 로그: `$env:TEMP\tv-issue14-baseline-tests.log` (로컬 임시 로그).
- 추가 개발 검증은 새 변경/실패에 맞춰 수행하며 baseline을 실환경 통과로 혼동하지 않는다.

## Dot 자료에 대한 구체적 주의
- ref: origin/codex/parallel-workers @ 9d61c74a1f5ffa0e788dae92f70dd4a92be04c37.
- merge-base 95a5828; main-only 44 commits, Dot-only 2 commits.
- target/Pine resource lease 아이디어는 참고 가능하나 layout은 진단 메타데이터로만 취급하며 공유를 허용한다. 이번 목표의 distinct-layout 계약과 다르다.
- 영문 저장 대화상자/매 실행 새 서버 버전/동일 소스 거부/손쉬운 구 main 회귀를 피한다.
- 실패 compile_performed=true의 의미 혼동, host timeout, 저장·native 계산·정리 중 장애 검증을 별도 점검한다.
- 61.3% 처리량 향상은 게시된 집계 보고일 뿐 독립 재현 증거로 사용하지 않는다.


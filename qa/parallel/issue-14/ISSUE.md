## 목표와 필수 조건

하나의 TradingView Desktop 인스턴스·하나의 CDP 포트에서 여러 독립 CLI 작업이 자기 target·레이아웃·Pine 문서·결과·복구 상태를 소유하며 동시에 실행되도록 한다. 결과 정확성과 실제 처리량 증가를 모두 검증한다.

- 작업 큐, 파이프라인, 전역 실행 잠금, 활성 탭/포커스 교대 실행으로 병렬성을 대체하지 않는다.
- multi-port/다중 Desktop 인스턴스는 제외한다. 사용자가 직접 동일 계정의 두 번째 인스턴스 로그인 후 기존 클라이언트 세션 끊김을 확인했다. 이는 사용자 환경에서의 관측이며 모든 계정에 대한 일반화는 아니다.
- 서로 다른 worker는 독립적으로 진행한다. 동일 자원 중복 소유는 대기 없이 명시적인 충돌 오류를 반환한다.
- 지원되는 작업 경로에서 다른 worker의 실행/중단/복구가 자기 상태를 변경하면 안 된다. 외부 사용자·구버전 CLI의 변경을 물리적으로 막는다는 주장은 하지 않고, 감지 시 실패하도록 한다.

## 개발 기준 및 역할

- 최신 main 기준: `fd1ce4123d294346c40d757c1237e4d6a1fcb6e9` (2026-10-01 fetch 확인).
- 새 작업 브랜치: `codex/issue-14-independent-cli`.
- 모든 채팅의 작업폴더: `C:\Codex\.worktrees\tradingview-cli-deep-backtesting-test`. 새 worktree/별도 checkout을 만들지 않는다.
- Lead: 문제 정리·기준 재현·작업 인계. Executor: 실제 구현·테스트·중간 커밋. Reviewer: 독립 검증 및 Executor와 수정 합의.
- 여러 의미 있는 커밋으로 관리한다. 하나의 최종 커밋으로 전체를 몰지 않는다.
- PR 생성·merge 없이, Reviewer와 합의한 clean 브랜치 상태로 마친다.

## 현재 main에서 확인한 문제

1. `src/cli/router.js:execute`는 일반 명령 실행 전에 `assertSessionAccess()`만 호출한다. 이 검사는 소유권을 획득하지 않는다.
2. `src/session.js`의 잠금/journal 키는 endpoint(host/port) 단위다. `examples/pine-batch.js`는 전체 endpoint를 점유하므로 별도 target 배치도 막는다.
3. `--target`은 연결 대상 지정이며 작업 예약이 아니다. 기본 경로는 활성 target을 선택하고, 배치는 실제 탭 전환/복원을 한다.
4. target이 달라도 저장 레이아웃/Pine 문서를 공유하면 영속 상태가 겹칠 수 있다. 탭 분리만으로 독립성을 증명할 수 없다.
5. main에는 최근 Pine QA 수정(#13 포함)이 있다. 새 경로가 문서 식별, 저장 여부, 수정/미수정 컴파일, 오류 응답과 viewport 검증을 퇴행시키면 안 된다.

### 재현과 확인 수준

`node qa/parallel/issue-14/reproduce-admission.mjs`

현재 main의 실제 session 모듈과 두 Node 자식 프로세스로, 별도 임시 디렉터리/가상 endpoint에서 재현했다. CDP에 연결하거나 Desktop을 조작하지 않는다.

- 일반 접근 검사: 두 프로세스가 동시에 admitted=true, lock_created=false.
- endpoint lease를 보유한 동안 다른 프로세스: SESSION_BUSY.
- target 정보가 달라도 현재 session 키는 동일하다(target 옵션 자체가 현재 스코프 계약에 없음).
- 기록: `qa/parallel/issue-14/baseline-admission.json`.
- 이것은 admission 결함의 재현이다. 실차트 오염/Windows 처리량 재현이라고 주장하지 않는다.

기준 확인: Windows / Node v24.19.0 / TradingView Desktop 3.4.1 / Electron 41.7.1. 9222의 HTTP inventory에서 차트 target 1개 확인. 계정 플랜은 확인하지 않았다. 기존 차트/에디터/로그인 상태는 변경하지 않았다.

기준 검증: `npm ci --ignore-scripts --no-audit --no-fund`, 네트워크 Pine 검사 제외 환경에서 `npm test` 339 pass / 0 fail, `npm run lint` 통과. 이는 Desktop 실환경 검증과 별개다.

## Dot 선행 실험: 참고만 사용

- [선행 보고](https://github.com/Gudals0320/tradingview-cli/issues/14#issuecomment-5928680084)
- [추가 보고/Windows 파일 저장 수정](https://github.com/Gudals0320/tradingview-cli/issues/14#issuecomment-5928760455)
- 참조 브랜치 `origin/codex/parallel-workers`: `9d61c74a1f5ffa0e788dae92f70dd4a92be04c37`.
- 공통 조상 `95a582886ddd2f4516980d232fcce1c4d1eca71f`; 현재 main에만 44커밋, Dot 브랜치에만 2커밋이다. 전체 merge/cherry-pick을 기본 접근으로 삼지 않는다.
- Linux cloud / Basic / 자동저장 OFF 공유 저장 레이아웃 / 별도 Pine 문서 / warmed 일반 백테스트 2-worker 조건의 보고다.
- +61.3%와 1.7409배는 Dot이 보고한 집계값이다. 원시 자료 미게시, Windows Desktop 미검증이므로 이번 작업의 통과 근거가 아니다.
- 선행 구현은 영문 Save-before-Add DOM, 실행마다 새 저장 버전 요구, 제한된 사전 컴파일 장애 복구, compile_performed의 시도/실행 혼동 등이 있다. 타깃/Pine 소유권 구조는 참고할 수 있으나 별도 저장 레이아웃 소유권과 최신 Pine 동작은 다시 설계·검증한다.
- 기존 댓글과 자료는 이력으로 남긴다. 현재 이 본문의 요구사항과 최신 main을 우선한다.

## Executor 작업 항목

### A. 작업 식별·자원 소유권
- 여러 CLI 호출에 걸쳐 같은 작업을 이어갈 수 있는 workspace/session 계약을 정한다(명칭은 구현자가 결정).
- 정확한 endpoint, target, 페이지 세대, 별도 저장 레이아웃, Pine 문서를 고정한다. 다른 target/활성 탭으로 자동 fallback하지 않는다.
- target/저장 레이아웃/Pine 문서의 중복 소유를 검증한다. 소유권 획득은 원자적으로 수행하고 충돌은 즉시 실패한다.
- PID만 믿지 말고 소유 토큰·중단 상태를 다룬다. 다른 작업의 lock/journal/결과를 지우지 않는다.
- 초기 버전은 미리 준비한 테스트 target 등록이 가능하다. 실행 중 공용 UI 자원을 번갈아 쓰는 것으로 완전 병렬을 흉내 내지 않는다.

### B. 명령 실행 경로와 호환성
- target별 연결/상태를 명확히 분리하고 기존 명령의 대상 선택 및 잠금 검사를 통합한다.
- 최소 지원 흐름: 종목·시간봉 설정, Pine 소스 적용/컴파일 또는 전략 입력 변경, 계산 완료 확인, 전략 결과/거래 원장 수집.
- legacy/UI/탭/레이아웃/임의 eval 등의 명령을 분류해 소유권을 우회하지 못하게 한다. 독립 실행을 보장할 수 없는 공용 명령은 명확히 거부한다. 지원 명령표를 문서화한다.
- 새 worker 명령만 별도 만들고 일반 CLI가 같은 자원을 계속 무방비로 변경하는 상태는 완료가 아니다.
- main의 Pine QA 수정은 유지한다. 불필요한 영속 저장/새 버전 생성이나 반복 동일 소스 실행 거부를 독립성의 필수 조건으로 삼지 않는다.

### C. 재현·장애 격리
- Windows 한국어 Desktop에 테스트용 별도 레이아웃·문서·target 2개를 확보하고 식별 증거를 기록한다.
- 로컬 기존 작업 자원과 9333 실험 인스턴스를 사용/재로그인/재시작하지 않는다. 테스트 자원을 안전하게 확보할 수 없으면 필요한 자원만 사용자에게 요청하고 오프라인 작업은 계속한다.
- 두 독립 OS 프로세스로 실행하고 비활성 target에서도 진행되는지 확인한다.
- 동일 target/문서/레이아웃 충돌, 재연결/페이지 reload, 외부 변경, 프로세스 종료, target 소실, 복구 실패를 검증한다.
- 쓰기 전뿐 아니라 컴파일/계산 진행 중과 정리 시점도 검토한다. A 실패 후 B의 정확한 완료를 확인한다.
- 일반 백테스트부터 검증한다. Deep Backtesting은 별도 권한·경로·증거 없이는 지원/성능을 주장하지 않는다.

### D. 실제 처리량과 증거
- 같은 작업 묶음을 1-worker와 2-worker로 교차 순서 반복 비교한다. 자원/계정이 허용하면 4-worker를 추가하되 미실행을 성공으로 대체하지 않는다.
- source/input/context/report 소속과 결과 동등성, 완료 건수/벽시계 시간, 오류·재시도, 계산 생명주기 중첩을 기록한다.
- 준비·warm-up·정리·저장 비용과 end-to-end 시간을 각각 공개한다. 유리한 실행만 골라 집계하지 않는다.
- 민감한 인증값/개인 소스 없이 재현 명령·환경·커밋·원시 결과·집계 도구를 보존한다.
- CLI 동시 시작이나 mock 통과만으로 성공 처리하지 않는다. 실제 throughput 증가를 반복 관측해야 한다. 증가하지 않으면 원인을 보고하고 목표를 큐로 바꾸지 않는다.

## 완료 조건

- [ ] 서로 다른 작업의 지원 명령이 단일 endpoint에서 교대 실행 없이 병렬 진행
- [ ] target·저장 레이아웃·Pine 문서·결과·복구의 분리와 충돌 즉시 실패
- [ ] 기존 main Pine 동작의 회귀 없음, 단위/통합/lint 검증
- [ ] Windows 실환경의 결과 정확성·장애 격리 증거
- [ ] 재현 가능한 1/2-worker 처리량 증가 증거와 한계 기록
- [ ] Executor–Reviewer 합의, 의미 있는 중간 커밋, clean 브랜치
- [ ] PR/merge 없이 대기


# S02 — UTC 세션 거래량·범위·봉 수 대시보드 (완료 handoff)

Worktree: `C:\Codex\.worktrees\tradingview-cli-pinescript-qa` · Branch: `codex/pine-qa` · Product baseline: 57ee8e7
전용 레이아웃: **CLI-QA-S02-20261001** (chart `nipHauoX`, target `7980FA5955C48DD48FF5EDBF9615BD45`)
저장 문서: **CLI-QA-S02 Session Dashboard 20261001** (`USER;6b325663a8a24b548558d60895ec3bc8`, 최종 v5.0)
제품 소스·공통 파일·다른 시나리오·Git은 수정하지 않았습니다.

## 1. 시나리오와 소스

요청: UTC 세션별 거래량·범위·봉 수를 집계하고 최근 완료 세션 20개를 저장하는 대시보드 개발·검증.

편집 순서(실제 실행):

실행 런은 두 번입니다. **런 A(ETHUSDT, v1 최초 반영)** — v1을 `pine new` 직후 `pine save` 후 `pine compile`로 반영했고, study가 없어 `addToChart` 경로로 차트에 추가되었습니다(기록 `24-compile-v1` exit 0, `button_clicked: addToChart`). **런 B(ETHUSDT→BTCUSDT→ETHUSDT, v2 오류 주입~v3 복구)** — 아래 표의 편집이 모두 실제 차트에 반영된 실행입니다.

문서 정정(Desktop 추가 실행 없음): 이전 초안의 "v1 최초 add 거부" 서술은 기록된 로그에서 확인되지 않아 근거에서 제외합니다. v2 이후 차트 반영(`updateOnChart`) 경로만 `Rejected`가 재현되었습니다.

| 단계 | 소스 | 핵심 |
|---|---|---|
| v1 baseline | `v1-baseline.pine` (SHA-256 `31fcd302…`) | 명시 UTC 세션 입력, 진행 세션 누적, 완료 시 1회 push, 20개 제한, 평균·표, 시작/완료/삭제 로그 |
| v2 오류 주입 | `v2-array-error.pine` (`6c0ffc57…`) | 히스토리 배열 크기 검사 없이 `array.get(histBars, size-1)` + 빈 배열에서 `for i = 0 to n-1` |
| v3 수정 | `v3-array-fixed.pine` (`eb174c78…`) | 경계 검사 복구 + 세션 완료 시 누적기 초기화(세션 전환 초기화) + 빈 이력 시 헤더만 |

독립 대조 표본:
- ETHUSDT 15분: 테이블 5행(09-27~10-01) 및 시리즈 24세션(09-07~10-01) 전부 일치.
- BTCUSDT 15분(1분봉 전환 런 포함): 9세션(09-21~09-29) 콘솔 완료 로그와 시리즈 일치.

v1→v2 실제 diff: `priorBars` 무가드 읽기 추가, 행 루프의 `if n > 0` 가드 제거.
v2→v3 실제 diff: 두 곳에 경계 검사 추가, 세션 완료 시 `runStartTs/runVol/runHigh/runLow/runBars` 초기화, 진행 셀 "no active session".

## 2. 수용 기준 판정

| # | 기준 | 판정 | 근거 |
|---|---|---|---|
| C1 | 첫 완료 세션 전 오류 없음 | **PASS (제한적)** | 캡처된 콘솔 기록 전부에서 오류 항목 0건이고 정상 실행 중 study 런타임 오류가 관측되지 않았습니다. 다만 최초 계산 구간 자체는 추출 창/콘솔 버퍼 밖이라 직접 보지 못했습니다. (정정: 이전 초안의 "완료 전 파생값 null" 간접 근거는 실제 스냅샷이 `hc=20, rm=171` 등 비어 있지 않으므로 철회합니다.) |
| C2 | 세션당 정확히 1회 기록 | **PASS** | 세션당 완료 1회·시작 1회, 중복/고아 완료 0 (session-analysis.json, series-verification.json의 24개 increment 전부 일치) |
| C3 | 새 세션 초기화 | **PASS** | 각 세션 첫 봉에서 runBars=1·runVol=첫 봉 거래량·runHigh/Low=첫 봉 고저 (24/24 세션) |
| C4 | 한도5에서 최신5개만, 표/배열 일관 | **PASS** | keep=5에서 표 5행(09-27~10-01), 배열 길이 5, removed 누적 단조 증가, avgVol=최신5 평균 6,815.57 일치 |
| C5 | 완료 세션 ≥2개를 같은 차트 OHLCV로 독립 계산 대조 | **PASS** | 15분봉 테이블 5행 전부 봉수·거래량·고가·저가·범위 완전 일치; 시리즈 검증 24세션 전부 일치. 표본: BTCUSDT 9세션(09-21~09-29), ETHUSDT 24세션(09-07~10-01) |
| C6 | console 실제 로그행만 | **PASS (제한적)** | `log.info` 출력이 그대로 `S02 session started/completed/oldest session removed utc=…` 형식으로만 파싱됨(오류 항목 0). 40줄 링버퍼 한계는 아래 5절 |
| C7 | 배열 오류 관측·복구 | **PASS** | 재현 2회: 저장 성공 후 compile/compile --save가 `Rejected`(exit 1) 3/3회(labels 44/48/91), 차트 study는 runtime error 상태, 수정 v3 set/save/compile --save로 복구(unchanged:true, statusType 2) |
| C8 | 저장/재열기 보존 | **PASS** | `pine get` == v3 파일 해시(`eb174c78…`) 동일, `pine open` 재열기 후 재확인 동일(141행), 콘솔에 실제 소스 저장 파이프라인 기록 존재 |
| C9 | 빈 배열에서 최초 시작을 실시간 관측 | **NOT TESTED (추출 창 제한)** | 사용 가능한 추출 창(최대 500봉)과 40줄 콘솔 버퍼가 초기 계산 구간을 포함하지 않아 직접 검증하지 못했습니다. Pine의 첫 계산이 선 채워진 상태인지도 단정하지 않습니다. |
| C10 | 실시간 세션 롤오버 | **NOT TESTED** | 장시간 대기 회피 지침에 따라 미검증 |

## 3. 실제 CLI 기록 (요약)

- 총 기록 명령 109건(results/pine-scenarios/s02-session-dashboard/log.jsonl), 비정상 종료 7건(전부 위 결함/의도적 오류 또는 harness 사용 오류).
- 주요 명령: `tab new --layout new`, `timeframe 15`, `ohlcv --count 500`, `pine new/set/save/compile/compile --save/get/open/errors/console/list`, `pine check/analyze`, `data tables --filter CLI-QA-S02`, `indicator set/get`, `replay start/stop`, `range`, `ui eval`.
- `pine check`는 샌드박스 네트워크 차단으로 bare `fetch failed`(exit 1) 후 승인 하에 재실행 성공(v1·v2 모두 서버 컴파일 통과).
### 콘솔 ↔ 표/시리즈 비교의 한계 (통과 근거로 쓰지 않은 이유)

`ohlcv-session-verification.json`의 `console_vs_ohlcv`는 8건 차이(`console_matches_ohlcv=false`)이고, `session-analysis.json`의 `table_check.mismatches`는 47건(`avgVolMatchesConsole=false`)입니다. 차이는 모두 다음과 같이 설명되며, 어떤 것도 제품 계산의 불일치가 아닙니다.

1. **다른 스냅샷/보존 구간**: 표 스냅샷(`100-tables-final`)은 09-12~10-01(20행), 콘솔 스냅샷(`58`/`34`)은 그 이전에 캡처된 09-21~09-29 구간이라 서로 다른 최신 세션 집합을 담습니다. 콘솔에 없는 09-25 등은 캡처 시점 차이입니다.
2. **표시 정밀도**: 콘솔 완료 로그의 거래량은 4자리 표시값이라 정확값과 ±0.0001~±0.0004 차이가 납니다(예: 표시 4418.377 vs 정확 4418.3769).

따라서 콘솔↔표/시리즈 "완전일치"는 어디에도 주장하지 않습니다. 통과 근거는 **`table_matches_ohlcv=true`(표 5행 5/5 완전일치)** 와 **시리즈 검증의 통계/초기화/보존 체크**뿐이며, 원시 실패 비교는 위 이유 때문에 근거에서 제외한 채 `results/`에 그대로 보존합니다.

- 독립 산출물: `ohlcv-session-verification.json`, `series-verification.json`, `session-analysis.json`, `source-verification.json`, `evidence.json`(살균).

## 4. 재현된 제품 결함

### 제품 결함

#### D1. 런타임 오류 스크립트의 차트 반영이 `Rejected` 한 단어로 실패
- 트리거: v2 저장(성공) → `pine compile` 또는 `pine compile --save`.
- 최소 재현: 저장된 스크립트가 빈 아카이브 상태의 첫 세션 시작 시점(관측: `bar_index 18`, 코드 라인 53)에 무가드 `array.get`을 수행하도록 만들고 기존 차트 study로 업데이트.
- 기대: 런타임 오류를 식별할 수 있는 구조적 진단(차트 study는 RE10045로 `funcName/index/size/bar_index`를 제공).
- 실제: `{"success":false,"compiled":false,"error":"Rejected"}` (exit 1), code/진단 없음. 에디터 마커 0건, 선언 시점이라 버튼은 disabled.
- 빈도: 3/3 (labels 44, 48, 91 — 오류 주입 2개 cycle에서 `compile --save`, `compile`, `compile --save` 3회 시도), 2회 독립 재현. 정상 v1의 최초 `addToChart`는 동일 조건이 아니며 기록상 실패 사실도 없습니다.
- 우회: 소스를 수정하면 같은 경로로 정상 반영(v3).
- 의심 컴포넌트: `src/core/pine-state.js`의 `dispatchPineCompilation`/`verifyPineCompilation` 또는 네이티브 `updateOnChart` 거부 경로.

### 환경 요인 (제품 결함 아님)
- `pine check`가 샌드박스 네트워크 미도달 시 `fetch failed`만 반환(exit 1). 네트워크가 있으면 정상 동작하며, 프로토콜이 예상하는 샌드박스 제약입니다.

### 알려진 한계 (제품 결함 아님)
- `pine analyze`가 계산 인덱스 `array.get` 무가드를 감지하지 못함(issue_count 0). 프로토콜이 `analyze`를 휴리스틱으로 규정하고 있고 정수 리터럴 범위만 검사하므로 범위 내 동작입니다.

fixture 오류(제품 결함 아님): 추출 스크립트 플롯 오프셋(F1), 세션 윈도우 이탈 시 세션 유실(F2), `ui click --text` 잘못된 사용법(F3).

## 5. 남은 QA 상태 / 다음 작업자 메모

- 레이아웃·문서·차트: 위 1절 그대로. 차트 study 2개(Volume, S02), replay 중지, 열린 다이얼로그 0.
- 콘솔 링버퍼 40줄 한계로 fresh-run 완전 로그는 세션이 9개를 넘으면 소실 → 완전한 시작/완료/삭제 계열이 필요하면 `pine-logs-level` 필터나 UI 초기화를 harness에 포함해야 함.
- 사용 가능한 추출 창이 최대 500봉이라 초기 계산 구간을 직접 관측하지 못했습니다(C9). 이는 실행 이력 자체의 제한이 아니라 관측 창/버퍼의 제한이며, Pine의 첫 계산이 선 채워진 상태라고 단정하지 않습니다.
- 다른 시나리오 자산 미접촉(S01 문서 `CLI-QA-S01 MTF Trend 20261001` v6.0 그대로 확인).

## 6. 종합 결과와 한계

요구된 개발·오류 주입·수정·초기화·한도 변경·저장/재열기·독립 OHLCV 대조를 실제 차트에서 완료했습니다. 핵심 기능(세션 집계, 1회 기록, 20/5 제한, 표 일관성)은 독립 계산과 완전히 일치하며, 런타임 배열 오류는 1건의 제품 진단 결함(D1)과 함께 명확히 재현·복구되었습니다. 빈 이력 시작의 직접 관측(C9)은 사용 가능한 추출 창/콘솔 버퍼 제한으로 NOT TESTED, 실시간 롤오버(C10)는 NOT TESTED입니다. 제품 코드는 수정하지 않았습니다.

증거: `evidence.json` (QA 디렉터리), 원시 CLI 출력은 무시된 `results/pine-scenarios/s02-session-dashboard/`에만 보관.


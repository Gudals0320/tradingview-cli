# 이슈 #26: 실제 백테스트 전 마지막 정적 검증

> 이 문서는 #26 당시 v1 코드의 역사적 검증 기록입니다. 현재 v2의 실행·잠금·선택·배치
> 계약은 [workspaces.md](workspaces.md)와 [operation-contracts.md](operation-contracts.md)를
> 따릅니다. 아래 endpoint 독점/active-tab batch 서술은 당시 fixture 증거이며 현재 운영
> 절차가 아닙니다. 현재 자동화는 이름 있는 workspace와 `examples/workspace-batch.mjs`를
> 사용하고, 이 기록의 source/report 보호 검사는 회귀 테스트로 유지됩니다.

검증 날짜: 2026-10-02 (Asia/Seoul). 대상은 로컬 및 fetch 후 원격 main 모두 `116cadf06211c0f7a3ed7730b413eefc5bd3ab9c`. 작업 브랜치는 `codex/issue-26-backtest-readiness`이며 main을 직접 수정하지 않았습니다. 이 기록의 “정적 검증”은 코드 검토와 offline native/DOM fixture 및 실제 CLI의 로컬 HTTP/CDP 계약 검증을 포함합니다. 내부 객체를 읽는 구현 방식과 검증 환경은 별개입니다. 실제 TradingView Desktop, 로그인, 개인 탭, 미저장 초안을 조작하지 않았습니다.

## 발견과 수정

| 차단 문제 | 수정 | 회귀 근거 |
| --- | --- | --- |
| 새 Pine 소스를 주입했지만 아직 compile하지 않거나 초기 SAVE_REQUIRED로 거부되면 이전 epoch의 report가 성공할 수 있었음 | set/new/open의 실제 editor 내용 변화 후 페이지의 모든 전략 epoch/cache를 REPORT_INVALIDATED로 해제. 동일 내용/변경 없는 setter 거부는 보존; partial mutation도 해제 | `tests/strategy_state.test.js`: 실제 serialized setSource, 이후 compile 초기 거부·재컴파일·새 VM 조회·원래 소스 same-version refresh. `pine_lifecycle`: new/open/same/거부/partial failure |
| ledger 페이지에 조건/결과 revision이 없어 중간 변경 혼입 가능 | run identity 및 전체 native ledger/performance/settings SHA-256, --report-revision 비교와 REPORT_CHANGED. strategy 선택 옵션과 next_offset 추가 | `tests/strategy_state.test.js`: 내부 거래 변경, 경계·종료·unsafe offset; `tests/cli-contract.test.js`: 실제 CLI/HTTP/WebSocket, stdout failure/exit 1, 무복구 journal |
| batch orders 실패/다른 실행 identity를 성공 결과처럼 저장 가능; throw가 이전 성공 결과를 숨김 | success/ID/token/hash/input/context 검사. completed_results와 failed_run 단계·파라미터·코드를 실패 details에 보존 | `tests/pine_batch.test.js`: 두 번째 변형 orders 실패, foreign hash, 컴파일 실패·stale report·복원 실패 |
| OHLCV 최신 tail과 부족한 히스토리의 truncated 의미 혼동, 누락 volume=0, 내부 봉 누락/graphics/view 추출 예외를 조용히 생략 | truncated와 insufficient_history 분리, null volume/avg_volume, 내부 봉 누락과 실제 추출 예외 실패. 지원되는 두 native table shape 유지 | `tests/data-contracts.test.js`: tail/short history, null volume, missing bar, API throw, 빈 셀/행 유지 |
| 새 fail-closed 오류가 페이지 예외 메시지에만 있고 CLI code/details가 없음(Reviewer 지적) | readData structured error envelope로 Node code/details 변환. graphics/values에 실패 study ID/name, missing bar에 index 제공 | `data-contracts`: 실제 page throw 식별; `cli-contract`: 실제 CLI stderr code/details 및 exit 1 |
| 비유한 지표가 JSON null로 변환되어 의미 불명확; 잘못된 tm이 RangeError로 전체 ledger 중단 | 유한 지표만 보존하고 missing_metrics 명시. 안전 UTC 변환과 timestamp_errors. total count fallback은 양쪽 count 요구 | `tests/strategy_state.test.js`: 손실 부호·Infinity/누락, 초/밀리초·invalid·out-of-range·시각 누락·미청산 fixture |

## 전체 체크리스트 근거

| 이슈 항목 | 코드 및 검사 근거 / 보장 범위 |
| --- | --- |
| 1. 소스/컴파일 실패 후 이전 결과 | `core/pine.js` setSource/newScript/openScript/smartCompile/finalize, `strategy-state.js` begin/fail/read. CLI source 변화는 페이지 모든 cache invalidate, 실제 compile 실패는 terminal. GUI 소스-only 편집은 이 주입 감시 밖. 이후 indicator input-only 재검증의 source_hash:null은 에디터 소스 적용 검증을 뜻하지 않음. |
| 1. 종목·시간봉·inputs 재계산 | `calculationKey`, `observeCalculation`, `compilationState`, `core/indicators.js` setInputs. native 시작/완료 cycle과 현재 key가 맞아야 채택. `strategy_state` fixtures의 종목/해상도/type, input A-B-A 및 timeout, `arguments`의 atomic unknown input 검사. chart setters의 chart_ready는 전략 report_ready와 별개. |
| 1. pending/unverified/timeout | 모든 strategy data endpoint는 readStrategyReport gate를 사용. `strategy_state`, `pine_outcome`, `pine_compile`, `workspace-runtime`의 실패/늦은 완료 검증. REPORT_TIMEOUT의 calculation_pending은 성공 표시가 아님; recover 없이 reload/force하지 않음. |
| 1. token/hash/input 보장 | token은 compile epoch, hash는 물리 CRLF 정규화된 CLI 소스 SHA-256, inputs fingerprint와 key는 현재 조건 검사. input-only 검증은 token/hash null 가능; token은 input/종목 변경마다 새로 발급되지 않음. reconnect 후 같은 페이지 감시는 남지만 page reload 후 소실. |
| 1. 전략 선택/ID | pine document ID와 exact target로 컴파일 매칭, duplicate target은 거부. read gate는 다른 전략 검증을 상속하지 않음. --strategy-id는 세션 ID, 이전 연결 ID 영속성 보장 없음. `pine_targets`, `strategy_state` duplicate/foreign/explicit selection tests. |
| 2. metrics 단위·비율·부호·누락 | native 수치 그대로, 단위·missing_metrics 명시; loss/DrawDown sign 강제 변환 없음. complete는 유한 netProfit 및 nonnegative integer trade count 필요. fallback win+lose는 breakeven을 포함하지 않을 수 있음. 각 percent 필드 실제 fraction/부호는 Desktop 미검증. |
| 2. 주문 이벤트 vs ledger | ordersData tail은 order_seq(ordinal), trades 배열은 거래 원장. 주문 상한 20, 원장 페이지 500. ORDERS_UNAVAILABLE/LEDGER_UNAVAILABLE은 정상 []와 구분. `strategy_state` endpoint/cap/availability tests. |
| 2. pagination 경계/변경 | native ordinal ascending, 다음 offset/has_more로 종료. revision을 전달하면 전체 native 배열 변경 검출(내부 거래도 포함). 전달 없으면 다른 snapshot이 섞일 수 있음. revision은 immutable server snapshot이나 거래소 완전성 증명이 아님; 매 페이지 O(전체 ledger) 직렬화·전송·해시. |
| 2. timestamp/open trade | 원본 tm/e/x/b 보존, 숫자 크기 기반 초/ms와 ISO → UTC. missing null, malformed null+timestamp_errors. open은 x 없음만 표현. 실제 native가 open 거래를 포함하는지 미검증. |
| 2. windows | backtest=settings dateRange, loaded=메모리 봉 범위, trade=첫 진입/마지막 청산 또는 진입. trade_window는 min/max/미청산 평가시각 아님. `strategy_state` metadata fixtures, batch verifyHistory의 달력 구간 검사. |
| 2. OHLCV/주문 상한 | ohlcv는 1..20000(기본500), 초과 요청은 오류. 로드된 이력만 반환하며 추가 로딩 없이 tail 잘림/부족 별도. orders는 요청값/20 cap/총수/잘림 명시. `data-contracts` 및 `arguments` 입력 상한 검사. |
| 2. 없음/미지원/추출 실패 | complete gate, missing_metrics(누락/비유한값 모두), availability code, equity error, filter not found, 추출 예외 실패. study 하나의 values/graphics 읽기 예외도 전체 호출 실패, code/study details 포함. Pine graphics collection 부재는 현재 검출 출력 없음이며 역사 전체가 빈 증거 아님. `values`는 표시 문자열, dataWindowView 없는 source는 제외. |
| 3. batch 현재 CLI/저장 identity | `examples/pine-batch.js`는 현재 core 직접 호출과 자체 parseArgs 사용(tv batch 명령 없음). CLI help data/pine compile/indicator set/ohlcv/quote로 옵션 확인. 각 성공 결과는 source/hash/token/study/inputs/context/parameters 포함. 예제는 metrics+최근 주문만 수집하며 full ledger 자동 수집 안 함. |
| 3. batch 실패/후속 실행 | 첫 실패에서 다음 variant를 실행하지 않고 cleanup. 실패 details는 완료 결과와 실패 단계/parameters 보존, --out은 전체 성공에만 작성. 미완료 journal은 새 baseline 채택 차단. `pine_batch`, `session`, `cli-contract` 복구/실패 tests. |
| 3. 동시 실행/공유 차트 | batch는 endpoint 독점, 개별 일반 CLI도 lease 보유; GUI는 잠금 밖. workspace는 별도 target/layout/document 소유권. source 변경·foreign strategy·사용자 외부 변화가 확인되면 mixed results/restoration 거부. |
| 4. 내부 API/DOM/버전 | metrics/report/trades/ledger/equity/bars/graphics는 내부 객체, native 이벤트. DOM fallback 없음. values는 내부 data-window. Pine editor/controller 확보에는 DOM/React fiber 사용. 내부 API도 버전 안정성 보장 없음. |
| 4. quote/depth | 현재 bid/ask와 DOM/depth는 UI/패널/공급 데이터 의존 experimental. 최신 quote bar와 optional DOM 가격 snapshot을 과거 bid/ask/spread/L2/raw execution/완전 이벤트 stream으로 취급하지 않음. 핵심 준비 상태에서 제외. |
| 5. commission/slippage/spread/funding | template Pine의 commission=0.05%/order, fixed slippage=1tick. 별도 dynamic spread/funding/체결 모델 없음. indicator/table funding 조회는 손익 반영과 다름, funding 전용 추출 없음. 소스·README 검토. |
| 5. equity | report equity/equityChart 배열 존재시만 반환, 없으면 EQUITY_UNAVAILABLE(정상 failure). buyHold 대체 없음. closed realized-P/L 누적 ledger curve는 unrealized 포함 per-bar equity와 다름. `strategy_state` availability fixtures. |

## 구현 / 이번 검증 / 실제 Desktop

| 기능 | 구현 | 이번 검사 | 이번 Desktop 실행 |
| --- | --- | --- | --- |
| Pine 주입/컴파일·target/error gate | 있음 | serialized native/DOM fixture, CLI contracts | 미실시 |
| chart symbol/resolution/type·strategy inputs | 있음 | setters 및 cycle/key/ABA fixture | 미실시 |
| metrics·orders·ledger/UTC/revision | 있음 | native shape fixture, real CLI/CDP local fixture | 미실시 |
| OHLCV·values·Pine graphics | 있음 | native collection/표시값/누락/예외 fixture | 미실시 |
| batch·소유권·복원·부분 실패 보존 | 있음 | sequential variants 및 failure/recovery fixture | 미실시 |
| current bid/ask/depth | experimental | 코드·가용성 한계 검토, 기존 quote 복원 fixture | 미실시 |
| native equity | 조건부 | availability fixture | 미실시; 배열 의미/밀도 확인 필요 |
| historical bid/ask/L2/raw executions·funding 주입·별도 dynamic cost model | 없음 | 구현/문서 경계 확인 | 대상 아님 |

## 실행한 검사와 자원

- `npm ci` 완료. Desktop 접속 없이 runtime help JSON을 조회했고 생성된 catalog는 저장/커밋하지 않았습니다.
- 초기 구현 커밋 `add2d020a9cca6a839cc0281d3d2bf80ac9951ba`: lint 및 462/462 tests PASS(Reviewer 독립 재현). Reviewer 필수 A/B를 반영한 최종 코드 커밋 `e0bb65b25a27edc14c59995c97a6e16df341ed44`: `npm run lint` PASS, `npm test` 464/464 PASS, `git diff --check` PASS. baseline은 Reviewer가 450/450 PASS 확인했습니다. 문서와 최종 후보를 포함한 독립검증 결과 및 정확한 최종 HEAD는 PR에 기록합니다.
- unit suite는 네트워크 API 및 Desktop smoke를 제외합니다. 로컬 HTTP/WebSocket 및 child CLI fixture를 사용하며 테스트 자원은 종료·정리됩니다. smoke/network suite를 실행한 것으로 간주하지 않습니다.
- npm dependencies는 작업폴더의 ignored node_modules에 유지합니다. 사용자 session/workspace/CDP target/브라우저를 생성하거나 삭제하지 않았습니다. worktree는 PR 검토를 위해 유지합니다. merge/배포/실제 최적화는 수행하지 않습니다.

## 첫 실제 백테스트에서 확인할 사항

1. 별도 disposable layout/Pine 문서에서 source set/new/open → compile → pine errors → 전략 results 확인. syntax/runtime 실패·SAVE_REQUIRED 뒤 이전 report가 성공하지 않는지 대조합니다. 원래 source로 복귀한 같은 버전 refresh에서 native cycle이 없으면 REPORT_TIMEOUT으로 실패하는지도 확인합니다.
2. 실제 build의 native 시작/완료 이벤트를 확인하고 input, symbol, timeframe 변경 및 원복 후 각 report 조건을 대조합니다. GUI 동시 편집은 하지 않습니다.
3. percent 필드 각각, gross loss/drawdown 부호, currency, breakeven/0trade count를 Strategy Tester와 대조합니다.
4. tm의 실제 native 단위, timezone/session 경계, open trade inclusion, missing timestamps, 3개 window와 요청 coverage를 대조합니다.
5. 100건 이상 원장을 페이지로 수집하고, 중간 report 변경 때 REPORT_CHANGED로 전체 수집을 다시 시작하는지 확인합니다. 실제 주문 tail과 ledger 관계도 대조합니다.
6. 실제 chart의 OHLCV 로드 상한과 missing volume, outputs/graphics의 현재 메모리 범위를 확인합니다. 내장 study를 포함한 차트에서 한 study의 예외로 values/graphics 전체가 계속 실패하는지 확인하고 실패 code/study details를 기록합니다. displayed value와 numeric series를 혼동하지 않습니다.
7. batch를 성공·실패·중단시켜 결과 identity, stderr partial results, 복원 확인 및 journal recovery를 검사합니다. 사용자 원본 초안·개인 탭은 사용하지 않습니다.
8. 필요할 때만 current quote/depth의 가용성/분류와 equity 배열 의미를 확인합니다. 미지원이면 핵심 백테스트 경로의 실패로 분류하지 않습니다.

정적으로 확인 가능한 차단 문제의 수정과 첫 실행을 위한 준비 검증이며, release 승인·모든 Desktop 버전 호환성·실제 전략 수익성 검증을 의미하지 않습니다.

## 목적과 검증 기준

서로 다른 Pine 개발 시나리오 **6개를 별도 스레드에서 순차 실행**하고, Lead가 모든 HANDOFF와 실행 증거를 검토한 통합 QA 이슈입니다. 사용자 요청에 따라 개별 이슈로 분산하지 않고 이 이슈 하나에 결과·결함·한계를 모읍니다.

- 제품 기준: `57ee8e7`, 로컬 `codex/pine-qa`. 기존 #4–#12 수정 이후의 추가 검증입니다. 이 실행에서는 `src/`, 기존 `tests/`, package 파일을 수정하지 않았습니다.
- 환경: Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Store), 한국어 UI, 로컬 CDP. 2026-10-01 KST.
- 전원 같은 checkout: `C:\Codex\.worktrees\tradingview-cli-pinescript-qa`. 쓰기 경로는 `qa/pine/scenarios/<scenario>/`, 원시 자료는 ignored `results/pine-scenarios/<scenario>/`로 분리했습니다.
- S01→S06 순서. 각 스레드의 종료/handoff 후 다음 스레드를 시작했으며 시각을 `REGISTRY.json`에 기록했습니다. Desktop 동시 실행 없음.
- 새 QA 레이아웃·문서 사용. Git 커밋은 Lead만 수행. **merge/PR/push 없음**. QA 파일들은 로컬 브랜치에 있으며, 아래 경로는 로컬 재현 자료입니다.
- 마지막 `TRADINGVIEW_SKIP_NETWORK_TESTS=1 npm test`: **308 passed, 0 failed**. `npm run lint` 통과. 이 결과는 Desktop 시나리오의 모든 경로가 통과했다는 뜻이 아닙니다.

## 여섯 시나리오 결과

| 시나리오 / 디렉터리 | 모델·effort | 실제 개발 작업 | 검토한 결과 |
|---|---|---|---|
| S01 `s01-mtf-trend` | anthropic/claude-opus-5-5 · medium | EMA 교차 지표에 확정 HTF 필터 추가, 함수 오류·복구, 시간대/입력 변경 | 5m/60·5m/240·15m/240 각 400행 HTF 시각/가격 비교. OFF=기본 신호, ON 통과/제외 일치. study1·소스 보존. 오류 compile의 저장 상태 누락 발견. 실시간 HTF rollover 직접 관측은 미실행. |
| S02 `s02-session-dashboard` | b.ai/deepseek-v4.1-flash · max | UTC 세션 거래량·범위·봉 수 집계, 배열 경계 오류·복구, 20→5 보존 | ETH 표 5행과 OHLCV 정확히 일치; series 24세션의 완료·초기화·보존 검사 통과. runtime 배열 오류 진단 누락 발견. 최초 빈 archive 직접 관측은 미검증. |
| S03 `s03-partial-exit` | gpt-6.1-sol · high | 고정 bracket→1R 50% 부분청산·본전/추적 stop·시간청산, 오류·복구 | 전용 최종 실행에서 17포지션/34개 청산 레그, TP1R 6건, 잔여 qty5 시간청산 3건. 수량/R/관측된 stop 대조 통과. 직접 save→compile 및 reopen→compile 실패; 우회 성공과 분리. 초기 harness 격리 사고·복원은 아래 별도 공개. |
| S04 `s04-pivot-drawings` | anthropic/claude-opus-5-5 · medium | 확정 피벗 label→box/line/label 영역, 30→5 한도·돌파·TTL 삭제 | 48/48 피벗 라벨, 30/30/30→5/5/5 객체, TTL0에서 3/3/3. 가격·좌표·문구 독립 시뮬레이션 일치. 오류·복구/재열기 성공. 좌표·로그 추출의 관측성 제약 기록. |
| S05 `s05-library-contracts` | b.ai/deepseek-v4.1-flash · max | export 수학 함수 5개, 타입 오류·복구, scale 인수 추가, 동일 본문의 검증 지표 | 최종 v2 함수 본문 50행 일치, 독립 oracle와 실제 표 **33/33** 통과. library 저장 보존. title 검사 차이·library 적용 timeout·패널/indicator 갱신 실패 관측. 게시/import는 수행하지 않았음. |
| S06 `s06-document-identity` | gpt-6.1-sol · high | 다른 저장 이름·같은 표시 제목 A/B, sentinel C, 충돌 D; CRLF 파일/LF stdin 교차 편집 | 10개 기준 PASS, 재열기 전략 compile 기준 FAIL. 정확한 이름 선택, 모호한 제목·부분명 거부, A/B/C/D 소스·버전 및 unrelated study 보존. 미저장 open/new 계약 통과. 재열기 B의 raw/normal 모두 Rejected. |

각 폴더의 `HANDOFF.md`, `evidence.json`과 `LEAD-REVIEW.md`를 함께 읽어야 합니다. 실패한 비교·우회·미검증을 제거하고 “전체 PASS”로 요약하면 안 됩니다.

## R1 — [P1] 변경 없는 저장 전략 재열기 후 compile 실패 및 report pending 잔존

**S06에서 직접 확인, S03에서도 유사 관측.** 정상 전략을 컴파일하고 즉시 retry하면 성공하지만, 다른 문서로 전환 후 원래 전략을 재열면 실패합니다. 원본 소스 오류나 중복 study가 아닙니다.

실제 S06 절차(전용 target 고정; `tv` = `node src/cli/index.js --target <QA_TARGET>`):

1. 저장 전략 B를 LF stdin으로 수정·저장하고 `pine compile` 성공/report_ready:true 확인.
2. 곧바로 `pine compile` → unchanged:true 성공.
3. 다른 자기 문서 A/C/D를 연 뒤 `pine open "CLI-QA-S06-Collision-B"`.
4. 동일 ID·version3.0, modified:false, 정규화 fullSHA 동일 확인.
5. `pine raw-compile` → exit1/Rejected, `pine errors` → 오류0/경고0, `pine compile` → 동일 실패.

```json
{"success":false,"compiled":false,"error":"Rejected"}
```

- S06: raw 373ms, normal 362ms, **한 재열기 상태에서 2/2 시도 실패**. S03의 재열기 실패는 별도 시나리오에서 1회 관측했습니다. 독립 재현 횟수와 retry 횟수를 합치지 않습니다.
- S06의 같은 소스가 1206자/LF33개 → 1239자/CRLF33개로 변했습니다. CRLF→LF 정규화 SHA는 계속 `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74`지만 raw SHA는 달라집니다. Lead도 원시 before/after로 재계산했습니다.
- 실패 뒤 native study는 status2/runtime_error:null/report_complete:true. 반면 CLI epoch는 **pending**, native operation은 started:false/actionDone:true/error:Rejected. 실제 `data strategy`도 exit1/**REPORT_PENDING**입니다.
- A/B study 수와 compiled input은 보존됐습니다. S04 indicator의 수정·CRLF 재열기 compile은 성공한 대조 사례입니다.

코드 근거: `src/session.js:sourceHash`는 원문을 그대로 해시하고 `src/strategy-state.js:beginCompilation`의 unchanged/awaiting 조건은 raw hash를 비교합니다. 또한 `smartCompile`의 native error 반환은 report epoch를 실패 상태로 정리하지 않습니다. **EOL 변화가 unchanged 조건을 깨뜨린다는 추론은 강하게 지지되지만, native updateOnChart 거부의 전체 원인을 확정한 것은 아닙니다.**

기대: 문서·study·입력·소스의 현재 상태를 검증해 동일 소스를 안전하게 처리하고, 실패한 action이 이후 결과 조회를 무기한 pending으로 남기지 않아야 합니다. 오래된 report를 임의로 채택하거나 study를 다시 추가하는 우회는 허용하면 안 됩니다.

재현 자료: `qa/pine/scenarios/s06-document-identity/b-v2.pine`, `run.mjs`, `followup.mjs`; raw tags `compile-B-v2`, `compile-B-retry`, `raw-B-open`, `raw-B-unchanged`, `repro-B-compile`, `followup-B-failed-epoch`, `followup-B-report-pending`. 재실행 시 Git의 자동 EOL 변환과 무관하게 **LF stdin**을 명시적으로 준비해야 합니다.

## R2 — [P2, 추가 원인 분리 필요] 정상 저장본의 갱신도 Rejected

R1과 관련될 수 있지만 같은 원인으로 확정하지 않았습니다.

- **S03**: 함수 오류 소스 set→save→compile 실패 후, 정상 소스 set→**save 성공(v6)**→compile도 Rejected. `pine errors`는 치명적 오류가 없는데 `data strategy`는 REPORT_PENDING. **오류 주입 한 cycle에서 정상 복구 실패 1회**. 작은 주석 변경 후 `compile --save`는 성공했습니다. tags `093-fixed-set`, `094-fixed-save`, `095-fixed-compile`, `095c-fixed-strategy`.
- **S05**: 정상 최종 verifier 저장본(v9, editor clean)을 기존 study에 갱신하려는 `compile --save`가 **3/3 시도 Rejected**. 기존 study는 이전 30-probe 버전을 유지했습니다. 자신의 study 제거·재추가 후 최종 33-probe가 실행됐습니다. tags `compile-verifier-v2`, `compile-verifier-v2b`, `compile-verifier-v2c`. 앞선 library/fixture/차트 상태 변화가 있는 세션이므로 신선한 독립 최소 재현은 후속 확인이 필요합니다.

기대: 정상 source save와 적용 상태를 구분해 갱신/unchanged를 검증하거나 명확한 상태 오류를 반환해야 합니다. **삭제·재추가 또는 무의미한 소스 변경을 정상 편집의 전제 조건으로 삼으면 안 됩니다.** 위 우회는 이 테스트의 복구 수단이지 제품 수정이 아닙니다.

## R3 — [P2] 실패 응답에서 저장 상태 또는 실제 진단이 사라짐

### R3a. compile --save 실패인데 실제로 저장·적용된 상태가 응답에 없음

S01에서 저장 지표에 `ta.crossovr`/`ta.smaa` 함수명 오류를 넣고 `pine compile --save` 실행. exit1/compiled:false/진단은 반환하지만 **saved/version 정보는 없음**. 실제 saved version은 증가했고 서버 저장 소스는 오류 버전, chart study도 해당 버전으로 변경되어 데이터가 사라졌습니다.

- **3/3 관측**: 본 시나리오1회 + 작은 `repro-ok.pine`/`repro-bad.pine` 2회.
- `--save`가 명시적으로 persistence를 허가했으므로 오류 소스 저장 자체를 무단 변경으로 주장하지 않습니다. plain `pine save`는 동일 상황에서 saved:true/version을 명시합니다.
- `smartCompile`은 persistence 정보를 만들지만 오류 진단 반환 분기에는 포함하지 않습니다.
- 기대: 실패하더라도 실제로 저장됐는지, 새 버전과 차트 상태가 무엇인지 구분해 반환. 자동 rollback이 있었다고 오인시키지 않아야 합니다.
- S01 tags `54-compile-save-v3`, `57-list-after-v3`, `60-facade-v3-v4`, `R11-*`, `R12-*`.

### R3b. 런타임 오류를 읽을 수 있는데 Rejected 한 단어만 반환

S02의 v2 소스는 첫 세션 시작 때 빈 배열의 `array.get(histBars, array.size(histBars)-1)`를 실행합니다. **plain save는 성공**한 뒤 compile/compile --save가 아래만 반환합니다.

```json
{"success":false,"compiled":false,"error":"Rejected"}
```

실제 study.status에는 type3 / **RE10045**, funcName=array.get, index=-1, size=0, **bar_index=18**이 있습니다. Monaco errors는 비어 있어 호출자는 CLI 응답만으로 원인을 알 수 없습니다.

- **3/3 CLI 시도, 두 오류 주입 cycle**: S02 tags `44-compile-v2-save`, `48-compile-v2-retry`, `91-repro-compile-v2`, `92-probe-study-status`.
- S03/S04의 이미 저장된 문법 오류에서도 bare Rejected 관측. 그 경우 별도 `pine errors`에는 진단이 있습니다.
- 기대: 문법 진단·runtime 오류·native action 거부를 구분하고, 읽을 수 있는 실제 메시지/위치를 포함. 진단이 정말 없으면 그 사실과 현재 상태를 명시.

## R4 — [P2, 지원 계약 명확화] library 검증·적용 경로의 불일치

### 제목 검증 차이

같은 원본 `library("CLIQA S05 Math Lib 20261001")`가 `pine check`에서는 compiled:true/오류0인데 Desktop compile에서는 다음 오류입니다.

> Invalid argument "title" in "library" call. It cannot contain spaces, special characters or begin with a digit.

원본 Desktop 진단 line5/column9, check/compile 각1회 대조. `check`의 `translate_light`와 editor 경로 차이로 추정됩니다. 현재 파일은 identifier-safe 제목으로 수정돼 있으므로 **초기 spaced-title record와 현재 fixture를 혼동하면 안 됩니다.**

기대: 결정 가능한 제목 제약을 확인하거나, 최소한 서버 light check의 성공을 Desktop 전체 검증 성공과 구분하는 계약/출력을 제공.

### 유효한 library를 chart study로 추가하고 계산 timeout

제목을 수정한 library는 서버 번역을 통과했으나 `pine compile` 경로에서 study로 추가된 뒤 status0/no error text 상태를 유지하며 약30초 timeout입니다. **정상 제목에서 2/2 시도** (`compile-library2`, `compile-library2b`); 잘못된 제목의 첫 시도와 별개입니다.

기대: 지원하지 않는 library chart application이면 명확한 unsupported 결과를 내고 불필요한 study를 추가하지 않아야 합니다. library 검사 지원이 목표라면 적합한 검증 경로로 분기해야 합니다. 플랫폼 내부 원인은 확정하지 않았습니다. 테스트 후 해당 QA library study만 제거했습니다.

## R5 — [P2 후보, 단일 관측] reload 후 pine open이 닫힌 패널을 열지 못함

S05에서 자기 탭 reload 후 controller:false/editor:false 상태에서 `pine open`이 약30초 후 실패. **visible, viewport2560×1358, bottom panel height0**이므로 S01/S04의 최소화된 0×0 화면 사례와는 구분됩니다.

`ui panel pine-editor open` 후 같은 `pine open`은 411–594ms에 성공했습니다. raw `open-lib`, `panel-open`, `open-lib2`. **1회 관측**, cold-load 타이밍/레이아웃 조건은 추가 분리 필요. `ensurePineEditorOpen/requestPineEditor`의 재시도/초기화 경로 확인이 필요합니다.

## 결함으로 확정하지 않은 관측·검증 한계

- **Drawing 좌표**: verbose x/x1/x2는 native graphics index이며 시간축 직접 값이 아닙니다. 읽기 전용 index→bar time 매핑을 거쳐 검증했습니다. 범위 밖 표시와 해석된 시각 제공은 개선 제안입니다.
- **Pine Logs**: 패널이 열려 렌더링된 행만 수집됩니다. 이번에는 30/40행이 보였지만, 이를 시스템 전체의 고정 ring-buffer 용량이라고 단정하지 않습니다. 전체 이력을 검증했다는 주장도 없습니다.
- **최소화**: S01/S04에서 viewport0×0, IsIconic=true일 때 editor 명령이 약31초 후 실패; 해당 창 복원으로 해결. 환경 제약이며 더 명확한 진단 메시지를 제안합니다.
- **check 네트워크 차단**은 sandbox 환경 문제. 계산 인덱스의 analyze 미탐은 기존 휴리스틱 한계. 이들을 새 기능 결함으로 세지 않았습니다.
- S02 최초 빈 archive는 추출 창 밖이라 직접 검증하지 못했습니다. 실패한 console/table 비교는 날짜 범위·표시 정밀도 차이를 설명하고, PASS 근거에서 제외했습니다. 실제 통과 근거는 표↔OHLCV와 series 비교입니다.
- 실시간 HTF rollover·미래 피벗 기다리기·픽셀 색상 비교·모든 intrabar stop 전이는 검증하지 않았습니다. S03 stop 단조성은 관측된 28개 MANAGE 기록/발행 stop·원장 대조 범위입니다.
- S05 **게시/import 연동 없음**. 33개 결과는 최종 library-v2와 export/이름을 정규화한 동일 본문을 가진 indicator에서 검증했습니다. 초기 v1의30개 결과로 v2 성공을 대체하지 않았습니다.

## 실행 도구 사고와 복원 — 제품 결함과 분리

S03 초기 recorder가 target 전달을 놓치고 open 실패 뒤 계속 진행하여 **S02의 QA 저장 소스를 S03 코드로 덮어썼습니다**. 해당 초기 기록001–055는 acceptance에서 제외했습니다.

- 원래 S02 saved ID와 최종 v3 소스로 복원; 서버 재열기 SHA `eb174c78d3374a7cc13a6d2d82f2d1d51e9b0cc1e14ae3d7c12a8ddf394b2251`, 기존 study ID/설정/status2 일치.
- **버전 이력은 5.0→8.0으로 변경**됐으며 원복했다고 주장하지 않습니다. 자신의 오염 study만 제거했습니다. 개인 문서·개인 차트가 아닌 QA 자산 사고입니다.
- 이후 target URL/native document ID 전후 확인과 child exit/JSON 불일치 즉시 중단을 강제했습니다. S04/S05/S06의 새 레이아웃도 이전 saved 문서를 열었지만, 같은 사고 없이 명시적 new/reset 후 작업했습니다.
- 잘못된 수학 기대값, quoting, stderr 파싱, 검산 창 정렬, 같은 봉 체결 카운터 등 fixture/harness 오류도 각 handoff에 보존하고 제품 결함에서 제외했습니다.

## 후속 완료 기준

- [ ] R1: LF↔CRLF 및 문서 전환 뒤 동일 saved strategy compile/raw/retry가 올바르게 처리되고 실패 action이 report epoch를 영구 pending으로 남기지 않음.
- [ ] R2: 정상 소스의 save→compile 및 기존 indicator 갱신을 새 격리 상태에서 최소 재현하고, 삭제·재추가 없이 해결/명시 거부.
- [ ] R3a: 실패 응답에서도 실제 저장 여부·버전·차트 변경 상태가 정확함.
- [ ] R3b: 저장된 오류 source의 syntax/runtime/native rejection 진단이 구분되고 확인 가능한 상세가 반환됨.
- [ ] R4: library light-check 범위와 chart application 지원 계약을 명확히 하고 불필요한 status0 study/timeout을 방지.
- [ ] R5: cold reload 후 닫힌 Pine 패널 자동 열기를 재현·검증하고 초기화 타이밍 한계를 명확히 처리.
- [ ] S01–S06의 통과 기준, 문서/target 격리, source 보존, unrelated study 보존이 회귀하지 않음.

## 자료와 종료 상태

`qa/pine/scenarios/REGISTRY.json`, `PROTOCOL.md`, `LEAD-REVIEW.md`, 각 폴더의 `HANDOFF.md/evidence.json` 및 Pine/재현 도구가 로컬 브랜치에 커밋되어 있습니다. 보고서별 원시 자료는 ignored results 아래 남겼으며 이슈에 계정 정보·private source·compiled blob을 붙이지 않았습니다.

QA 증거 커밋: S01 `ae5ca9d`, S02 `d7c9684` + 요약 정정 `54aac95`, S03 `2e9a87c`, S04 `2de84fe`, S05 `fb82aeb`, S06 `5777b59`. 통합 전 제품 변경 없음. 기존 #4–#12는 이 이슈 때문에 자동 종료하지 않습니다.

모든 worker 실행 종료. QA 레이아웃/문서는 재현 자산으로 남아 있으며 S06 최종 editor는 A clean, dialogs/replay 없음입니다. S06 B의 pending CLI epoch는 위 실패 상태로 남아 있습니다. 여기서 코드 수정이나 Executor 추가 작업을 시작하지 않습니다.

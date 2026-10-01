# S04 인계 — 피벗 지지·저항 객체 수명

2026-10-01 KST, cwd `C:\Codex\.worktrees\tradingview-cli-pinescript-qa`, branch `codex/pine-qa`. 제품 코드·공용 파일·다른 시나리오·Git은 변경하지 않았습니다(`REGISTRY.json`의 M 표시는 Lead 소유 변경이며 S04가 쓰지 않았습니다).

**결과: 모든 acceptance 기준 PASS. 독립 OHLC 재계산과 실제 drawing 추출이 전 단계에서 일치했습니다. S04 경로에서는 제품 결함을 재현하지 못했고, 관측성 한계 3건과 환경 1건을 기록합니다.** S03의 D1(오류 복구 후 compile Rejected)과 D2(CRLF 재열기 후 compile Rejected)는 indicator에서는 각 1/1회 재현되지 않았습니다. Desktop 사용을 종료했습니다.

## 자산과 식별자

- 레이아웃 `CLI-QA-S04-20261001`, chart `ofWK5ePT`, 고정 target `A80BFC8814BDE6007E9C57E8CB604788` (001 `tab new` → 002 `tab list`로 확인). 다른 6개 target은 harness에서 금지 목록으로 차단했습니다.
- 저장 문서: 이름/제목 `CLI-QA-S04 Pivot Zones`, ID `USER;e4b6a39e8a79466bb3134287eb3713a0`, 최종 v6.0. suffix 없음, 정확히 1개(024, 135 `pine list`).
- 차트 study `7AVlth` 1개 + 기본 Volume `iBDNo5`. BINANCE:ETHUSDT, 15분, 캔들 type1. symbol/timeframe은 변경하지 않았습니다.

## 격리 guard 실행 기록 (PROTOCOL 'Mandatory guards learned during S03')

1. 004 첫 `pine get`은 창 최소화로 실패했습니다(아래 E1). 창을 복원한 직후(007) 에디터는 빈 상태였습니다.
2. 에디터가 마운트되자 **새 S04 레이아웃이 S03 저장 문서 `USER;d90436c7…` v9.0(`CLI-QA-S03-EMA`, modified false)을 열었습니다.** 첫 `020 pine new` 시도는 pre-fence(`--doc none`)가 CLI 실행 전에 중단시켰습니다(raw 없음, 제품 명령 미실행). 019에서 S03 문서·미수정 상태를 읽기 전용으로 기록한 뒤 020 `pine new indicator`로 전환했습니다. S03 문서는 set/save하지 않았습니다.
3. 021 template `My script` / ID null / modified true 확인 → 022 v1 set → 023 save(`saved_with_dialog`)에서 S04 ID를 받았고, 024에서 실제 이름을 확인했습니다.
4. 이후 모든 명령은 `run.mjs`가 CDP로 **전후 URL(`/chart/ofWK5ePT/`)과 에디터 native doc ID**(`findPineController().getScriptIdVersion`)를 검증했습니다. child CLI exit와 JSON `success`를 확인하며, 기대 실패(`--exit 1`)는 명시적으로 지정했습니다. 불일치 시 exit 3으로 중단하고 tag 덮어쓰기를 거부합니다. assertion `noForeignTargetUsed`, `everyMutationOnS04DocAfterSave`, `firstSaveFromUnsavedTemplate` 모두 true입니다.

## 소스와 편집 순서

SHA-256은 CRLF→LF만 정규화하고 trim하지 않았습니다.

| 버전 | 파일 | 내용 | SHA-256 |
|---|---|---|---|
| v1 초기 | `v1-baseline-labels.pine` | 확정 피벗(좌5/우5)마다 `PH/PL 가격` 라벨. `barstate.isconfirmed`에서만 생성 | `9f378e9f…c187` |
| v2 영역관리 | `v2-zones-keep30.pine` | box(PH: high~몸통상단, PL: 몸통하단~low)+중앙 dashed line+상태 label. 9개 병렬 배열(객체3·top/bot/kind/pivotBar/state). close 돌파 시 회색·`BROKEN`·우측 고정. 보존30 초과 시 oldest 3객체+상태 동시 삭제. created/deleted/broken/live, `box/line/label.all`, 배열 정합·객체↔배열 mismatch 표, CREATE/BREAK/DELETE `log.info` | `a4a98103…7c2a` |
| v3 보존5 | `v3-zones-keep5.pine` | 기본 `keepZones` 30→5 (1줄) | `bf7782e3…cd2e` |
| v4 삭제/갱신 편집 | `v4-delete-update.pine` | 돌파 라벨에 `BROKEN@돌파종가`, 돌파 후 `brokenTtl`(기본10)봉 경과 영역 삭제(`deletedTtl`). 배열 2개 추가. v3 대비 +28/−10 | `674d36e7…96b4` |
| v5 오류주입 | `v5-error-injected.pine` | 93행 `removeZone(j)` → `box.qa_missing(j)` (1줄) | `f41cb6dd…30c5` |
| v6 수정 | (= `v4-delete-update.pine`) | v4 소스 그대로 복원 | `674d36e7…96b4` |

v1→v2는 +106/−19입니다. 모든 생성/돌파/삭제는 `barstate.isconfirmed`에서만 실행해 확정 전 객체와 realtime rollback 의존을 배제했습니다. `max_*_count=500`을 두어 플랫폼 GC가 아니라 스크립트 삭제 로직이 개수를 결정하게 했습니다.

## 독립 검증 방법

- 실제 추출: `data boxes/lines/labels --filter CLI-QA-S04 -v`(각 단계 raw)와 `data tables`.
- 좌표 해석: CLI `-v`의 `x/x1/x2`는 bar index·시간이 아니라 study `_graphics._indexes`의 인덱스입니다(O1). `probe-expr.mjs`가 읽기 전용 `ui eval`로 같은 study의 primitive와 `_indexes`→mainSeries 시간, 로드된 OHLC를 한 snapshot으로 읽습니다.
- `verify.mjs`: 로드된 389~390봉에서 forming bar를 제외하고 피벗을 재계산한 뒤 v2~v4 수명주기(확장→돌파→TTL삭제→생성(PH 먼저)→보존 삭제)를 시뮬레이션합니다. 각 기대 영역에 대해 box 1·line 1·label 1, 가격, 중앙값, 좌측 시간, 우측 시간(돌파봉 또는 마지막 확정봉), 텍스트를 대조합니다. 객체 수가 기대와 같아야 `allMatched`입니다.
- 피벗 정의: 4개 변형을 비교했습니다. v1에서 **우측 strict 비교만 실제와 48/48 일치**했고, 우측 비동치 변형은 동가 tie 1건(`1790507700 PL 2707.18`)을 추가로 기대해 불일치했습니다. 이후 strictBoth를 사용했습니다(좌측 strict/loose는 이 표본에서 구분 불가).
- Pine은 약 20.5k봉(로그 bar_index 20,559)을 계산하지만 차트에는 389봉만 로드되어 있습니다. 로드 범위 밖 drawing은 `-2000000`→`t:null`입니다. 로드 창 안의 결정 가능한 피벗만 비교했고, 보존 대상 영역은 모두 창 안에서 해석되었습니다(`*Unresolved: 0`). 스크립트 누적 카운터(2665 등)는 전체 이력 값이라 독립 계산하지 않았고, 내부 항등식과 버전 간 불변성만 사용했습니다.
- `logcheck.mjs`: `pine console`의 실제 표시 로그행을 OHLC와 대조합니다.

## 기준별 결과

| 기준 | 결과 | 근거 (raw tag / evidence.json) |
|---|---|---|
| 피벗 확정 전 객체 없음 | PASS | v1 `labelsAfterLastConfirmablePivot` 0 (033). 모든 영역 검증에서 `preConfirmationObjects` 0. 최신 영역 pivot 1790820900 = 마지막 결정 가능 pivot 이하. 로그 CREATE 24건 모두 confirmBar−pivotBar=5 (068/079). |
| baseline 피벗 라벨 | PASS | 025 compile→`addToChart`, 7AVlth. 033 로드 창 라벨 48 = 독립 피벗 48 (누락0/추가0), 텍스트 불일치0. |
| 묶인 box/line/label 함께 갱신 | PASS | v2 30개, v3·v4·v6 각 5개 영역의 box·line 우측이 기대 돌파봉/마지막 확정봉과 일치, label `INTACT/BROKEN(@종가)` 일치 (049/059/080/116/127 `allMatched`). 116→127 사이 새 15분봉 확정 시 intact 영역 x2가 함께 확장된 상태도 일치. |
| 묶인 객체 함께 삭제 | PASS | v2→v3 30/30/30→5/5/5 (045-047, 054-056). TTL0 입력(086)에서 돌파된 R 2개의 box·line·label이 동시에 사라져 3/3/3이 되고, 시뮬레이션 3과 일치 (090). 복원(091) 후 5/5/5 일치 (093). 로그 `DELETE limit` 18, `DELETE ttl` 7행. |
| 한도5에서 5개 이하, 배열 길이·인덱스 정합 | PASS | 스크립트 표 `arraysAligned true`, `mismatch 0`, `live 5 expected=5`, `all box/line/label 5/5/5` (057/078/092/115/123/138). 독립 추출 5/5/5. keep30에서는 30/30/30 (048, 049). |
| 실제 drawing 추출과 가격/텍스트/개수 대조 | PASS | 위 검증. 화면 대조는 스크린샷 대신 차트 primitive를 직접 읽어 수행했으며, 시각 픽셀 비교는 하지 않았습니다. |
| 생성/삭제/현재 계수와 로그 | PASS(로그 UI 우회) | 표 항등식 live=created−deletedLimit(−deletedTtl) 모든 단계 성립. 로그: v3 30행(CREATE12/BREAK5/DELETE13), v4 30행(CREATE12/BREAK6/DELETE ttl7·limit5). CREATE 가격 24/24, BREAK 종가 11/11 OHLC 일치. 로그 행은 Pine Logs 패널 표시 후에만 읽혀 UI 우회가 필요했습니다(O2). 표시된 최근 30행만 셉니다. |
| 오류 주입 검출 | PASS | 101 save v5.0 → 102 compile child exit1 `{"success":false,"compiled":false,"error":"Rejected"}` → 103 errors exit1, `box.qa_missing` 93:24와 파생 `log.info` 타입 오류. 서버 check 014도 동일 2건 exit1. |
| 오류 상태에서 객체 누적 없음 | PASS | 104 study 1개, 107 study가 v5.0에 바인딩(features indicator/plot)되고 105/106 drawing·table 0. 이전 실행 객체가 남지 않음. |
| 수정 후 compile 및 반복 compile | PASS | 111 save v6.0 → 112 compile exit0 → 113 study pineVersion 6.0 · 전체 features. 117/118 compile, 119 raw-compile, 120 compile --save 모두 exit0. 122 study 1개, 123 created 2665 불변·5/5/5, 127 독립 일치. |
| 소스 save/open 보존 | PASS | 130 get = 로컬 v4 해시 → 131 `pine new`(template 해시 `1f0fc5b3…`) → 133 exact-name open(script_id S04) → 134 get 정규화 해시 동일 `674d36e7…`. raw 바이트는 CRLF로 다름(6875→7011자, 136 개행). 137 재열기 후 compile exit0, 138 표 동일. |
| 실시간 다음 피벗까지 관측 | NOT TESTED | 지시대로 긴 대기를 하지 않았습니다. 확정봉 1개 확장만 우연히 관측했습니다(116/127). |

`evidence.json.assertions` 18개가 모두 true입니다. 120 `compile --save`, 112, 117–119는 모두 `compile_performed:false, unchanged:true`를 반환했습니다. 즉 반복 compile은 재dispatch하지 않았고, 차트 적용은 save가 수행했습니다(`indicator get` pineVersion으로 확인). 이를 강제 재컴파일로 주장하지 않습니다.

## 제품 관측 (결함 재현 없음)

- **O1 — drawing 추출 좌표가 내부 인덱스 (관측성, 매회 재현).** `data labels|lines|boxes -v`의 `x/x1/x2`는 `_graphics._indexes` 인덱스(예: 라벨 x 5..502 연속)이며 bar index나 시간이 아닙니다. 로드 범위 밖은 `-2000000`으로 매핑됩니다. 비verbose `data lines/boxes`는 가격 중복을 제거한 `horizontal_levels/zones`만 반환해 시간축 대조가 불가능합니다. 기대: 해석된 bar time(또는 index)을 함께 반환하거나 범위 밖임을 표시. 우회: `probe-expr.mjs` 읽기 전용 해석. 의심 컴포넌트 `src/core/data.js` `getPineLabels/Lines/Boxes`. 심각도 low–medium(검증 자동화 차단).
- **O2 — 스크립트 log는 Pine Logs 패널 표시 시에만 수집.** 058 `pine console` 10행 중 스크립트 로그 0. `ui panel`에 pine logs 옵션이 없습니다. UI 우회: 064 `script-more-options` 클릭(async ui eval 반환은 `{}`이지만 메뉴는 열림, 065로 확인) → 066 `[data-qa-id=open-pine-logs]` 클릭 → 067 표시·대화상자 없음 → 068 30행. hidden DOM은 세지 않았습니다. 표시 행은 최근 30개뿐입니다(S02 ring buffer 한계와 동일 계열). 의심 컴포넌트 `readPineConsole`/`openPanel`.
- **O3 — 오류 소스 save 시 차트 study가 깨진 버전으로 재바인딩**되어 drawing 0이 됩니다(104–107). TradingView 동작으로 판단하며 결함으로 세지 않습니다. 오류 compile은 진단 없는 bare `Rejected`이고 `pine errors`로만 확인됩니다(기존 알려진 클래스).
- **O4 — `max_labels_count=500`인데 v1 `label.all`/total_labels 505** (029/028). 플랫폼 GC 여유로 보이며 CLI 결함이 아닙니다. v2 이후에는 스크립트 삭제로 개수를 통제했습니다.
- S03 D1/D2 비재현: 112 수정 후 compile exit0 (1/1), 137 CRLF 재열기 후 compile exit0 (1/1). S03은 strategy였고 S04는 indicator이므로, strategy report 경로 한정 가능성을 Lead 판단용으로 남깁니다.

## 환경·harness·fixture 오류 (제품 결함 아님)

- **E1 환경**: Desktop 창 최소화(pid 18220 `IsIconic` true), page `hidden`, viewport 0×0(005). 004 `pine get` exit1, 31.5초, "Could not open Pine Editor…". 006 `ShowWindow(SW_SHOWNOACTIVATE)`로 복원(iconic false)했고(PID 기준, 권한 상승), 007은 824ms에 성공했습니다. S01 E1과 동일합니다.
- 샌드박스 네트워크: 비권한 `pine check`는 `fetch failed`였고, 권한 상승 후 010–014가 정상이었습니다.
- Harness 실수: (a) PowerShell이 따옴표 없는 `USER;…`의 `;`를 분리해 CLI가 실행되지 않음(019 재시도로 대체). (b) 082 `indicator set` JSON 인자가 PowerShell에서 깨져 CLI exit1, harness가 정상 중단했으나 **제 오케스트레이션 루프가 별도 명령인 083–085 읽기 전용 추출을 계속 실행**했습니다. 085의 ttl0 비교 불일치는 입력이 10 그대로였으므로 무효이며 evidence에 `INVALID`로 표시했습니다. `@file:` 인자 치환 후 086–090으로 대체했습니다. 상태 변경은 없었습니다. (c) evidence builder의 tag 문자열 비교 경계 오류를 수정했습니다. (d) 계정명이 포함된 probe 결과는 evidence에서 `<redacted>` 처리했습니다.
- Fixture: 오류 없음. v5 주입은 의도된 파생 오류 1건(log.info 인자 타입)을 동반합니다.

## 실행 명령

118개 명령 기록(시각, 실제 argv, 기대/실제 child exit, 소요, 전후 fence, 정제 JSON)이 `evidence.json.commands`에 있습니다. 원본 stdout/stderr는 ignored `results/pine-scenarios/s04-pivot-drawings/raw/`, 검증 산출물은 같은 디렉터리의 `verify-*.json`, `logcheck-*.json`에 있습니다. 재실행: `node qa/pine/scenarios/s04-pivot-drawings/run.mjs TAG [--exit N] [--doc ID] [--post-doc ID] -- <cli args>`, `node …/verify.mjs zones RESOLVE_TAG KEEP [TTL]`, `node …/build-evidence.mjs`.

## 남은 QA 상태 (141–144)

- 활성 레이아웃 `CLI-QA-S04-20261001`(ofWK5ePT), 에디터는 S04 v6.0 · modified false · errors 0.
- 차트: S04 study `7AVlth` 1개(inputs 5/5/5/10, 기본값 복원), Volume 1개. 대화상자0 · 메뉴0 · replay 미시작.
- 변경된 UI 상태: **Pine Logs 패널을 열어 둔 상태**(O2 우회)이고, **Desktop 창은 최소화에서 복원된 상태**로 두었습니다. 다음 worker가 E1을 피할 수 있으며, Lead가 원하면 다시 최소화하면 됩니다.
- 다른 레이아웃·S03 문서·다른 study는 변경하지 않았습니다. S03 문서는 019에서 읽기 전용으로 관측만 했습니다.
- 다음 worker 메모: 새 레이아웃도 직전 저장 문서를 엽니다(S04에서 재확인). 따옴표 없는 `USER;…`과 JSON 인자는 PowerShell에서 깨지므로 파일 치환을 쓰세요. drawing 시간 대조에는 O1 해석이 필요합니다.

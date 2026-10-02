# TradingView CLI

실행 중인 TradingView Desktop을 터미널에서 조작하고, 차트 데이터와 백테스트 결과를 구조화된 데이터로 가져오는 개인용 CLI입니다. 명령 이름은 `tv`이며, 결과를 JSON으로 출력하므로 Python이나 셸 스크립트와 연결하기 편합니다.

반복적인 차트 설정, Pine Script 적용, 전략 입력값 변경, 결과 수집을 자동화하는 데 사용합니다. TradingView Desktop의 로컬 디버깅 연결인 CDP(Chrome DevTools Protocol)를 이용합니다.

이 저장소는 개인 개발용 비공개 저장소입니다. TradingView가 제작하거나 승인한 공식 도구가 아니며, 원본 코드의 출처는 [NOTICE.md](NOTICE.md)에 정리되어 있습니다.

## 프로젝트의 목적과 개발 범위

앞으로의 개발은 다음 범위에 집중합니다.

- 가격·캔들·지표·차트 표시 데이터 수집과 관찰
- Pine Script 개발 보조와 전략 백테스트
- 조건을 바꿔가며 반복 실험하고 결과를 저장·비교하는 작업
- TradingView 알림의 조회·생성·관리
- 위 작업에 필요한 차트·탭·레이아웃·화면 조작

**브로커 연결과 매수·매도 주문 실행은 현재와 향후 개발 대상에서 제외합니다.** 주문 제출·수정·취소, 포지션 실행·관리, 실거래 자동매매를 위해 TradingView 화면이나 내부 API를 우회하는 기능을 추가하지 않습니다. 일반 UI 조작 기능도 정보 수집과 연구 작업을 위한 용도로 사용합니다.

Pine 전략의 진입·청산 시뮬레이션, 백테스트 주문 기록과 거래 원장 분석은 연구 범위에 포함됩니다. 이 기록은 실제 브로커 주문을 실행한 결과가 아닙니다.

기존 코드의 `replay trade`는 과거에 구현된 리플레이 연습용 명령입니다. 향후 개발·확장 대상에서 제외하며, 아래 사용 예제에는 포함하지 않습니다. 이번 문서 변경으로 해당 명령의 구현을 제거한 것은 아닙니다.

## 할 수 있는 일

| 분야 | 주요 기능 |
| --- | --- |
| 차트 조작 | 종목 검색·전환, 시간봉·차트 유형 변경, 표시 기간 조절, 특정 날짜로 이동 |
| 정보 수집 | 현재 가격, OHLCV, 지표 값, Pine이 만든 선·라벨·표·박스 읽기 |
| Pine 개발 | 소스 읽기·적용, 컴파일, 오류·경고 확인, 저장된 스크립트 열기·저장 |
| 백테스트 | 전략 지표, 주문 기록, 진입·청산 시각을 포함한 거래 원장 조회 |
| 반복 실험 | 입력값 변경, 재계산 완료 확인, 결과 저장, 배치 실행 후 원래 상태 복원 |
| 지속 관찰 | 여러 종목과 시간봉의 최신 캔들·가격·지표 변화를 JSONL로 출력 |
| 작업 환경 | 탭·레이아웃·분할 차트·관심종목 관리, 지표 설정, 그림과 화면 캡처 |
| 알림 | 기본 가격 조건 알림의 조회·생성·삭제 |

명령이 구현되어 있어도 TradingView 버전·계정 기능·현재 화면 상태에 따라 사용할 수 있는 범위가 달라집니다. 현재 실제 검증은 Windows의 한국어 Desktop 환경에서 차트·Pine·전략 결과·배치 경로를 중심으로 진행했습니다.

현재 배치 예제는 SMA 10/30과 20/60 두 조합을 순서대로 비교합니다. 임의 전략의 대규모 파라미터 탐색은 별도 반복 스크립트를 작성해야 합니다. `data equity` 명령도 있지만, 검증한 Desktop 버전에서 전략의 봉별 자산 곡선은 제공되지 않아 사용이 제한됩니다.

## 실행 조건

- Node.js 20 이상
- TradingView Desktop 설치 및 로그인
- 사용하려는 기능을 제공하는 TradingView 요금제와 데이터 이용 권한
- 로컬 CDP 포트로 실행한 TradingView Desktop: 기본값은 `127.0.0.1:9222`

데이터와 히스토리 범위는 차트에 실제로 로드된 내용 및 계정의 이용 범위를 따릅니다.

## 설치

저장소를 내려받고 의존성을 설치합니다. 비공개 저장소이므로 GitHub 접근 인증이 필요합니다.

```bash
git clone https://github.com/Gudals0320/tradingview-cli.git
cd tradingview-cli
npm ci
npm link
```

`npm link`를 실행하면 `tv` 명령을 전역으로 사용할 수 있습니다. 전역 연결 없이 저장소 안에서 실행하려면 다음 형식을 사용합니다.

```bash
npm run tv -- status
node src/cli/index.js status
```

## TradingView Desktop 연결

다음 명령으로 Desktop을 CDP 연결이 가능한 상태로 실행하고 연결을 확인합니다.

```bash
tv launch
tv status
```

`tv launch`는 macOS·Windows·Linux에서 TradingView 설치 위치를 찾고, 기본적으로 기존 실행을 종료한 뒤 `--remote-debugging-port=9222`로 다시 실행합니다. 기존 실행을 종료하지 않으려면 `--no-kill`을 사용합니다. 이미 실행 중인 앱에 CDP가 활성화되어 있지 않으면 별도 재시작이 필요할 수 있습니다.

포트를 바꾸려면 `tv launch --port 9333`처럼 실행하고, 후속 명령에도 `TV_CDP_PORT` 환경 변수로 같은 포트를 지정합니다. PowerShell 예시는 다음과 같습니다.

```powershell
$env:TV_CDP_PORT = '9333'
tv launch --port 9333
tv status
```

플랫폼별 실행 스크립트도 포함되어 있습니다.

```powershell
# Windows
.\scripts\launch_tv_debug.bat
```

```bash
# macOS
./scripts/launch_tv_debug_mac.sh

# Linux
./scripts/launch_tv_debug_linux.sh
```

수동으로 실행할 경우 TradingView를 완전히 종료한 뒤 실행 파일에 `--remote-debugging-port=9222` 인자를 추가합니다.

## 빠른 시작

```bash
# 현재 차트와 데이터 확인
tv status
tv state
tv quote
tv ohlcv --count 20 --summary

# 종목·시간봉·차트 유형 변경
tv symbol NASDAQ:AAPL
tv timeframe 15
tv type Candles

# 지표 값과 Pine 표시 데이터 수집
tv values
tv data lines --filter "My Indicator"
tv data labels --filter "My Indicator"

# Pine 소스 검사·적용·컴파일
tv pine analyze --file strategy.pine
tv pine check --file strategy.pine
tv pine set --file strategy.pine
tv pine compile

# 검증된 전략의 백테스트 지표와 거래 원장 조회
tv data strategy
tv data ledger --offset 0 --limit 100

# 과거 차트를 한 봉씩 관찰
tv replay start --date 2025-03-01
tv replay step
tv replay status
tv replay stop

# 가격 변화를 계속 수집
tv stream quote --interval 500
# 종료할 때까지 같은 endpoint의 다른 tv 명령은 SESSION_BUSY입니다.
```

`pine raw-compile`은 deprecated 호환 별칭이며 `pine compile`과 같은 스마트 검증을 수행합니다.
검증된 동일 지표·전략은 `unchanged:true, compile_performed:false`로 실행을 생략할 수 있습니다.
버튼 강제 클릭을 요청하는 명령으로 사용하지 마세요.

저장된 스크립트의 미저장 변경을 컴파일하려면 먼저 `pine save`를 실행하거나 `pine compile --save`를 사용하세요.
기본 컴파일은 기존 저장 내용을 바꾸지 않으며, 저장이 필요하면 `SAVE_REQUIRED`와 exit 1을 반환합니다.
`--save`로 저장한 성공 응답에는 `saved:true`와 `script_id`가 포함됩니다. 새 draft 컴파일은 Desktop의 임시 draft 경로를 사용합니다.
`pine save`는 새 문서의 이름 창에서 Desktop이 제안한 이름을 확인하고 서버 소스를 재조회해 저장을 검증합니다.
`pine new/open`은 미저장 편집 내용을 요청한 문서로 교체합니다. 필요한 내용은 먼저 저장하세요.
`pine open`은 정확한 저장 이름을 우선하며, 제목 또는 부분 이름이 여러 문서와 일치하면 열기를 거부합니다.
경고 marker는 컴파일 응답 이후에 나타날 수 있으므로 `pine errors`로 다시 확인하세요.

컴파일의 저장·적용·계산 결과는 별개입니다. `--save` 응답의 `saved`는 요청한 소스가 현재 서버 저장본과 일치하는지,
`save_performed`는 이번 호출에서 저장 버전이 새로 생겼는지 뜻합니다. `source_persisted`는 임시 draft까지 포함한 소스 보존,
`version`은 관측한 현재 버전입니다. `chart_changed`는 대상 study의 ID/compiled input 변화,
`applied`는 저장 버전과 적용 버전의 일치, `calculation_ready`는 해당 study의 계산 완료 여부입니다.
컴파일이 실패해도 저장·차트 변경은 이미 발생했을 수 있습니다. 조회가 실패하면 `saved:null`, `persistence_verified:false`로
불확실성을 표시하며 자동 rollback은 하지 않습니다.

`pine check`의 `validation_scope`는 `local_library_title` 또는 `light_server_translation`입니다.
`desktop_validated:false`는 Desktop 실행·적용·library 게시/import를 검증하지 않았음을 뜻합니다.
결정 가능한 library 제목은 [공식 identifier 규칙](https://www.tradingview.com/pine-script-docs/language/declaration-statements/)으로 검사합니다.
이 CLI의 library chart application은 지원하지 않으며 `compile --save`도 library를 저장하지 않습니다. 저장은 `pine save`를 사용하세요.

| 실패 코드 | 의미 |
| --- | --- |
| `PINE_COMPILE_ERROR` | 문법/번역 진단과 위치를 확인하세요. |
| `PINE_RUNTIME_ERROR` | 적용된 현재 버전의 실행 오류; native context/stack을 포함합니다. |
| `NATIVE_ACTION_REJECTED` | native 작업 거부; 확인 가능한 진단과 현재 상태를 함께 반환합니다. |
| `COMPILE_EXCEPTION` | native 거부로 분류할 수 없는 예외입니다. |
| `SAVE_FAILED` | 저장/검증 실패; 전략의 준비 epoch를 종료합니다. |
| `REPORT_TIMEOUT` | 제한 시간 내 report를 검증하지 못했습니다. `calculation_pending:true`인 기존 검증된 입력 재계산만 관찰을 유지합니다. |
| `LIBRARY_NOT_APPLICABLE` / `INVALID_LIBRARY_TITLE` | library 적용 지원 범위 또는 제목 규칙을 확인하세요. |
| `PINE_VIEWPORT_UNAVAILABLE` | 초기화가 필요한 대상 viewport가 0입니다. 창/탭을 보이게 하고 재시도하세요. |
| `PINE_EDITOR_NOT_READY` | 보이는 Pine 패널이 제한 시간 내 초기화되지 않았습니다. |

Pine 작업은 usable Monaco와 native controller를 모두 필요로 합니다. Desktop 3.4.1.8194에서 검증한 private API
(`translateScript`, `_replaceStubByStudy`, pending-request/diagnostic store, study `restart`)에 의존하며,
지원 capability가 없으면 `CLEAN_UPDATE_UNSUPPORTED` 등으로 거부합니다. clean 저장본을 refresh할 때는 기존 study와
저장 버전을 유지하고 새 native 계산을 관측합니다. 컴파일 `source_hash`는 물리 CRLF→LF만 정규화하며 get/set 원문을 바꾸지 않습니다.

현재 옵션은 `tv --help`, `tv <명령> --help`, `tv <명령> <하위 명령> --help`로 확인할 수 있습니다.

`tv help --json`은 모든 명령의 옵션·위치 인자·읽기 전용 여부·출력 형식을 JSON 카탈로그로 출력합니다. `tv help --json pine`처럼 명령 이름으로 범위를 좁힐 수 있습니다. AI 에이전트용 사용 규칙은 [AGENTS.md](AGENTS.md)에 정리되어 있습니다.

전용 실험 레이아웃을 선택하고 소스·결과를 확인한 뒤 원래 상태를 복원하는 사용법은 [Pine 배치 예제](examples/README.md)를 참고하세요.

## 명령 목록

| 분야 | 명령 |
| --- | --- |
| 연결·진단 | `status`, `launch`, `update`, `discover`, `ui-state` |
| 차트 | `state`, `symbol`, `timeframe`, `type`, `info`, `search`, `range`, `scroll` |
| 시세·지표 | `quote`, `ohlcv`, `values` |
| 상세 데이터 | `data lines`, `labels`, `tables`, `boxes`, `strategy`, `trades`, `ledger`, `equity`, `depth`, `indicator` |
| Pine Script | `pine get`, `set`, `compile`, `raw-compile`, `analyze`, `check`, `save`, `new`, `open`, `list`, `errors`, `console` |
| 화면 캡처 | `screenshot` |
| 과거 차트 관찰 | `replay start`, `step`, `stop`, `status`, `autoplay` |
| 그림 | `draw shape`, `list`, `get`, `remove`, `clear` |
| 가격 알림 | `alert list`, `create`, `delete` |
| 관심종목 | `watchlist get`, `add`, `add-bulk`, `remove` |
| 레이아웃·지표 | `layout list`, `layout switch`, `indicator add`, `remove`, `toggle`, `set`, `get` |
| UI 조작 | `ui click`, `keyboard`, `hover`, `scroll`, `find`, `eval`, `type`, `panel`, `fullscreen`, `mouse` |
| 분할 차트·탭 | `pane list`, `layout`, `focus`, `symbol`; `tab list`, `new`, `close`, `switch` |
| 지속 수집 | `stream ohlcv`, `quote`, `bars`, `values`, `lines`, `labels`, `tables`, `all` |
| 배치 상태·복구 | `session status`, `session discard` |

대부분의 명령은 현재 활성화된 차트에서 실행합니다. 지표·그림 등의 엔터티 ID는 현재 세션에 해당하며 재접속 후 그대로 사용할 수 있다고 가정하지 않습니다.

Desktop의 활성 탭은 셸의 실제 탭 선택 상태를 기준으로 판단합니다. `tv tab list`에서 탭 순서, `shell_tab_id`, `resolved`를 확인할 수 있습니다. 같은 레이아웃이 여러 탭에 열려 대상이 모호하면 실패합니다. 특정 페이지를 명시하려면 `tv --target CDP_ID state`처럼 실행합니다. CDP ID도 세션마다 달라질 수 있습니다.

## 백테스트 결과를 읽는 방법

전략 결과는 선택한 전략의 계산이 검증된 경우에만 반환합니다. GUI에서 추가한 전략이나 페이지를 새로고침한 뒤 감시가 없는 전략을 바로 조회하면 `success:false`, `REPORT_UNVERIFIED`, 종료 코드 1을 반환하며 지표·거래 데이터를 내보내지 않습니다.

다음 중 하나로 검증을 시작할 수 있습니다.

- 해당 전략 소스를 에디터에 넣고 `tv pine compile` 실행
- `tv indicator set ENTITY_ID --inputs '{"in_0":20}'`처럼 실제 전략 입력값 변경

입력 ID는 전략마다 다르므로 `tv indicator get ENTITY_ID`로 먼저 확인합니다. 감시를 시작하기만 하거나 입력을 기존과 같은 값으로 설정하는 것만으로는 기존 결과를 검증하지 않습니다.

컴파일은 변경된 compiled-script 식별값(`text`·`pineId`·`pineVersion`) 또는 새 study와, 그 전략의 새로운 완전한 report를 확인합니다. 이전 report의 실시간 갱신만으로 새 컴파일을 인정하지 않습니다. 이미 검증된 같은 소스는 `unchanged:true`, `compile_performed:false`와 기존 compilation token을 반환합니다.

감시 중인 전략의 입력·종목·시간봉·차트 유형이 바뀌면 native 재계산 전이와 현재 조건에 맞는 완전한 결과를 확인합니다. 이전 입력값으로 되돌리는 경우에도 계산 중이거나 아직 채택하지 않은 완료 기록이 있으면 `REPORT_PENDING`이 될 수 있습니다. `indicator set`은 계산 완료 검증을 기다립니다.

검증된 같은 소스를 입력 재계산 중 다시 컴파일하면 컴파일 버튼을 누르거나 감시 상태를 덮어쓰지 않고 기존 계산을 기다립니다. 성공 시 `compile_performed:false`와 기존 token을 반환합니다. 입력 변경으로 검증한 결과의 `compilation_token`·`source_hash`는 null일 수 있습니다. 이 두 필드는 CLI 소스 컴파일의 식별 정보이며 결과 준비 여부 자체를 의미하지 않습니다.

다른 전략을 선택해도 검증을 상속하지 않습니다. 필요한 native 계산 이벤트를 구독할 수 없는 Desktop 빌드에서는 컴파일 뒤에도 `REPORT_UNVERIFIED`가 됩니다. 같은 study ID의 내부 전략 객체가 교체되면 검증을 해제하고 감시를 다시 연결하며, 새로운 계산 관찰이 필요합니다.

외부에서 스크립트를 교체한 뒤 같은 소스를 재적용하면 변경 증거가 없어 timeout이 발생할 수 있습니다. `indicator set`으로 입력을 변경하거나 소스를 수정한 뒤 다시 컴파일해 검증을 진행합니다.

**`pine compile` 또는 `indicator set` 실행 중에는 GUI에서 전략 입력값을 동시에 편집하지 마세요.** GUI 편집은 CLI 잠금에 참여하지 않습니다. 특히 컴파일이 첫 report를 채택하고 감시를 설치하기 전에 동시에 입력을 바꾸면 이전 계산이 현재 입력의 결과로 채택될 수 있습니다. 이 동시 편집 경로는 지원 범위에서 제외하며 [후속 이슈 #2](https://github.com/Gudals0320/tradingview-cli/issues/2)에서 추적합니다.

전략 결과에는 실제 백테스트·거래·로드된 데이터 기간, 입력값, 단위 정보가 포함됩니다. `data trades`는 백테스트 주문 기록이며 `order_seq`는 시간이나 봉 번호가 아닌 주문 순번입니다. `time_index`는 같은 순번의 이전 이름으로 남아 있습니다. `data ledger`는 진입·청산 시각을 UTC로 변환한 거래 원장을 페이지 단위로 반환합니다. 비율 값은 단위 메타데이터를 확인하세요. 예를 들어 `0.01`은 1%를 의미합니다.

## 배치 실행과 중단 복구

단일 Desktop/포트에서 여러 CLI 작업을 동시에 실행하려면 [독립 workspace 문서](docs/workspaces.md)를 사용합니다. 작업별 target·저장 레이아웃·Pine 문서를 예약하고, 각 호출을 `tv --workspace FILE ...`로 이어갑니다. 예약 중에는 일반 online 명령이 차단됩니다. 일반 CLI 호출끼리도 실행 전체의 endpoint lease를 획득하므로 겹치는 호출은 `SESSION_BUSY`로 실패할 수 있습니다.

배치는 같은 Desktop endpoint와 운영체제 임시 디렉토리를 공유하는 CLI 프로세스 사이에 잠금을 사용합니다. Pine 초안이 레이아웃 간에 공유될 수 있으므로 다른 레이아웃의 충돌하는 CLI 작업도 거부합니다.

`tv session status`는 저장된 초안 내용을 노출하지 않고 소유권과 복구 상태를 보여줍니다. 배치를 강제 종료하면 복구 journal을 보존하고 후속 변경 작업을 거부합니다. 복구 대기 중에는 `status`, `state`, `tab list`로 상태를 확인할 수 있지만, 다른 배치가 살아 있는 동안에는 이 명령들도 차단됩니다.

명시적 복구는 다음과 같이 진행합니다.

```bash
node examples/pine-batch.js --recover --out results/recovery.json
```

복원을 포기하려면 `session status`의 정확한 `recovery_run_id`를 사용합니다.

```bash
tv session discard --run-id RECOVERY_RUN_ID
```

이 명령은 Desktop을 현재 상태로 두고 저장된 초안을 포함한 journal을 보관합니다. 다른 사용자나 TEMP 경로에는 잠금이 공유되지 않습니다. 강제 종료 뒤 남은 `.acquire` 파일, PID 재사용, 손상되거나 run ID가 없는 journal의 수동 보관 등은 [후속 이슈 #2](https://github.com/Gudals0320/tradingview-cli/issues/2)의 제한 사항입니다. 자세한 복구와 히스토리 범위 확인 방법은 [예제 문서](examples/README.md)를 참고하세요.

## JSON 출력과 종료 코드

명령 결과는 표준 출력(stdout)에 JSON으로 기록합니다.

```json
{
  "success": true,
  "symbol": "NASDAQ:AAPL",
  "resolution": "15"
}
```

작업 결과가 `success:false`인 경우에도 결과 JSON은 stdout에 나올 수 있습니다. 예외나 연결 오류는 표준 오류(stderr)에 JSON으로 출력합니다. 성공 여부는 종료 코드와 JSON을 함께 확인합니다.

| 종료 코드 | 의미 |
| --- | --- |
| `0` | 성공 |
| `1` | 잘못된 명령·입력, 작업 실패, 컴파일 실패 또는 치명적 오류 |
| `2` | CDP 전송·연결 실패 |

Pine 경고만 있는 경우에는 컴파일을 실패로 처리하지 않습니다. `pine analyze`는 제한적인 오프라인 휴리스틱 검사이므로 Pine 문법 검증기를 대신하지 않습니다. 문법 검증에는 `pine check` 또는 Desktop 컴파일을 사용합니다.

스트리밍 명령은 Ctrl+C로 중단할 때까지 한 줄에 JSON 객체 하나를 출력하는 JSONL 형식을 사용합니다.

## 여러 종목·시간봉의 OHLCV 수집

서로 다른 탭이나 분할 차트를 이용해 여러 종목과 시간봉을 동시에 관찰할 수 있습니다.

```bash
tv stream ohlcv CME_MINI:ES1!@1 CME_MINI:NQ1!@5 NASDAQ:AAPL@15 --interval 250
```

마지막 `@` 뒤의 값은 시간봉입니다. 조건이 맞는 기존 차트를 재사용하고, 필요하면 차트 분할을 늘리거나 새 탭을 열어 각 데이터에 차트를 배정합니다. 수집을 중단해도 이 과정에서 구성한 차트와 탭은 열린 상태로 남습니다.

값이 바뀌면 `symbol`, `timeframe`, `bar_time`, `open`, `high`, `low`, `close`, `volume`, `bar_index`, `observed_at`, `tab_id`, `pane_index`를 포함한 JSON을 출력합니다. 시작 안내와 복구 가능한 오류는 stderr에 기록합니다.

저장소 루트에서 Python으로 연결하는 예시입니다.

```python
import json
import subprocess

command = [
    "node", "src/cli/index.js", "stream", "ohlcv",
    "CME_MINI:ES1!@1",
    "CME_MINI:NQ1!@5",
    "NASDAQ:AAPL@15",
    "--interval", "250",
]

process = subprocess.Popen(command, stdout=subprocess.PIPE, text=True)
try:
    for line in process.stdout:
        bar = json.loads(line)
        # 이 지점에서 배열·큐·파일·데이터베이스 등에 데이터를 전달합니다.
        print(bar["symbol"], bar["timeframe"], bar["close"])
finally:
    process.terminate()
    process.wait()
```

수집은 로컬 차트의 진행 중인 최신 봉을 일정 간격으로 확인하는 방식입니다. 거래소의 모든 틱을 받는 피드가 아니므로 확인 사이에 발생한 갱신은 놓칠 수 있습니다. 여러 OHLCV 수집의 기본 간격은 250ms이며 최소 간격은 100ms입니다.

## 업데이트

변경 사항이 없는 `main` 체크아웃에서 실행합니다.

```bash
tv update
```

`origin`이 `Gudals0320/tradingview-cli`를 가리키는 경우에만 원격 `main`을 가져와 fast-forward로 업데이트합니다. GitHub 인증을 미리 준비해야 합니다. `tv status`의 업데이트 확인도 인증된 Git을 사용합니다. `package-lock.json`이 바뀌면 `npm ci`를 실행하며, 업데이트 뒤에는 `tv` 명령을 다시 실행합니다.


### Stream 소유권과 timeout 복구

Legacy stream은 실행하는 동안 endpoint lease를 독점합니다. 같은 endpoint의
다른 CLI 명령이나 workspace 예약은 stream을 종료한 뒤 실행하세요. 충돌 오류는
명령·PID·run ID·시작 시간을 표시합니다. 협력하는 CLI 잠금의 지원 범위는 동일한
OS 사용자와 TEMP/session 디렉터리입니다. 다른 사용자·별도 TEMP는 지원 범위 밖이며,
살아 있거나 확인할 수 없는 PID는 시간이나 PID 재사용 추정만으로 회수하지 않습니다.

기존 pane은 요청과 정확히 일치하면 읽기만 하여 재사용합니다. 다른 feed의 배정과
레이아웃 확장은 CLI가 생성한 target에만 적용합니다. 기존 target을 재배정하려면
`stream ohlcv --allow-reassign-target EXACT_TARGET`을 명시하세요. 복구 client는 교체 뒤
즉시 닫고, 탭 생성·복구 재시도는 유한하게 제한합니다.

레이아웃 전환은 getSavedCharts의 전체 객체(숫자 ID와 URL ID를 구분)를 native loader에
전달합니다. Desktop 3.4.1의 page-local load service await 흐름을 직접 읽어 확인했습니다.
완료 Promise와 여러 번 읽은 실제 URL ID가 함께 맞아야 성공합니다. 확인창 클릭은 하지 않습니다.
확인창이 CLI 반환 뒤 늦게 나타나도 page watcher가 계속 관찰하며, 이 전환에서 생성된
cancel-btn 동작만 취소로 기록합니다. Save/Don't save 후 지연된 전환은 계속 차단합니다.

완료 신호 없는 opaque/void API는 시간이 지나도 LAYOUT_UNVERIFIED로 유지됩니다.
`session recover`는 compile/save/registry/layout/pendingRequests/calculating 중 차단 원인을
details에 표시합니다. 끝나지 않는 native 작업에는 사용자가 해당 확인창을 해결해야 합니다.
마지막 수단은 사용자가 기록된 target만 명시적으로 reload하는 것입니다. reload는 해당 탭의
미저장 차트·Pine 편집·일시 상태를 잃을 수 있으므로, 원문을 먼저 보관하고 개인 탭은 reload하지 마세요.
CLI는 reload나 force 해제를 자동 수행하지 않습니다. 관측한 3.4.1 page-local 경로에서는
새 CDP loaderId로 구세대 파기를 확인하고, layout/chart/controller가 여러 샘플에서 안정된 뒤
복구합니다. 알 수 없는 외부/shell callback 구현에는 이 무효화를 일반화하지 않습니다.

CDP 요청은 기본 15초로 제한되며 `TV_CDP_TIMEOUT_MS`는 100..120000 범위입니다.
timeout은 native 작업 취소가 아닙니다. journal은 실제 변경 요청 직전에 정확한 target을
기록합니다. 순수 조회·stream polling 강제 종료는 복구 journal을 만들지 않습니다.
quote의 임시 종목 변경과 feed provisioning은 복원·준비 상태가 검증된 뒤에만 fence를
해제합니다. 저장 timeout은 `saved:null,persistence_verified:false`이며 실행이 계속될 수 있습니다.

`tv session status`의 native run ID로 `tv session recover --run-id ID`를 실행하면
기록된 target의 native 요청·계산 종료를 검증합니다. 진행 중이면 차단이 유지되고,
종료 뒤에는 reload 없이 복구할 수 있습니다. `incomplete:true`는 이전 명령의 결과를
확정할 수 없다는 뜻이므로 상태를 읽고 재시도하세요. batch journal은 기존
`pine-batch --recover` 또는 명시적인 `session discard --run-id ID`를 사용합니다.
자동 복구는 도입하지 않았습니다. native 종료 확인과 이전 결과 채택은 별도 판단입니다.

run ID 없는 손상 journal은 status에 노출된 hash와
`session discard --journal-hash HASH`로 원본 bytes를 보존하여 보관할 수 있습니다.
`workspace gate-status`는 repair 소유권도 표시하며,
`workspace gate-clear --repair-token TOKEN`은 확인된 죽은 repair만 제거합니다.

조회 명령은 UI 패널을 자동으로 열지 않습니다. `pine get/errors/console`은 편집기가
닫혀 있으면 PINE_EDITOR_REQUIRED, `watchlist get`은 패널이 닫혀 있으면
WATCHLIST_PANEL_REQUIRED를 반환합니다. 명시적으로 `tv ui panel pine-editor open` 또는
`tv ui panel watchlist open`으로 준비한 뒤 조회하세요. 이 준비 명령은 변경 명령이며,
workspace 예약 전에 전용 target에서 실행합니다.

Legacy `pine compile`/`pine save`는 `--expect-script-id ID`를 지원하며 source_hash를
반환합니다. draft와 사용자 저장 문서를 구분합니다. GUI의 reserved study 입력 변경은
native schema 변경과 완전히 구별할 수 없으므로 실행 중 GUI 편집은 지원하지 않습니다.

데이터 응답에는 context와 target이 포함됩니다. `count`는 1..500 정수이고,
orders 응답은 요청·적용·전체·잘림 정보를 노출합니다. 기존 `data trades`의 trades는
주문 기록의 호환 필드이며 orders/record_kind를 함께 제공합니다. tables의 cells는
빈 셀·행을 보존한 2차원 배열이고 rows는 표시용 호환 필드입니다. labels는 x 내림차순,
동일/없는 좌표는 native 삽입 순서로 안정 정렬합니다. 일치 study가 없으면 STUDY_NOT_FOUND,
일치 study에 도형이 없으면 정상 빈 결과입니다.

`pine analyze`는 분석 실행 성공과 진단을 구분합니다. 기본 exit 0은 분석 완료를 뜻하며,
CI에서 확정 error 진단으로 실패하려면 `--fail-on-error`를 사용합니다. 배열의 동적 크기,
재할당·별칭·스코프는 입증되지 않은 bounds error로 처리하지 않습니다.

`tv update`의 dependency 설치는 기본 `--ignore-scripts`입니다. 현재 lockfile에는 필요한
lifecycle script가 없습니다. 신뢰한 변경의 script가 필요하면 `--allow-install-scripts`로
명시적으로 허용하거나 설치를 직접 수행하세요.

`npm run smoke:desktop`은 정확히 하나의 저장된 CLI-QA-I22-A 전용 탭이 필요합니다.
자원 identity와 개인 탭 상태를 확인하고 raw 결과는 ignored results/issue-overhaul에 남깁니다.
공개 증거에는 요약만 포함합니다. Windows signal 검증은 자식의 SIGINT handler를 호출하며
물리 키보드 Ctrl+C 검증을 뜻하지 않습니다.

## 개발과 검증

```bash
npm ci
npm run lint
npm test
```

GitHub Actions는 `main` push, `main` 대상 PR, 수동 실행에서 Windows와 Node.js 24로 lint와 단위 테스트를 수행합니다. CI는 `TRADINGVIEW_SKIP_NETWORK_TESTS=1`로 Pine 서버에 접속하는 테스트 5개를 제외하므로 Desktop이나 계정이 필요하지 않습니다. 기본 `npm test`는 오프라인 단위 검사이며 Pine 서버의 2개 스위트(5개 테스트)는 `npm run test:network`로 명시적으로 실행합니다.

테스트는 명령 처리, Pine 검사, 입력값 검증, 차트 히스토리, 지표 설정, 전략 결과 검증, 배치 소유권·복구, 탭 처리, 업데이트 등을 다룹니다.

실제 Desktop 통합 테스트는 로컬 CDP 포트 9222에 연결된 상태에서 별도로 실행합니다. 활성 차트와 UI를 조작하므로 전용 검증 환경을 준비하세요.

```bash
npm run test:e2e
```

## 코드 구조

```text
tv 명령 → 명령 어댑터 → 핵심 동작 → localhost:9222의 CDP → TradingView Desktop
```

- `src/cli/`: 명령·인자 해석과 JSON 출력
- `src/core/`: 차트·데이터·Pine·리플레이·그림·UI·실행 동작
- `src/connection.js`: CDP 연결과 페이지 코드 실행 보조
- `src/wait.js`: 차트 준비 상태와 렌더링 대기

## 사용 조건과 제한

- CDP 포트는 localhost에만 연결하고 신뢰할 수 없는 네트워크에 노출하지 않습니다.
- TradingView 로그인, 구독, 데이터 권한과 제품의 이용 제한을 따릅니다.
- 내부 페이지 API와 UI는 변경될 수 있어 Desktop 업데이트 뒤 호환성 수정이 필요할 수 있습니다.
- 검증한 환경은 Windows, Node.js 24.19.0, TradingView Desktop 3.4.1.8194(Windows Store), 한국어 UI입니다. 다른 운영체제·UI 언어·Desktop 버전과 모든 명령의 동작을 같은 수준으로 검증한 것은 아닙니다.
- 다중 Desktop 창, Deep Backtesting 등은 현재 실제 검증 범위에 포함되지 않습니다.
- 무인 실행 전에 UI 조작, 알림 삭제, 그림 삭제 등 기존 상태를 바꾸는 명령을 확인합니다.

사용 시 [TradingView 이용약관](https://www.tradingview.com/policies/)을 따릅니다.

## 기여·출처·라이선스

개인 이슈와 PR은 이 저장소에서 관리합니다. 개발 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요. 제안하는 기능은 위의 정보 수집·연구·백테스트·알림 범위에 맞아야 합니다.

TradingView는 TradingView Inc.의 상표입니다. 이 프로젝트는 해당 회사와 제휴·승인·후원 관계가 없으며 TradingView 소프트웨어를 포함하거나 수정하지 않습니다. 원본 코드와 출처는 [NOTICE.md](NOTICE.md), MIT 라이선스와 상표 고지는 [LICENSE](LICENSE)에 보존되어 있습니다.

# TradingView CLI

실행 중인 TradingView Desktop을 터미널에서 조작하고 차트·Pine·백테스트 결과를
JSON으로 수집하는 개인용 도구입니다. 로컬 CDP 연결을 사용합니다. TradingView의
공식 도구가 아니며 원본 출처는 [NOTICE.md](NOTICE.md)에 있습니다.

버전 2의 기본 흐름은 **저장 레이아웃 생성/선택 → 이름 있는 workspace 생성/선택
→ 작업 실행**입니다. 다른 탭을 보고 있어도 명시한 workspace를 대상으로 실행하며,
선택 없이 차트 작업을 하면 `WORKSPACE_REQUIRED`로 거부합니다.

브로커 연결과 실제 주문 제출·수정·취소는 개발 범위에 포함하지 않습니다.
Pine 전략 시뮬레이션과 과거 거래 기록은 연구용입니다.

## 설치와 업데이트

Node.js 20 이상, TradingView Desktop 설치·로그인, 해당 기능/데이터 이용 권한이
필요합니다. CDP 기본 주소는 `127.0.0.1:9222`입니다.

```powershell
git clone https://github.com/Gudals0320/tradingview-cli.git
cd tradingview-cli
npm ci
npm link
Import-Module .\scripts\TradingViewCli.psm1
tv --version
tv status
```

현재 버전은 `2.2.0`입니다. 전역 연결 없이 `node src/cli/index.js ...`로 실행할 수
있습니다. PowerShell 모듈을 쓰는 동안 저장소 진입점을 고정하려면
`$env:TV_CLI_ENTRY = (Resolve-Path .\src\cli\index.js).Path`를 설정합니다.

2.2.0 호환성: 미복구 dead operation은 모든 Desktop 관찰에서 `WORKSPACE_OWNER_DEAD`로 거부하고 `workspace show`는 진단용으로 유지합니다. 없는 strategy ID는 기다리는 대신 현재 ID를 다시 조회하세요. `layout open`이 실제로 만든 새 탭의 정확한 lifecycle만 close할 수 있습니다. 2.1 이하의 boolean-only 탭 소유권은 자동 승격하지 않으므로 `WORKSPACE_TAB_NOT_OWNED`가 나면 draft를 보존하고 reservation을 release하거나 사용자가 직접 닫은 뒤 새 CLI 탭을 여세요. 기존 landing 재사용/GUI 탭은 close 소유로 주장하지 않습니다.

```powershell
tv update
Import-Module .\scripts\TradingViewCli.psm1 -Force
# 프로필 등록은 원할 때만 명시 실행합니다.
Install-TvProfile
```

모듈 import는 프로필이나 User/Machine 환경변수를 바꾸지 않습니다. 프로필 설치는
기존 내용을 보존하는 멱등 작업입니다. 새 터미널에서는 모듈을 import하고 workspace를
다시 선택합니다. 업데이트 후 기존 터미널은 `-Force`로 모듈을 다시 불러오세요.

Desktop이 CDP 없이 실행 중이면 사용자가 저장 상태를 확인하고 CDP로 실행해야 합니다.
`tv launch`는 기본적으로 기존 앱을 종료하므로 미저장 작업을 잃을 수 있습니다.
등록된 workspace가 있으면 kill 실행을 거부합니다. 명시 `tv launch --no-kill`은
기존 앱을 종료하지 않습니다. CLI는 자동으로 앱을 실행/재시작하지 않습니다.
TV_CDP_HOST/TV_CDP_PORT/TV_CDP_TIMEOUT_MS로 연결 설정을 변경할 수 있습니다.

## 레이아웃과 workspace 준비

Windows PowerShell5의 `2>&1`은 native stderr JSON을 NativeCommandError로 감쌀 수
있습니다. stdout/stderr를 따로 수집하고 `$LASTEXITCODE`도 확인하세요. 모듈은 영구적인
실행 정책을 변경하지 않습니다; 로컬 모듈을 허용하지 않는 셸에서는 명시 이름 지정이
그대로 동작합니다.

```powershell
tv layout create "Research A"
tv layout list
tv workspace inventory
tv workspace create research-a --layout LAYOUT_URL_ID
tv workspace select research-a
tv state
tv symbol BINANCE:BTCUSDT
tv timeframe 60
tv quote
tv ohlcv --count 20 --summary
```

레이아웃 생성은 **새 탭**에서 이루어지며 이전 활성 target과 foreground 변경을
결과에 표시합니다. 기존 레이아웃을 새 탭에 열려면 `tv layout open LAYOUT_URL_ID`를
사용합니다. `layout list`의 `id`는 차트 URL/바인딩 ID이고 숫자 저장 ID는 `storage_id`입니다.
같은 레이아웃이 여러 탭에 열려 있거나 다른 workspace가 예약했으면 거부합니다.

차트-only workspace는 Pine 에디터 없이 생성·조회·종목 변경할 수 있습니다.
workspace 하나가 전용 저장 레이아웃과 실행 target 하나를 소유합니다. 현재 선택은
각 PowerShell 프로세스에만 저장됩니다. workspace를 선택하면 연결 레이아웃도 함께
확인/선택합니다. 레이아웃 선택이 달라지면 모듈은 workspace 선택을 무효화합니다.

```powershell
# 세션 선택과 무관하게 이 호출에만 적용합니다.
tv --workspace research-a state
tv --workspace research-a symbol BITSTAMP:BTCUSD
tv workspace list
tv workspace show research-a
```

모듈 없이 `workspace select`를 실행하면 부모 셸에 선택을 적용할 수 없다는 오류가
납니다. 자동화/에이전트는 매 호출에 `--workspace NAME`을 붙이는 방식을 권장합니다.
명시 이름 → 터미널 선택 → 미선택 오류 순서이며 활성 탭으로 fallback하지 않습니다.

## Pine과 백테스트

실제 적용 전략 Properties는 `strategy properties`로 읽습니다.
`strategy set-properties --values JSON`은 전체 patch를 타입·단위·native 옵션으로 먼저 검사하고 한 번 적용한
뒤 readback과 해당 계산 완료를 확인합니다. `indicator set`은 strategy_props 내부 ID
변경을 거부합니다. [필드·통화·호환성 계약](docs/strategy-properties.md)을 확인하세요.

개발 브랜치의 `backtest run --mode deep`은 별도 native Deep 작업을 명시 실행합니다.
status/wait/results는 순수 관측이며 일반 `data strategy`를 딥 결과로 대신 반환하지
않습니다. [기간·timezone·응답 귀속·불명 작업 계약](docs/deep-backtesting.md)은 현재
실환경 인수 검증 중입니다. 설치된 정식 2.2.0의 지원 목록과 구분하세요.

Pine 문서는 기본 생성 조건이 아닙니다. chart-only workspace에서 명시적으로 새 저장
문서를 준비하거나 정확한 저장 ID를 엽니다. 현재 generation과 재호출에 사용할 고정
request ID가 필요합니다. `--mount`는 에디터만 열며 기존 수정 draft를 저장/폐기하지
않습니다. 이미 준비됐으면
`workspace create`에 `--pine 'USER;DOCUMENT'`를 지정해도 됩니다.

```powershell
tv pine list
tv workspace show research-a
tv workspace pine-prepare research-a --create 'Research A Strategy' --file strategy.pine --request-id research-a-document --generation EXACT_GENERATION --mount
tv workspace attach research-a --pine 'USER;DOCUMENT_A' --generation EXACT_GENERATION
tv --workspace research-a pine set --file strategy.pine
tv --workspace research-a pine compile --save
tv --workspace research-a pine errors
tv --workspace research-a workspace wait
tv --workspace research-a data strategy
tv --workspace research-a data ledger --offset 0 --limit 100
```

같은 Pine 문서를 두 workspace에 연결할 수 없습니다. 탭만 나눠서 같은 문서 저장을
경쟁시키지 마세요. 자동 복제는 하지 않으며 명시 복제본은 사용자가 보관/정리합니다.
바인딩된 `pine new/open`은 문서 교체를 거부합니다. 전용 문서를 준비한 뒤 attach하거나,
`workspace detach NAME --generation GEN`으로 차트-only로 전환합니다. GUI 수정 draft를
몰래 버리거나 저장하지 않습니다. GUI 입력 변경은 CLI 잠금을 따르지 않습니다.

`pine-prepare`는 생성/원격 저장 검증/열기/연결 결과와 ID·버전·generation을 반환합니다.
기존 문서는 chart-only workspace에서 `--create` 대신 `--open 'USER;DOCUMENT_A'`로
선택합니다. 수정되지 않은 저장 문서 전환은 previous_document에 기록됩니다. 문서
생성은 탭 종료 소유권을 부여하지 않습니다. 응답 유실은 같은 request ID로 재개하며
0개/여러 후보는 불명으로 보존합니다. 완료 뒤 옛 generation 재호출은 현재 generation
안내와 함께 거부하며, 새 generation으로 재호출하면 중복 생성 없이 재사용합니다.

`pine analyze`는 offline 휴리스틱이고 `pine check`는 차트 없이 서버에서 검사합니다.
컴파일 완료·전략 계산·저장된 소스 일치·결과 검증은 별개입니다. 이미 검증된 동일
소스의 `unchanged:true, compile_performed:false`는 성공입니다. 경고가 늦게 도착할 수
있으므로 errors를 다시 읽습니다. `REPORT_UNVERIFIED`는 compile 또는 검증된 입력 변경이
필요합니다. `indicator get ID`로 입력 ID를 먼저 확인하세요.

```powershell
tv --workspace research-a indicator get CURRENT_STUDY_ID
tv --workspace research-a indicator set CURRENT_STUDY_ID --inputs '{"in_0":21}'
tv --workspace research-a workspace wait
tv --workspace research-a data ledger --offset 100 --limit 100 --report-revision FIRST_REVISION
```

원장 페이지 간 revision이 바뀌면 `REPORT_CHANGED`로 거부하며 offset 0부터 다시
수집해야 합니다. 데이터/히스토리는 실제 로드된 봉과 계정 권한 범위입니다. Deep
Backtesting과 서버 전체 히스토리 완전성을 보장하지 않습니다. `data equity`는 해당
Desktop 내부 배열이 제공될 때만 성공하며 buy-and-hold로 대체하지 않습니다.

## 병렬 작업과 관찰

다른 터미널에서 Research B 레이아웃/workspace와 별도 문서를 준비하세요. 서로 다른
workspace의 연결·변경·계산·결과 수집은 병렬로 실행할 수 있습니다. 같은 자원의 변경은
FIFO 순서로 대기합니다. 기본 대기는 30초, 최대 300초, 대기열은 64개입니다. Ctrl+C로
대기를 취소하거나 `--lock-timeout-ms`로 제한합니다. timeout은 소유 command/PID/시작시각을
알려주며 성공 결과에도 `provenance.locks.waited_ms`와 대기했던 소유자를 남깁니다.

```powershell
tv --workspace research-a stream quote --interval 500
# 다른 터미널
tv --workspace research-b pine compile
tv --workspace research-b data strategy
tv workspace locks
```

상태·wait·허용 관찰·stream은 변경 잠금을 잡지 않습니다. source/inputs/context가 읽는
중 변하면 결과를 채택하지 않습니다. stream은 매 tick target/generation을 확인하고
소실 시 종료하며 샘플에 workspace/target/generation을 붙입니다. `stream ohlcv`는
workspace의 **이미 준비된 pane**만 관찰합니다. 다른 target을 자동 생성/재배치하지
않으며 출력은 요청 feed를 담은 frame입니다. pane을 먼저 준비하거나 workspace를 나누세요.

UI·CDP 화면 캡처는 소유 탭이 선택돼 있어야 합니다. `screenshot --method api`는 해당
차트의 백그라운드 API를 사용합니다. 에디터/UI는 창 최소화로 viewport가 0이면
`PINE_VIEWPORT_UNAVAILABLE` 등으로 실패합니다. 기존 창을 복원하세요. 다른 탭을 보는
것과 앱 창 최소화는 다릅니다; 모든 UI가 가려진 탭에서 동작한다고 보장하지 않습니다.

## 종료와 복구

상주 daemon은 없습니다. 호출마다 지속 workspace ID와 일시 target/browser/page 세대를
확인합니다. CDP 정상 목록에서 target이 없을 때만 `WORKSPACE_TARGET_LOST`, 연결 불가는
`WORKSPACE_DISCONNECTED`(exit 2)입니다. 자동 kill/reload/무한 탭 재생성을 하지 않습니다.
CLI를 중단해도 저장 자원과 미완료 기록을 보존합니다. release 기본값은 탭 보존입니다.

완전히 해제한 이름을 재사용하려면 `workspace reset NAME --id ID`로 정확한 이름/ID를
확인해 reset하세요. 기록은 보존하고 새 생성에서 ID를 새로 만듭니다. live owner나
연결 단절을 reset으로 우회하지 않습니다.

```powershell
tv workspace show research-a
tv --workspace research-a workspace interrupt --operation EXACT_DEAD_OPERATION
tv --workspace research-a workspace recover --operation EXACT_INTERRUPTED_OPERATION
tv layout open LAYOUT_URL_ID
tv workspace reconnect research-a --target NEW_TARGET --generation OLD_GENERATION
tv --workspace research-a workspace release
```

재연결은 이전 generation을 대조하며 새 target의 정확한 레이아웃/문서를 검증합니다.
예전 study ID·계산 검증은 버리고 다시 compile해야 합니다. GUI 미저장 draft의 복구는
보장하지 않습니다. `--rebind --restore-document`는 외부 수정 draft를 덮지 않는 경우에만
기록된 문서/소스를 복원합니다. 정상 계산 대기·입력 오류·읽기 실패만으로 무조건 recover를
요구하지 않습니다. 미완료 native 결과는 확인 없이 재실행하지 마세요.

무관한 journal/pane/target 조사 오류는 정상 workspace를 차단하지 않습니다. inventory는
partial과 대상별 오류를 제공합니다. 전체 레이아웃 변경은 넓은 검증을 유지합니다.
`LOCK_HOLDER_DEAD`는 native 기록을 먼저 복구하고 정확한 dead token을 확인해야 합니다.
`ADMISSION_PERMISSION`은 상태 디렉터리 권한, `ADMISSION_BUSY`는 메타데이터 점유입니다.

```powershell
tv session status
tv session recover --run-id EXACT_RUN
tv session discard --target-lost --run-id EXACT_RUN
tv --workspace research-a workspace abandon --id EXACT_ID --operation EXACT_OPERATION
```

discard/abandon은 복원을 포기하는 명시 작업이며 incomplete 기록을 남깁니다. lost-target
discard는 연결 가능한 CDP에서 기록 target들이 모두 없는지 확인합니다. live 잠금을
강제 삭제하거나 탭을 reload해서 우회하지 마세요. `tab switch`는 해당 workspace만
선택하고 `tab close`는 CLI가 만든 소유 탭만 닫습니다. `layout switch` 대신 다른
레이아웃을 open하고 workspace를 생성/선택하세요.

## 기존 설치/파일/스크립트 이행

버전2의 breaking changes는 WORKSPACE_REQUIRED 의무 선택, 활성 탭 fallback 제거,
구 active-tab pine-batch 실행 은퇴, TEMP에서 LOCALAPPDATA/XDG로 상태 저장소 이동입니다.
기존 전역 설치와 모든 터미널/스크립트를 아래 순서로 이행하세요.

상태는 `%LOCALAPPDATA%\tradingview-cli` 또는 Unix XDG state에 지속 저장됩니다.
`TV_STATE_DIR`로 바꿀 수 있습니다. 전역 활성 선택은 저장하지 않습니다. 이름/연결/잠금/
journal/history/results는 private 저장소에 있으며 공개 handle에는 소스/token이 없습니다.

1. 구버전 터미널에서 작업을 완료/복구하고 기존 workspace reservation을 release합니다.
2. handle과 예전 private artifacts를 보존한 채 업데이트하고 모듈을 재import합니다.
3. schema 1/2 handle을 이름으로 import한 뒤 명시 rebind하고 결과를 다시 검증합니다.

```powershell
tv workspace import research-a --file worker-a.tvws.json
tv --workspace research-a workspace rebind --id EXACT_ID
```

import는 멱등이고 예전 TEMP 파일을 삭제/이동하지 않습니다. 필요한 경우 `--legacy-state`
경로를 지정합니다. 구버전의 live lease는 `LEGACY_CLI_ACTIVE`, journal은 해당 target/app
효과만 차단합니다. 예전 reservation이 살아 있으면 import를 거부합니다. 모든 터미널을
업데이트하고 같은 구버전 reservation을 두 버전에서 공유하지 마세요.

구 임시 registry에 자원 예약만 투영해 v1의 일반 실행도 차단합니다. 원래 기록과
private 소스는 보존합니다. `session status`의 legacy 항목과
`session recover/discard --legacy-state DIRECTORY`로 예전 journal을 현재 복구 코드에서
진단/보관할 수 있습니다. endpoint를 공유하는 터미널은 같은 상태 디렉터리를 사용하세요.

`--workspace FILE`은 JSON 경고가 있는 이행 경로입니다. 이름과 로컬 파일이 모두 맞는
참조는 모호성 오류입니다. 기존 `--target`/TV_CDP_TARGET 차트 스크립트는 이름 지정으로
바꾸세요. 구 active-tab `examples/pine-batch.js` 실행은 퇴역했으며
[workspace-batch.mjs](examples/workspace-batch.mjs)가 전용 전략 입력 실험/결과 일치를
검증합니다. 초기 source 적용·compile 후 실행하고 각 입력 ID를 확인하세요.

## 검사와 상세 계약

```powershell
npm run lint
npm test
node scripts/stress-workspace-locks.mjs 20
tv help --json
tv help --json pine compile
tv help --json --brief pine compile
tv --workspace research-a watchlist raw --list-id EXACT_LIST_ID
```

`--brief`는 `--json`과 함께 사용합니다. 명령의 인자·workspace·잠금·foreground·읽기 조건을 유지하고 반복 설명을 줄입니다. 공통 옵션·환경·오류·출력·provenance 계약은 처음에 full catalog로 확인하고 캐시하세요. brief의 `contract.bootstrap_command`가 full 조회 명령을 안내합니다. 캐시는 `cli.version`, `catalog_version`, `catalog_fingerprint`가 바뀌면 무효화합니다. fingerprint는 필터와 무관한 전체 계약의 SHA-256입니다. 알 수 없는 명령은 stdout 없이 stderr JSON의 `UNKNOWN_COMMAND`, `details.command_path`, `details.help_command`로 안내합니다.

offline 검사는 Desktop 없이 실행합니다. 실환경 smoke는 명시 전용 workspace에서만
수행하며 SHA/dirty/시각/target을 기록합니다. 실제 검사와 fixture 증거를 구분합니다.

- [Workspace 준비·잠금·복구·이행](docs/workspaces.md)
- [명령 실행 범위](docs/workspace-commands.md)
- [Dispatch와 결과 증거](docs/operation-contracts.md)
- [오류 코드별 다음 조치](docs/errors.md)
- [백테스트 보호의 과거 검증 기록](docs/backtest-readiness.md)
- [이슈29 검증·증거·자원·제약 기록](docs/issue29-validation.md)
- [에이전트 지침](AGENTS.md)

미공식 도구입니다. TradingView 약관과 계정/데이터 권한 범위에서 사용하세요. 내부 API와
DOM은 Desktop 버전에 따라 달라질 수 있으며 재현 가능한 검증 범위를 보고합니다.

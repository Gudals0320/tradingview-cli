# TradingView CLI 2.3.0

2.3.0은 이름 있는 workspace에서 저장 전략 준비, 실제 설정 변경, TradingView 서버
알림 운영, UTC Deep 계산과 실제 equity 수집을 제공합니다. 구현은
[PR #54](https://github.com/Gudals0320/tradingview-cli/pull/54), CI fixture 수정은
[PR #55](https://github.com/Gudals0320/tradingview-cli/pull/55)에서 main에 통합됐습니다.
이 파일은 릴리즈 준비 변경 기록이며 GitHub Release 게시나 실제 설치 업데이트의
완료 영수증을 대신하지 않습니다.

## 사용할 수 있는 기능

- `workspace pine-prepare`: 전용 저장 Pine 문서를 만들거나 정확한 ID로 열어
  persistence, mount/attach, compile과 검증된 보고서까지 연결합니다. Stable request
  ID로 부분 실패를 재조회하며 수정된 foreign draft를 몰래 저장하거나 버리지 않습니다.
- `strategy properties` / `strategy set-properties`: 16개 Properties의 타입·단위·native
  지원 상태를 읽고, 한 번 적용한 뒤 readback과 해당 재계산 완료를 확인합니다.
- `alert strategy-create`: fills, alert(), both를 선택해 saved source/inputs/context/
  effective Properties의 서버 스냅샷을 만들고 정확한 ID로 확인합니다. 이름·메시지·만료를
  명시하며 메시지는 그대로 전달하고 공개 결과에는 hash를 반환합니다.
- 전략 알림의 get/pause/resume/update/delete, stale 스냅샷 비교, 명시적인 gap/overlap
  replacement와 finite TV 내부 fire 로그를 제공합니다. Uncertain outcome은 정확한
  요청/작업 ID로 관측·복구하며 생성·수정 요청을 맹목적으로 재전송하지 않습니다.
- `backtest run/status/wait/results/normal`: 별도 native Deep 요청의 기간·source·native
  request/cycle/response 귀속을 검증하고 immutable metrics/ledger를 수집합니다.
- `data equity`: 이미 추가된 direct `plot(strategy.equity)`를 명시적으로 선택해 loaded
  raw curve를 수집하고 독립 fill/fee/final PnL 대조 후 전체 CSV로 내보냅니다.
- FIFO 테스트는 논리 wait와 mock CDP 응답의 시간을 맞추고 실제 queue-ready를
  기다립니다. 실패해도 해당 fixture가 만든 owner child만 정리해 CI가 멈추지 않습니다.
  제품 timeout, assertions 의미 및 CI job timeout은 바꾸지 않았습니다.

## 사용자에게 영향을 주는 동작

- 일반 보고서와 원장은 `mode:normal`을 반환합니다. Deep UI가 표시돼도 일반 차트
  데이터를 Deep 결과로 바꿔 반환하지 않습니다.
- Native open ledger는 `x`에 평가값이 있어도 `open:true`입니다. 실제 청산이 없으면
  `exit_time`/`exit_bar`는 null이며 평가 시각/바는 `mark_time`/`mark_bar`로 구분합니다.
  Raw native fields와 초·밀리초 정밀도는 보존합니다. 기존 `x` 존재만으로 청산 여부를
  판단하던 소비자는 `open`과 `exit_time`을 확인하세요.
- `strategy-update`는 원래 전략 스냅샷을 유지하며 이름/메시지/만료를 수정하는 native
  modify-and-restart입니다. **Paused 알림도 활성화합니다.** 활성 반영이 늦으면 성공으로
  간주하지 않고 동일 operation ID의 fresh readback으로 확인합니다.
- `strategy-create-then-pause`는 active 생성 후 pause하는 명시적 두 단계 정책입니다.
  **원자적 초기 paused 생성이 아니며 그 창 동안 알림이 발생할 수 있습니다.** 결과에
  단계와 client 확인 시간 창을 반환합니다. Gap 교체는 신호 공백, overlap 교체는
  중복 신호 가능성이 있으며 old alert를 자동 삭제·재활성화하지 않습니다.
- Modified draft, 외부 변경, stale proof, pending/unknown native outcome은 보호합니다.
  업데이트가 기존 workspace 상태나 로그인·private 기록을 자동 복구/초기화하지 않습니다.
  Catalog cache는 `cli.version`, `catalog_version`, `catalog_fingerprint`로 무효화하세요.

## 지원 범위

Deep는 현재 검증된 UTC/Etc-UTC 계산과 UTC로 정규화한 두 경계가 모두 자정인
whole-day 구간만 지원합니다. Non-UTC/subday는 전송 전에 거부합니다. Equity는 일반
same-currency whole-entry/exit 경로를 지원하며 FX, partial/pyramided allocation,
모호한 same-bar ordering 및 Deep equity는 미검증으로 거부합니다. Loaded curve를
전체 계정 기간으로 표현하지 않습니다.

웹훅 설정·외부 HTTP 전송/수신·receiver 및 실거래 주문은 포함하지 않습니다. 계정 최대
규모와 bar-magnifier 하위 봉 coverage는 실측했다고 주장하지 않습니다. Deep 전용 live
process-kill과 실제 alert quota rejection도 실시/관찰하지 않았습니다. 관련 fixture와
실제 native 검증은 구분합니다.

상세 계약: [Properties](strategy-properties.md), [전략 알림](strategy-alerts.md),
[Deep](deep-backtesting.md), [equity](strategy-equity.md), [workspace/오류 복구](workspaces.md).

## 검증과 업데이트

660개 offline tests와 lint가 통과한 roadmap/M1 head는 `5d7017e`이며 Opus가 수용했습니다.
실제 clean-code Desktop smoke 기준은 `943f214`로, 일반 원장 1,461행 및 equity CSV
1,660행/118개 checkpoint(최대 오차 3.637978807091713e-12)를 확인했습니다. TV 화면의
정상/Deep 지표·기간, zero/open/breakeven, 전략 알림 3모드와 운영·교체·실시간 이벤트,
거래별 UTC/Asia-Seoul 표시 시각을 대조했습니다.

FIFO fixture head `dfef2ba`는 Sol의 독립 lint/660개 테스트 및 지연·실패 정리 검증을
통과했고 main `44a0d87`의 [CI](https://github.com/Gudals0320/tradingview-cli/actions/runs/37295998320)가
성공했습니다. 첫 main CI의 cancelled 시도와 앞선 원불명 flake는 실패 기록으로
보존하며 성공으로 집계하지 않습니다. 이번 버전 준비의 검증은 별도 PR/SHA로 기록하고,
버전 bump가 과거 native 실험을 다시 실행한 것처럼 표현하지 않습니다.

[공개 실제 인수 기록·정밀도·지원 한계](roadmap46-validation.md)는 당시 버전/SHA와
설치·게시 상태를 보존하는 과거 영수증입니다. QA 알림 6개만 삭제했고 기존 사용자
26개의 ID·설정이 같음을 확인했습니다. 전용 문서/layout, genuine unknown과 실패/partial
private 원본을 보존했고 개인 ID/source/token은 공개하지 않습니다.

기존 clean main 설치에서 `tv update`를 실행한 뒤 새 프로세스의 `tv --version`과
`tv help --json`을 확인하세요. Updater는 release tag가 아니라 해당 개인 origin/main을
fast-forward합니다. Dirty/non-main/diverged 설치는 거부하며 workspace·Desktop을
자동 재기동하지 않습니다. Lockfile 변경 때 `npm ci --ignore-scripts`를 수행하므로
`deps_installed:true`와 warning 유무를 확인하세요. 두 번째 update는 `up_to_date`여야 합니다.
이 저장소는 `private:true`이며 npm registry publish는 제공하지 않습니다.

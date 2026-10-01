검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 재현
1. 전용 QA 차트에 실행 가능한 전략을 set하고 `tv pine compile`로 report_ready:true를 확인합니다.
```pine
//@version=6
strategy("CLI-QA Raw")
if bar_index == 10
    strategy.entry("L", strategy.long)
plot(close)
```
2. 소스와 입력을 바꾸지 않은 상태로 `tv pine raw-compile` 실행.
3. `tv pine raw-compile --help`와 비교합니다.

실제: raw-compile도 `compiled:true, unchanged:true, compile_performed:false, report_ready:true`, exit 0을 반환하고 컴파일 버튼을 누르지 않습니다. 도움말은 "Click compile/add button without smart detection"입니다.

## 기대 및 완료 기준
raw-compile의 계약을 명확히 선택하고 도움말·구현·테스트를 일치시키세요. 이름과 현재 문서의 버튼 클릭 계약을 유지한다면 같은 소스에서도 dispatch해야 합니다. 호환 별칭으로 유지할 결정이라면 스마트 검증을 생략한다는 설명을 제거하고 deprecated/alias 동작을 명시해야 합니다. 실제 명령 어댑터를 통한 회귀 검증이 필요합니다.

## 근거/범위
`src/cli/commands/pine.js`는 core.compile로 연결하며 `src/core/pine.js:compile`은 무조건 smartCompile를 호출합니다. 스마트 경로의 indicator 조기 성공 결함은 별도 이슈에서 추적합니다.
로컬 증거: `strategy-unchanged-confirmed`, `raw-strategy-unchanged`.

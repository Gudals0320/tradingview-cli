검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 최소 소스
```pine
//@version=6
indicator("CLI-QA Warning")
float value = na
if close > open
    value := ta.sma(close, 10)
plot(value)
```

## 재현
1. 위 소스를 `warning.pine`로 저장하고 `tv pine check --file warning.pine` 실행.
2. `tv pine set --file warning.pine`, `tv pine compile` 실행 후 실제 컴파일 완료를 기다립니다.
3. `tv pine errors` 실행.

실제: check는 compiled:true, error_count:0, warning_count:1, exit 0. 완료 후 compile도 has_errors:false와 warnings, exit 0입니다. 그런데 errors는 다음과 같이 exit 1로 반환합니다.
```json
{"success":true,"has_errors":true,"error_count":1,"errors":[{"line":5,"column":14,"message":"The function \"ta.sma\" should be called on each calculation for consistency. It is recommended to extract the call from this scope","severity":4}]}
```

## 기대 및 완료 기준
Monaco severity를 구분해 경고를 실제 오류 수와 has_errors에서 제외하고, 경고만 있으면 exit 0이어야 합니다. warnings는 별도 필드로 유지하세요. 실제 getErrors 경로로 오류만/경고만/혼합/빈 진단을 검증하세요.

## 근거
`getErrors`는 모든 marker의 길이를 error_count와 has_errors로 사용합니다. `smartCompile`에는 이미 `splitMarkers` 구분이 있습니다.
로컬 증거: `check-warning`, `errors-warning`, `compile-warning-settled`.

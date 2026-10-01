검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 최소 소스
```pine
//@version=6
indicator("CLI-QA Comments")
// Development note: strategy.entry could be added in a strategy variant.
plot(close)
```

## 재현
`tv pine analyze --file comments.pine` 후 `tv pine check --file comments.pine` 실행.

실제: analyze는 line 3에 severity:error, `strategy.entry/close used but no strategy() declaration found` 진단을 반환합니다. check는 compiled:true, error_count:0, warning_count:0입니다. 주석을 편집하는 정상 개발 작업이 잘못된 오류를 만들고 있습니다.

## 기대 및 완료 기준
주석·문자열의 식별자 텍스트를 실제 호출로 판단하지 않아야 합니다. 실제 strategy.entry 호출에 대한 기존 진단은 유지해야 합니다. 전체 파서 구현을 요구하는 것은 아닙니다. 최소한 주석과 문자열을 제외하는 분석 경계를 정의하고 실제 `src/core/pine.js:analyze`를 호출하는 회귀 테스트를 추가하세요.

## 근거
현재 검사는 `trimmed.includes('strategy.entry')` 등을 사용합니다. `tests/pine_analyze.test.js`의 로컬 복사 함수만 검사하면 운영 함수의 수정/회귀를 놓칠 수 있습니다.
로컬 증거: `analyze-comment`, `check-comment`; fixture: `qa/pine/comment-only.pine`.

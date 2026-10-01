검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 재현
1. QA 에디터에 의미 있는 코드가 있는 상태에서 `tv pine get`으로 백업합니다.
2. `tv pine new typo` 실행.
3. `tv pine get` 실행.

실제: `{"success":true,"type":"typo","action":"new_script_created"}`, exit 0. 원래 소스가 다음 기본 지표로 바뀝니다.
```pine
//@version=6
indicator("My script")
plot(close)
```
`template` 필드도 반환에서 사라집니다.

## 기대 및 완료 기준
지원되는 indicator/strategy/library 이외 값은 CDP 접근이나 에디터 변경 전에 명확한 validation error, exit 1로 거부해야 합니다. 입력 없는 기본 indicator 동작과 유효한 3종은 유지하세요. 잘못된 입력에서 소스 변경 호출이 없다는 테스트가 필요합니다.

## 범위
문서 ID 전환 이슈와 별개로 입력 검증만으로 해결 가능한 국소 문제입니다. `templates[type] || templates.indicator`가 오타를 묵살합니다.
로컬 증거: `new-invalid-type`, `get-invalid-type`.

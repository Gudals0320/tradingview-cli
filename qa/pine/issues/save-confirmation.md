검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 재현
1. 한국어 Desktop UI에서 새 미저장 QA 문서를 준비합니다.
2. `tv pine set --file qa.pine`로 다음 소스를 넣습니다.
```pine
//@version=6
indicator("CLI-QA Save")
plot(close)
```
3. `tv pine save` 실행.
4. 창이 열린 상태와 `tv pine list`, `tv pine open "CLI-QA Save"` 결과를 확인합니다.

실제: save는 약 990ms 뒤 `{"success":true,"action":"Ctrl+S_dispatched"}`, exit 0을 반환했습니다. 이름 입력값은 채워져 있었지만 한국어 `저장` 버튼이 있는 창은 열린 채였습니다. 목록에 스크립트가 없고 open은 not found, exit 1입니다. UI의 `[data-qa-id=save-btn]`을 눌러야 저장·재열기가 가능했습니다.

## 기대 및 완료 기준
저장 완료를 확인하거나, 사용자 입력이 필요하면 명시적인 미완료 상태를 반환해야 합니다. 명령 성공이 실제 저장 성공으로 오인되면 안 됩니다. 한국어/영어 저장 창, 기존 문서 저장, 이름 입력 필요, 실패·취소 시나리오를 검증하세요.

## 원인 후보
`save`의 다이얼로그 버튼 탐색이 영어 `text === 'Save'`에 의존하며, 마지막 반환값은 저장 완료가 아닌 키 전송 여부입니다. 안정적인 selector와 완료 상태 확인이 필요합니다.
로컬 증거: `save-initial`, `inspect-save.json`, `list-before-save`, `open-before-save`. 문서 ID 전환 오류는 별도 이슈입니다.

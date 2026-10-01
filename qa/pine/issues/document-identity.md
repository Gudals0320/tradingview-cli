검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 문제
`new`와 `open`은 Monaco 소스만 교체하고 활성 스크립트의 저장 대상을 유지합니다. 반환값은 새 스크립트 생성/열기 성공이지만 이후 저장은 다른 문서를 덮어씁니다.

## 재현 A: new
1. UI에서 폐기 가능한 `QA-A` 지표를 만들어 저장하고 그대로 에디터에서 엽니다.
2. `tv pine new strategy` → `new_script_created`, exit 0.
3. `tv pine save` → exit 0.
4. `tv pine open "QA-A"`, `tv pine get` 실행.

실제: QA-A의 서버 저장 소스가 `strategy("My strategy", overlay=true)` 템플릿으로 바뀌었습니다. 새 문서를 만들지 않았습니다.

## 재현 B: open
1. UI에서 QA-A(지표), QA-B(전략)를 각각 저장하고 **QA-B를 UI에서 연 상태**로 시작합니다.
2. `tv pine open "QA-A"` → QA-A의 ID와 `opened:true` 반환.
3. 에디터 제목은 여전히 QA-B입니다. `tv pine save` 실행.
4. `tv pine open "QA-B"`, `tv pine get` 실행.

실제: QA-B의 서버 소스가 QA-A 지표 소스로 덮어써졌습니다. 저장 완료 후 목록 API와 재열기로 확인했습니다.

## 기대 및 완료 기준
- new는 독립적인 새 문서/저장 대상을 생성하고 기존 저장 문서를 보존해야 합니다.
- open은 소스뿐 아니라 활성 문서 ID·제목·저장 대상도 바꿔야 합니다.
- QA-A/B 각각의 저장 소스를 검증하는 실제 함수 회귀 테스트와 Desktop 왕복 검증이 필요합니다.
- 구현이 소스 가져오기만 지원한다면 최소한 현재의 new/open 성공 계약으로 오인시키지 않아야 합니다.

## 근거/범위
`src/core/pine.js:newScript,openScript`는 `m.editor.setValue(...)`만 사용합니다. 두 명령의 공통 문서 수명주기 문제이므로 한 이슈로 묶었습니다. 저장 다이얼로그 완료 판정은 별도 이슈입니다.
로컬 증거: `new-after-saved`, `save-after-new`, `original-after-new-get`, `open-a-from-b`, `b-after-open-a-get`. 실험에 쓴 QA-A/B는 원본 QA 소스로 복원했습니다.

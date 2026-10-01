검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 재현
1. 한국어 Desktop의 사이드 오버레이 Pine 에디터에서 아래 소스를 적용합니다.
```pine
//@version=6
indicator("CLI-QA Console")
plot(close)
```
2. 컴파일 완료 후 `tv pine console` 실행.

실제: entry_count:2, 두 항목 모두 type:info, timestamp:null. 각 message에 Pine 에디터 제목, 저장/퍼블리시 버튼 텍스트, 전체 소스, 컴파일 메시지, 라인/열 상태바가 한 덩어리로 들어갑니다. 하나는 다른 하나의 상위 컨테이너라 중복됩니다. 의도적인 문법 오류가 있는 소스에서도 같은 전체 텍스트 형태로 반환됐습니다.

## 기대 및 완료 기준
실제 콘솔 행만 반환하고 메시지별 타입·시간을 가능한 범위에서 보존해야 합니다. 에디터 소스·툴바·상태바·상위 컨테이너를 로그로 취급하면 안 됩니다. 지원하지 않는 Pine Logs 영역은 빈 결과나 명확한 상태로 구분하세요. 한국어 오전/오후 시간 표기, 에디터 오버레이/분할 보기, 컴파일 오류·일반 로그를 실제 DOM fixture로 검증하세요.

## 원인 후보
`getConsole`의 `[class*="log-"]`는 `dialog-...` 클래스에도 매칭됩니다. 실제 `editorBaseLayoutContainer-dialog-...`가 선택됐습니다.
로컬 증거: `console-indicator`, `console-invalid`, `inspect-initial.json`. Pine log.info의 모든 표시 모드는 아직 검증하지 않았으며, 이 이슈는 확인된 전체 에디터 텍스트 오추출에 한정합니다.

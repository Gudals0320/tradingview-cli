검증 기준: `95a58288` (main), Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Windows Store) / 한국어 UI. 2026-10-01 KST에 실제 CLI 및 전용 QA 레이아웃에서 재현했습니다. 아래 `tv`는 `node src/cli/index.js`와 같습니다.

개인 스크립트 대신 폐기 가능한 QA 스크립트를 사용하세요. 로컬 인계 자료는 `qa/pine/`, 원시 실행 결과는 ignored `results/pine-qa/`에 있습니다.

## 최소 소스
```pine
//@version=6
indicator("CLI-QA Invalid")
plot(qa_missing_function(close))
```

## 재현
1. 전용 차트에서 정상 지표를 한 번 적용하고 오류가 없는 상태로 시작합니다.
2. 위 소스를 `bad.pine`로 저장합니다.
3. `tv pine check --file bad.pine`는 line 3, column 6 오류와 exit 1을 반환합니다.
4. `tv pine set --file bad.pine` 직후 `tv pine compile` 실행.
5. 실제 컴파일이 끝난 뒤(이번 관측은 1초 이상) `tv pine errors` 실행.

실제 compile 결과(366ms, exit 0):
```json
{"success":true,"compiled":true,"has_errors":false,"errors":[],"warnings":[],"button_clicked":"Add or update on chart"}
```
나중의 errors는 `Could not find function or function reference 'qa_missing_function'`, severity 8, exit 1을 반환합니다. 정상 지표의 첫 적용도 CLI 성공 직후에는 차트 study가 없었고 나중에 추가됐습니다.

## 기대 및 완료 기준
현재 소스의 실제 컴파일 완료와 진단을 기다린 뒤 성공/실패를 반환해야 합니다. 완료를 입증할 수 없으면 timeout/불확실 상태를 반환해야 하며, 오류가 아직 없다는 이유만으로 성공하면 안 됩니다. indicator 경로에서 지연 성공·지연 오류·이전 진단·실패 후 수정 사례를 검증하세요.

## 원인 후보/범위
`smartCompile`은 첫 200ms 대기 후 `!strategyMode`면 바로 성공을 반환합니다. 전략의 report 검증 경로와 달리 완료 증거가 없습니다. `raw-compile`도 현재 같은 함수를 호출하므로 영향을 받습니다. 고정 sleep을 늘리는 것만으로 완료 판정을 대신하지 않는 수정이 필요합니다.
로컬 증거: `check-invalid`, `compile-invalid`, `errors-invalid-immediate`, `errors-invalid-later`, `applied-indicator`, `indicator-later`.

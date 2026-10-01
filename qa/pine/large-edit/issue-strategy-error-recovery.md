검증 기준: `6e41546`, `codex/pine-qa`; Windows / Node.js 24.19.0 / TradingView Desktop 3.4.1.8194 (Store) / 한국어 UI. 2026-10-01 KST 실제 CLI 검증입니다. #5의 기존 indicator 수정 이후 발견한 **saved strategy 오류 복구 경로**의 후속 결함입니다.

## 사용자에게 보이는 문제

저장·적용된 전략에 컴파일 오류를 넣었다가 수정하고 `pine compile --save`를 실행하면, 동일 전략이 차트에 두 개 생깁니다. 실제 두 study는 정상 완료됐지만 CLI는 약 30초 후 `compiled:false`, `report_ready:false`, exit 1을 반환합니다. 따라서 정상적인 디버깅 루프가 실패하고 차트 상태도 변경됩니다.

## 독립적인 최소 재현

폐기 가능한 전용 QA 차트에서 아래 전략을 새 QA 이름으로 저장합니다. `tv`는 `node src/cli/index.js`와 같습니다.

```pine
//@version=6
strategy("CLI-QA Strategy Reopen 20261001")
fast = ta.sma(close, 5)
slow = ta.sma(close, 20)
if ta.crossover(fast, slow)
    strategy.entry("L", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("L")
plot(fast)
```

1. `pine new strategy` → `pine set --file good.pine` → `pine save` → `pine compile`. 같은 이름의 chart study가 1개, report_ready:true인지 확인합니다.
2. `pine open "CLI-QA Strategy Reopen 20261001"`; 3행의 5를 7로 바꾸어 set → compile --save. **이 정상 수정은 통과하고 study는 1개를 유지했습니다.**
3. 같은 문서를 open하고 3행을 `fast = qa_missing_sma(close, 9)`로 바꾸어 set → compile --save. 함수 없음, line 3/column 8, exit 1을 확인합니다. study 수는 아직 1개입니다.
4. 3행을 `fast = ta.sma(close, 9)`로 수정해 set → compile --save.
5. `state`로 같은 이름의 study 수, `pine errors`로 현재 진단을 확인합니다.

실제 4단계 결과(30,362ms, exit 1):

```json
{
  "success": false,
  "compiled": false,
  "has_errors": false,
  "errors": [],
  "warnings": [],
  "error": "Compilation did not produce a provably fresh report before timeout.",
  "report_ready": false
}
```

실제 5단계: 같은 전략 **2개**, `pine errors`는 error_count:0, warning_count:0, exit 0.

## 큰 실제 편집에서도 동일 재현

266-line editor count의 초기 전략을 319-line/18,588-byte 편집본으로 확장했습니다. 다중 입력·보조함수·배열 통계·21행 대시보드·ATR 추적 손절·본전 보호·손실 후 재진입 대기를 포함합니다. 120행 함수명 한 곳을 깨뜨렸다 복구했을 때 같은 문제가 발생했습니다.

- `check`는 수정본에 compiled:true, 오류/경고 0.
- 실제 차트에는 같은 Pine 문서/버전 3.0의 study 2개, status_type:2, 완전한 report와 각각 closed_trades:515, runtime_error:null.
- 내부 `compilationState`는 `More than one strategy changed; cannot identify the compiled script.` 상태.
- UI console에는 완료 및 차트 추가 메시지가 있음.
- 실패 뒤 저장 소스를 다시 열었을 때 전체 LF-normalized SHA-256이 편집본과 일치함. 코드 유실이나 실제 Pine 문법 오류가 원인은 아님.

## 원인 후보와 수정 범위

오류 후 Desktop의 native compile action이 add/update 중 무엇을 가리키는지 확인해야 합니다. `dispatchPineCompilation`은 버튼 handler에서 updateOnChart를 추론하고, 그렇지 않으면 addToChart를 수행합니다. 잘못된 추가로 동일 문서의 여러 study가 변경되면 전략 freshness 검증은 이를 모호하다고 거부합니다. **관측된 중복 생성을 해결해야 하며, 타임아웃을 늘리거나 여러 report 중 첫 것을 고르는 수정은 부적절합니다.** 정확한 내부 원인은 Executor에서 확정하세요.

## 완료 기준

- saved strategy의 정상 수정 및 오류→수정 모두 문서/차트 연결을 유지하며 study 수가 1→1이어야 함.
- 수정 후 실제 현재 소스의 report_ready:true와 exit 0을 반환해야 함.
- 다른 전략/동명 다른 문서가 있으면 잘못 갱신하지 않고 대상을 검증하거나 명확히 거부해야 함.
- 실패 뒤 retry/raw-compile에서도 중복 추가나 오래된 report 채택이 없어야 함.
- 실제 함수 회귀 테스트와 최소 재현 및 큰 소스 시나리오의 Desktop 재검증 필요.

## 자료 및 임시 우회

로컬 `qa/pine/large-edit/`에 baseline/edited/broken.pine, workflow.mjs, evidence.json, 최소 재현 도구와 minimal-evidence.json을 보존했습니다. 최소 재현은 `node qa/pine/large-edit/repro-strategy-update.mjs TARGET` 다음 같은 명령에 `error-cycle`을 붙여 실행합니다. 기존 동일 QA 이름 study가 있으면 최초 단계가 보호 차원에서 중단됩니다.

큰 시나리오의 나머지 저장 검증을 위해 **해당 실험이 만든 두 QA study만 제거 후 저장된 동일 소스를 재적용**했습니다. 그 후 compile/저장/다른 문서 왕복/raw-compile은 통과했습니다. 이는 수동 우회이며 제품 수정으로 간주하지 않습니다. 최소 재현용 중복 study는 추가 디버깅용으로 남겼습니다.

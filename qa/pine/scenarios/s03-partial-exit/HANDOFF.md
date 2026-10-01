# S03 인계 — 부분청산·잔여 포지션 관리

2026-10-01 KST. 작업 디렉터리 `C:\Codex\.worktrees\tradingview-cli-pinescript-qa`.

**기능 검증 PASS(컴파일 복구 우회 포함). 직접 저장→컴파일 복구/재열기 후 컴파일은 FAIL. 초기 실행의 자산 격리 이탈도 FAIL이며 S02를 복원했습니다.** 제품 파일, 다른 worker의 로컬 파일, Git, 이슈는 변경하지 않았습니다. Desktop 실행을 종료하고 Lead에게 인계합니다.

## 최종 자산과 소스

- 레이아웃 `CLI-QA-S03-20261001`, chart `8b3vQsAK`, 고정 target `890408E3FA96D8076A7D49A8B3AF200A`.
- 실제 저장 이름/제목 `CLI-QA-S03-EMA`, ID `USER;d90436c7ff524821b19882294c3c4548`, 최종 v9.0. 자동 suffix 없음(124 목록 확인).
- 전략 study `IC4e6I` 1개 + 기본 Volume `oHjgbk` 1개. 최종 symbol `BINANCE:ETHUSDT`, 15분, 캔들 type1.
- 초기 소스 `baseline.pine`: EMA5/12 상승 교차, 10개 long, 신호봉 ATR14×0.5를 초기 R로 고정, 전량 initial stop/2R limit.
- 최종 소스 `final.pine`: 같은 진입, `TP50` 5개에 1R limit/초기 stop, `Runner` 5개에 초기 stop. 두 exit의 `oca_name`을 분리합니다. TP 체결 후 잔량5를 감지하면 stop을 `max(이전 stop, 진입가, close[1]-ATR[1]×0.6)`로 갱신합니다. 주문 체결 시 재계산을 켜 본전보호 지연을 보정했습니다. 같은 봉 재진입을 막고 시간청산 전에 두 pending exit를 취소합니다. 기본 최대보유12봉, QA 입력3봉/1봉을 별도로 검증했습니다.
- `delayed-protection.pine`: 첫 편집의 보존본. `calc_on_order_fills`가 없어 같은 봉 TP 후 잔여 stop이 초기 stop으로 체결된 fixture 실패(공용 QA에서 관측). 통과 근거에서 제외.
- `function-error.pine`: 최종 계열에서 `math.max(runnerStop, …)`를 존재하지 않는 `math.qa_missing`으로 바꾼 실제 오류 주입본. 최종의 체결 집계 보정/복구 주석은 이 파일 이후 추가됐습니다.
- 진단 표는 마지막 확정 과거봉에도 그립니다. 체결 건수는 `strategy.closedtrades.exit_comment`로 집계하고 관측 카운터는 별도로 표시합니다.

SHA-256은 CRLF→LF만 정규화하며 trim하지 않았습니다.

| 소스 | SHA-256 |
|---|---|
| 최종 로컬/에디터/서버 재열기/최종 report | `1ce153bd5506036b2b172f5aef1d067c8a69feb7d5af0d28b6a61dac34f3b98e` |
| S02 복원본/서버 재열기 | `eb174c78d3374a7cc13a6d2d82f2d1d51e9b0cc1e14ae3d7c12a8ddf394b2251` |

다른 초기/주입 소스의 정확한 해시는 `evidence.json.sourceHashes`에 있습니다. 전체 Pine 소스는 위 파일들에 있으며 편집 차이는 고정 bracket→5/5 exit, 체결 재계산, 고정 R/단조 stop, 시간청산, 이벤트 기록, 실제 체결 집계입니다.

## 기준별 결과

| 기준 | 결과 | 실제 근거 |
|---|---|---|
| 전용 저장 baseline 실행 | PASS | 063 compile exit0/report_ready true, 064 실제 `L` qty10/`Fixed` qty10 주문. |
| 1R 50% 실제 부분청산/잔량/예약 충돌 대조 | PASS | 127 원장: 17개 포지션, 청산 레그34개, 모든 포지션 합10, 각 레그5. TP1R 6건. 129 마지막 실제 주문20개 중 청산을 원장의 ID·가격·수량과 대조. 최종 open PL0. 표의 partialFills6와 일치. |
| 초기 R 불변 | PASS | 34개 청산의 entry/exit 코멘트 R, 49개 이벤트의 R, 17개 entry R 일치. 6개 TP 체결가격은 entry+R에서 심볼 1tick(0.01) 이내. |
| stop 후퇴 없음/본전 보호 | PASS(관측 범위 명시) | 128 표의 MANAGE28개에서 stop≥prev. 잔량5 MANAGE에서 stop≥entry. TP6건의 잔여 stop 코멘트 모두 entry 이상, 실제 runner 체결가격은 발행 stop과 1tick 이내. 다봉 관리4개 포지션의 마지막 trace stop과 원장 일치. 동일봉 왕복2건은 trace 대신 실제 원장 stop 코멘트로 본전 확인. 모든 tick 변경을 관측한 것은 아님. |
| 시간청산 실제 발생 | PASS | 기본12봉은 TIME0건이므로 통과 근거로 사용하지 않음. maxBars3의 110 원장에는 TIME4건(잔량5 3건, 전량10 1건), 모두 entry와 정확히3봉 차이. 111 표 timeFills4와 일치. 별도 risk10×ATR/maxBars1의 전용 run 079–081은 TIME17건, 전부10개/1봉. |
| 오류 주입·검출 | PASS, compile 진단 제한 별도 | 089 set→090 save v5→091 compile exit1/bare Rejected. 092 errors exit1, `math.qa_missing` line35 column23. 반환2개는 동일한 진단의 중복이며 서로 다른 오류2건으로 세지 않음. 주입1회. |
| 수정 후 직접 save→compile | FAIL | 093 수정→094 save v6 성공→095 compile exit1/Rejected. 095a errors는 정상(경고1), 095c data strategy exit1 REPORT_PENDING. |
| 복구 우회 후 study1/current source report, retry/raw | PASS | 주석으로 소스를 변경한 뒤 095f/119b `compile --save` 성공. 최종 119b v9, 119c retry/120 raw exit0, compile_performed false/unchanged true/report_ready true. 121의 report hash는 최종 소스 해시와 같고 122 study1. raw를 강제 재컴파일로 주장하지 않음. |
| 전체 소스 save/open/다른 문서/재열기 보존 | PASS | v8에서 113–118로 S02 문서를 읽기 전용으로 열었다 돌아와 정규화 해시/ID 보존. v9에서 121a save→121b get→121c exact-name open→121d get, 로컬/에디터/재열기/report 해시 일치. 124 exact name/id 확인. |
| v8 재열기 후 compile | FAIL | 114 LF 소스와 118 CRLF 소스의 정규화 해시 같음. 119 compile exit1/Rejected. 최종 v9는 별도의 성공 우회와 재열기/report 확인으로 정리했으며 이 실패를 PASS로 대체하지 않음. |
| 최초부터 고정 전용 자산/다른 시나리오 미접촉 | FAIL | 아래 격리 이탈·복원 참조. 001–055를 기능 acceptance 근거에서 제외. |
| 실시간/실거래/무한 과거/모든 intrabar stop 변경 | NOT TESTED | 과거 계산 표본으로 완료. broker/replay 주문과 긴 대기를 실행하지 않음. |

`evidence.json.assertions`의 독립 수량·숫자·해시 assertion은 모두 true입니다. 이들은 C7/C8의 실행 실패를 없애지 않습니다.

### 실제 원장 사례

- 기본 설정 T6: entry `2656.75`, R `4.31166434`; TP qty5 `2661.07`; 잔여 qty5 stop `2679.62170701`, 실제 fill `2679.62`. 초기 R은 두 청산에서 동일. 표 stop은 `2652.43833566→2656.75→2657.0420024→2659.77285938→2662.17451228→2664.2887614→2679.62170701`.
- 동일봉 본전 T1: entry `2705.19`, R `2.37872162`; TP qty5 `2707.57`; 같은 다음 봉 잔여 qty5 stop/fill `2705.19`. T8도 entry `2687.62`로 동일봉 본전 stop 확인.
- maxBars3 T6: TP qty5 후 TIME qty5, entry bar20298→exit bar20301, TIME 발행 stop `2657.0420024`. T11/T14도 잔량5 TIME. T16은 부분청산 없이 전량10 TIME.
- 진단의 `observedPartial=4`와 실제 TP6 차이는 동일봉 왕복 T1/T8이 end-of-bar var/array trace에 남지 않은 한계입니다. 초기 counter4를 TP6의 근거로 쓰지 않았고 최종 `partialFills=6`은 실제 closed-trades 집계입니다. 기본 TIME0/별도 TIME4도 명확히 구분했습니다.

## 초기 격리 이탈과 복원 — 실행자 실수, 제품 결함 아님

1. 001로 새 S03 레이아웃을 만들었지만 target.txt 설정이 존재하지 않아 초기 harness가 공용 QA `358BB… / kdn7wAFi` fallback을 사용했습니다(003–039). 026 actual URL과 raw command target이 이를 증명합니다. CLI가 target을 무시한 것이 아닙니다. 공용 QA에 제가 만든 draft strategy `qqjYoI`만 038에서 제거했고 039 상태는 원래 Volume `4PlNH6`만 남습니다. 다른 study를 정리하지 않았습니다.
2. 040 이후 target을 새 S03 차트에 하드코딩했으나 그 차트 에디터가 S02 문서를 열고 있었습니다. 041 `pine open CLI-QA-S03-EMA`가 실패했는데 당시 harness가 계속 진행했고, 043/046에서 S02 ID `USER;6b325663a8a24b548558d60895ec3bc8`를 S03 소스로 v6/v7 저장했습니다. 이 실행은 오염된 기록이며 통과 근거에서 제외합니다.
3. 052–054에서 검증된 S02 v3 파일을 같은 ID에 v8.0으로 복원 저장했습니다. 다른 worker 로컬 파일에는 쓰지 않았습니다. 055에서는 새 차트에 제가 추가한 오염 study `Pf9XnW`만 제거했습니다.
4. 084–085 서버의 exact saved name으로 S02를 재열어 요청된 SHA가 정확히 일치함을 확인했습니다. 115–116의 두 번째 문서 전환에서도 같은 해시입니다. `s02-restoration-verification.json`은 S02 원래 chart `nipHauoX`, target `7980FA…`, study `XvcQgK`, Volume `rLenrk`, keep20, 정상 statusType2/statusError null, ETHUSDT/15분/type1을 이전 raw와 비교합니다.
5. **저장본과 원래 S02 chart study의 pineVersion은 5.0→8.0으로 증가했습니다.** `sameStudyVersion:false`를 그대로 보존했습니다. 기존 study는 저장 복원에 따라 v8.0을 사용하며 나머지 ID/설정/정상 상태는 일치합니다. 버전 이력을 원복했다고 주장하지 않습니다.
6. 056에서 명시적으로 새 strategy를 만들고, 058–061의 이름 저장 UI/CLI 검증 후 062 목록에서 실제 S03 name/id를 확인했습니다. 이후 깨끗한 S03 루프는 `IC4e6I / USER;d904…`만 사용합니다.
7. 084부터 harness는 각 명령 전후 실제 URL/doc ID/title을 CDP로 검증하고, 예상 exit/JSON/id/report 불일치에서 throw합니다. phase도 throw를 전파합니다. 기존 tag 파일 덮어쓰기, 다른 study input 변경, 최종 상태에서 새 문서 생성도 금지했습니다. 정상 source 복구의 095/재열기 후 119 실패에서 실제로 중단했습니다. fence 초기 정규식 실수도 preflight에서 차단되어 CLI 명령을 실행하지 않았고 수정했습니다.

## 제품 문제: 최소 재현·빈도·우회

### D1 — 저장된 정상 전략 복구 후 native compile Rejected / REPORT_PENDING

정확한 실제 명령은 `evidence.json.commands`의 089–095c에 있습니다. 모두 전용 target, 동일 S03 doc/study입니다. 아래는 같은 오류·복구 소스를 사용하는 최소 재현 절차이며 다시 실행하지 않았습니다. `recovery-valid-v6.pine`은 실제 오류 주입본에서 그 함수 호출만 복원한 당시 정상 소스입니다(093은 당시의 `final.pine` 경로를 사용했습니다).

```powershell
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine set --file qa/pine/scenarios/s03-partial-exit/function-error.pine
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine save
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine compile
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine errors
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine set --file qa/pine/scenarios/s03-partial-exit/recovery-valid-v6.pine
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine save
node src/cli/index.js --target 890408E3FA96D8076A7D49A8B3AF200A pine compile
```

- 091 invalid compile: exit1 `{"success":false,"compiled":false,"error":"Rejected"}`. 092 reports the missing function. This overlaps the known bare-Rejected diagnostic class; not counted as a second independent recovery repro.
- 094 save valid v6: exit0, saved true; 095 expected successful recovery instead returns the same Rejected JSON exit1. 095c report read: exit1 `code:REPORT_PENDING`.
- **Valid recovery failure observed once in one injection cycle (1/1), not repeated three times.** No further repro loop.
- UI/native add button was disabled(095b). A harmless comment change followed by `pine compile --save` recovered with the same ID/study, then retry/raw succeeded.
- Suspected component: native `updateOnChart` rejection after save/auto-application plus strategy freshness dispatch in `pine-state.js`/`strategy-state.js`. This is a hypothesis; no product fix.

### D2 — normalized-identical LF/CRLF reopen invalidates strategy compile shortcut

- Trigger: v8 final source `save→get(114)→open another doc→open exact S03→get(118)→compile(119)`.
- 114 source4343 chars, 118 source4426 chars; the83 extra characters are CRLF vs LF over83 line breaks. CRLF-normalized source hashes match. Raw hashes differ; originals remain in ignored records.
- Expected unchanged-source successful verification. Actual119 exit1/bare Rejected; harness stopped.
- **One observed reopen failure / one reproduction (1/1).** Separate from D1, not a second injection cycle.
- Local source audit: `session.js sourceHash` hashes raw bytes; `beginCompilation` compares raw source hash before unchanged shortcut. This explains a plausible line-ending invalidation/native-dispatch path, not a proven complete root cause.
- Workaround119a/b: change harmless comment then compile --save. Final v9 raw/retry succeeds, exact-name save/reopen retains source hash, and subsequent data strategy read succeeds with final hash/token. Final reopen was followed by data read, not another compile; that distinction is intentional and explicit.

### Fixture/observability corrections

- First editor-title/name assumption and target fallback were harness errors, not product defects.
- Initial bar-close-only partial protection was corrected with fill recalculation/previous-bar trailing inputs.
- Table initially empty because only `barstate.islast` drew on a strategy with an unconfirmed realtime bar. Adding `islastconfirmedhistory` made the historical table available; `data tables` was not a product extraction defect.
- ObservedPartial4 vs actualTP6 was corrected by adding a closed-trade fill counter, preserving observedPartial separately. No invented counter equality.

## Commands, evidence, and remaining state

- `evidence.json.commands` records **every actual scenario CLI attempt**(147회), ordered, exact arguments, exit, sanitized `json_summary`, duration, time and raw filename. `results/pine-scenarios/s03-partial-exit/commands.jsonl` retains complete JSON/stdout/stderr. Ledger/table/console는 중복 상세를 축약하고 독립 대조본을 별도 보존합니다. Missing tags were never executed after fail-closed abort; they are not successes.
- Raw source/private lists/compiled blobs remain only in ignored results. Committed evidence contains source hashes, filtered S03 identity and QA data. Product module reads were limited to observed target/table/compile failures.
- `build-evidence.cjs` recomputes independent ledger/trace/filled-order/hash assertions. It completed with failedAssertions `[]`. `numeric-verification.json` preserves full numeric comparison. No product tests or code modifications.
- Final editor: saved S03 `CLI-QA-S03-EMA` v9.0 on new S03 layout. Pending dialogs0(125). Final list has one exact S03 saved name, no suffix. Main strategies1, total studies2(122/125). No broker actions, publishing or replay commands. No explicit symbol/timeframe changes were issued on the new layout.
- Final recovered compile token `c3aebfdb-f78a-4641-9113-368318345b7f`; retry/raw share it. Final report total closed legs34, open PL0, current source hash above. Warning1 about barstate.islast remains; historical fallback is included.
- Shared QA keeps Volume only; its S03 temporary draft editor/document `USER;d924…` was not listed as a saved document and is not acceptance evidence. S02 restored saved source/study use v8.0. Personal tabs and other scenario studies were not cleaned up.
- Lead can proceed to S04. Keep D1/D2, early isolation FAIL, S02 version increase, and the intrabar trace limitation in the aggregate QA report. No claim that all criteria passed without caveats.

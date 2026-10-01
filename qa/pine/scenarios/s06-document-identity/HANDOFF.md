# S06 HANDOFF — 동명 문서·전체 소스 보존

종합 FAIL: 문서ID/저장대상/전체 소스 보존과 모호성 거부·미저장 교체 계약은 PASS. 재열기한 저장 전략의 compile/raw-compile은 두 번 모두 `Rejected`로 실패했다. 제품 수정·Git 작업·issue 작성 없음. Desktop 실행 종료.

실행: 2026-10-01T05:21:10.464Z ~ 2026-10-01T05:30:04.731Z (UTC; 한국 시간 +09:00), 실제 CLI 80회, exit0 70회, exit1 10회. 외부 서버/CDP 실패 없음. 각 명령·JSON·exit·시간·전후 URL/ID/버전/소스SHA/studySHA는 evidence.json commands에 있으며 전체 raw는 ignored `results/pine-scenarios/s06-document-identity/raw/`에 있다. 다른 문서 목록·컴파일 blob·직전 S05 소스는 공개용 evidence에서 제외했다.

## 자산과 소스

레이아웃 **CLI-QA-S06-20261001**, [차트](https://kr.tradingview.com/chart/I8rFPvNF/), target `F6CE4AD09EB46237D9D76DF813DCCB62`. 새 레이아웃 최초 editor는 이전 시나리오 문서였으며 `004-initial-get`에 기록했다. source set 전에 `pine new`로 의도한 indicator/strategy 템플릿과 null ID를 확인했고 다른 시나리오 문서는 수정하지 않았다.

| 문서 | 실제 저장이름 | 문서ID | 버전(실험 baseline → final) | 최종 fullSHA (CRLF→LF만) |
|---|---|---|---|---|
| A | CLI-QA-S06-Collision-A | `USER;7dc29034cbaa496ea7581d9aa81e36fb` | 2.0 → 3.0 | `a9198437fbc68443b706e1b00a4cf93159b9c5c9c7dcc93776e1eb7e6366f997` |
| B | CLI-QA-S06-Collision-B | `USER;067c354806024b8b9c357c97a1f0b842` | 2.0 → 3.0 | `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74` |
| C | CLI-QA-S06-Sentinel-C | `USER;3756d54dc7bd4730993cb59fa06e0ab7` | 1.0 → 1.0 | `b028ef99e5af7af750d1ed588c615a52439a3e4050b70783241f3bc6b2e63387` |
| D | CLI-QA-S06-Collision-D | `USER;492a9a9d337c418eaa9b7a101ccaf54e` | 1.0 → 1.0 | `2c1bfd6f3e99ce5da12c53a8bf30448de09e287c63ad70e65c7419af4b480ee5` |

A/B 표시 title은 모두 `CLI-QA-S06-Shared`; 이것과 같은 savedName은 없다. 실제 title match 2개, partial `CLI-QA-S06-Collision`은 A/B/D 3개. 생성 때 A/B seed의 title을 저장이름으로 지정해 첫 save하고, 이후 Shared로만 변경·save했으므로 native rename 우회가 필요 없었다. A/B 첫 생성 seed v1.0 → Shared baseline v2.0 → final v3.0. C/D 생성 이후 저장·소스 변경 없음.

초기/최종 전체 소스는 `a-v1.pine` → `a-v2.pine`, `b-v1.pine` → `b-v2.pine`, `c-sentinel.pine`, `d-collision.pine`; 이름 생성용 `a-seed.pine`/`b-seed.pine` 및 미저장 교체시험용 `a-unsaved.pine` 포함. 한글, escaped quotes/backslash/newline, 주석, helper 함수, multiline call, EOF newline을 포함한다. A 파일은 CRLF, B stdin은 LF. Monaco 원문 char_count가 CRLF 때문에 다를 수 있으나 LF 정규화한 전체SHA가 file/stdin/set/save/open/get 모두 같았다. trim이나 부분해시 사용 없음.

의도 diff는 정확히 각 2줄:

- A L6: 평균 기간 12→17; L8: `A-v1`→`A-v2`.
- B L7: risk 1.5→2.0; L8: `B-v1`→`B-v2`.
- C/D diff 없음. 미저장 시험 comment는 저장되지 않았고 A 버전은 3.0 유지.

## 기준별 결과

| 기준 | 결과 | raw tag (evidence.json에도 수록) |
|---|---|---|
| exact_saved_name | PASS | `create-final-list`, `edit-A-open`, `edit-B-open`, `edit-final-open-A`, `edit-final-open-B`, `edit-final-open-C`, `edit-final-open-D` |
| ambiguous_title_partial_before_mutation | PASS | `ambiguous-title`, `ambiguous-title-retry`, `ambiguous-partial`, `unsaved-ambiguous-title` |
| A_save_preserves_B_C_source_version | PASS | `edit-baseline-list`, `edit-A-after-list`, `edit-A-preserve-B`, `edit-A-preserve-C` |
| B_compile_preserves_A_compiled_identity_count | PASS | `compile-A-get`, `compile-B-v2`, `compile-B-retry` |
| full_source_file_stdin_save_open | PASS | `edit-A-file-crlf`, `edit-A-save`, `edit-A-reopen`, `edit-B-stdin`, `edit-B-save`, `edit-final-get-A`, `edit-final-get-B`, `edit-final-get-C`, `edit-final-get-D` |
| unsaved_open_new_README_contract | PASS | `unsaved-open-set`, `unsaved-open-B`, `unsaved-open-reopen-A`, `unsaved-new-set`, `unsaved-new-strategy`, `unsaved-new-reopen-A`, `contract-final-list` |
| diagnostics | PASS | `edit-A-save-required`, `ambiguous-title-retry`, `ambiguous-partial`, `missing-name`, `invalid-new-type`, `compile-B-errors`, `repro-B-errors` |
| indicator_raw_alias_unchanged_retries_no_duplicates | PASS | `repeat-A-compile-n1`, `repeat-A-raw-compile-alias`, `repeat-A-compile-n2` |
| strategy_immediate_retry_no_duplicates | PASS | `compile-B-v2`, `compile-B-retry` |
| strategy_reopened_raw_alias_normal_compile | FAIL | `raw-B-open`, `raw-B-unchanged`, `repro-B-errors`, `repro-B-console`, `repro-B-compile`, `followup-B-failed-epoch`, `followup-B-report-pending` |
| final_cleanup | PASS | `contract-final-C`, `contract-final-A`, `contract-final-state`, `contract-final-replay`, `contract-final-get` |

B compile 전후 A study `cUzeWV`의 전체 compiled input 문자열이 완전히 동일했다. B study `YSrTZc`; 최종 A=1, B=1, Pine=2. `state`는 native Volume `ArWAjb`까지 포함해 전체 study=3. A normal/raw/normal 반복 3회 모두 unchanged=true,compile_performed=false 및 study snapshot 동일. B 최초 compile과 바로 다음 retry는 성공/report_ready=true이며 retry는 unchanged skip.

SAVE_REQUIRED는 stdout JSON code와 exit1. 모호한 title/partial, missing name, invalid new type은 stderr JSON 및 exit1이고 machine code 필드는 없다. 모두 전후 ID/version/sourceSHA/study 보존; 미저장 A 상태에서 title 거부도 source/modified=true 보존. B compile 직후 errors: error_count=0,warning_count=1 (strategy barstate.islast의 confirmed-bar 경고); B 재열기 후 errors는 0/0. 최종 A errors는 0/0.

## 제품 결함 후보 S06-STRATEGY-REOPEN-COMPILE-REJECTED

최소 재현(실제 command pin은 evidence에 있음):

1. 새 strategy B 생성·자기 소스 set/save, compile 성공, 즉시 compile retry 성공.
2. 다른 자기 문서 A/C/D를 exact savedName으로 열고 B exact savedName을 재열기. B의 ID/버전3.0/fullSHA가 이전과 같고 modified=false.
3. `pine raw-compile`: exit1, {success:false,compiled:false,error:"Rejected"} (373ms).
4. `pine errors`: error_count=0,warning_count=0; console은 open 및 저장할 변경 없음.
5. `pine compile`: 같은 exit1/Rejected (362ms).

기대: 이미 적용된 동일 saved strategy의 검증된 성공 또는 unchanged skip. 실제: 두 명령 각각 1회, 총 2/2 실패. 두 번 모두 source/ID/version과 A/B study·compiled input은 보존됐고 중복은 없었다. source 오류를 나타내는 marker 없음. 의심 컴포넌트: smartCompile의 strategy reopen/native updateOnChart 경로; 원인은 확정하지 않았다. 실패 직후 recorder가 중단했고 다음 독립 단계는 명시적 ID 가드 뒤에 수행했다.

관측된 우회: B를 처음 compile한 직후, 재열기 전의 retry는 성공한다(compile-B-retry). 재열기 이후 복구는 NOT TESTED. 다른 기준은 A를 exact savedName으로 열어 독립 수행했고 UI 우회/다른 자산 삭제는 필요 없었다.

## harness/한계/남은 QA state

첫 ambiguous-title 거부는 stderr JSON인데 최초 recorder가 stdout만 파싱해서 중단했다. 예상 failure에 한해 stderr 파싱하도록 수정하고 원본 raw를 보존했다. 재시도에서 같은 안전한 거부를 확인했다. 이 건은 harness 결함이고 제품 결함으로 세지 않는다. 총 harness stop 2회: 이 parser 문제 1회 + 예상 성공했던 B raw 실패 1회. 의도된 오류코드/거부시험만 exit1 예외를 사용했다. 제품/shared/다른 시나리오 파일을 쓰지 않았다.

NOT TESTED: 동일 exact savedName끼리의 충돌(요구된 A/B는 서로 다른 저장이름), 재열기 전략 실패의 native UI 복구, 다른 symbol/timeframe/version 일반화. 장시간 실시간 대기 없음.

최종 editor A v3.0, modified=false, dialogs=[]; replay_started=false,autoplay_started=false. 차트 BINANCE:ETHUSDT 15분/type1, 별도 symbol/timeframe 변경 명령 없음. 새 전용 레이아웃에 A/B study와 기본 Volume 남음. saved A/B/C/D 모두 남음. pending dialog/replay 정리할 대상이 없음을 실제 조회했다. 개인 탭이나 다른 QA study를 삭제/종료하지 않았다. 이 보고서 작성 이후 Desktop 조작을 하지 않는다.

## 추가 요청 — B rawSHA/EOL 및 실패 epoch/report

이미 캡처한 fullsource만 오프라인 비교했다. B normalizedSHA는 아래 모든 행에서 `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74`로 동일하고 문서ID도 동일하다. saved 이후부터 version은 3.0 유지. LF 개수(총 newline)는 모두 33개이고 재열기 후에는 전부 CRLF다. 여기 char_count는 정규화 전 JS 문자열 길이다.

| 시점/기록 | char_count | CRLF 수 | bare LF 수 | rawSHA |
|---|---|---|---|---|
| set_stdin (edit-B-stdin) | 1206 | 0 | 33 | `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74` |
| save (edit-B-save) | 1206 | 0 | 33 | `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74` |
| compile_success (compile-B-v2) | 1206 | 0 | 33 | `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74` |
| retry_success (compile-B-retry) | 1206 | 0 | 33 | `ff43caca7f16fe33a56618693d6b19ff6709411ad9d4b7c63ab448897345ce74` |
| reopen_B_first (edit-final-open-B) | 1239 | 33 | 0 | `64e9965c180af051cf01b0c7e3357184e20781424562721657be4b7e14c9cfb0` |
| reopen_B_before_failure (raw-B-open) | 1239 | 33 | 0 | `64e9965c180af051cf01b0c7e3357184e20781424562721657be4b7e14c9cfb0` |
| raw_compile_failure (raw-B-unchanged) | 1239 | 33 | 0 | `64e9965c180af051cf01b0c7e3357184e20781424562721657be4b7e14c9cfb0` |
| normal_compile_failure (repro-B-compile) | 1239 | 33 | 0 | `64e9965c180af051cf01b0c7e3357184e20781424562721657be4b7e14c9cfb0` |

관측: 정상 compile/retry 때 rawSHA는 LF 원문 hash였고, 재열기 후 rawSHA만 CRLF hash로 변경됐다. 현재 실패 epoch의 source_hash도 `64e9965c180af051cf01b0c7e3357184e20781424562721657be4b7e14c9cfb0`다. 코드 근거: `src/session.js:105` sourceHash는 원문을 그대로 해시하고, `src/core/pine.js:388`에서 이 값을 beginCompilation에 전달하며, `src/strategy-state.js:116` unchanged 조건은 previous.source_hash === sourceHash를 요구한다. pending-awaiting 조건 L111도 같은 raw 비교다.

코드에 근거한 추론: EOL만 바뀌어도 해당 전략 unchanged hash 조건을 만족할 수 없게 된다. 따라서 normalized source 불변과 전략 rawhash skip 실패는 양립한다. 그러나 native updateOnChart가 왜 Rejected였는지, 다른 ready/report/document predicate가 동시에 실패했는지는 확정하지 않는다. rawhash 변화로 rejection의 전체 원인을 확정하는 주장은 하지 않는다.

현재 상태(마지막 추가 읽기 전용 관측): editor는 계속 A v3.0 clean. `followup-B-failed-epoch`에서 B target YSrTZc의 native compile operation은 method=updateOnChart, started=false,completed=false,actionDone=true,error=Rejected. 같은 token의 `__tvCliCompilation`은 **phase=pending**, requires_compiled_change=true, report_verified=null, error=null, strategy_id=null, target_study_id=YSrTZc, baseline_count=1이다. 따라서 실패한 CLI action과 phase=failed epoch를 혼동하지 않는다. native B study status_type=2,runtime_error=null,report_complete=true,report.trades.length=1901이지만 `data strategy` 실제 조회는 exit1/code=REPORT_PENDING이다. 이 1901은 UI에서 확인한 거래 총수 주장이 아니라 native report 배열 길이 관측이다.

`src/core/pine-state.js:100`은 rejection을 native operation.error에 넣고, `src/core/pine.js:412`는 그 오류로 반환한다. 이 경로는 report epoch를 failed로 바꾸지 않으며 `src/strategy-state.js:217` report reader는 pending epoch를 거부한다. 실패 뒤 report가 pending으로 남는 현상도 같은 결함 후보에 포함한다. 재컴파일·광범위재현·소스변경 없이 기존 raw 비교와 epoch/report 읽기 2명령만 추가했다. 최종 dialogs=[]/Pine=2/A clean은 이 추가 명령 전후에도 동일하다. 이후 Desktop 실행을 다시 종료했다.

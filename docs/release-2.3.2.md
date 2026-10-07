# TradingView CLI 2.3.2

로드된 OHLCV의 기간·커서 읽기, 검색 범위 표시, 읽기 전용 workspace 점검과
캡처 메타데이터를 추가합니다. 이슈 #57~#61의 구현과 검증 근거는
[검증표](verification-2.3.2.md)에 정리했습니다.

## 새 계약과 호환성

- `ohlcv --from SEC --to SEC`는 UTC 초로 지정한 양 끝을 포함해 봉 시작 시각으로
  선택합니다. 최신 20,000봉 밖의 로드된 옛 구간도 선택할 수 있습니다.
  `--cursor EXACT_NEXT_CURSOR`로 다음 페이지를 읽습니다. 과거를 먼저 로드하세요.
- 기존 `ohlcv --count`의 기본 500·최대 20,000과 반환 필드 의미는 유지합니다.
  기간 모드의 `truncated`는 다음 페이지 유무이고 `insufficient_history`는 `null`입니다.
  `coverage`는 요청·로드·반환 범위와 기간의 양 끝 확보를 별도로 표시합니다.
- 커서는 이미 반환한 과거값·첫 시각·종목·해상도·pane·series·target·generation을
  검증합니다. 뒤에 새 봉이 생기거나 경계 이후 최신봉이 변하는 것은 허용합니다.
  과거값 수정, 앞쪽 이력 추가, 재접속 또는 문맥 변경 뒤에는 다시 시작해야 합니다.
- range와 scroll은 같은 시계열 진단을 쓰며 빈 데이터·로딩·피드 오류를 실제
  범위 밖 오류와 구분합니다. 오류에도 요청·실제 로드 범위를 포함합니다.
  scroll도 이제 최대 25회의 과거 로딩을 시도합니다. 예약된 대기는 최대 약
  170초이며 CDP·네트워크 지연은 별도입니다.
- 검색에 `--exchange`, `--type`, `--count`, `--offset`을 추가합니다. offset은
  새로 받은 단일 응답 안의 위치입니다. CLI 잘림과 제공자 한계를 구분하며,
  제공자 전체 개수와 원격 페이지 지원은 확인되지 않으면 unknown/null입니다.
  상품 식별자·유형을 보존하고 다른 상품으로 대체하지 않습니다.
- `workspace preflight NAME`은 HTTP 연결과 저장된 generation·문맥·operation·lock을
  읽고 다음 조치를 요약합니다. PID 시작 시각까지 검증하며 판별 불가는 unknown으로
  유지합니다. 파일·journal·mutation lock을 생성하거나 원 작업을 재전송하지 않습니다.
- recover의 새 `recovery_summary`는 generation 전후와 채택 문맥을 보여 줍니다.
  기존 `recovered:true`와 `incomplete:true`는 함께 유지합니다. 복구는 원 작업 완료가
  아니며 남은 작업을 이어야 합니다.
- screenshot은 backend·실제 selector·clip·좌표계·DPR·PNG 크기·fallback과 selector
  match 개수를 반환합니다. 여러 match 중 첫 영역만 잡으면 `first_match_only`입니다.
  API 경로는 UI 호출 성공이며 `file_path:null`, 실제 영역은 unknown입니다.
  잘못된 region 문자열은 이제 오류로 거부합니다.

catalog_version은 **2**를 유지합니다. 새 옵션과 필드는 추가 계약이며 버전과
catalog_fingerprint 변경으로 캐시를 무효화해야 합니다. broker/order 기능,
Pine draft 보호, 소유 탭·foreground 보호, 복구 승인 규칙은 그대로입니다.
이 저장소는 `private:true`를 유지하며 npm publish를 추가하지 않습니다.

## 검증 범위와 한계

2026-10-07 Windows, Node.js 24.19.0, TradingView Desktop 파일 버전 3.4.1에서
전용 QA 자원으로 확인했습니다. 오프라인 fixture와 실제 Desktop 증거를 구분합니다.

- 20,419봉 fixture, 합성식 겹침/비중첩/빈 데이터/로딩, 커서 append·과거 수정·prepend·
  문맥 변경, 검색 16번째 이후 상품과 차단 응답, preflight 무변경성, 캡처 fallback/API를
  검증했습니다. 실제 CLI 진입점과 기존 소유·복구·Pine 보호 회귀도 포함합니다.
- OP 합성식/480에서 두 페이지를 읽었습니다. 다른 전용 QA 차트의 ETHUSDT/480에서는
  range가 로딩 3회 후 2024년 1분기 범위를 확보했습니다. 독립 Reviewer가 같은 기간
  274봉을 100/100/74의 세 페이지로 읽고 중복 없음과 범위 진단을 확인했습니다.
- 독립 Reviewer의 live preflight 전후 private state digest가 같았습니다.
- chart 캡처의 이미지 크기와 clip이 일치했습니다. pane-canvas 캡처는 실제로 축과
  editor를 제외했고 다중 pane에서는 첫 plot만 담았습니다. 실제 editor가 열린 상태에서
  full 캡처에는 editor가 포함됐고 chart 캡처에는 포함되지 않았습니다.

기간 확보는 로드된 첫·마지막 봉 시작 시각의 범위 판정입니다. 세션 공백과
불규칙 시계열의 내부 결측, 최신봉 완성 여부는 unknown이며 보간하거나 0으로
채우지 않습니다. 과거 OP 오류 순간의 pane/series 상태가 보존되지 않아 원인은
확정하지 못했습니다. 새 진단은 빈 데이터·로딩의 오분류 경로를 제거합니다.

익명 검색 제공자는 HTML/403 응답을 반환해 원격 페이지 지원을 live로 확인하지
못했습니다. API 캡처와 selector 부재 fallback은 fixture 검증이며 live 성공으로
표현하지 않습니다. 포괄적인 `smoke:desktop`과 Pine 서버 network suite는 실행하지
않았습니다. 실제 검증은 이 릴리즈 범위의 전용 QA 흐름입니다.

QA 생성은 새 탭을 전면에 선택했습니다. 첫 QA에서 OP 합성식이 ETHUSDT로 외부
변경됐고 보호가 정상 거부했습니다. 행위자는 확인되지 않았으며 이 자원은 보존합니다.
새 QA에서는 기존 사용자 탭·layout·draft를 바꾸지 않았습니다. 우측 Pine editor에
대해 기존 `ui panel close`가 성공을 반환해도 닫히지 않는 별도 한계를 발견했습니다.
소스는 편집·저장·컴파일하지 않았고 editor 열린 상태를 숨기지 않습니다.
이 별도 결함은 [후속 이슈 #62](https://github.com/Gudals0320/tradingview-cli/issues/62)로
기록했으며 이번 릴리즈에서 해결했다고 주장하지 않습니다.

상세 계약: [기간/범위](history-export.md), [검색](symbol-search.md),
[preflight/캡처](preflight-capture.md).

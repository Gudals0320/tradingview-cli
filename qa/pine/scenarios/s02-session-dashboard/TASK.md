# S02 — 세션 거래량·변동성 대시보드

Model: b.ai/deepseek-v4.1-flash; effort: max.

Write ownership: qa/pine/scenarios/s02-session-dashboard/ and ignored results/pine-scenarios/s02-session-dashboard/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S02. Execution order: 2 of 6.

## Development request

UTC 세션별 거래량·범위·봉 수를 집계하고 최근 완료 세션20개를 저장하는 대시보드를 개발·검증한다.

## Implementation and edit sequence

- 명시 UTC 세션 입력, 진행 세션 volume합계/high/low/bar count.
- 완료된 세션만 배열에 1회 추가, 최근20개 제한; 평균과 세션별 표.
- 시작/종료/오래된 항목 삭제 로그; 빈 배열 접근 오류 주입 후 경계 검사 수정.
- 보존 한도20→5 편집 및 세션 전환 초기화.

## Acceptance criteria

- 첫 완료 세션 전 오류 없음, 세션당 정확히1회 기록, 새 세션 초기화.
- 한도5면 최신5개만; 표/배열 일관성.
- 완료 세션 최소2개를 같은 차트 OHLCV로 독립 계산한 volume/range/barcount와 대조. 부족하면 더 짧은 UTC 세션/시간프레임으로 재현 가능 표본 확보.
- console 실제 로그행만, 배열 오류 관측·복구 후 소스 저장/재열기 보존.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

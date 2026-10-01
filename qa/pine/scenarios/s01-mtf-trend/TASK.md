# S01 — 확정 상위시간대 추세 지표

Model: anthropic/claude-opus-5-5; effort: medium.

Write ownership: qa/pine/scenarios/s01-mtf-trend/ and ignored results/pine-scenarios/s01-mtf-trend/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S01. Execution order: 1 of 6.

## Development request

현재 차트 EMA 교차 신호 중 마지막으로 확정된 상위 시간대 추세와 방향이 일치하는 신호만 표시하는 지표를 개발·검증한다.

## Implementation and edit sequence

- 현재 EMA12/36, 상위 EMA50, 상위 시간대 입력과 필터 ON/OFF.
- 상승/하락/제외 신호 구분, 대시보드의 확정 HTF 값과 통과/제외 수.
- 초기 교차 지표 → HTF 확정 필터 추가 → 함수명 오류 주입 → 수정 → 입력/시간대 변경.

## Acceptance criteria

- 필터 OFF가 원래 교차 신호와 일치. ON의 제외 여부를 독립 계산/비교 플롯으로 대조.
- 상위 시간대 마지막 확정 값 사용을 명시 검증; 미래 유입/미확정 HTF 값을 사용하지 않는지 확인.
- 정상 편집, 오류 복구, 재컴파일 때 study1 유지. 저장/재열기 전체 소스 일치.
- 필요한 표본에 데이터 부족 시 정확한 제한 기록; 단순 컴파일 통과를 기능 검증으로 과장하지 않기.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

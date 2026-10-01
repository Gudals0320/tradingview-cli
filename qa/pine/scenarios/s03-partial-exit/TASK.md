# S03 — 부분 청산·잔여 포지션 관리

Model: gpt-6.1-sol; effort: high.

Write ownership: qa/pine/scenarios/s03-partial-exit/ and ignored results/pine-scenarios/s03-partial-exit/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S03. Execution order: 3 of 6.

## Development request

EMA 전략의 고정 bracket을 1R 50% 부분청산과 잔여 본전/ATR 추적손절/시간청산으로 수정하고 실제 거래 기록으로 검증한다.

## Implementation and edit sequence

- 단순 EMA진입과 ATR 초기위험 고정.
- 1R 절반 청산, 잔여 수량 본전보호+단조 추적 손절.
- 최대보유봉 시간청산과 이벤트 진단.
- 저장된 전략의 의도적 컴파일 오류→수정→재시도→raw-compile.

## Acceptance criteria

- 부분청산이 실제 발생하고 잔량/주문 예약 충돌 없음. 거래/주문 내역으로 대조.
- entry-time R 고정, 추적stop 후퇴 없음.
- 시간청산도 실제 발생하도록 파라미터 별도 설정하여 사례 확보; 0회면 통과로 쓰지 않기.
- 오류 복구 후 study1 및 현재소스 report_ready true. 전체소스 저장/다른문서/재열기 보존.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

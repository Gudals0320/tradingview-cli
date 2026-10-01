# S05 — 계산 라이브러리 타입·계약

Model: b.ai/deepseek-v4.1-flash; effort: max.

Write ownership: qa/pine/scenarios/s05-library-contracts/ and ignored results/pine-scenarios/s05-library-contracts/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S05. Execution order: 5 of 6.

## Development request

정규화/가중점수/배열통계 함수를 exported Pine library로 개발하고 타입·경계·저장 계약을 검증한다.

## Implementation and edit sequence

- clamp, 0분모 정책 normalization, weighted score, 빈배열 정책 mean/population variance.
- new library, export 타입/설명, 의도적 타입 오류→수정, 인수추가 시그니처 편집.
- 동일 함수 본문의 별도 QA 검증 지표(외부 import 대신)를 작성하고 자동으로 본문 일치 비교.
- 미게시 library의 서버검사와 Desktop compile 지원범위를 실제 구분.

## Acceptance criteria

- library 서버컴파일 성공, 의도적 타입 오류 위치/인수 진단과 복구.
- 검증 입력벡터의 독립 기대값: [1,2,3] mean2 population variance2/3, empty, zero denom, out-of-range.
- save/reopen export 및 전체소스 보존; 검증지표 계산 결과 실제 대조.
- 게시/외부import/계정공유 금지. library import integration 검증했다고 주장하지 말 것; unsupported Desktop 차트추가 동작은 정확히 기록.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

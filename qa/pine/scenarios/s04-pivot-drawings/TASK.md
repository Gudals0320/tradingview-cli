# S04 — 피벗 지지·저항 객체 수명

Model: anthropic/claude-opus-5-5; effort: medium.

Write ownership: qa/pine/scenarios/s04-pivot-drawings/ and ignored results/pine-scenarios/s04-pivot-drawings/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S04. Execution order: 4 of 6.

## Development request

확정 피벗의 지지저항 영역을 생성·돌파갱신·한도초과삭제하는 drawing 지표를 개발·검증한다.

## Implementation and edit sequence

- 확정 high/low pivot별 box+중앙line+상태label.
- 미돌파/돌파 색상과 문구, 객체ID 배열과 가격/상태 관리.
- 초기 라벨 → 영역관리 → 보존30→5 → 삭제/갱신 로직 편집.
- 생성/삭제/현재객체 계수와 로그.

## Acceptance criteria

- 피벗 확정 전 객체 없음; 묶인 line/box/label 함께 갱신·삭제.
- 한도5에서 영역5개 이하, 객체/상태 배열 길이와 인덱스 정합.
- 실제 drawing 추출 데이터 및 가능하면 화면과 가격/텍스트/개수 대조.
- 오류 주입/수정·반복컴파일 후 기존 실행 객체 누적 없음; 소스 save/open 보존.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

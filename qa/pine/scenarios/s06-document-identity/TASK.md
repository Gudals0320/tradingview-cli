# S06 — 동명 문서·복잡한 소스 보존

Model: gpt-6.1-sol; effort: high.

Write ownership: qa/pine/scenarios/s06-document-identity/ and ignored results/pine-scenarios/s06-document-identity/ ONLY.
Read ../PROTOCOL.md before work. Prefix: CLI-QA-S06. Execution order: 6 of 6.

## Development request

동일 표시제목의 독립 지표A/전략B 및 변경금지C를 생성하고 교차 편집하면서 문서ID/저장대상/전체소스 보존을 검증한다.

## Implementation and edit sequence

- 다른 저장이름A/B, 동일 Pine title; sentinel C; 부분이름 충돌용 QA문서.
- 한글/따옴표/역슬래시/multiline/주석/보조함수로 현실적인 긴 소스.
- A file입력수정/save→B stdin수정/save→A/B/C재열기.
- exact saved name, ambiguous exact title, ambiguous partial, unsaved open/new.

## Acceptance criteria

- exact saved name의 ID 정확; 모호한 title/partial은 mutation전 거부.
- A 저장 때 B/C source/version 보존, B compile 때 A study compiled identity/count 보존.
- 의도한 부분만 diff; CRLF→LF만 정규화한 fullSHA 파일/stdin/save/open 일치.
- unsaved open/new가 README 계약과 일치. 각 오류코드/diagnostic 관측, raw alias unchanged 및 반복적용중복 확인.

## Completion

Run the actual scenario, gather evidence, write HANDOFF.md and sanitized evidence.json here. Do not edit shared product code or Git. End with final handoff and stop using Desktop.

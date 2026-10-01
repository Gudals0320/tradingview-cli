# Pine workflow QA — Lead

Base: `95a5828`; branch: `codex/pine-qa`; Windows, Node 24.19.0.
All roles use `C:\Codex\.worktrees\tradingview-cli-pinescript-qa`.

Scope: encounter and reproduce local failures during actual Pine development;
do not implement fixes during Lead QA. File separate root-cause issues, review
their reproduction instructions, commit evidence, and hand a clean branch to
Executor. Executor requests Reviewer when needed; no merge or PR.

## Registered validation tasks

| ID | Command | Intended attempt | Result |
| --- | --- | --- | --- |
| P01 | get | Read initial empty QA draft; verify set/get round trip | PASS; UTF-8 file exact match |
| P02 | set | UTF-8 file and stdin; edits followed by readback | PASS; stdin shell adds trailing newline |
| P03 | analyze | Clean script and developer comment | clean PASS; comment false positive #9; stopped expansion at reproduced defect |
| P04 | check | Clean script, syntax error, warning | PASS; exit 0/1/0, accurate diagnostic location |
| P05 | compile | Indicator/strategy apply, error, correction | indicator premature success #5; strategy fresh report and unchanged PASS |
| P06 | raw-compile | Compare documented behavior to actual dispatch | #11; unchanged strategy skips dispatch |
| P07 | errors | Error and warning distinction; corrected diagnostics | actual errors detected; warnings fail command #6; corrected clean PASS |
| P08 | console | Compiler messages and Pine log output | full editor text returned #8; separate Pine Logs panel coverage limited |
| P09 | new | Three templates and invalid type; document identity | templates readable; invalid type mutates #10; identity failure #4 |
| P10 | save | Save disposable script; verify persistence | unsaved Korean dialog incomplete #7; existing QA save works |
| P11 | list | Locate saved QA script and compare persistence | PASS; absent before dialog confirmation, present afterward; failure injection not attempted |
| P12 | open | Open QA script; verify text and save destination | source loads; missing script fails; wrong save target #4 |
| P13 | full flow | Create, validate, apply, break, diagnose, correct, save, reopen | attempted end-to-end; blockers and manual QA-only workaround documented |
| P14 | issues | Deduplicate, create root-cause issues, review evidence | #4–#11 created; all remote titles/bodies read back and verified |
| P15 | handoff | Commit QA artifacts; clean branch; dispatch Executor | handoff procedure in HANDOFF.md; verify git status before dispatch |

## Baseline

- `npm ci --ignore-scripts`: passed.
- `TRADINGVIEW_SKIP_NETWORK_TESTS=1 npm test`: 266 passed, 0 failed.
- `npm run lint`: passed.
- Existing GitHub issues: #1 closed, #2 open (session recovery/concurrent GUI editing).
- Raw local outputs are stored under ignored `results/pine-qa/`; only sanitized
  test sources, reproduction tools, and summaries should be committed.

No product source or existing tests were modified by Lead. This is a workflow
validation attempt of every requested command, not exhaustive certification of
all OS/language/error/latency combinations. Issue links are in `issues/index.json`.

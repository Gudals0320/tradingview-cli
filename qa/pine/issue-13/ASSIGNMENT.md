# Issue 13 — implementation and review assignment

Human request: resolve GitHub issue 13 using the original Lead → Executor ↔
Reviewer workflow. This supersedes the historical scenario-only prohibition on
product edits; that prohibition remains appropriate to the original test reports.

- Repository/cwd: `C:\Codex\.worktrees\tradingview-cli-pinescript-qa` for every role.
- Continue `codex/pine-qa`. Starting product/QA HEAD: `00aad3b`, clean at dispatch.
- Issue: https://github.com/Gudals0320/tradingview-cli/issues/13 (OPEN, no comments at dispatch).
- Executor: `01a0f501-3851-78d1-ba46-6201911aaf4a`, GPT-6.1-Sol / High.
- Reviewer: `01a0f504-e284-7e21-be27-7c56c82b7cf6`, anthropic/claude-opus-5-5 / Medium.
- Lead: `01a0f4dd-e208-7830-8122-9ae8c7280f0b`.

## Scope and acceptance

Read `qa/pine/scenarios/AGGREGATE-ISSUE.md`, `LEAD-REVIEW.md` and the relevant
scenario HANDOFF/evidence before implementing. Preserve those historical records.
The product baseline was unchanged during all six scenarios. Existing unit suite:
308 passing tests with `TRADINGVIEW_SKIP_NETWORK_TESTS=1`; lint passed.

1. **R1:** Resolve saved strategy reopen/LF↔CRLF compile/raw/retry failure and the
   pending report epoch left after a rejected native action. Bind source/report to
   actual document/study/inputs; never silently accept stale/ambiguous reports.
   Reproduce S06 and cross-check S03. Source canonicalization is a hypothesis to
   establish, not permission to ignore other freshness predicates.
2. **R2:** Isolate valid source save→compile and existing indicator update failures
   in fresh QA state. Resolve or return a meaningful, evidenced refusal for an
   unsupported state. Do not call removal/re-add or harmless source edits a fix.
   Distinguish source validity, persistence, application and calculation readiness.
3. **R3a:** Error responses must retain accurate persistence/version/chart-change
   information when compile --save actually saved an erroring version. Explicit
   save authorization remains required; no implicit persistence.
4. **R3b:** Preserve actionable syntax/runtime/native-action diagnostics instead
   of a bare Rejected when the actual study/markers expose the cause (S02 RE10045).
5. **R4:** Clarify/enforce library title validation and light-server-check scope;
   handle unsupported library chart application explicitly before adding a
   non-calculating study or waiting on an impossible indicator result.
6. **R5:** Reproduce cold reload/closed Pine panel initialization. Fix bounded
   opening/retry behavior or precisely classify unsupported environment states;
   distinguish S05's visible/full viewport from minimized zero-viewport cases.
7. Preserve passing document identity, ambiguous-name refusal, source round trips,
   unrelated-study protection and representative S01–S06 functionality.

Drawing coordinate resolution and visible-log coverage are observational notes,
not blanket authorization to redesign unrelated data APIs. Fixture mistakes and
the S03 operator accident are not product defects. Do not quietly drop an R item:
record exact resolution, evidence and any remaining limitation for Reviewer.

## Ownership and safe execution

Executor owns code edits and focused commits (`src/`, meaningful tests, README,
package test registration if needed). Put new reproduction/verification material
under `qa/pine/issue-13/`, raw data under ignored `results/pine-issue-13/`.
Do not rewrite the six original scenario sources/evidence to make failures vanish.
No other worktree/checkout. No merge, PR or push. No all-in-one implementation commit.

Only one role may mutate Desktop at a time. Executor owns it by default. Reviewer
must explicitly coordinate any live verification window with Executor; during
that window Executor stops Desktop actions. Reviewer should review named commits,
not race a changing working tree. Avoid concurrent test runs that write fixtures.

Use new `CLI-QA-I13-*` documents/layouts; never overwrite prior scenario or personal
assets. Every mutation needs target URL + native document ID checks. A new chart
can inherit an older saved Pine document: run deliberate new, verify null ID and
template, then set/save and record actual saved name/ID. Abort on unexpected child
exit/JSON/open failure. Expected diagnostic errors must be explicit in the harness.
Use LF stdin explicitly for R1; normalize only physical CRLF→LF when comparing
whole sources. Retain whitespace, Unicode, quoted escapes and trailing newlines.

Old QA leftovers may be ambiguous or erroring. Observe them if useful, but do not
automatically delete/re-add studies as recovery. Any necessary test setup cleanup
must be limited to assets created by this new assignment and recorded separately.
No library publication/import expansion, broker actions or real trading.

## Coordination and completion

The user requested the same workflow and authorizes Executor/Reviewer to converse
as needed. Executor may ask Lead a concrete reproduction question and send the
completion handoff. Keep routine progress in the working chats.

Reviewer can initially read the issue and fixed baseline without changing Desktop
or files. Executor sends focused commit IDs and reproducible evidence for interim
and final review. Reviewer independently checks implementation, tests and relevant
live results where feasible, and returns acceptance or actionable changes. Clarify
which live tests were rerun versus evidence reviewed.

Completion requires all issue checklist items accounted for, appropriate unit
tests and lint, actual CLI regression of the important failure paths without the
old workarounds, explicit Reviewer agreement, focused commits and a clean branch.
Record final commits, commands/results, limits and leftover QA state in
`qa/pine/issue-13/EXECUTOR.md`. Do not claim deployment or remotely available code:
the branch is local and must remain unmerged/unpushed with no PR.

Lead verifies startup once, then stops polling and waits as originally requested.
Original requested fast settings were Executor on / Reviewer off; the messaging
API exposes model/effort but no fast-mode control, so do not claim it was changed.

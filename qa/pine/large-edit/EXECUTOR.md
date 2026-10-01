# Issue 12 — executor verification

Date: 2026-10-01 KST. Workspace/branch unchanged. Lead baseline `ad95857`.
Fix commits: `c2b631e` (target planning and postconditions), `73a9a85`
(document-bound report freshness), `5ac341b` (unreadable-target error code).
The same-title live test also exposed #4's saved-name/title collision; the separate
fix is `488f7cb` and has Reviewer agreement.

## Confirmed cause

The previous dispatcher inferred update from a recognized compile button's
onClick text and otherwise unconditionally called addToChart. The large scenario's
initial snapshot had an updateOnChart handler. After the error and before recovery,
the recognized handler was unavailable (`"undefined"`), while the controller's
`ui.isScriptOnChart` remained true and exactly one study still used the document.
That state therefore selected add despite the existing binding. Lead observed
1→2 and a freshness ambiguity; our independent pre-fix split-view attempt also
created a second study during the broken compile. The defect was UI heuristic
fallback, not source size, a lost document, an incomplete valid report or latency.

The dispatcher now uses actual applied Pine IDs: no matching study permits add,
one permits only update, and multiple matches fail before dispatch. After the
native action it verifies the target count/id and every unrelated TV script's
id/compiled identity. It never removes duplicates automatically. Report freshness
is bound to document/study identity; titles are used only for initially unbound
drafts. Missing native update actions and unreadable targets fail closed.

## Actual CLI verification, without error-recovery workaround

- Minimal saved strategy: normal edit, missing function, correction, retry and
  raw alias preserve one study. Correction returns report_ready true / exit 0.
- Large saved strategy: reset the same existing document to the 266-line baseline
  through an explicit edit/compile --save, make a normal edit, inject the missing
  helper on line 120 in the 319-line change, correct it, retry/raw, save and reopen.
  No study deletion or reapplication occurs inside this sequence; count stays 1
  after normal edit, error, correction and retry. Source hashes are compared in
  full, with CRLF→LF as the only normalization.
- Final large source hash remains
  `772756f1a7dadc024312e8ed6890d0b4bc87814f80d7147d990736662bbae440`.
  The sentinel document/id and full source are preserved. Final editor is the
  saved CLI-QA Large Edit 20261001 edited source in split view.
- Lead's already-duplicated minimal QA document: compile, raw-compile and
  compile --save each return AMBIGUOUS_TARGET / exit 1 with count 2 unchanged.
  Only then were those exact two QA study instances explicitly removed as setup
  for an independent minimal run. That subsequent run passes with one study.
- Saved indicator normal/error/correction also preserves one study and succeeds
  after correction. Two same-title strategy documents retain separate Pine IDs;
  updating P leaves Q's count and compiled identity unchanged.
- Original `executor-compile-regression.mjs` and `executor-regression.mjs` were
  rerun: saved edits/explicit-save policy, draft first compile 0→1, second unchanged
  compile, invalid/warning/correction and #4/#7 source-save round trips pass.
  Previous disposable 0.x draft studies were explicitly retired before the draft
  run so a shared temporary draft ID would not collide with old QA assets. This
  was recorded test setup, not an automatic compiler repair.

## Tests and retained evidence

`TRADINGVIEW_SKIP_NETWORK_TESTS=1 npm test`: 308 passed, 0 failed.
`npm run lint` and whitespace checks pass. The default test list includes
pine_targets.test.js. Regressions execute exported target/state functions and
cover add/update decisions, duplicate rejection before shortcuts, document/title
separation, unrelated mutation, target replacement and unavailable actions.

`recovery-regression.mjs`, `guard-regression.mjs`, `same-title-regression.mjs` and
`draft-setup.mjs` record the live assertions. `executor-*-evidence.json` snapshots
omit document/study IDs, compiled payloads, tokens, full source and user tabs.
The original Lead failure/workaround evidence is retained separately and still
represents the pre-fix product. Raw records remain ignored in results/pine-qa.

The large strategy and sentinel, minimal strategy, separate indicator and same-title
QA document remain saved as disposable assets. Some diagnostic duplicates from the
independent pre-fix Executor attempt remain; future compilation of that document
is intentionally ambiguous. Personal scripts and original user layouts were not
changed. Broad E2E was not run. Lead's time-exit counter was 0, so that Pine branch
was compiled but not exercised by this workflow.

Reviewer `01a0f504-e284-7e21-be27-7c56c82b7cf6` explicitly agreed completion of
#12 and the #4 follow-up at `0a75062`. The reviewer independently ran 308 tests and
lint, checked clean status, accepted the live evidence and known limits, and
approved this documentation-only agreement record without another review.
Transient unreadable post-action targets currently fail closed immediately;
retrying such snapshots until timeout is a nonblocking future improvement.

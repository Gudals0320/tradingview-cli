# Large Pine development workflow — Lead follow-up

Date: 2026-10-01 KST. Product baseline: `6e41546`, after Executor/Reviewer agreement
on #4–#11. Same workspace and `codex/pine-qa` branch; no product source changes.

## Concrete edit

Started with `baseline.pine`: a multi-filter EMA/RSI/volume/ATR strategy with a
confirmed higher-timeframe input, risk-based sizing, long/short orders, fixed
brackets, ten helpers, bounded recent-trade arrays, chart overlays and a dashboard.
Changed this same saved script to `edited.pine` by adding:

- Monotonic ATR trailing stops activated at a configurable initial-R threshold.
- Break-even protection measured against entry-time risk.
- A configurable cooldown after a losing trade.
- Maximum holding duration and counters for the new branches.
- Five extra dashboard rows, explicit runtime telemetry, and a stop-ratchet invariant.

Editor line counts (including the terminal empty line): 266 → 319.
UTF-8 bytes: 14,985 → 18,588. This is executable strategy code, not repeated filler.
`build-revision.mjs` records exact edit anchors and generates `broken.pine` by
replacing one helper call on line 120 with the nonexistent `qa_missing_max`.
TradingView's [strategy documentation](https://www.tradingview.com/pine-script-docs/concepts/strategies/)
was consulted for exit-order semantics; this artifact is a software QA fixture.

## Actual results

| Development action | Result |
| --- | --- |
| new strategy and set/get the entire baseline from file | Passed, full LF-normalized source equality |
| analyze/check baseline and valid edited source | Passed, server error_count/warning_count 0 |
| Save baseline, compile, list saved document | Passed, verified report_ready:true |
| Inject one bad function in the large edit via stdin | Entire broken source preserved |
| Analyze broken source | No diagnostic; expected limited heuristic coverage, check is required |
| check/compile/errors on broken source | All detect missing function at line 120, column 26; exit 1 |
| console after bad compile | Correct error record, no editor-container source dump |
| compile edited saved source without --save | Correctly rejected with SAVE_REQUIRED |
| Correct source then compile --save | **Failed:** duplicate strategy and 30-second timeout, filed #12 |
| Continue after explicit QA-only duplicate removal | Corrected source compiled with report_ready:true |
| Save and open a separate sentinel, then reopen edited strategy | Both full sources and document IDs preserved |
| raw-compile on unchanged corrected strategy | Passed deprecated smart alias contract: unchanged:true |
| list final document | Exactly one matching saved document ID/name |
| Switch to split view, read Pine Logs and dashboard | Passed; 3 runtime messages and 21 dashboard rows |

Baseline Desktop analysis produced a warning about `barstate.islast` on unconfirmed
realtime bars. `pine errors` correctly treated it as a warning with exit 0. The
first table read was empty; the later corrected strategy table was populated.
This was not filed as a CLI defect. Native warnings and server checks are not
assumed to be identical.

## Full-source checks and runtime evidence

- Baseline normalized SHA-256:
  `748cded60236826449e4397f4d72d6522f5a69fd3eba88b284ee4e334ff8e070`
- Final edited normalized SHA-256, before save, after reopening, and in split view:
  `772756f1a7dadc024312e8ed6890d0b4bc87814f80d7147d990736662bbae440`
- Sentinel normalized SHA-256 unchanged:
  `cd09f6ebf4b89fcd739d33f6af83b0424651793effdfaa7722aed97237b646a6`
- Normalization changes CRLF to LF only; trailing newlines, whitespace, Unicode,
  comments, strings, and the rest of the source are compared in full.
- Final report/dashboard: 515 closed trades; bounded sample arrays retained 64.
- Instrumentation observed 945 stop improvements, 296 break-even crossings,
  191 cooldown blocks, and 0 stop-ratchet violations.
- Time-exit counter was 0: that branch was compiled but not exercised by these
  default parameters. Counters are not an independent bar-by-bar correctness
  oracle or evidence of investment quality. No broker integration was used.

`evidence.json` keeps sequential command outcomes, including the failed edit
phase and the later **explicit workaround** phase. `runtime-evidence.json` stores
the verified log rows and dashboard. Internal IDs, compiled payloads, personal
script lists and target inventory are omitted from committed evidence.

## New issue and minimal isolation

[Issue #12](https://github.com/Gudals0320/tradingview-cli/issues/12): saved strategy
error→correction adds a duplicate study and times out. Its published body was read
back and compared with `issue-strategy-error-recovery.md`.

The tiny `repro-strategy-update.mjs` independently showed:

1. Fresh saved strategy compile: study count 0→1, successful report.
2. Normal reopen/edit/compile: count stays 1, updateOnChart succeeds.
3. Intentional error compile: exit 1 and count stays 1.
4. Corrected compile: exit 1 after 30,362ms, count becomes 2, while errors is clean.

Thus size alone is not the trigger: a realistic debugging loop uncovered a
saved-strategy error-recovery defect that small happy-path fixtures had missed.
No product fix was made by Lead. Executor should preserve the distinction between
the successful normal edit and failed error recovery when adding regression tests.

## Reproduction and current QA state

- All tools require the explicit QA target. Reconfirm it with `tv tab list`.
- Layout remains `CLI-QA-Pine-20261001`, chart `kdn7wAFi`.
- `workflow.mjs TARGET baseline` creates Sentinel and the large strategy;
  `... edit` runs the bad-function/correction sequence and stops at unexpected failure.
- `... finish` is an **intentional manual workaround**: it removes only the chart
  studies named `CLI-QA Large Edit 20261001`, reapplies the unchanged saved source,
  and finishes persistence checks. Do not label that as a fixed error recovery.
- `repro-strategy-update.mjs TARGET` sets up the minimal normal edit; the same
  command with `error-cycle` runs the failing error/correction sequence.
- The minimal repro starts with a guard against an already-applied same-name
  study. Two instances named `CLI-QA Strategy Reopen 20261001` currently remain as
  debug assets, both created by this run. Remove only those if restarting it.
- Current editor: saved `CLI-QA Large Edit 20261001`, edited source v2, split view;
  Pine Logs is open and shows the edited QA strategy.
- Large strategy has one applied instance after the documented workaround.
  Sentinel remains saved and unchanged. Original user tabs/scripts were not modified.
- Raw before/after records and controller snapshots remain under ignored
  `results/pine-qa/large-edit/`; do not publish them wholesale.

## Handoff and limits

Continue in the same checkout. Fix #12, consult the existing Reviewer, replay the
large error-correction sequence **without the workaround**, and leave a clean
branch with no merge/PR. Check original eight-issue regressions as appropriate.
User communication authorization and chat IDs remain in `../HANDOFF.md`.

Lead checked script syntax, issue body readback, source hashes, and actual
Desktop behavior. Product code was unchanged, so the existing 297-test suite was
not rerun during this follow-up; that prior result is Executor's baseline.

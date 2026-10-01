# Six-scenario validation protocol

Repository/cwd for EVERY thread: C:\Codex\.worktrees\tradingview-cli-pinescript-qa
Branch: codex/pine-qa. Product baseline: 57ee8e7. Lead owns scheduling, shared files and Git.

## Exclusive execution and file ownership

Only ONE scenario thread is active at a time. A start instruction grants exclusive Desktop execution until final handoff. Do not spawn other threads or message another worker. Lead will read your final response and files.
Write only your assigned qa/pine/scenarios/<slug>/ and results/pine-scenarios/<slug>/ (the latter ignored). Shared src/, tests/, package files, other scenarios, prior QA artifacts and Git operations are read-only: NO product fixes, commits, branch/worktree changes, merge, push, PR or GitHub issues. Lead creates ONE aggregate issue after all six. You may fix your own Pine code/harness to execute the scenario and must distinguish fixture mistakes from product bugs.
Do not install dependencies or plugins unless unavoidable and discussed with Lead. Existing node_modules and CLI are available.

## TradingView isolation

Use only disposable documents with prefix CLI-QA-S01 ... CLI-QA-S06 matching your scenario. Prefer a dedicated layout named CLI-QA-Sxx-20261001 using the CLI tab new workflow; discover the returned target with tab list and pin every command to that target. If a new layout is unavailable, use only the known QA layout CLI-QA-Pine-20261001 / chart kdn7wAFi and document the fallback; never use personal charts. Existing old QA duplicate/draft studies may cause AMBIGUOUS_TARGET: do not delete another scenario's or old QA assets. Record a blockage or create your own layout. No broker actions, publishing or real orders; strategy.entry/exit simulate backtests only.
At finish list your layout/chart, saved QA document names, remaining study counts, active editor, pending dialogs and any changed chart settings. Close/cancel your pending modal; do not close personal tabs or terminate Desktop. Sequential scheduling does not authorize changing a different worker's assets.

## CLI quick start (PowerShell, from repository root)

node src/cli/index.js --help
node src/cli/index.js tab list
node src/cli/index.js --target TARGET tab new --layout new --name CLI-QA-Sxx-20261001
node src/cli/index.js --target YOUR_TARGET pine new indicator
node src/cli/index.js --target YOUR_TARGET pine set --file qa/pine/scenarios/YOUR_SLUG/baseline.pine
node src/cli/index.js --target YOUR_TARGET pine get
node src/cli/index.js pine analyze --file PATH
node src/cli/index.js pine check --file PATH
node src/cli/index.js --target YOUR_TARGET pine save
node src/cli/index.js --target YOUR_TARGET pine compile
node src/cli/index.js --target YOUR_TARGET pine compile --save
node src/cli/index.js --target YOUR_TARGET pine errors
node src/cli/index.js --target YOUR_TARGET pine console
node src/cli/index.js --target YOUR_TARGET pine list
node src/cli/index.js --target YOUR_TARGET pine open "EXACT SAVED NAME"
node src/cli/index.js --target YOUR_TARGET pine raw-compile

Use new strategy/library where appropriate. Output JSON and exit status both matter. analyze is heuristic, not grammar validation. check contacts TradingView's server. Saved modified source requires pine save before compile OR explicit compile --save. raw-compile is a deprecated smart alias, not a force-add button. errors distinguishes warnings (exit0) and errors (exit1). open exact saved name takes precedence; ambiguous names reject. new/open replace unsaved changes per README.
Record actual CLI via Node spawnSync(process.execPath, ['src/cli/index.js','--target',target,...args],{encoding:'utf8',input,timeout:65000,maxBuffer:8*1024*1024}). stdin via input avoids PowerShell extra newline. Store raw output only in your ignored results directory; emit compact sanitized evidence in your owned QA directory. Never publish private source, account names, unrelated script lists, cookies or compiled blobs.
CLI network/CDP commands may need sandbox escalation: use require_escalated with a concrete justification; don't treat sandbox denied network as product failure. Read-only core/CDP inspection through this repo is allowed for diagnosis. Don't modify product source to bypass a failing CLI command. If you use a UI workaround, capture initial failure first and label workaround clearly.

## Additional inspection

state; timeframe; symbol; indicator get/set/remove; data tables/lines/labels/boxes --filter NAME; data strategy/trades/ledger; ui-state; ui eval; ui click; ui panel. Read --help and relevant core modules rather than guessing options. Avoid broad general E2E tests that mutate unrelated charts. Freshness and counts must be verified with real CLI calls, not just internal mocks.
Pine v6 references: https://www.tradingview.com/pine-script-docs/ . Use official sources when needed. Network/script API failures are evidence; a completed command alone does not prove the feature.

## Required deliverables

Write HANDOFF.md in your assigned QA directory with:
1. Exact scenario and initial/final Pine sources; concise actual edit diff.
2. Each acceptance criterion PASS / FAIL / BLOCKED / NOT TESTED, with evidence reference.
3. Commands, exit codes, JSON, timing, independent numeric/source/identity assertions (evidence.json).
4. Reproduced product defects: trigger, minimal repro, expected/actual, frequency, workaround, suspected component. Separate fixture errors/environment/known limitation.
5. All attempted Pine commands, source SHA-256 (normalize CRLF only, not trim), document identity preservation, true UI/report/count checks as applicable.
6. Remaining QA state and next-worker notes; no Git commit by worker.
7. Overall outcome and limitations. A legitimate blocker may end a scenario only after concrete attempts and safe alternatives are documented. Do not stop after merely drafting Pine code or promising later verification.

Keep work focused on this scenario; don't turn a discovered CLI bug into an implementation project. If a core defect blocks later criteria, collect minimal evidence then use a clearly documented safe UI/setup workaround for independent checks where possible. No invented passes. Finish with a concise final handoff path/outcome; Lead will collect it and decide whether follow-up is needed.

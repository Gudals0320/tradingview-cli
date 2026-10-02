# AGENTS.md

Guide for AI agents that use or modify `tv`, a CLI that drives a running TradingView Desktop over CDP and returns JSON. The human-facing documentation is [README.md](README.md) (Korean).

## Discover commands from the CLI, not from this file

```bash
tv help --json
tv help --json pine
tv help --json pine compile
```

The catalog is generated from the registered commands, so it matches the installed code. Each entry lists `usage`, `positionals` (`min`/`max`, `null` = unbounded), `options`, `scope`, `invocation`, `desktop` (whether the call contacts Desktop), `endpoint_lease` (whether it holds the shared lease), `read_only` (`true` / `false` / `"conditional"` with `read_only_when`) and `output` (`json`, `jsonl`, or `"conditional"` with `output_when`). The legend for each field is in the same output. `tv help --json` with no filter is large (about 50 KB), so filter by command when you can.

Inside the repository without `npm link`, run `node src/cli/index.js ...` instead of `tv ...`. Install dependencies first with `npm ci`; even `--help` fails without them.

## Preconditions

- TradingView Desktop is running and logged in, with CDP at `127.0.0.1:9222`. Override with `TV_CDP_HOST` / `TV_CDP_PORT`.
- Run `tv status` first. Exit code `2` means no CDP connection.
- `tv launch` **kills running TradingView instances by default**, which can discard the user's unsaved work. Do not run it without the user's consent; `--no-kill` avoids the kill.
- Commands with `desktop: "none"` need no Desktop, for example `help`, `pine analyze`, `pine check`, `search` and `session status`. Do not infer this from `scope: "offline"`: `session recover` and `workspace inventory` are routed offline but still contact Desktop.

## Calling contract

- stdout carries one JSON object per call. Stream commands (`output: "jsonl"`) emit one JSON object per line until killed.
- Errors go to stderr as `{"success":false,"error":...,"code":...,"details":...}`.
- Check **both** the exit code and `success`. A `success:false` result can appear on stdout with exit `1`.
- Exit codes: `0` success; `1` invalid input, operation failure or compile failure; `2` CDP connection failure.
- Run one lease-holding call (`endpoint_lease` other than `false`) at a time per Desktop endpoint. Overlapping lease holders fail with `SESSION_BUSY`. A running `stream` holds the lease until it is terminated, so always run streams with a timeout or terminate them yourself.
- For parallel work, use workspaces (`tv --workspace FILE ...`); see [docs/workspaces.md](docs/workspaces.md) and [docs/workspace-commands.md](docs/workspace-commands.md).
- Entity IDs (studies, drawings, CDP targets) are only valid for the current session. Re-read them after a reconnect.

## Safety

- Commands with `read_only: false` change the user's Desktop. Confirm destructive ones with the user first: `alert delete`, `draw clear`, `draw remove`, `indicator remove`, `watchlist remove`, `tab close`, `ui eval`, `pine new`, `pine open`. `pine new` and `pine open` replace unsaved editor content.
- Do not edit strategy inputs in the GUI while `pine compile` or `indicator set` runs. The GUI does not take the CLI lock.
- Never reload a tab or force-clear a lock to get unstuck. Reload loses unsaved chart and Pine state. The CLI never does this automatically, and neither should you.
- Broker connections and order execution are out of scope for this project. Do not add or attempt them.

## Pine and backtest workflow

```bash
tv pine analyze --file strategy.pine
tv pine check --file strategy.pine
tv pine set --file strategy.pine
tv pine compile
tv pine errors
tv data strategy
tv data ledger --offset 0 --limit 100
```

1. `pine analyze` is an offline heuristic, not a syntax validator. `pine check` compiles on the TradingView server without a chart.
2. `pine compile` verifies completion. An already verified, unchanged source returns `unchanged:true, compile_performed:false`. That is success, not a skipped step.
3. Warnings can appear after the compile response, so re-check with `pine errors`.
4. Strategy results are returned only after a verified calculation. `data strategy` returns `REPORT_UNVERIFIED` until you compile the strategy source or change an input with `indicator set`. Read input IDs with `indicator get` first.

## Error codes and next actions

| Code | Next action |
| --- | --- |
| `SESSION_BUSY` | Another CLI call, stream or workspace owns the endpoint. Wait for it or stop it; do not force. |
| `SAVE_REQUIRED` | The saved script has unsaved edits. Use `pine save` or `pine compile --save`. |
| `PINE_COMPILE_ERROR` | Fix the source using the returned diagnostics and locations. |
| `REPORT_UNVERIFIED` | Run `pine compile` for that strategy or change an input with `indicator set`. |
| `REPORT_PENDING` / `REPORT_TIMEOUT` | The report is not verified yet. Wait, then read again; `calculation_pending:true` means the calculation is still running. |
| `PINE_EDITOR_REQUIRED` | Run `tv ui panel pine-editor open`, then retry. |
| `WATCHLIST_PANEL_REQUIRED` | Run `tv ui panel watchlist open`, then retry. |
| `STUDY_NOT_FOUND` | No study matches the filter. Check names with `tv state`. |
| `CDP_TIMEOUT` | The timeout did not cancel native work. Run `tv session status`, then `tv session recover --run-id RUN_ID`. |
| `LAYOUT_UNVERIFIED` | A layout switch could not be confirmed. Inspect with `tv state` before continuing. |

The README lists more Pine failure codes under "빠른 시작".

## Recovery

```bash
tv session status
tv session recover --run-id RUN_ID
tv session discard --run-id RUN_ID
```

`session status` shows ownership and recovery state without exposing the saved draft. `recover` verifies that native work finished. `incomplete:true` means the previous result is unknown: read the state again and retry. `discard` abandons restoration and leaves Desktop as it is. Ask the user before you discard.

## Changing this repository

- Run `npm run lint` and `npm test` before committing. Tests run offline and need no Desktop.
- `tv help --json` is generated from the code at runtime; never write or commit catalog output. Its text comes from the `description` of each command and option, so when you change behavior, options or arguments, update those descriptions in the same change and check the result with `tv help --json <command>`. Tests fail if a description is missing, not if it is wrong.
- A new command must be registered in `src/cli/commands/`, classified exactly once in `src/cli/policy.js` and given a positional range in `src/cli/arguments.js` if it takes arguments. `tests/command-policy.test.js` fails on unclassified commands. The `tv help --json` catalog picks up new commands automatically.
- Every `tv ...` line in README.md, docs/workspaces.md and this file is syntax-checked against the real argument parser by `tests/documented-arguments.test.js`.

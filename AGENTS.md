# AGENTS.md

Guide for agents using/modifying `tv`, a JSON CLI for a running TradingView Desktop
over CDP. The human documentation is [README.md](README.md) (Korean).

## Discover the installed contract

```bash
tv help --json pine compile
tv help --json workspace
```

The runtime catalog classifies scope/invocation/Desktop access/read-only/output,
workspace_required, resource locks and foreground requirements. Never commit
generated catalog output. Install dependencies with `npm ci` first; in this repo
use `node src/cli/index.js ...` without npm link.

## Establish the workspace before execution

Desktop must be logged in and have CDP (default 127.0.0.1:9222; TV_CDP_HOST/PORT
override). `tv status` is preparation and must run first; exit 2 means disconnected.
Create/select a saved dedicated layout, then create/select a named workspace.
Ordinary Desktop work without selection is WORKSPACE_REQUIRED. Never infer an
active tab. Agents/scripts should use explicit names on every invocation:

```bash
tv status
tv layout list
tv layout create "Agent Research"
tv workspace inventory
tv workspace create agent-research --layout EXACT_LAYOUT_ID
tv --workspace agent-research state
```

PowerShell humans may import scripts/TradingViewCli.psm1 and select a workspace.
Selection belongs only to that PowerShell process. Explicit --workspace NAME takes
priority without changing selection. CLI children cannot select their parent shell.
Help/version/offline diagnostics and layout/workspace preparation need no selection.
See [docs/workspaces.md](docs/workspaces.md) for migration and lifetime policies.

## Contract and safety

- stdout: one JSON object per call; streams: JSONL. Errors: structured JSON on
  stderr. Check exit code **and** success. Exit 0 success, 1 input/operation/compile
  failure, 2 CDP connection failure.
- Independent workspace resources run concurrently. Conflicting mutations queue
  (30s default, max300s,64 tickets; --lock-timeout-ms). Observation/status/wait do
  not take mutation leases. Limit/terminate streams; samples pin generation.
- IDs for studies/drawings/targets are ephemeral. Re-read after reconnect and
  compile before adopting new-generation results.
- `tv launch` kills by default and may discard unsaved work. Do not use without
  consent; --no-kill avoids killing. Never auto-launch, reload a tab or force-clear
  live ownership to get unstuck.
- Confirm destructive Desktop operations before execution: alert delete, draw
  clear/remove, indicator remove, watchlist remove, tab close, ui eval and editor
  replacement. Already authorized dedicated test resources may be used within the
  agreed scope; never change/delete preexisting user resources.
- UI and CDP capture require the owned tab selected. Mounted Pine can run in
  background tabs; restore the window if PINE_VIEWPORT_UNAVAILABLE. Do not edit
  GUI inputs while compile/input changes run: GUI does not take CLI locks.
- Broker connections and order execution are out of scope; never add/attempt them.

## Pine and result collection

Pine is optional for chart-only workspaces. For Pine work, attach a dedicated saved
document already mounted in the owned layout (or pass --pine on creation). Duplicate
document reservations are refused. Bound pine new/open/layout switch cannot replace
resources implicitly. Use attach or open/select a different workspace.

```bash
tv workspace show agent-research
tv workspace attach agent-research --pine 'USER;DOCUMENT' --generation EXACT_GENERATION
tv pine analyze --file strategy.pine
tv pine check --file strategy.pine
tv --workspace agent-research pine set --file strategy.pine
tv --workspace agent-research pine compile --save
tv --workspace agent-research pine errors
tv --workspace agent-research data strategy
tv --workspace agent-research data ledger --offset 0 --limit 100
```

Analyze is heuristic, not syntax validation. Check compiles on the server without
a chart. An already verified unchanged compile is success (unchanged:true,
compile_performed:false). Read warnings again with pine errors. REPORT_UNVERIFIED
requires compile or verified input change. Read indicator input IDs first. Ledger
pages must pass the first report_revision; REPORT_CHANGED means restart at offset0.

## Recovery

Only reachable CDP with an absent recorded target proves target_lost. Unreachable
CDP is disconnected. No automatic recreation or infinite retry. Preserve incomplete
journals/results, foreign modified drafts and unknown native outcomes.

```bash
tv workspace show agent-research
tv workspace locks
tv --workspace agent-research workspace interrupt --operation EXACT_DEAD_OPERATION
tv --workspace agent-research workspace recover --operation EXACT_INTERRUPTED_OPERATION
tv workspace reconnect agent-research --target NEW_TARGET --generation OLD_GENERATION
tv session status
tv session recover --run-id EXACT_RUN
```

Recovery validates recorded resources/panes, not unrelated targets. Whole-layout
effects retain broad validation. Reconnect requires saved layout/document identity
and exact generation, invalidates old IDs/proofs, and cannot overwrite foreign drafts.
Release preserves tabs/artifacts. Ask before abandoning/discarding: those preserve
incomplete records but stop restoration. Exact dead gate/resource repair is permitted
only after native work is reconciled; never treat a live/unverifiable PID as dead.

WORKSPACE_DISCONNECTED: restore CDP availability. WORKSPACE_TARGET_LOST: explicitly
open the saved layout and reconnect. LOCK_TIMEOUT: inspect owner/wait or cancel.
LOCK_HOLDER_DEAD: reconcile the exact interrupted native operation. ADMISSION_PERMISSION:
inspect the state directory owner/permissions. REPORT_PENDING/TIMEOUT: wait; do not
repeat an uncertain mutation. Expected validation/read errors alone do not imply
manual recovery. WORKSPACE_EXTERNAL_CHANGE means inspect the affected workspace.

## Repository changes

- Run npm run lint and npm test before every commit. Unit/native/DOM/CLI HTTP
  fixtures run offline; separate live Desktop evidence from fixture claims.
- Register commands in src/cli/commands, classify exactly once in policy.js, add
  positional ranges in arguments.js and update descriptions/help in the same change.
- CLI contract tests execute the real entry point with isolated state/HTTP fixtures;
  assert output/exit/side effects agree with the catalog.
- README/docs/workspaces/this file tv examples are parsed by
  tests/documented-arguments.test.js. Update examples/scripts/PowerShell/migration
  alongside changed execution contracts.
- Persistent private state uses LOCALAPPDATA/XDG (TV_STATE_DIR override), not TEMP.
  Never commit owner tokens, private source/journals or live raw result blobs.

# TradingView CLI

Control a running TradingView Desktop session from your terminal through Chrome DevTools Protocol (CDP). The `tv` command emits JSON, so it works well in shell scripts and `jq` pipelines.

This is a private personal codebase. The command remains `tv`. The initial version includes the Windows/Korean Pine and tab compatibility fixes, graceful CLI shutdown, regression tests, and batch examples. See [NOTICE.md](NOTICE.md) for source attribution.

This is an unofficial local automation tool. It is not affiliated with or endorsed by TradingView Inc.

## Prerequisites

- Node.js 20 or newer
- TradingView Desktop installed and signed in
- A TradingView plan that supports the features you use
- TradingView launched with a local CDP port (the default is `9222`)

## Install

Clone the repository and install its single runtime dependency:

```bash
git clone https://github.com/Gudals0320/tradingview-cli.git
cd tradingview-cli
npm install
npm link
```

`npm link` makes the `tv` command available globally. Without linking, run commands as `npm run tv -- <command>`.

## Launch TradingView with CDP

The simplest option is:

```bash
tv launch
tv status
```

`tv launch` finds TradingView on macOS, Windows, or Linux and restarts it with `--remote-debugging-port=9222`. Pass `--no-kill` to avoid closing an existing instance, or `--port 9333` to choose another port.

Platform launch scripts are also included:

```powershell
# Windows
.\scripts\launch_tv_debug.bat
```

```bash
# macOS
./scripts/launch_tv_debug_mac.sh

# Linux
./scripts/launch_tv_debug_linux.sh
```

To launch manually, fully quit TradingView first and start its executable with:

```text
--remote-debugging-port=9222
```

## Quick Start

```bash
# Inspect the current chart
tv status
tv state
tv quote
tv ohlcv --count 20 --summary

# Change the chart
tv symbol NASDAQ:AAPL
tv timeframe 15
tv type Candles

# Read indicator and Pine drawing data
tv values
tv data lines --filter "My Indicator"
tv data labels --filter "My Indicator"

# Work with Pine Script
tv pine analyze --file indicator.pine
tv pine set --file indicator.pine
tv pine compile

# Practice with bar replay
tv replay start --date 2025-03-01
tv replay step
tv replay trade buy
tv replay status

# Stream newline-delimited JSON
tv stream quote --interval 500 | jq .close
```

Run `tv --help`, `tv <command> --help`, or `tv <command> <subcommand> --help` for the current options.

For a sequential Pine parameter sweep with source verification and cleanup, see [the batch example](examples/README.md). It selects an explicit disposable chart layout and writes Strategy Tester metrics to JSON.

## Commands

| Area | Commands |
| --- | --- |
| Connection | `status`, `launch`, `update`, `discover`, `ui-state` |
| Chart | `state`, `symbol`, `timeframe`, `type`, `info`, `search`, `range`, `scroll` |
| Market data | `quote`, `ohlcv`, `values` |
| Advanced data | `data lines`, `labels`, `tables`, `boxes`, `strategy`, `trades`, `equity`, `depth`, `indicator` |
| Pine Script | `pine get`, `set`, `compile`, `raw-compile`, `analyze`, `check`, `save`, `new`, `open`, `list`, `errors`, `console` |
| Screenshots | `screenshot` |
| Replay | `replay start`, `step`, `stop`, `status`, `autoplay`, `trade` |
| Drawings | `draw shape`, `list`, `get`, `remove`, `clear` |
| Alerts | `alert list`, `create`, `delete` |
| Watchlists | `watchlist get`, `add`, `add-bulk`, `remove` |
| Layouts and indicators | `layout list`, `layout switch`, `indicator add`, `remove`, `toggle`, `set`, `get` |
| UI automation | `ui click`, `keyboard`, `hover`, `scroll`, `find`, `eval`, `type`, `panel`, `fullscreen`, `mouse` |
| Panes and tabs | `pane list`, `layout`, `focus`, `symbol`; `tab list`, `new`, `close`, `switch` |
| Streaming | `stream ohlcv`, `quote`, `bars`, `values`, `lines`, `labels`, `tables`, `all` |

Most commands operate on the currently active TradingView chart. Entity IDs returned by `tv state`, `tv draw list`, or related commands are session-specific.

Desktop selection follows the shell's active tab, not CDP list order or page visibility. `tv tab list` reports shell order, native tab IDs, and `resolved`. Ambiguous duplicate layouts are rejected. Use `tv --target CDP_ID state` for an explicit page; the ID is session-specific. `tab switch` verifies the actual shell selection and does not scan through unrelated tabs.

Operation results with `success:false`, failed compilation, and fatal editor diagnostics exit with code 1. Typed CDP transport failures exit with code 2. Warning-only Pine diagnostics do not fail compilation. `pine analyze` is a limited offline heuristic, not a Pine compiler; use `pine check` or Desktop compilation for syntax validation.

After CLI compilation, strategy data requires a changed compiled-script identity (`text`/`pineId`/`pineVersion`) or a new study, plus a fresh complete report from that study. Real-time changes to the previous strategy's report are insufficient. An already verified identical source returns `unchanged:true`, `compile_performed:false` and its existing compilation token. An external script replacement invalidates that verification. Strategy JSON includes actual backtest/trade/loaded ranges, input values and unit metadata. `data trades` exposes `order_seq`; `time_index` remains a deprecated ordinal alias. `data ledger --offset 0 --limit 100` provides paginated native trades with UTC entry/exit times and raw profit/commission fields.

Strategy data reads (`data strategy`, `trades`, `ledger`, and `equity`) require a verified calculation for the selected strategy. Strategies added through the GUI or restored after a page reload return `success:false`, `code:REPORT_UNVERIFIED`, and exit code 1 without metrics or trade data. Run `tv pine compile` with the strategy source, or change an input with `tv indicator set ENTITY_ID --inputs '{"in_0":20}'`, to establish verification. Starting monitoring or setting an unchanged input does not verify an existing report. A calculation verified through `indicator set` can have a null compilation token and source hash; those fields identify CLI source compilation, not report readiness.

For monitored strategies, input/context changes require an observed native recalculation transition and a complete report for the new inputs/context. `indicator set` waits for that verification; applying inputs without verified completion fails instead of reporting success. GUI edits to monitored strategies can temporarily return `REPORT_PENDING`. Selecting another strategy does not inherit the monitored strategy's verification. Desktop builds without the required calculation events reject unverified changed-input results. After an external script replacement, an identical-source apply can time out safely; edit the source before recompiling to establish a new verified result.

Batch jobs own an endpoint lock shared by cooperating processes using the same operating-system temporary directory, because Pine drafts can be shared across layouts. Conflicting CLI operations are rejected while a batch is alive. `tv session status` shows ownership and recovery status without revealing the saved draft. Abruptly killed batches leave a private recovery journal and refuse subsequent mutations until explicit recovery. During recovery, `status`, `state` and `tab list` remain available for diagnosis. `tv session discard --run-id RECOVERY_RUN_ID` explicitly abandons restoration and archives the saved journal, leaving Desktop changes in place. See the example documentation for `--recover` and history-coverage options.

## JSON Output and Exit Codes

Successful commands write formatted JSON to stdout:

```json
{
  "success": true,
  "symbol": "NASDAQ:AAPL",
  "resolution": "15"
}
```

Errors are JSON on stderr. Exit codes are:

- `0`: success
- `1`: invalid command, invalid input, or operation failure
- `2`: CDP connection failure or TradingView not running

Streaming commands emit JSON Lines (one JSON object per line) until interrupted with Ctrl+C.

## Multi-feed OHLCV Streaming

Stream different symbols and timeframes from separate chart panes, including panes in other TradingView tabs:

```bash
tv stream ohlcv CME_MINI:ES1!@1 CME_MINI:NQ1!@5 NASDAQ:AAPL@15 --interval 250
```

The final `@` separates each symbol from its timeframe. Existing matching panes are reused. When necessary, the CLI expands a chart layout or opens another tab, configures one pane per feed, and leaves those panes and tabs open after the stream stops.

Each changed feed emits one JSON object containing `symbol`, `timeframe`, `bar_time`, `open`, `high`, `low`, `close`, `volume`, `bar_index`, `observed_at`, `tab_id`, and `pane_index`. Stdout contains JSONL events only; startup notices and recoverable errors go to stderr.

Python can pipe those events directly into arrays or backend calculations:

```python
import json
import subprocess

command = [
    "tv", "stream", "ohlcv",
    "CME_MINI:ES1!@1",
    "CME_MINI:NQ1!@5",
    "NASDAQ:AAPL@15",
    "--interval", "250",
]

process = subprocess.Popen(command, stdout=subprocess.PIPE, text=True)
try:
    for line in process.stdout:
        bar = json.loads(line)
        # Append bar fields to NumPy arrays, queues, databases, or calculations here.
        print(bar["symbol"], bar["timeframe"], bar["close"])
finally:
    process.terminate()
    process.wait()
```

This polls the latest forming bar from each local chart pane; it is not a raw exchange-tick feed. A value is emitted when that pane's latest OHLCV record changes, so updates that occur between polls can be missed. The default polling interval is 250 ms and the minimum is 100 ms.

## Updating

From a clean Git checkout on `main`:

```bash
tv update
```

The command only accepts an `origin` pointing to `Gudals0320/tradingview-cli`, then fetches and fast-forwards its `main` branch. Authenticate GitHub access before updating this private repository. `tv status` also checks this private origin through authenticated Git. If `package-lock.json` changed, it also runs `npm ci`. Restart the `tv` command after an update.

## Testing

GitHub Actions runs lint and unit tests on Windows with Node.js 24 for pushes to `main`, pull requests targeting `main`, and manual runs. CI sets `TRADINGVIEW_SKIP_NETWORK_TESTS=1` to skip the five Pine server-compile tests; no TradingView account or Desktop session is required. Normal local `npm test` still includes those server checks.

```bash
npm ci
npm run lint
npm test
```

The offline suite covers routing, Pine analysis and compile checks, input sanitization, replay behavior, launch detection, chart history, indicator inputs, self-update guards, and the repository boundary.

With TradingView Desktop running on port 9222, run the live integration suite:

```bash
npm run test:e2e
```

## Architecture

```text
tv command -> command adapter -> core operation -> CDP on localhost:9222 -> TradingView Desktop
```

- `src/cli/` parses commands and serializes results.
- `src/core/` implements chart, data, Pine, replay, drawing, UI, and launch behavior.
- `src/connection.js` owns the CDP connection and safe page evaluation helpers.
- `src/wait.js` centralizes chart readiness and render waits.

## Security and Limitations

- CDP can control the TradingView Desktop page. Keep it bound to localhost and never expose port 9222 to an untrusted network.
- The CLI automates your local desktop session; it does not bypass TradingView authentication, subscriptions, permissions, or product limits.
- TradingView's internal page APIs can change without notice and may require compatibility updates here.
- Review commands before using them in unattended scripts, especially UI automation, alert deletion, drawing removal, and replay trades.

Use this project subject to the [TradingView Terms of Use](https://www.tradingview.com/policies/).

## Contributing

Keep personal issues and pull requests in this private repository. See [CONTRIBUTING.md](CONTRIBUTING.md) for development commands and scope.

## Attribution and Disclaimer

TradingView is a trademark of TradingView Inc. This independent project is not affiliated with, endorsed by, sponsored by, or associated with TradingView Inc. It does not include or modify TradingView software. Users are responsible for complying with TradingView's terms and all applicable laws.

## License

The source code is available under the MIT License. See [LICENSE](LICENSE) for the full license and trademark notice.

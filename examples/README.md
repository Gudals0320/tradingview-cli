# Pine batch example

This example runs two SMA configurations through the real TradingView Strategy Tester. It is a plumbing demonstration, not an assessment of strategy quality. It creates no alerts and places no live broker orders.

## Setup

1. Install the CLI dependencies with `npm ci`.
2. Run a signed-in TradingView Desktop with `--remote-debugging-port=9222` bound to localhost. Keep its window displayed: a hidden or newly created tab can have a zero-size viewport.
3. Create a separate disposable saved chart layout in TradingView and open it in Desktop. Remove other strategies from that layout; ordinary indicators may stay.
4. Run `node src/cli/index.js tab list` and copy that layout's `chart_id`.

Run from the repository root, replacing `YOUR_DISPOSABLE_CHART_ID`:

```powershell
node examples/pine-batch.js --chart-id YOUR_DISPOSABLE_CHART_ID --symbol BINANCE:BTCUSDT --timeframe 60 --start 2026-08-01T00:00:00Z --end 2026-09-30T00:00:00Z --out results/pine-batch.json
```

The same command works in bash. Omit `--start` and `--end` to use the 60 days ending at today's UTC midnight. The interval is an entry-signal window; the broker emulator fills market orders on the next available bar, so the final exit may occur at the boundary. Available chart history and subscription limits still apply.

The runner exclusively owns the Desktop session, selects the explicit layout, tries SMA 10/30 and 20/60, verifies source read-back, compiles, and checks the report's run-specific name, compilation token, source hash, symbol/timeframe and input values. Each saved result contains `parameters`, `strategy_id`, `compilation_token`, `source_hash`, `strategy_inputs` and `context`, metrics, and the ten most recent order events with their count/cap/truncation metadata. It verifies the order query's success and identity too. It deliberately does not collect a complete ledger: use `data ledger --strategy-id` and carry its `report_revision` across pages when a full ledger is needed. These separate calls are not an atomic report snapshot. No model invocation is needed between experiments. The Pine template uses a 10,000 initial balance, 10% equity per position, 0.05% commission per order, one tick of slippage, and no pyramiding.

The example imports the current core modules directly; it is not a `tv batch` command and has its own `parseArgs` options. On compile/report/order failure it stops before the next variant, restores owned state, exits 1 and prints `success:false` with `code` and `details` on stderr. `details` preserves `run_id`, `failed_run` (strategy, parameters and phase), `completed_results`, and `restored`; redirect stderr if you need those partial results. The `--out` file is written only after full success, so a pre-existing file at that path is not proof that a failed invocation succeeded. A failed cleanup retains the recovery journal and does not claim restoration. Restoring a changed editor draft invalidates its page's prior report verification; cleanup does not compile the user's draft or restore report caches.

After success or failure, it removes only this run's example studies and verifies restoration of the selected chart's symbol, timeframe, type and editor draft. It restores the previously active tab. Cleanup failures produce a nonzero exit code and retain the recovery journal. The selected layout tab remains open. TradingView may share the editor draft between tabs, so do not edit Pine elsewhere while the batch is running. External draft/chart changes are not overwritten silently.

Duplicate open layouts are rejected; use a uniquely resolved `--target-id` from `tv tab list` when appropriate. Signal interruption requests cooperative cleanup. Forced termination cannot run cleanup, but the next batch refuses to adopt the interrupted state as a new baseline. After inspecting `tv session status`, run explicit recovery:

```powershell
node examples/pine-batch.js --recover --out results/recovery.json
```

Recovery first uses the recorded target, then the native tab identity or a uniquely open recorded layout. This allows recovery after CDP target IDs change. Reopen a missing layout; if duplicates are open, pass `--target-id` with a resolved ID from `tv tab list`. Recovery refuses unrelated draft/chart changes and reports the allowed chart states. `tv status`, `tv state` and `tv tab list` remain read-only and available during recovery; they are still blocked while another batch is alive.

To explicitly abandon restoration, copy `recovery_run_id` from `tv session status` and run `tv session discard --run-id RECOVERY_RUN_ID`. This leaves Desktop as it is and archives the journal, including its saved draft, for manual recovery. A missing or mismatched run ID fails without discarding anything. Recovery snapshots are stored in the operating-system user's temporary directory; they are not committed or uploaded. Processes with different users or temporary directories do not share the cooperative lock. A killed acquisition process can leave an `.acquire` gate; inspect its recorded PID before manually removing that gate.

A corrupted journal or one without a run ID is preserved on recovery failure and cannot be discarded through the run-ID command. Inspect `journal_path` from `session status` and manually archive that file before continuing; keep its saved draft for manual restoration.

Requested history coverage is checked against the actual report range. Insufficient or unavailable coverage fails by default. `--allow-partial-history` explicitly permits a shorter range, marks `history_coverage.complete:false`, and records the actual range and warning. This is independent of the entry-signal window described above. For calendar intervals, coverage accounts for the final bar's duration.

## Result interpretation

- `metrics` preserves the CLI's raw Strategy Tester fields. In the Desktop 3.4.1 build used for validation, percentage fields were fractions: `0.02` represented 2%. Check the UI before comparing these fields across versions.
- `recentOrders` contains order events, not a complete closed-trade ledger. The CLI currently limits this query to twenty records; this example requests ten.
- The current Desktop build did not expose a per-bar equity series through `data equity`. The example does not fabricate one or substitute buy-and-hold data.
- Reports are read sequentially from one layout. Concurrent batches anywhere on the same Desktop endpoint are rejected before snapshot/mutation.

`sma-crossover.pine` is also a valid standalone Pine v6 script. Its default dates admit all available history; the batch runner sets explicit timestamps and lengths for each experiment.

## Validation

Earlier project work recorded compatible Pine and tab paths on Windows, TradingView Desktop 3.4.1.8194 (Windows Store), Node.js 24.19.0, and the Korean UI. That is separate from issue #26, which uses code review, offline fixtures and CLI contract tests and performs no Desktop run. See [the readiness audit](../docs/backtest-readiness.md) for the reviewed main SHA, evidence and first-run checks. A real Desktop run is still required to validate the changes and future TradingView releases, because the underlying UI and internal APIs are undocumented.

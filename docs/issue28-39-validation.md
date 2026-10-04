# Issues #28 and #31–#39: validation receipts

Fixed on `codex/issue-28-31-39-fixes`, [PR #40](https://github.com/Gudals0320/tradingview-cli/pull/40), code SHA `ed3f319b5675f5cf7145f0efc289a12bdf7e6946`. **Not merged.** No merge or deployment was performed. Each issue comment links this receipt and states the same branch-only status.

## Environment and evidence rules

- Date: 2026-10-04 KST. Windows NT 10.0.26200.0, PowerShell 7.6.5, Node 24.19.0, CLI 2.0.0. CDP `/json/version`: TradingView Desktop 3.4.1, Electron 41.7.1, Chrome 146.0.7680.216, protocol 1.3. Package revision was not independently returned by the package query; no more precise build is claimed.
- `npm ci` completed before execution. `node src/cli/index.js status` was the first Desktop call: exit 0, `success:true`, `cdp_connected:true`, `api_available:true`. Dedicated saved layouts/workspaces were then created. All ordinary CLI chart operations used explicit `--workspace NAME`; no `npm link`, launch, reload, broker or order operation was used.
- `npm run lint` and `npm test` passed before each implementation commit. Executor and Reviewer independently tested: `0d9046e` 483/483, `65837b5` 493/493, `b43c0af` 500/500, `ed3f319` 501/501, all lint exit 0. Reviewer used isolated Git archives and private fixture state, without touching Desktop.
- [GitHub CI run 37170496088](https://github.com/Gudals0320/tradingview-cli/actions/runs/37170496088): completed/success for `ed3f319`. The combined-status endpoint returned no legacy status entries; this is not a second independent CI claim.
- Fixture claims execute production code, including real entry-point children and HTTP/WebSocket/VM page expressions where stated. Fixtures are not live Desktop evidence. Command target/operation/run identifiers and acknowledgement hashes are placeholders; dedicated test layout URL IDs are listed for reproducibility. Named workspaces are dedicated test resources.
- Live raw CLI output is retained in the private task record; source/operation/result journals remain in the normal private LOCALAPPDATA store. Public artifacts contain sanitized summaries only. No owner token, private Pine source, live raw blob, personal watchlist symbol/name, or private storage path is committed or posted.
- The initial layout-create attempt in the sandbox returned `ADMISSION_PERMISSION`; `.git` branch creation also needed metadata write access. Normal escalation used the same default private state directory, with no TEMP state workaround. Initial network access was restricted; authenticated repository owner/push permission was verified before the approved branch push.

## Measurement revisions

| Evidence | Measurement revision | Dirty status and equivalence |
|---|---|---|
| #35/#36 offline catalog/router | `0d9046e`, independently archived; final `ed3f319` | Clean archives/final clean; full and brief byte measurements below |
| #33 duplicate/new ID opening, #34 normal list | `0d9046e` plus implementation of `65837b5` | Dirty initial live run; `openLayout`, `newTab` ID path and `readSavedCharts` are the committed `65837b5` implementation and remain unchanged through `ed3f319` |
| #37 queued quote and #31 feed transitions | `b43c0af` | Clean replay; `src/core/stream.js` is unchanged at `ed3f319`, and subsequent workspace change is only BOM validation in `pine set` |
| #38 four EOL forms/PowerShell pipeline | `b43c0af` | Clean replay; `ed3f319` adds only the leading-BOM rejection to this source path. Non-BOM EOL comparison is unchanged |
| #38 BOM rejection and #32 live summaries | `ed3f319` | Clean live raw-stdin replay. A PowerShell decoder removes BOM before piping, so raw BOM stdin was separately supplied as UTF-8 text by a Node child |
| #28 Pine runtime status 3 | `b43c0af` plus exact `ed3f319` follow-up | Dirty precommit live run; terminal-error classification and runtime harness were committed unchanged. Original saved indicator restored and saved |
| #28 native pending/recovery and watchlists | `ed3f319` | Clean replay |
| #39 Pine close and chart close | First chart workflow: `0d9046e` plus `65837b5`; indicator: `b43c0af` plus follow-up; final chart/strategy replay: `ed3f319` | Final two workflows clean. Release/show/reset production paths are unchanged from reviewed `b43c0af` |

No timing benchmark is claimed. #37 timing includes child startup, admission and native work, with readiness preparation outside the timed children; disposal is after measurement. Symbol and quote order was fixed, the real symbol holder was observed before quote startup, and network/cache temperature was not controlled. These values prove contention, not a performance comparison.

## #31 — independent feed readiness

- Each requested feed reports `status:ok/loading/error` and a feed-specific code: `DATA_NOT_READY`, `DATA_FEED_ERROR`, `FEED_IDENTITY_MISMATCH`, `FEED_STATE_UNREADABLE`, `WORKSPACE_FEED_MISSING` or `WORKSPACE_FEED_AMBIGUOUS`. Top-level success is true only when all feeds are ok; `partial_success` preserves healthy feeds while failures contain no OHLCV. Failure frames keep polling; readiness transitions participate in deduplication. Lifecycle/sample stderr records are JSON events.
- Actual identity comes from `symbolInfo().full_name/pro_name` and the pane interval, with readiness and identity checked again after sampling. `isLoading` and `isStatusError` must be boolean; missing, throwing or unknown values fail closed. Desktop main-series status was observed as **numeric 3, meaning unverified**; its explicit error predicate is used instead of guessing the numeric enum. This differs from Pine study object status type 3.
- `node scripts/smoke-issue31.mjs executor-feeds`, clean `b43c0af`: dedicated two-pane layout `X0nWZzQ6`; actual `stream ohlcv BINANCE:SOLUSDT@60 BITSTAMP:BTCUSD@60 --interval 100` saw missing → loading (`DATA_NOT_READY`, no prices) → ok. The healthy first feed remained available with partial_success. Secondary pane symbol mutation exited 0 / `pane_verified:true`. During a second real active-pane symbol load, `active_loading_secondary_healthy:true` confirmed the unaffected secondary feed still succeeded. The harness exited 0; the stream child was bounded with SIGTERM and returned that signal, not an OS Ctrl+C claim.
- Production-expression tests in `tests/owned-feed.test.js` and the actual JSONL entry-point fixture reproduce secondary loading/error/stale bars, and active-only loading with a healthy secondary. They assert no stale prices, no TypeError, numeric-status predicate handling, fail-closed unreadable signals, and status-change emission.
- Limits: actual `DATA_FEED_ERROR`, identity-mismatch, ambiguous and unreadable branches use fixtures; no real feed error was deliberately induced. Missing-feed status was also observed in the real missing/loading/ok transition, and active-only loading was exercised live. Windows signal-stop limitation is also recorded in cleanup. The production feed reader is unchanged between `b43c0af` and final code `ed3f319`.

## #35 — structured unknown commands

- Command variants: `no-such-command`, `data no-such-command`, `help --json data no-such-command`, plus global workspace/target selectors. Actual entry point: exit 1, stdout 0 bytes, exactly one stderr JSON, `code:UNKNOWN_COMMAND`, `details.command_path`, executable help hint and available commands/subcommands.
- Explicit help remains text/exit 0; bare `data` remains text help/exit 0. `help --brief` without `--json` is `INVALID_OPTION_COMBINATION`/exit 1.
- Evidence: `tests/help-catalog.test.js`, Reviewer independent CLI runs. Entirely offline; no live Desktop claim or resource mutation is needed.

## #36 — cached brief catalog

- `help --json --brief` is derived from the central full catalog. Command arguments, option types, workspace/locks/foreground/read-only/conditional execution fields are unchanged. Common error/output/provenance/options/environment contract is bootstrapped with `tv help --json` and cached by CLI/catalog version and whole-contract SHA-256 fingerprint.
- Fingerprint is identical across full/brief/filter and changes with contract changes. Default full keys remain compatible; brief requires `--json`.

| Clean `ed3f319` command | Full stdout UTF-8 bytes | Brief bytes | Exit |
|---|---:|---:|---:|
| `help --json` / `--brief` | 87,630 | 56,325 | 0 |
| `help --json pine compile` / `--brief` | 5,587 | 1,008 | 0 |

These are bytes, not tokenizer measurements. Full catalog grew with the new documented contracts; no generated catalog was committed.

## #32 — compiled text projection

- Router output projection runs after raw compiled identity, inputs fingerprint, source guard and report revision calculations. Only input `id:text` in `inputs`/`strategy_inputs` is replaced by `{id,omitted,length,sha256}`. User inputs are retained regardless of length, including the formerly broad 500-character filter in data values.
- Production VM plus actual CLI tests use a 480,000-character compiled fixture and a long ordinary user input. Wait/strategy/trades/ledger output growth stays below 16 bytes between small/large text. Text-only identity changes produce different ledger revisions, old page revisions yield `REPORT_CHANGED`, and external compiled edits still fail the workspace guard. No native evidence is truncated.
- Clean live sample: `workspace wait`, `data strategy`, `data trades`, `data ledger --limit 1` all exit 0 / `success:true`; compiled length 2,578 summarized with `omitted:true`, no `value`. Exact stdout sizes: 2,793 / 4,865 / 12,167 / 5,070 bytes. These are specific sample sizes, not a size bound on trade data.
- Compile output uses the same final boundary, including unchanged compilation. Raw/debug compiled output is not offered. The linear-growth measurement is fixture evidence; live confirms the summary shape.

## #34 — saved-layout lookup failures

- Production `readSavedCharts` + actual entry point: normal `[]` is successful empty list; normal list is successful; synchronous throw preserves `SYNTHETIC_LAYOUT_READ_FAILURE`; callback timeout and non-array/missing-ID responses produce `LAYOUT_LIST_TIMEOUT` / `LAYOUT_LIST_MALFORMED`, exit 1. Late callbacks cannot start later navigation.
- `openLayout` propagates failed lookup and calls no `newTab`; source-of-error is preserved. Live saved-list lookup and successful opening were verified.
- Limits: throw, timeout, malformed and late-callback branches are fixture-only; no broken API was injected into the actual Desktop.

## #33 — exact layout IDs

- Two newly saved layouts with the same name and one saved layout named `new` were opened by exact IDs. Actual returned `chart_id` matched each requested ID (`PKABX6xs`, `OgRlJ3Jn`, `OXl62tBq`), exit 0, `layout_opened_in_new_tab`.
- Create/open are explicit core arguments; exact IDs never become display names or the `new` sentinel. Name opening requires a unique exact name; partial name matching is rejected. `new`/`NEW` fixtures remain open operations. Legacy `tab new --layout new` is explicitly documented as a creation sentinel.
- URL ID mismatch is a structured failure carrying the new target for inspection. **Mismatch and `NEW` negative branches are fixture-only.** Actual opened targets and saved layouts were preserved until controlled cleanup; no preexisting `new` resource was used.

## #37 — admitted quote restoration

- `scripts/smoke-issue37.mjs`: prepare ETH; start `symbol SOL`; observe its real holder; start `quote BITSTAMP:BTCUSD`. Clean `b43c0af` replay: symbol exit 0 in 1,266 ms, quote exit 0 in 2,654 ms, `provenance.locks.waited_ms:1221`, `waited_for` contains `symbol`.
- Quote reports BTC, `restored:true`; final context/state SOL; `show.state:idle`, `interrupted:null`; subsequent `timeframe 60` and state succeed. Both readiness preparations and later cleanup are outside these child timings.
- Page guard establishes the execution baseline after FIFO admission; Node journal matches that restore identity. Queued target/resource changes fail before dispatch. Deterministic admission fixture proves the waiting baseline advances from ETH to SOL. Real external symbol changes still fail; existing actual restoration-failure tests remain enabled.

## #39 — target-lost release/cleanup

- Chart-only and saved-Pine live workflows: normal `tab close` exit 0; `show` is `target_lost`, operation/interrupted null; release exit 1 / `WORKSPACE_TARGET_LOST`; second show remains target_lost with interrupted null; its exact named reset exits 0, `artifacts_preserved:true`, `desktop_changed:false`; name is released and saved layout remains.
- Bound target_lost suggests explicit saved-layout open/reconnect with exact generation or confirmed reset. Interrupted+target_lost and null binding suggest only confirmed exact reset/abandon; no unusable reconnect or `undefined` generation. Real entry-point tests execute suggested resets for chart/Pine and all three states.
- Pine indicator initially had an unsaved layout. Close returned exit 1 / `tab_close_pending`, detected and dismissed the confirmation; nothing was discarded. Its known save button was then clicked to preserve the dedicated layout, after which close succeeded. A later chart save-button lookup was unavailable, but normal close succeeded without a dialog; no state was guessed from that failed UI lookup.
- Real dispatched native timeout remains interrupted and recovery is refused while pending; see #28. Preflight target absence/disconnection never proves native completion. Live reset only concerned confirmed normal test tab closure.

## #38 — strict EOL source verification

- `scripts/smoke-issue38.ps1`: actual LF, CRLF, mixed final CRLF, lone CR, and `Get-Content -Raw | node ... pine set` all exit 0; full `pine get` source matches after physical EOL normalization. File cases share one normalized hash; the pipeline adds a final newline, which is preserved and separately verified.
- Source edits produce `REPORT_INVALIDATED`/exit 1. `pine compile --save` then exits 0 with `compiled:true`, `saved:true`; `data strategy` succeeds. Character, whitespace, indentation, BOM and trailing-newline differences are not trimmed away.
- Additional BOM experiment on clean `b43c0af`: Monaco removed the leading BOM after setting, strict guard reported `WORKSPACE_EXTERNAL_CHANGE` and preserved an interrupted journal. Exact recovery command: `node src/cli/index.js --workspace executor-issues workspace recover --operation EXACT_BOM_OPERATION --rebind`; exit 0, `recovered:true`, adopted source only. Actual readback matched the known synthetic source with BOM removed; normal compile/save succeeded. This is recorded as a failed experiment, not as a passing BOM result.
- Follow-up `ed3f319`: leading BOM file and **raw** stdin return exit 1 / `PINE_SOURCE_UNSUPPORTED_BOM`, `editor_changed:false`, `results_invalidated:false`; source hash unchanged, workspace idle/interrupted null. Actual entry-point fixtures assert no CDP request, no new admission journal or filesystem changes. PowerShell's text decoder strips BOM itself, so its decoded pipeline was treated as a normal source/EOL edit, not claimed as raw BOM rejection.

## #28 — diagnostics, recovery and complete watchlist arrays

1. Permission diagnostics: injected EACCES/EPERM preserve errno/syscall, gate existence and safe owner pid/liveness without token. Real competition distinguishes permission using an independent write probe because Windows EPERM can race with gate removal. Permission injection is fixture-only. Six concurrent-process admission and FIFO tests pass; actual queued contention is #37.
2. Native/batch status exposes normalized target(s), panes, command and phase without source/token. Only diagnostics matching the actual journal hash are used. Wrong/missing run ID and mismatched target preserve prior diagnostics byte-for-byte; hints use the journal's run ID.
3. Native sources: Pine 0/1 busy, 2 idle, 3 terminal_error; arbitrary/missing values unknown. Auxiliary completion uses observed status/loading, never ESD name. Actual dedicated crypto/equity/derivative ESD sources observed type 2/loading false; original auxiliary type 1 was **not reproduced live** and remains unverified/unknown. Actual dedicated Pine runtime array error: compile exit 1 / `PINE_RUNTIME_ERROR`, native status 3/loading false, quiescence `ready:true`; original saved indicator restored and saved. Pine type 7 remains protected and is excluded from auxiliary acknowledgement.
4. Exit from auxiliary-only unknown: explicit `session recover --run-id EXACT_RUN --acknowledge-unknown EXACT_HASH` requires human confirmation. Hash binds exact journal bytes, run, target/generation and observed unknown set. Other native signals must be idle/readable; three probes must stay identical. Archive retains original journal bytes; result is `recovered:false`, `restoration_abandoned:true`, `outcome:unknown`. Changed hash/state, Pine unknown, busy, disconnected or target-lost cases retain the fence. This opt-in is **synthetic fixture evidence only**, not automatically used against a real unknown source. Target-lost archival also keeps external save/alert outcome unknown. Operations/diagnostic hints and human procedures are documented in `docs/errors.md`.
5. Real native protection: `scripts/smoke-issues-recovery.mjs` dispatches a page-local 3-second delayed eval on a dedicated workspace, with 500-ms CDP deadline. Exit 1 / `CDP_TIMEOUT` records interruption; exact recover while native pending returns `WORKSPACE_NATIVE_BUSY`; after settlement exact recover exits 0; workspace idle/interrupted null and subsequent state succeeds. No chart or source change was dispatched in that probe. Private-draft, live-owner, missing/unreadable-target and unknown external-effect regressions remain enabled offline.
6. `watchlist raw --list-id ID` / `--list-name NAME`: actual eight custom API lists plus one already-mounted colored native list were read without selecting/changing/removing a list. Full ID/name arrays exactly matched the independent source arrays, preserving sections, formulas, exchange notation, multiplier characters and order. Custom counts: 59, 63, 57, 186, 117, 219, 14, 3. Mounted colored raw_count 19 vs rendered_count 16 **DOM symbol rows**; section rows are not part of rendered_count. Other/unmounted selected lists correctly return rendered_count null. Public proof uses counts/hashes only. Duplicate entries are synthetic fixture-only (actual tested lists had none). Scope: custom lists and currently mounted colored native list; an unmounted colored list is not selected or inferred and may return notfound.

## Dedicated resources and final cleanup

- Created seven saved layouts: `K2HsL56g` (strategy), `PKABX6xs`/`OgRlJ3Jn` (duplicate names), `OXl62tBq` (`new`), `yZFSBpuH` (initial chart close), `X0nWZzQ6` (two feeds), `I8idjmGn` (indicator). Created two dedicated saved Pine documents. All seven saved layouts and both documents are intentionally retained as reproducible artifacts; no layout/document deletion was attempted.
- Closed all ten test chart tabs: six duplicate/new creation/open tabs, chart-close tab, feed tab, indicator tab and strategy tab. Duplicate/new cleanup checked exact CLI creation proof, exact target/layout and no modified editor draft before close. It touched no preexisting tab. Four named test workspace registrations were reset after confirmed tab closure; private results/journals are preserved.
- Initial six user chart targets remain; initial selected tab restored. Extra targets/foreign resource holders created concurrently by another actor were observed and left untouched. No force-clear, PID kill, foreign source edit or automatic native abandonment was used. End-of-run legacy session is unlocked with recovery_required false; own test layout targets remaining: 0. Foreign activity is not claimed as this run's cleanup residue.
- Streams were bounded and stopped by the harness with SIGTERM; on Windows this returned a termination signal rather than exercising an OS Ctrl+C handler. This limitation is separate from JSONL feed correctness.

## Review and delivery gate

Reviewer approved all ten issues at `ed3f319` after independent lint/501 tests, reviewed the failure/limit distinctions, and matched PR #40's 47-file diff to the exact code commit. Issue comments are posted only after receipt agreement, then completed issues are closed. The final receipt-only commit does not change implementation; its head SHA and CI are checked separately before marking the PR ready. Main remains `788674940ce5b79112f8265afde19ca8cbfde6c3` until a separately authorized merge.

# Issue 14 — independent CLI validation

Completed on 2026-10-01, Windows Korean TradingView Desktop 3.4.1, Electron
41.7.1, Node 24.19.0, one Desktop and CDP port 9222. No launch, restart,
second instance, second port, login or user chart/source modification was used.
The original target `D1AFFCCBC3A67669FD97D434AADFB942` / layout `KHbeIfLo`
remains open and active. Its identifiers and the final tab inventory are recorded;
pre-existing user Pine source was not collected.

## Implementation and command contract

`tv workspace init` reserves distinct exact targets, saved layouts and saved Pine
documents across CLI invocations. Each call has its own operation token, journal,
result and recovery. Different workspaces run in independent OS processes. Only
short filesystem metadata transactions share a gate; Desktop preparation,
source application, compilation, native calculation and result collection do not
hold it. No execution queue, pipeline, global workspace execution lease or
alternating tab focus is used.

Legacy commands acquire an endpoint lease rather than a check-only admission.
They cannot bypass reserved resources with `--target`, UI/eval, batch, hostname
aliases or launch/restart. The 19 target-local commands, explicit administration
and unsupported shared operations are listed in [the support matrix](../../../docs/workspace-commands.md).
Normal Pine QA behavior is preserved, including identical-source reuse, explicit
save permission, accurate save/compile failures and stable study identity.

Connection, page nonce, chart/controller references, native layout UID and document
ID are pinned. Source/context/inputs are checked before and after async actions;
synchronous expressions have same-turn guards. Compilation may legitimately change
the owned study's schema/defaults; a GUI edit to that same study during compilation
can be indistinguishable and is a documented limit. Older/non-cooperating clients,
different users/TEMP directories and direct external modification are not physically
excluded. Corrupt ownership fails closed. Older-format leases on another hostname
without a port field remain outside the cooperating-client guarantee.

## Performance

Each job includes CLI process startup, CDP attachment, guarded input mutation,
verified calculation, strategy metrics and **all** ledger pages, through the final
child exit after its result commit. Wall clocks use millisecond `Date.now()` on
the same host. Raw operation status/report events bind native start/end to the
requested inputs. Warm-up was declared excluded before measurement. No failures
or retries occurred in the accepted sets.

| Workload | Repetitions | 1-worker | Parallel | Throughput |
|---|---:|---:|---:|---:|
| Light full CLI workflow, 8 jobs | ABBA twice, 64 jobs | mean 16.868 s | 2: 8.632 s | **1.954× (+95.4%)** |
| Heavy fresh inputs, 4 jobs, 1500-loop script | cold ABBA, 16 fresh + 16 repeated jobs | mean 21.118 s | 2: 10.708 s | **1.972× (+97.2%)** |
| Heavy repeated inputs, secondary metric | same matched cohorts | mean 6.189 s | 2: 3.324 s | 1.862× |
| Light full CLI workflow, 8 jobs | ABBA, 32 jobs | mean 16.779 s | 4: 4.934 s | 3.401× |
| Heavy fresh inputs, 8 jobs, exploratory | one fresh trial per mode, matched repeats | 40.071 s | 4: 10.587 s | 3.785× |

The light set spends approximately 5–13% of job time in native lifecycles, so its
gain primarily measures CLI workflow concurrency. The heavy primary set uses
disjoint fresh inputs A100–107/B120–127, balanced first/repeated request order
`1,2,2,1,2,1,1,2`; each mode has two fresh trials. Fresh native lifecycles account
for **70.3%** of job time. Two-worker fresh native overlap is **6.987/7.035 s**,
most of the shorter worker's native total. Individual native durations do not
increase in parallel. These are target calculation lifecycle measurements,
including server/network response, not CPU-only instrumentation.

Four-worker heavy input sets are a200–203/b220–223/c240–243/d260–263. All results
match their paired repeated requests. Maximum observed simultaneous native
lifecycles is four; pairwise overlap totals 41.675 s. Fresh individual durations
are 3.498–3.817 s with one workflow and 3.500–3.919 s with four. Saturation was
not observed at this scale. The single fresh trial per mode makes this exploratory,
not a general scaling guarantee. Light four-worker inputs overlap between workers,
so shared cache effects cannot be excluded.

Cache behavior is disclosed: the first 500-loop pilot dropped from ~1.5 s to
~0.1 s for repeated inputs. A 1500-loop pilot accidentally reused inputs seeded
by preparation; it is retained and not used as the primary fresh comparison.
The primary 1500-loop set uses previously unrequested values, with first/repeated
native duration ratios 267–521×. The cache location (target/account/server) was
not established. Repeated-response speed is a secondary workflow metric.

### Correctness

The aggregators independently decode every gzip job. They require the operation's
cycle to increase, status `1→2` / ready-report events, current input values and
workspace/target/layout/Pine provenance. Complete ledgers and all strategy metrics
match across modes; only the two live-ticker buy-and-hold reference fields were
excluded **before** comparison. No later exclusions were added. Last-bar timestamp
is recorded; the primary two-worker sets share `1790848800`, have zero open P/L
and no open trades. Heavy/4-worker sources close positions at 2026-09-30 UTC.
Results change with inputs, so successful jobs are not unchanged shortcuts.

## Preparation, saving and cleanup costs

The four-resource preparation records **30.480 s**, including prior lease release,
creation of C/D layouts, context setup, source saving/compilation, mounting,
restoring the original tab and registering all four resources. Warm-ups are
recorded separately: light two 2.322 s; heavy two 5.292 s; light four and heavy
four are in their summary files. Saving only occurred for new or changed test
sources. Repeated identical-source save/compile retained the saved version.

Initial A/B preparation includes a failed inactive-editor mount (30 s) and separate
manual CLI preparation; its entire cold creation cost was not captured by one
timer. Raw preparation and that failure are preserved. Neither cold setup nor
one-off cleanup was hidden inside the quoted warmed throughput numbers. For a
single 8-job four-worker bundle, adding the measured shared 30.480 s preparation
cost gives 47.259 s (one workflow) versus 35.414 s (four), before warm-up and
cleanup; long sweeps amortize that common fixed cost. This arithmetic is not a
separately measured cold-run benchmark.

Fixed 1280×800 viewport/focus emulation was applied only to dedicated targets.
Initial Pine mounting selected dedicated tabs during preparation, then restored
the original native tab. Every benchmark's active native tabs were unchanged;
all workers used exact inactive native targets. Emulated page visibility/focus
is explicitly distinct from native shell selection.

Cleanup measures **17.907 s** of executed operations, including fault probes,
target closure, reservation release and tab closure. It initially left the shell
entry of the deliberately destroyed D target; the recorded D shell-tab ID was
closed explicitly. The first attempt and wall time including diagnosis are
retained. Final state: **zero registrations, zero test tabs, original tab only,
legacy state success**. Four saved test layouts/documents and private recovery
artifacts are intentionally retained as reproducible fixtures; cloud deletion
was not performed or included in cleanup cost.

## Isolation and failure evidence

- All 19 allowed adapters ran on Desktop; equity accurately returns
  `EQUITY_UNAVAILABLE` in this build and does not mark the workspace interrupted.
- A symbol/timeframe/source edits leave B's document, source and context unchanged.
  A save/compile and B input calculation complete concurrently.
- During native calculation, save and compile, A is killed after observing the
  corresponding pending state. B completes its own input/report; only its requested
  `in_0` changes. A recovers with its exact operation ID; wrong IDs fail.
- Reload loses generation and may reopen the globally most recent document.
  Rebind requires generation change; `--restore-document` opens only the recorded
  owned version, refuses foreign drafts, and leaves the loaded B snapshot unchanged.
  If editor/applied versions differ, both sources are verified before input-only
  report acceptance. Modified compile saves once and targets the actual old version.
- D target loss while B calculates: D fails `WORKSPACE_TARGET_LOST`, offline abandon
  releases only D, and remaining workspaces still block legacy access.
- A simulated dead metadata transaction while B calculates is inspected and cleared
  with its exact dead token; B completes correctly. No unrelated lock/result/journal
  is discarded.
- Actual two/six OS process fixtures cover atomic collision, PID termination,
  token/resource tampering, 90 concurrent admission/finalization transactions,
  clean failures, alias/launch races and recovery-only acknowledgement.

## Reproduction and provenance

```powershell
$env:TRADINGVIEW_SKIP_NETWORK_TESTS='1'
npm test
npm run lint
node qa/parallel/issue-14/summarize.mjs
node qa/parallel/issue-14/summarize-heavy.mjs
node qa/parallel/issue-14/finalize-evidence.mjs
```

Live scripts require dedicated prepared targets and fresh private handles, whose
IDs change when reopened. Follow [workspaces.md](../../../docs/workspaces.md)
to provision/register exact resources; never substitute the user's original chart.
`prepare.mjs`, `validate-live.mjs`, `faults.mjs`, `reload-compile.mjs`,
`prepare-heavy.mjs`, `benchmark.mjs`, `prepare-four.mjs`, `benchmark-four.mjs` and
`cleanup.mjs` preserve commands and checks. All use 9222; none launches Desktop.

Measurement revisions are recorded: light two `246888d` (revision annotated after
the run), successful faults `682ba7e` (initial uncommitted changes committed during
the run), heavy primary `8b43579`, light four `b70ae65`, heavy four `ef01ea5`.
Heavy/four production diffs were empty at start; overall dirty status comes from
untracked evidence. Retrospective records explicitly say when no start diff hash
was captured. Later production changes harden metadata admission and do not alter
the measured calculation/report path; the report does not relabel old measurements
as final-revision reruns.

The interrupted 112-MB monolithic logging attempt (40 jobs complete, evidence write
failed) is compressed and excluded from acceptance. Per-job gzip records avoid
that failure. Their raw hashes, sizes and privacy checks are in
[`live/artifact-manifest.json`](live/artifact-manifest.json). Private workspace
handles/owner tokens and `.tv-workspaces` journals remain ignored. Generated fixture
sources are public test code; no cookies/authentication secrets or pre-existing
user Pine source are in the evidence.

Final unit suite and lint results are retained in `offline-tests.log`. Reviewer
independently checked code, fixtures and raw 1/2/4-worker evidence. The branch has
multiple meaningful implementation/fix/QA commits, and no PR or merge is created.


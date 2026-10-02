# Issue 29 validation record

Date: 2026-10-02, Asia/Seoul. Implementation starts at main 17d170fc; stage commits
remain separate. Code SHA: `3c05604df6d28e0abf244878deef0edb6465d77a`.
Documentation SHA is the report-only commit containing this revision, resolved
with `git log -1 --format=%H -- docs/issue29-validation.md`; its exact hash is
recorded separately in the PR and ignored final-manifest.json. Live evidence
records the code it actually ran, not the later documentation SHA. No merge or
deployment is performed.

## Reproduce and classify evidence

Offline: npm ci, npm run lint, npm test (481 tests). The Reviewer independently
cloned fixed candidates and ran tests five consecutive times, six-process
admission20 times, 8×1s/16×200ms conflicting queues, killed holder/waiter recovery
and PowerShell5.1/7.6 contracts. All passed; queues/holders were empty afterward.
`scripts/stress-workspace-locks.mjs 20` reproduces stress separately from Desktop.

Accepted live evidence: final-parallel-3c05604.json and
final-lifetime-3c05604.json both pin code SHA3c05604 with dirty:false;
final-protection.json pins SHA6d2c21e with dirty:false and7/7 checks. The3c05604
runtime diff changes only completedResult capture order, catch error details,
best-effort finish arguments and acquireWorkspace dependency injection, with a
metadata-finish regression test. The protection force-kill scenario kills its
child process and therefore does not run that catch path. It changes no native
dispatch or protection behavior. Reviewer accepted this impact analysis. The
final documentation-only commits do not rerun harnesses or create more resources.

Live harnesses use **explicit dedicated names**, not arbitrary active charts:

```powershell
node scripts/smoke-workspaces-desktop.mjs --workspace-a qa29a --workspace-b qa29b --observe-from USER_TARGET --out results/issue29/final-parallel.json
node scripts/smoke-workspace-protection.mjs --workspace qa29b --draft-name DEDICATED_DRAFT_NAME --out results/issue29/final-protection.json
node scripts/smoke-workspace-lifetime.mjs --name DEDICATED_LIFETIME_NAME --connection-workspace qa29a --out results/issue29/final-lifetime.json
```

Raw evidence remains in ignored `results/issue29`; compiled text is hashed in the
parallel harness, private source/tokens are never committed. New draft/lifetime
resources are included in their returned manifests. A later rerun must record its
additional resources rather than silently deleting them.

## Completion checklist

| Criterion | Evidence and practical limit |
|---|---|
| No selection rejects work; preparation/offline usable | real-entry-point cli-contract and policy/catalog tests; live explicit names; version/help/list remain offline |
| Terminal selections independent; explicit designation nonpersistent | powershell-selection tests in5.1/7 plus two live processes selected qa29a/qa29b, explicit opposite workspace, selected env unchanged and User/Machine env unchanged (session-a/b.json) |
| Other tab selected; only owned target changes | final-parallel foreground_at_start is an unrelated original user tab; target/source/context ownership guards and private before/after comparison |
| Independent connection/calculation/results | A/B compile and input changes overlap; native started/completed calculation events overlap on distinct targets/documents; reports carry revision/pendingfalse and actual context |
| Stream with other workspace changes | A quote stream samples identify workspace/target/generation while B timeframe changes; observation holds no mutation lease |
| Same resource sequential; status/wait during work | queue result waited_ms plus waited_for owner; wait completion after overlapping admitted/queued changes with latest inputs/context; workspace-wait race regression |
| Chart-only without editor | initial qa29a init/symbol live result pine:null; workspace-page chart-only fixture throws if editor touched; lifetime chart-only remains functional |
| Unrelated journal/pane/target failures do not block | resource-lifetime legacy target/app fence fixture, recorded-pane0 recovery ignoring loading/calculating pane1 native-fault fixture, partial inventory test |
| Lifetime/generation/connection differentiated | explicit same-target reconnect ends old stream GENERATION_CHANGED; only newly created lifetime tab closed, stream exits1 and state target_lost; unreachable127.0.0.2 returns disconnected exit2; healthy original endpoint resumes |
| Draft/external/save/report protections | live protection7 checks below; workspace-page foreign draft/source/permit tests, pine_lifecycle persistence fixtures, strategy_state and workspace-runtime report tests |
| All docs/help/examples/PowerShell/scripts consistent | strict documented-arguments + generated catalog/policy coverage; README, AGENTS, docs, named batch, three smoke harnesses; old aliases removed |
| v1/global/file/script migration | version2 breaking contract documented; schema1/2 released-handle import, reservation-only old-gate projection and legacy-state recovery fixtures |
| Lint/offline/live verification separated | offline tests and stress above; live evidence pins SHA/dirty/target/time; unverified areas below |

Protection smoke checks: expected document mismatch dispatches no save; unknown
inputs are rejected atomically; native numeric strings retain string type; a
report read never unhides a strategy; a held owned translation is force-killed
with its CLI process, LOCK_HOLDER_DEAD blocks mutation, pending recovery refuses,
then ending the held promise allows exact recovery/lock-clear without reload;
SIGINT handler leaves JSONL only/no mutation owner; actual unmodified scratch
draft save returns saved:false/persistence_kind:draft and chart-only CLI save
rejects before editor mutation. The hidden strategy read returned REPORT_PENDING
(exit1), so **hidden report-read success is not claimed**.

Remaining old graphical extraction coverage is offline: data-contracts/extraction
tests retain blank table columns, label order/native shape and compiled-text
exclusion. Source persistence, failed callback fencing and exact applied identity
remain in pine_lifecycle/pine_compile/pine_outcome/native-faults/strategy_state.
G2/H1 regressions preserve completed_result and distinguish unconfirmed metadata
commit/release from verified native completion, preventing blind replay.

## Resource and original-state record

The original selected tab and window minimization were restored after testing.
Reviewer independently checked selection, minimized visibility and empty
locks/recovery state. No preexisting resource was deleted or edited; no app kill
or tab reload was used. Private before/after comparisons verify preservation.
Unseen GUI draft bytes are not claimed as verified.

Exact layout/document/target/registry identifiers and Desktop snapshot details
are retained only in ignored local `final-manifest.json`, `after-tabs.json` and
`after-state.json`. The public report uses test aliases and resource counts.

| Newly created resource | State/handling |
|---|---|
| qa29a | saved layout/tab and dedicated saved document retained for review |
| qa29b | saved layout/tab and separate document retained; protection restores original source/type/visibility |
| qa29life | saved layout retained; only its own created tab closed by lifetime harness |
| qa29lifefinal | saved layout retained; only its own created tab closed |
| qa29draft | generated unmodified draft/tab retained; reservation released after explicit chart-only state acknowledgement |
| qa29draftfinal | generated unmodified draft/tab retained; no forced close/save/discard |
| Saved test documents A and B | newly created independent strategies retained; IDs remain private |

Duplicate saved document reservation was also rejected live on the distinct
released scratch layout (WORKSPACE_CONFLICT: pine already reserved), but
duplicate-document.json did **not** record a SHA. The offline counterpart is
`tests/workspace.test.js`: "rejects duplicate target, layout and document
reservations". No preexisting
resource was deleted/edited. Draft tabs may show save/discard confirmation when
closed; they are retained, with explicit user choice required later.

Final totals:6 saved layouts,2 saved Pine test documents,4 retained test tabs
(2 with generated drafts),6 name-registry entries. Idle reservations3 are kept
for review;2 lost-target records preserve lifetime evidence and1 is released.
Resource holders and queued tickets are empty; session recovery is not required.

| Registry test alias | Final state and later cleanup |
|---|---|
| qa29a | idle, retained for independent-strategy review; `tv --workspace qa29a workspace release` frees its reservation and retains layout/document/tab |
| qa29b | idle, retained for protection review; `tv --workspace qa29b workspace release` frees its reservation and retains layout/document/tab |
| qa29draftfinal | idle, retains actual draft evidence; inspect and explicitly acknowledge chart-only baseline with reconnect and exact generation before release if external-change protection rejects it; leave the draft tab for the user's save/discard choice |
| qa29life | target_lost, retained lifetime record; `tv workspace reset qa29life --id WORKSPACE_ID` removes reservation/name, preserving artifacts and stored layout; obtain the exact ID from workspace show |
| qa29lifefinal | target_lost, retained final lifetime record; `tv workspace reset qa29lifefinal --id WORKSPACE_ID` removes reservation/name, preserving artifacts and stored layout; obtain the exact ID from workspace show |
| qa29draft | released, keeps name and draft tab for evidence; exact-ID reset can remove the name later, while the draft tab still requires the user's save/discard choice |

No cleanup action forces a save/discard, closes the retained tabs or deletes
stored layouts/documents. Private evidence is intentionally excluded from Git.

## Unverified boundaries

App termination/restart was **not exercised live** to protect original user state;
browser generation/transport/target fixtures verify the bounded explicit policy.
There is no daemon to stop/restart: process termination is tested via actual killed
CLI/holder/waiter processes and held native promises. Live SIGINT is emitted as a
Node process event using the registered handler; OS console Ctrl+C injection is
not claimed. GUI-only unsaved draft restoration after app/tab loss is not promised.
Background arbitrary UI and deep backtesting remain unsupported. Minimization can
prevent editor/UI initialization; restoring the existing window is required.

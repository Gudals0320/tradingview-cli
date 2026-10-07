# 2.3.2 acceptance evidence

All offline entries below are fixtures, not live Desktop claims. Live evidence was
collected on 2026-10-07, Windows/Node 24.19.0/Desktop 3.4.1, using only newly created
dedicated resources. Private raw outputs, source, identities and screenshots are
excluded from Git. F1 match-count evidence is rechecked against the final commit.

Fixture shorthand (the named tests are in these files):

- H: `tests/chart_history.test.js` (synthetic overlap/outside/readiness; termination;
  20419 old period; time cursor append/tick/prepend/correction/identity; final page;
  loading settles/bounded guard).
- S: `tests/symbol-search.test.js` (after result 15; provider remaining/blocked/schema;
  CLI filters/count/offset forwarding).
- P: `tests/preflight-capture.test.js` (state digest; process identity; incomplete
  recovery summary; changing operation; capture selectors; API no fallback; partial
  multiple matches; target absence/layout mismatch/duplicate).
- C: `tests/cli-contract.test.js` (real period OHLCV CLI and real named preflight).
- G: existing workspace/page/runtime/wait/privacy/Pine/ownership suites; new
  `workspace-page` test excludes observation fields from identity comparison.
- D: help-catalog/documented-arguments/version tests.

| Issue / acceptance checkbox | Implementation location | Offline evidence | Live evidence | Limit |
| --- | --- | --- | --- | --- |
| #57 period and large-window cursor | core/data:getOhlcv | H 20419 + cursor; C period CLI | OP/480 two pages; Reviewer ETH/480 100/100/74 | loaded history only; load first |
| #57 requested/loaded/returned and count/period distinction | chart-context:historyCoverage; data:getOhlcv | H old-period flag assertions; C | Reviewer 274 bars, boundaries inclusive, period flags | envelope only, not continuity |
| #57 missing extent/loading termination | chart-context:historyCoverage; chart:setVisibleRange | H satisfied/feed_end/unknown/guard and loading-settles | QA2 requests 3/satisfied; future error unknown | unreadable availability stays unknown |
| #57 20419 old bars outside latest 20000 | data:getOhlcv | H named 20419 fixture | not replayed with 20419 live bars | fixture scale claim only |
| #57 context change/no interpolation/session gaps | chart-context:chartIdentity; data:getOhlcv | H cursor/tick/prepend/correction/identity and gap removal | live cursor pages without duplicates; QA1 foreign symbol refused | last bar complete and internal gaps unknown |
| #57 catalog/help/compatibility and fixture/live separation | commands/data; arguments; docs/history-export | D, existing count CLI C | scoped QA flows above | catalog schema 2, fingerprint changes |
| #58 CLI truncation vs provider limits | chart:symbolSearch | S after15/remaining | anonymous endpoint HTML/403 | native paging unverified |
| #58 exchange/type/count/pages | commands/chart; chart:symbolSearch | S CLI forwarding; local offset/count | provider unavailable | offset is a fresh-response slice, no stable remote cursor |
| #58 unknown total vs returned count | chart:symbolSearch provider metadata | S null total/remaining cases | no provider JSON key list obtained | returned count is never inventory total |
| #58 preserve provider identifiers/product type | chart:symbolSearch | S prefix-only full_name/type/provider_symbol | no live identity resolution claim | no automatic alias/substitution |
| #58 target after16 + truthful truncation | chart:symbolSearch | S result18 via next local slice | fixture only | provider ordering may change |
| #58 catalog/help/old invocation | commands/chart; docs/symbol-search | D; S default15 | old endpoint blocked | defaults preserved |
| #59 preserved log chronology/context/cause limits | docs/history-export OP investigation | old source/log comparison + H | not the historical incident | empty/loading is plausible, unproven cause |
| #59 common symbol/resolution/pane/series/time/loaded diagnostics | chart-context:readChartContext; chart:setVisibleRange; data:getOhlcv | H synthetic common context; G identity projection | live contexts expose identity/units and loaded envelope | unavailable pane/series fields null |
| #59 range error requested/actual extent | chart:setVisibleRange | H actual outside + empty/loading/feed | Reviewer future RANGE_OUTSIDE_DATA with loaded3300 | true scan absence differs from loading |
| #59 owned synthetic overlap/nonoverlap regression | H fixture OP/BTC*1e6/480 | H overlap/outside/loading/empty | OP cursor; QA2 range3; Reviewer inside/future | live range diagnostic uses ETH, not incident reproduction |
| #59 dedicated live/protection | existing workspace guards | G unchanged | QA1 external symbol blocked before handler; QA2 dedicated | actor unknown; no reload/unlock/draft replacement |
| #60 survey existing fields vs integration | docs/preflight-capture table | code audit show/status/locks/wait/recover | preflight combined output | no claimed missing field that already existed |
| #60 readonly connection/generation/operation/owner/context/action | workspace-preflight:workspacePreflight | P state/digest/process/context; C real CLI | Reviewer connected/none/empty locks/context | recorded generation not page verification |
| #60 recovery context/generation/incomplete summary | workspace:recoverWorkspace; preflight:recoverySummary | P recovered/incomplete/generation/context | no induced dead operation live | original remaining work still needs resumption |
| #60 identity is not PID existence; unknown stays unknown | process-identity:ownerProcessState | P start mismatch/EPERM/unreadable identity | idle owner none | existing conservative ownership gates unchanged |
| #60 no replay/force unlock/foreign mutation | preflight independent HTTP path | C pageCalls0/no admission; G protections | QA1 retained; QA2 only | no recovery automation added |
| #60 readonly hash + incomplete recovery fixture | P + C | full state digest before/after; P summary | Reviewer entire private state digest equal | recovery summary fixture, no unsafe live interruption |
| #61 backend/requested/actual/pane/crop coordinates | capture:captureScreenshot/captureRegionMetadata | P primary/alternate/no selector/API/PNG | chart1551x1249 and full2560x1358 image/header agreement | selected pane unknown if unmappable |
| #61 DOM selector/fallback and API source | capture functions | P alternate/full_page/API no hidden fallback | primary DOM selector observed | selector absence/API fixture only |
| #61 axes verified vs unknown | capture metadata | P unknown assertions | visual chart images omit price/time axes | API returns unknown, no visual inference in CLI |
| #61 editor open/closed/multi/no selector image comparison | capture functions; docs/preflight-capture | P no selector/partial matches | editor open confirmed; full includes it, chart excludes; two-pane first plot | close API ineffective on right editor; closed response isn't proof |
| #61 path compatibility/owned/foreground protection | capture:captureScreenshot; existing policy | P file/API and G ownership; D catalog | scoped QA2 CDP captures on selected owned tab | no hidden target fallback; invalid region now errors |

## Independent review and resource evidence

Reviewer separately read the code and ran live preflight/three-page OHLCV/range
inside+future/chart capture on QA2. The preflight digest was unchanged, the OHLCV
pages had zero duplicate timestamps and exact requested endpoints, and returned
metadata agreed with the observed chart image. Fixture lint/test results are
reported separately from this live check. Mandatory R1/R2 were corrected; R3 was
withdrawn after confirming snapshot.context already projects identity only.

QA1 creation changed foreground (tabs8→9); all previous tab/layout identities
remained. Its OP chart changed externally to ETHUSDT between 10:54:41 and
11:00:33 UTC. No Executor mutation occurred between the successful cursor read
and protected range entry; the handler/probe/loading did not run. Old main and new
readers agreed on the different symbol. The actor is unknown. QA1 and its records
remain untouched, without rebind/unlock or original research restart.

QA2 creation added another dedicated foreground tab. Source was never edited,
saved or compiled. Its layout returns to one pane; the newer right Pine editor
remains open because the existing panel-close action did not close it. After
independent verification, QA2 workspace ownership is explicitly released while
its saved layout/tab and local evidence remain. No user foreground is guessed or
restored. No existing resource is deleted.
The separate panel-close defect is tracked in
[issue #62](https://github.com/Gudals0320/tradingview-cli/issues/62), with sanitized
reproduction and the tested SHA. It is not marked fixed by this release.

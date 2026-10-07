# Symbol search

The old query-only invocation still returns at most 15 results. `count` is the
returned count, never the total inventory. `--exchange` and `--type` are passed
unchanged as provider exchange/search_type filters. Product types and native
identifiers are preserved; no alias, spot, mark or derivative replacement occurs.

```sh
tv search CONTRACT --exchange BINANCE --type futures --count 100
tv search CONTRACT --offset 15 --count 15
```

`--offset` selects within a freshly fetched response. It does not persist a search
snapshot and is not a verified native provider cursor. Result ordering can change
between calls. `response_count` and `cli_truncated` describe the local response;
`provider.total` remains null (unknown). A supplied `symbols_remaining` is reported
only if it is a nonnegative integer; absence means unknown. Provider pagination
and limits are explicitly unverified. Increasing count or narrowing exact filters
can reveal a contract after result 15 in the same response.

On 2026-10-07 the live anonymous endpoint returned HTML/403, and alternate public
fetch probes also returned challenge responses. Native `start` support could not
be verified; no live provider key list or native next-page success is claimed.
Offline response fixtures verify the local slice/filter contract. HTML, blocked
HTTP and malformed schema produce structured errors, without login/cookie fallback.

# Named workspace examples

Prepare a dedicated saved layout and Pine document, create a named workspace,
attach the exact document and compile before running experiments. Use explicit
names in automation; terminal selection is process-local and is never global.

```powershell
node examples/workspace-batch.mjs --workspace research-a --study CURRENT_STUDY_ID --out results/a.json
node examples/workspace-batch.mjs --workspace research-b --jobs jobs.json --out results/b.json
```

`jobs.json` is an array of input mappings, for example
`[{"in_0":10,"in_1":30},{"in_0":20,"in_1":60}]`. Inspect actual indicator input IDs
before using the defaults. The example changes inputs, waits and validates each
collected report against the requested values. Independent workspaces can run
concurrently. Same-resource commands queue; a foreign input change causes
BATCH_INPUT_CHANGED rather than mixed results. The last requested inputs remain;
no automatic draft/layout restoration or document deletion is performed.

The previous active-tab `pine-batch.js` production entry point is retired with
LEGACY_BATCH_REMOVED. Its fixture-injected functions remain regression coverage
for old recovery journals. Reconcile old journals with the old installed CLI before
upgrading. See [migration](../docs/workspaces.md).

`sma-crossover.pine` remains a source example for a dedicated saved strategy.
Live smoke scripts require explicit dedicated workspace names and retain raw
evidence under ignored `results/`; never run them against preexisting user resources.

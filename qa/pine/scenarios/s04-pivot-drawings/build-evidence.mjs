// Builds sanitized evidence.json from ignored raw records. No private source/script lists are copied.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const OUT = 'results/pine-scenarios/s04-pivot-drawings', DIR = 'qa/pine/scenarios/s04-pivot-drawings';
const sha = s => createHash('sha256').update(String(s).replace(/\r\n/g, '\n')).digest('hex');
const rawSha = s => createHash('sha256').update(String(s)).digest('hex');
const raw = t => JSON.parse(fs.readFileSync(OUT + '/raw/' + t + '.json', 'utf8'));
const J = t => raw(t).json;
const S04 = 'USER;e4b6a39e8a79466bb3134287eb3713a0';
const files = ['v1-baseline-labels', 'v2-zones-keep30', 'v3-zones-keep5', 'v4-delete-update', 'v5-error-injected'];
const sourceHashes = Object.fromEntries(files.map(f => [f + '.pine', sha(fs.readFileSync(DIR + '/' + f + '.pine', 'utf8'))]));
const compact = (tag, j) => {
  if (!j) return null;
  const x = JSON.parse(JSON.stringify(j, (k, v) => k === 'source' && typeof v === 'string' ? { chars: v.length, sha256: sha(v) } : v));
  if (Array.isArray(x.scripts)) { x.scripts_total = x.scripts.length; x.scripts = x.scripts.filter(s => /CLI-QA-S04/.test((s.name || '') + (s.title || ''))); }
  if (Array.isArray(x.tabs)) x.tabs = x.tabs.map(t => ({ id: t.id, chart_id: t.chart_id, active: t.active }));
  if (Array.isArray(x.bars)) x.bars = { count: x.bars.length, first: x.bars[0], last: x.bars.at(-1) };
  if (Array.isArray(x.entries)) { const all = x.entries; x.entries = { count: all.length, scriptLogRows: all.filter(e => /CREATE|BREAK|DELETE/.test(e.message)).length, last3: all.slice(-3).map(e => e.message) }; }
  if (x.result && typeof x.result === 'string' && x.result.length > 600) x.result = { chars: x.result.length, note: 'resolver snapshot; see verify-*.json in ignored results' };
  for (const s of x.studies || []) { for (const k of ['labels', 'all_boxes', 'all_lines']) if (Array.isArray(s[k])) s[k] = { count: s[k].length, sample: s[k].slice(0, 3) }; }
  return x;
};
const commands = fs.readFileSync(OUT + '/commands.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(c => {
  const r = raw(c.tag);
  return { tag: c.tag, at: c.at, command: ['node', 'src/cli/index.js', ...(r.command.slice(2))].join(' ').replace(/ui eval .{120,}$/, 'ui eval <read-only probe expression, see probe-expr.mjs / HANDOFF>'),
    expect_exit: c.expect_exit, exit_code: c.exit_code, elapsed_ms: c.elapsed_ms, harness_accepted: c.exit_code === c.expect_exit && (c.expect_exit !== 0 || c.success === true),
    fence_pre: c.pre && { url: c.pre.url, id: c.pre.id, version: c.pre.version, modified: c.pre.modified, title: c.pre.title },
    fence_post: c.post && { id: c.post.id, version: c.post.version, modified: c.post.modified, title: c.post.title },
    stderr: r.stderr ? r.stderr.slice(0, 300) : '', json: compact(c.tag, r.json) };
});
const V = t => { const v = JSON.parse(fs.readFileSync(OUT + '/verify-' + t + '.json', 'utf8')); const { matches, ...rest } = v; return { ...rest, matchedZones: matches ? matches.map(m => ({ t1: m.t1, kind: m.kind, text: m.actualText, state: m.state, boxRightOk: m.boxRightOk, lineRightOk: m.lineRightOk, textOk: m.textOk })) : undefined }; };
const LC = t => { const { checks, ...r } = JSON.parse(fs.readFileSync(OUT + '/logcheck-' + t + '.json', 'utf8')); return r; };
const verification = Object.fromEntries(['033-resolve-v1', '049-resolve-v2', '059-resolve-v3', '080-resolve-v4', '085-resolve-ttl0', '090-resolve-ttl0', '093-resolve-ttl10', '116-resolve-v6', '127-resolve-after-repeat'].map(t => [t, V(t)]));
verification['085-resolve-ttl0'].INVALID = 'Harness error: 082 input change failed (PowerShell JSON quoting), study still ttl=10; comparing to ttl=0 simulation is invalid. Superseded by 086-090.';
const table = t => J(t).studies?.[0]?.tables?.[0]?.rows ?? [];
const src = t => J(t).source;
const assertions = {
  noForeignTargetUsed: commands.filter(c => c.fence_pre).every(c => c.fence_pre.url === 'https://kr.tradingview.com/chart/ofWK5ePT/'),
  firstSaveFromUnsavedTemplate: commands.find(c => c.tag === '023-save-v1').fence_pre.id === null && commands.find(c => c.tag === '023-save-v1').json.script_id === S04,
  everyMutationOnS04DocAfterSave: commands.filter(c => /pine (set|save|compile|raw-compile)|indicator set/.test(c.command) && c.tag >= '024').every(c => c.fence_pre.id === S04),
  allChildExitsAsExpected_exceptRecordedStops: commands.filter(c => !['004-pine-get-initial', '082-input-ttl0'].includes(c.tag)).every(c => c.harness_accepted),
  savedNameExactSingle: J('135-list-final').scripts.filter(s => s.name === 'CLI-QA-S04 Pivot Zones').length === 1,
  v1LabelsMatchStrictPivots: verification['033-resolve-v1'].variants.strictBoth.missing === 0 && verification['033-resolve-v1'].variants.strictBoth.extra === 0 && verification['033-resolve-v1'].labelsInWindow === 48,
  v1NoLabelBeyondLastConfirmablePivot: verification['033-resolve-v1'].labelsAfterLastConfirmablePivot.length === 0,
  zonesAllMatched: ['049-resolve-v2', '059-resolve-v3', '080-resolve-v4', '090-resolve-ttl0', '093-resolve-ttl10', '116-resolve-v6', '127-resolve-after-repeat'].every(t => verification[t].allMatched && verification[t].preConfirmationObjects === 0),
  keep30Count: verification['049-resolve-v2'].actualCounts.boxes === 30 && verification['049-resolve-v2'].actualCounts.lines === 30 && verification['049-resolve-v2'].actualCounts.labels === 30,
  keep5CountAtMost5: ['059-resolve-v3', '080-resolve-v4', '093-resolve-ttl10', '116-resolve-v6', '127-resolve-after-repeat'].every(t => verification[t].actualCounts.boxes <= 5 && verification[t].actualCounts.boxes === verification[t].actualCounts.lines && verification[t].actualCounts.lines === verification[t].actualCounts.labels),
  scriptTablesAlignedNoMismatch: ['048-tables-v2', '057-tables-v3', '078-tables-v4', '088-tables-ttl0', '092-tables-ttl10', '115-tables-v6', '123-tables-after-repeat', '138-tables-after-reopen'].every(t => table(t).includes('arraysAligned | true') && table(t).includes('mismatch | 0')),
  createdConstantAcrossRecompiles: ['048-tables-v2', '057-tables-v3', '078-tables-v4', '115-tables-v6', '123-tables-after-repeat', '138-tables-after-reopen'].every(t => table(t).includes('created | 2665')),
  singleS04StudyThroughout: ['026-state-v1', '044-state-v2', '053-state-v3', '074-state-v4', '104-state-v5', '114-state-v6', '122-state-after-repeat', '136-state-after-reopen', '142-final-state'].every(t => J(t).studies.filter(s => /CLI-QA-S04/.test(s.name)).length === 1 && J(t).studies.some(s => s.id === '7AVlth')),
  injectedErrorDetected: J('103-errors-v5').errors.some(e => /box\.qa_missing/.test(e.message)) && raw('102-compile-v5').exit_code === 1 && raw('103-errors-v5').exit_code === 1,
  recoveryCompileOk: raw('112-compile-v6').exit_code === 0 && J('113-indicator-get-v6').inputs.find(i => i.id === 'pineVersion').value === '6.0',
  sourcePreservedSaveOpen: sha(src('130-get-before-reopen')) === sourceHashes['v4-delete-update.pine'] && sha(src('134-get-reopened')) === sourceHashes['v4-delete-update.pine'],
  reopenRawLineEndingsDiffer: rawSha(src('130-get-before-reopen')) !== rawSha(src('134-get-reopened')),
  logsMatchOhlc: ['068-console-v3-logs-visible', '079-console-v4'].every(t => { const r = LC(t); return r.createConfirmLagAll5 && r.createPriceOk === r.createPriceChecked && r.breakCloseOk === r.breakCloseChecked; }),
};
const ev = {
  scenario: 'S04 pivot support/resistance drawings: create, break-update, retention delete', generated: new Date().toISOString(),
  environment: { cwd: 'C:/Codex/.worktrees/tradingview-cli-pinescript-qa', branch: 'codex/pine-qa', layout: 'CLI-QA-S04-20261001', chartId: 'ofWK5ePT', target: 'A80BFC8814BDE6007E9C57E8CB604788', symbol: 'BINANCE:ETHUSDT', resolution: '15', savedName: 'CLI-QA-S04 Pivot Zones', savedId: S04, finalVersion: '6.0', studyId: '7AVlth',
    windowRestore: { pid: 18220, action: 'ShowWindow SW_SHOWNOACTIVATE(4)', iconicBefore: true, iconicAfter: false, reason: 'page visibility hidden, viewport 0x0 (005)' } },
  sourceHashes: { ...sourceHashes, 'v6 fix (= v4 file)': sourceHashes['v4-delete-update.pine'], template_021: sha(src('021-get-template')), editor_130: sha(src('130-get-before-reopen')), reopened_134: sha(src('134-get-reopened')), reopened_134_rawBytes: rawSha(src('134-get-reopened')), editor_130_rawBytes: rawSha(src('130-get-before-reopen')) },
  assertions, verification, logChecks: { v3: LC('068-console-v3-logs-visible'), v4: LC('079-console-v4') },
  scriptTables: Object.fromEntries(['029-tables-v1', '048-tables-v2', '057-tables-v3', '078-tables-v4', '088-tables-ttl0', '092-tables-ttl10', '105-tables-v5', '115-tables-v6', '123-tables-after-repeat', '138-tables-after-reopen'].map(t => [t, table(t)])),
  commands,
};
fs.writeFileSync(DIR + '/evidence.json', JSON.stringify(ev, null, 2).replace(/로그인계정: [^\\"]*/g, '로그인계정: <redacted>'));
console.log(JSON.stringify({ assertions, commands: commands.length, sourceHashes: ev.sourceHashes }, null, 1));

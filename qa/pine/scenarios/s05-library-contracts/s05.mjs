// S05 harness: real CLI recorder with target/document fences (pattern verified in S03/S04).
// Usage: node s05.mjs TAG [--exit N] [--doc ID|none|any] [--post-doc ID|none|any] [--stdin FILE] [--timeout MS] -- <cli args>
//        node s05.mjs --local <hashes|build-verifier|state-set|summarize|init> [args...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import CDP from 'chrome-remote-interface';
import { findPineController, findPineEditor } from '../../../../src/core/desktop-dom.js';

const ROOT = 'C:/Codex/.worktrees/tradingview-cli-pinescript-qa';
const OUT = ROOT + '/results/pine-scenarios/s05-library-contracts';
const QA = ROOT + '/qa/pine/scenarios/s05-library-contracts';
fs.mkdirSync(OUT + '/raw', { recursive: true });
const STATE_FILE = OUT + '/state.json';
const LIB_FIXTURE = QA + '/library-v1.pine';
const LIB_FINAL = QA + '/library-v2.pine';
const TYPE_FIXTURE = QA + '/library-type-error.pine';
const VERIFY_FIXTURE = QA + '/verifier-indicator.pine';
const BODY_BEGIN = 'CLIQAS05-BODY-BEGIN';
const BODY_END = 'CLIQAS05-BODY-END';
const COPY_BEGIN = 'CLIQAS05-VERIFY-COPY-BEGIN';
const COPY_END = 'CLIQAS05-VERIFY-COPY-END';

const sha = s => createHash('sha256').update(String(s ?? '').replace(/\r\n/g, '\n')).digest('hex');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const lineCount = t => String(t).replace(/\r\n/g, '\n').trimEnd().split('\n').length;
const sliceBody = (text, b, e) => {
  const lines = String(text).split('\n');
  const i = lines.findIndex(l => l.includes(b)), j = lines.findIndex(l => l.includes(e));
  if (i < 0 || j < 0 || j <= i) throw Error('markers not found: ' + b + ' .. ' + e);
  return lines.slice(i + 1, j);
};
// The verifier cannot import the library, so it renames the functions. Body identity is
// therefore compared with the leading function name normalized to a placeholder; signature
// parameters, defaults, indentation and every body line must still match exactly.
const normalizeFnNames = lines => lines.map(l => l.replace(/^([A-Za-z_][A-Za-z0-9_]*)\(/, 'CLIQAS05FN('));
const loadState = () => JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const saveState = s => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const argv = process.argv.slice(2);
const tag = argv.shift();

async function fence(phase, expectDoc) {
  const st = loadState();
  const client = await CDP({ host: '127.0.0.1', port: 9222, target: st.target });
  try {
    const expr = '(()=>{const c=(' + findPineController.toString() + ')(document);const e=('
      + findPineEditor.toString() + ')(document);const iv=c?.getScriptIdVersion?.();const src=e?.editor?.getValue?.();'
      + 'return {url:location.href,id:iv?.scriptIdPart||null,version:iv?.version||null,modified:c?.isModified?.()??null,'
      + 'controller:Boolean(c),editor:Boolean(e),title:(function(t){if(!t)return null;var L=t.split(String.fromCharCode(10));'
      + 'for(var li=0;li<L.length;li++){var s=L[li];while(s.length&&(s.charAt(0)===" "||s.charAt(0)===String.fromCharCode(9)))s=s.slice(1);'
      + 'if(s.indexOf("indicator(")===0||s.indexOf("strategy(")===0||s.indexOf("library(")===0){'
      + 'var q=String.fromCharCode(34),a=s.indexOf(q);if(a<0)return null;var b=s.indexOf(q,a+1);return b>a?s.slice(a+1,b):null;}}return null;})(src)};})()';
    const { result, exceptionDetails } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    const s = result?.value;
    const rec = { phase, expectDoc, state: s, exception: exceptionDetails?.text || null,
      exception_detail: exceptionDetails ? (exceptionDetails.exception?.description || JSON.stringify(exceptionDetails)).slice(0, 600) : null };
    if (exceptionDetails || !s) throw Error('fence eval failed ' + JSON.stringify(rec));
    if (s.url !== st.chartUrl) throw Error('TARGET URL FENCE ' + phase + ': ' + s.url + ' != ' + st.chartUrl);
    if (expectDoc === 'none' && s.id) throw Error('DOC FENCE ' + phase + ': expected unsaved, got ' + s.id);
    if (expectDoc && !['any', 'none'].includes(expectDoc) && s.id !== expectDoc) throw Error('DOC FENCE ' + phase + ': ' + s.id + ' != ' + expectDoc);
    return rec;
  } finally { await client.close(); }
}

if (tag === '--local') {
  const verb = argv[0];
  if (verb === 'hashes') {
    // The final contract is library-v2, so the body identity comparison targets library-v2.
    const libV1 = read(LIB_FIXTURE), lib = read(LIB_FINAL), ver = read(VERIFY_FIXTURE), err = read(TYPE_FIXTURE);
    const exportBodies = sliceBody(lib, BODY_BEGIN, BODY_END);
    const exportBodiesV1 = sliceBody(libV1, BODY_BEGIN, BODY_END);
    const copyBodies = sliceBody(ver, COPY_BEGIN, COPY_END);
    const stripped = normalizeFnNames(exportBodies.map(l => l.replace(/^export /, '')));
    const copied = normalizeFnNames(copyBodies);
    const equal = stripped.length === copied.length && stripped.every((l, i) => l === copied[i]);
    const v1Stripped = normalizeFnNames(exportBodiesV1.map(l => l.replace(/^export /, '')));
    const v1Equal = v1Stripped.length === copied.length && v1Stripped.every((l, i) => l === copied[i]);
    const out = {
      library_v1: { file: 'library-v1.pine', hash_nl: sha(libV1), chars: libV1.length, lines: lineCount(libV1), body_lines: exportBodiesV1.length, body_hash_nl: sha(v1Stripped.join('\n')) },
      library_final: { file: 'library-v2.pine', hash_nl: sha(lib), chars: lib.length, lines: lineCount(lib), body_lines: exportBodies.length, body_hash_nl: sha(stripped.join('\n')) },
      verifier: { file: 'verifier-indicator.pine', hash_nl: sha(ver), chars: ver.length, lines: lineCount(ver), copy_lines: copyBodies.length, copy_hash_nl: sha(copied.join('\n')) },
      type_error: { file: 'library-type-error.pine', hash_nl: sha(err), chars: err.length, lines: lineCount(err) },
      body_exact_match_vs_final: equal,
      body_exact_match_vs_v1: v1Equal,
      diff_sample: equal ? null : stripped.map((l, i) => l === copied[i] ? null : (i + ': ' + JSON.stringify(l) + ' vs ' + JSON.stringify(copied[i]))).filter(Boolean).slice(0, 12),
    };
    fs.writeFileSync(OUT + '/raw/hashes.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } else if (verb === 'build-verifier') {
    const src = read(argv[1]);
    const template = read(VERIFY_FIXTURE).split('\n');
    const b = template.findIndex(l => l.includes(COPY_BEGIN));
    const e = template.findIndex(l => l.includes(COPY_END));
    if (b < 0 || e < 0) throw Error('copy markers missing');
    // The verifier must not import the library, so it renames the functions; the splice must
    // apply the same rename or the probe calls would not resolve (observed as a compile error).
    const body = sliceBody(src, BODY_BEGIN, BODY_END).map(l => l
      .replace(/^export /, '')
      .replace(/^([A-Za-z_][A-Za-z0-9_]*)\(/, '$1Fn('));
    template.splice(b + 1, e - b - 1, ...body);
    const text = template.join('\n');
    const outFile = OUT + '/raw/verifier-spliced.pine';
    fs.writeFileSync(outFile, text);
    const plainBody = read(VERIFY_FIXTURE);
    const plain = { file: 'verifier-indicator.pine', hash_nl: sha(plainBody), chars: plainBody.length, lines: lineCount(plainBody) };
    console.log(JSON.stringify({ out_file: outFile, injected_lines: body.length, hash_nl: sha(text), chars: text.length, lines: lineCount(text), source_of_bodies: argv[1], baseline: plain }, null, 2));
  } else if (verb === 'state-set') {
    const st = loadState();
    for (const pair of argv.slice(1)) { const p = pair.split('='); st[p[0]] = p[1] === 'null' ? null : p[1]; }
    saveState(st);
    console.log(JSON.stringify(st, null, 2));
  } else if (verb === 'init') {
    const st = { target: argv[1], chartUrl: argv[2], layout: argv[3] || 'CLI-QA-S05-20261001', docId: null, libId: null, verifierId: null, studyId: null, createdAt: new Date().toISOString() };
    saveState(st);
    console.log(JSON.stringify(st, null, 2));
  } else if (verb === 'summarize') {
    const files = fs.readdirSync(OUT + '/raw').filter(f => f.endsWith('.json') && !['hashes.json', 'tables.json'].includes(f));
    const rows = files.map(f => {
      const r = JSON.parse(fs.readFileSync(OUT + '/raw/' + f, 'utf8'));
      return { tag: r.tag, exit: r.exit_code, expect_exit: r.expect_exit, pre: r.fence_pre?.state?.id ?? null, post: r.fence_post?.state?.id ?? null, ok: r.json_sanitized?.success ?? null, postErr: r.fence_post_error ?? null };
    });
    console.log(JSON.stringify(rows, null, 1));
  } else if (verb === 'vectors') {
    // Independent numeric oracle: recompute every probe vector in Node (no Pine involved) and
    // compare against (a) the expectation literals shown in the chart table and (b) the values
    // the compiled indicator actually produced. Evidence file: raw/vector-check.json.
    const src = argv[1] || (OUT + '/raw/tables-verifier3.json');
    const rows = JSON.parse(fs.readFileSync(src, 'utf8')).json_sanitized.studies[0].tables[0].rows;
    const num = t => { if (t === 'NaN' || t === 'na') return NaN; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
    const clamp = (v, lo, hi) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
    const normalize = (v, lo, hi, fb = 0) => (hi - lo !== 0 ? (v - lo) / (hi - lo) : fb);
    const weighted = (vs, ws, fb = 0, scale = 1) => {
      const sum = a => a.reduce((x, y) => x + y, 0);
      if (vs.length === 0 || ws.length !== vs.length) return fb;
      const wsum = sum(ws); if (wsum === 0) return fb;
      return sum(vs.map((v, i) => v * ws[i])) / wsum * scale;
    };
    const mean = (vs, fb = 0) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : fb);
    const variance = (vs, fb = 0) => {
      if (!vs.length) return fb;
      const m = mean(vs);
      return vs.reduce((a, x) => a + (x - m) * (x - m), 0) / vs.length;
    };
    const empty = [];
    const truth = {
      'clamp-in-range': clamp(0.25, 0, 1), 'clamp-below-lo': clamp(-5, 0, 1), 'clamp-above-hi': clamp(2, 0, 1),
      'clamp-reversed-bounds': clamp(-1, 1, 0), 'clamp-na-input': NaN,
      'normalize-mid': normalize(3, 1, 5), 'normalize-lo-edge': normalize(1, 1, 5), 'normalize-hi-edge': normalize(5, 1, 5),
      'normalize-zero-denom': normalize(3, 2, 2), 'normalize-zero-denom-fb': normalize(3, 2, 2, -1),
      'normalize-oor-low': normalize(-3, 0, 3), 'normalize-oor-high': normalize(6, 0, 3),
      'weighted-basic': weighted([1, 2, 3], [1, 2, 3]), 'weighted-equal-weights': weighted([1, 2, 3], [1, 1, 1]),
      'weighted-zero-weight-sum': weighted([1, 2, 3], [0, 0, 0]),
      'weighted-zero-sum-fallback': weighted([1, 2, 3], [0, 0, 0], -9),
      'weighted-empty': weighted(empty, empty), 'weighted-length-mismatch': weighted([1, 2, 3], [1, 2]),
      'weighted-negative-weight': weighted([2, 4], [3, -1]),
      'weighted-scale-one': weighted([1, 2, 3], [1, 2, 3], 0, 1),
      'weighted-scale-two': weighted([1, 2, 3], [1, 2, 3], 0, 2),
      'weighted-scale-zero': weighted([1, 2, 3], [1, 2, 3], 0, 0),
      'mean-1-2-3': mean([1, 2, 3]), 'mean-empty': mean(empty), 'mean-empty-fallback': mean(empty, -7),
      'mean-single': mean([5]), 'mean-negative': mean([-1, -2, -3]),
      'variance-1-2-3': variance([1, 2, 3]), 'variance-empty': variance(empty), 'variance-single': variance([42]),
      'variance-constant': variance([5, 5, 5]), 'variance-two-points': variance([1, 3]), 'variance-four-points': variance([1, 3, 5, 7]),
    };
    const close = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) ? true : Math.abs(a - b) < 1e-8;
    const report = [];
    let literalFails = 0, actualFails = 0, tableMismatch = 0;
    for (const row of rows.slice(1)) {
      const parts = row.split(' | ');
      const id = parts[0], expectedShown = num(parts[2]), actualShown = num(parts[3]), status = parts[4];
      const t = id in truth ? truth[id] : undefined;
      const literalOk = t !== undefined && close(t, expectedShown);
      const actualOk = t !== undefined && close(t, actualShown);
      if (!literalOk) literalFails++;
      if (!actualOk) actualFails++;
      if (status !== 'PASS') tableMismatch++;
      report.push({ id, vars: parts[1], truth: Number.isNaN(t) ? 'NaN' : t, expected_shown: parts[2], actual_shown: parts[3],
        literal_matches_oracle: literalOk, actual_matches_oracle: actualOk, indicator_status: status });
    }
    const out = { source: src, probes: report.length, literal_mismatches: literalFails, actual_mismatches: actualFails,
      indicator_mismatch_rows: tableMismatch, all_match: literalFails === 0 && actualFails === 0 && tableMismatch === 0, report };
    fs.writeFileSync(OUT + '/raw/vector-check.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ source: src, probes: out.probes, literal_mismatches: out.literal_mismatches,
      actual_mismatches: out.actual_mismatches, indicator_mismatch_rows: out.indicator_mismatch_rows, all_match: out.all_match }, null, 2));
    if (!out.all_match) console.log(JSON.stringify(report.filter(r => !r.literal_matches_oracle || !r.actual_matches_oracle || r.indicator_status !== 'PASS'), null, 2));
  } else if (verb === 'study-status') {
    // Read-only: per-study runtime status/performance/error for every TV script on the chart.
    const st = loadState();
    const client = await CDP({ host: '127.0.0.1', port: 9222, target: st.target });
    try {
      const expr = '(()=>{const m=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().model();'
        + 'const out=[];m.dataSources().forEach(s=>{const i=s.metaInfo?s.metaInfo():null;if(!i||!i.isTVScript)return;'
        + 'let stt=null;try{stt=s.status?s.status():null}catch(e){stt={err:String(e)}}'
        + 'let cells=null,labels=null;try{cells=s._graphics&&s._graphics._primitivesCollection?Object.keys(s._graphics._primitivesCollection):null}catch(e){}'
        + 'out.push({id:s.id(),name:i.description,status:stt&&stt.type!=null?stt.type:null,'
        + 'error:stt&&stt.errorDescription?String(stt.errorDescription.error).slice(0,240):null,'
        + 'perf:stt&&stt.performance?stt.performance:null,graphics_collections:cells});});return out;})()';
      const { result, exceptionDetails } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
      if (exceptionDetails) throw Error(exceptionDetails.exception?.description || exceptionDetails.text);
      fs.writeFileSync(OUT + '/raw/study-status.json', JSON.stringify(result.value, null, 2));
      console.log(JSON.stringify(result.value, null, 2));
    } finally { await client.close(); }
  } else if (verb === 'reload') {
    // Reload only this scenario's own chart tab (safe: all S05 sources are saved).
    const st = loadState();
    const client = await CDP({ host: '127.0.0.1', port: 9222, target: st.target });
    try { await client.Page.enable(); await client.Page.reload({ ignoreCache: true }); }
    finally { await client.close(); }
    console.log(JSON.stringify({ reloaded: true, target: st.target, at: new Date().toISOString() }, null, 2));
  } else throw Error('unknown local verb ' + verb);
  process.exit(0);
}

let expectExit = 0, doc = null, postDoc = null, stdinFile = null, timeout = 90000;
while (argv.length && argv[0] !== '--') {
  const a = argv.shift();
  if (a === '--exit') expectExit = Number(argv.shift());
  else if (a === '--doc') doc = argv.shift();
  else if (a === '--post-doc') postDoc = argv.shift();
  else if (a === '--stdin') stdinFile = argv.shift();
  else if (a === '--timeout') timeout = Number(argv.shift());
  else throw Error('unknown harness option ' + a);
}
if (argv.shift() !== '--') throw Error('missing -- separator');
const cli = argv.map(a => a.startsWith('@file:') ? fs.readFileSync(a.slice(6), 'utf8').trim() : a);
const rawFile = OUT + '/raw/' + tag + '.json';
if (fs.existsSync(rawFile)) throw Error('Refusing to overwrite evidence tag ' + tag);
const st = loadState();
if (!st?.target || !st?.chartUrl) throw Error('No recorded S05 target; refusing to run pinned command.');
const forbidden = ['D1AFFCCBC3A67669FD97D434AADFB942', 'BACBB4E74A751DBFC2E3918B8E6B2B12', '358BB580C74E309A605A52D3EDC6BDF9',
  '3D2E5C4CE6FF2209409B3094C7F0ABA2', '7980FA5955C48DD48FF5EDBF9615BD45', '890408E3FA96D8076A7D49A8B3AF200A', 'A80BFC8814BDE6007E9C57E8CB604788'];
if (forbidden.includes(st.target)) throw Error('Target belongs to another layout');

doc ??= st.docId ?? 'any';
postDoc ??= doc;
const pre = await fence('pre', doc);
const input = stdinFile ? fs.readFileSync(stdinFile, 'utf8') : undefined;
const args = ['--target', st.target, ...cli];
const t0 = Date.now();
const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { cwd: ROOT, encoding: 'utf8', input, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const elapsed_ms = Date.now() - t0;
let json = null; try { json = JSON.parse(r.stdout); } catch { /* non-JSON output is recorded raw */ }
let post = null, postErr = null;
try { post = await fence('post', postDoc); } catch (e) { postErr = e.message; }

const sanitize = (k, v) => (k === 'source' && typeof v === 'string' && v.length > 80)
  ? { chars: v.length, lines: lineCount(v), sha256_nl: sha(v), head: v.split('\n').slice(0, 3) }
  : (k === 'scripts' && Array.isArray(v)) ? v.filter(x => /CLIQA|CLI-QA-S05/i.test((x.name || '') + (x.title || ''))) : v;
const rec = {
  tag, at: new Date(t0).toISOString(), command: ['node', 'src/cli/index.js', ...args],
  elapsed_ms, expect_exit: expectExit, exit_code: r.status, signal: r.signal,
  spawn_error: r.error ? r.error.message : null,
  stdout_sanitized: json ? JSON.stringify(json, sanitize, 2) : (r.stdout || '').slice(0, 4000),
  stderr: (r.stderr || '').slice(0, 3000),
  json_sanitized: json ? JSON.parse(JSON.stringify(json, sanitize)) : null,
  fence_pre: pre, fence_post: post, fence_post_error: postErr,
};
if (json && typeof json.source === 'string') fs.writeFileSync(OUT + '/raw/' + tag + '.source.pine', json.source.replace(/\r\n/g, '\n'));
fs.writeFileSync(rawFile, JSON.stringify(rec, null, 2));
fs.appendFileSync(OUT + '/commands.jsonl', JSON.stringify({ tag, at: rec.at, args: cli, exit_code: r.status, elapsed_ms, success: json?.success ?? null, pre: pre.state, post: post?.state ?? null, postErr }) + '\n');
console.log(JSON.stringify({ tag, exit: r.status, ms: elapsed_ms, pre: pre.state, post: post?.state ?? null, postErr }));
console.log(rec.stdout_sanitized.length > 6000 ? rec.stdout_sanitized.slice(0, 6000) + '...[truncated]' : rec.stdout_sanitized);
if (r.stderr) console.log('STDERR', r.stderr.slice(0, 1200));

const fail = m => { console.error('HARNESS STOP: ' + m); process.exit(3); };
if (r.status !== expectExit) fail('exit ' + r.status + ' expected ' + expectExit);
if (!json) fail('missing JSON');
if (expectExit === 0 && json.success !== true) fail('JSON success not true');
if (postErr) fail(postErr);
if (cli[0] === 'pine' && ['save', 'open'].includes(cli[1]) && postDoc && !['any', 'none'].includes(postDoc) && json.script_id && json.script_id !== postDoc) fail('script_id mismatch on ' + cli[1]);
if (cli[0] === 'pine' && cli[1] === 'save' && json.saved === false) fail('save reported not saved');


// S04 harness: real CLI recorder with target/document fences. Raw output -> ignored results dir.
// Usage: node run.mjs TAG [--exit N] [--doc ID|none|any] [--post-doc ID|none|any] [--no-target] [--stdin FILE] -- <cli args>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import CDP from 'chrome-remote-interface';
import { findPineController, findPineEditor } from '../../../../src/core/desktop-dom.js';
const OUT = 'results/pine-scenarios/s04-pivot-drawings';
fs.mkdirSync(OUT + '/raw', { recursive: true });
const argv = process.argv.slice(2);
const tag = argv.shift();
if (!/^[0-9a-z][0-9a-z_.-]*$/i.test(tag || '')) throw Error('safe tag required');
let expectExit = 0, doc = null, postDoc = null, noTarget = false, stdinFile = null;
while (argv.length && argv[0] !== '--') {
  const a = argv.shift();
  if (a === '--exit') expectExit = Number(argv.shift());
  else if (a === '--doc') doc = argv.shift();
  else if (a === '--post-doc') postDoc = argv.shift();
  else if (a === '--no-target') noTarget = true;
  else if (a === '--stdin') stdinFile = argv.shift();
  else throw Error('unknown harness option ' + a);
}
if (argv.shift() !== '--') throw Error('missing -- separator');
// "@file:PATH" args are replaced by the file content (avoids shell quoting of JSON)
const cli = argv.map(a => a.startsWith('@file:') ? fs.readFileSync(a.slice(6), 'utf8').trim() : a);
const rawFile = OUT + '/raw/' + tag + '.json';
if (fs.existsSync(rawFile)) throw Error('Refusing to overwrite evidence tag ' + tag);
const stateFile = OUT + '/state.json';
const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
doc ??= st?.docId ?? 'any';
if (!noTarget && !st?.target) throw Error('No recorded S04 target; refusing to run pinned command (no fallback).');
const forbiddenTargets = ['D1AFFCCBC3A67669FD97D434AADFB942','BACBB4E74A751DBFC2E3918B8E6B2B12','358BB580C74E309A605A52D3EDC6BDF9','3D2E5C4CE6FF2209409B3094C7F0ABA2','7980FA5955C48DD48FF5EDBF9615BD45','890408E3FA96D8076A7D49A8B3AF200A'];
if (!noTarget && forbiddenTargets.includes(st.target)) throw Error('Target belongs to another layout');
if (cli[0] === 'indicator' && cli[1] === 'set' && st?.studyId && cli[2] !== st.studyId) throw Error('Study mutation fence');
if (cli[0] === 'indicator' && cli[1] === 'remove') throw Error('indicator remove requires manual review');
const sha = s => createHash('sha256').update(String(s ?? '').replace(/\r\n/g, '\n')).digest('hex');

async function fence(phase, expectDoc) {
  if (noTarget) return null;
  const client = await CDP({ host: '127.0.0.1', port: 9222, target: st.target });
  try {
    const expr = '(()=>{const c=(' + findPineController.toString() + ')(document);const e=(' + findPineEditor.toString() + ')(document);const iv=c?.getScriptIdVersion?.();const src=e?.editor?.getValue?.();return {url:location.href,id:iv?.scriptIdPart||null,version:iv?.version||null,modified:c?.isModified?.()??null,title:src?(src.match(/^(?:indicator|strategy|library)\\(\\s*"([^"]*)"/m)||[])[1]||null:null};})()';
    const { result, exceptionDetails } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    const s = result?.value;
    const rec = { phase, expectDoc, state: s, exception: exceptionDetails?.text || null };
    if (exceptionDetails || !s) throw Error('fence eval failed ' + JSON.stringify(rec));
    if (s.url !== st.chartUrl) throw Error('TARGET URL FENCE ' + phase + ': ' + s.url + ' != ' + st.chartUrl);
    if (expectDoc === 'none' && s.id) throw Error('DOC FENCE ' + phase + ': expected unsaved, got ' + s.id);
    if (expectDoc && !['any', 'none'].includes(expectDoc) && s.id !== expectDoc) throw Error('DOC FENCE ' + phase + ': ' + s.id + ' != ' + expectDoc);
    return rec;
  } finally { await client.close(); }
}

const pre = await fence('pre', doc);
const input = stdinFile ? fs.readFileSync(stdinFile, 'utf8') : undefined;
const args = noTarget ? cli : ['--target', st.target, ...cli];
const t0 = Date.now();
const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', input, timeout: 65000, maxBuffer: 8 * 1024 * 1024 });
const elapsed_ms = Date.now() - t0;
let json = null; try { json = JSON.parse(r.stdout); } catch {}
let post = null, postErr = null;
try { post = await fence('post', postDoc ?? doc); } catch (e) { postErr = e.message; }
const rec = { tag, at: new Date(t0).toISOString(), command: ['node', 'src/cli/index.js', ...args], stdin_sha256: input !== undefined ? sha(input) : null,
  expect_exit: expectExit, exit_code: r.status, signal: r.signal, spawn_error: r.error?.message || null, elapsed_ms, stdout: r.stdout, stderr: r.stderr, json, fence_pre: pre, fence_post: post, fence_post_error: postErr };
fs.writeFileSync(rawFile, JSON.stringify(rec, null, 2));
fs.appendFileSync(OUT + '/commands.jsonl', JSON.stringify({ tag, at: rec.at, args: cli, expect_exit: expectExit, exit_code: r.status, elapsed_ms, success: json?.success ?? null, pre: pre?.state ?? null, post: post?.state ?? null, postErr }) + '\n');
const brief = JSON.stringify(json ?? r.stdout, (k, v) => (k === 'source' && typeof v === 'string') ? { chars: v.length, sha256: sha(v) } : (k === 'scripts' && Array.isArray(v)) ? v.filter(x => /CLI-QA-S04/.test((x.name || '') + (x.title || ''))) : v);
console.log(JSON.stringify({ tag, exit: r.status, ms: elapsed_ms, pre: pre?.state, post: post?.state }));
console.log(brief.length > 6000 ? brief.slice(0, 6000) + '...[truncated]' : brief);
if (r.stderr) console.log('STDERR', r.stderr.slice(0, 1500));
const fail = m => { console.error('HARNESS STOP: ' + m); process.exit(3); };
if (r.status !== expectExit) fail('exit ' + r.status + ' expected ' + expectExit);
if (!json) fail('missing JSON');
if (expectExit === 0 && json.success !== true) fail('JSON success not true');
if (postErr) fail(postErr);
if (cli[0] === 'pine' && cli[1] === 'save' && postDoc && !['any', 'none'].includes(postDoc) && json.script_id !== postDoc) fail('save script_id mismatch');
if (cli[0] === 'pine' && cli[1] === 'open' && postDoc && !['any', 'none'].includes(postDoc) && json.script_id && json.script_id !== postDoc) fail('open script_id mismatch');


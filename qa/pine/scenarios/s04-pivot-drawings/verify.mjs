// Independent verifier: recompute pivots / zone lifecycle from OHLC and compare to extracted drawings.
// Usage: node verify.mjs MODE RESOLVE_TAG [keep] [ttl]   MODE = labels | zones
import fs from 'node:fs';
const OUT = 'results/pine-scenarios/s04-pivot-drawings';
const [mode, tag, keepArg, ttlArg] = process.argv.slice(2);
const L = 5, R = 5;
const rec = JSON.parse(fs.readFileSync(OUT + '/raw/' + tag + '.json', 'utf8'));
const snap = JSON.parse(rec.json.result);
const bars = snap.bars; // [index,time,o,h,l,c]
const last = bars.length - 1;           // forming realtime bar
const lc = last - 1;                    // last confirmed bar position
const fx = n => n.toFixed(2);
// pivot semantics variants; Pine semantics are checked against the chart rather than assumed
function pivots(strictLeft, strictRight) {
  const out = [];
  for (let p = L; p + R <= lc; p++) {
    for (const kind of [1, -1]) {
      const v = kind === 1 ? bars[p][3] : bars[p][4];
      let ok = true;
      for (let k = 1; k <= L && ok; k++) { const w = kind === 1 ? bars[p - k][3] : bars[p - k][4]; ok = strictLeft ? (kind === 1 ? v > w : v < w) : (kind === 1 ? v >= w : v <= w); }
      for (let k = 1; k <= R && ok; k++) { const w = kind === 1 ? bars[p + k][3] : bars[p + k][4]; ok = strictRight ? (kind === 1 ? v > w : v < w) : (kind === 1 ? v >= w : v <= w); }
      if (ok) out.push({ p, c: p + R, kind, t: bars[p][1], price: v });
    }
  }
  return out;
}
const variants = { strictBoth: pivots(true, true), leftStrictRightLoose: pivots(true, false), leftLooseRightStrict: pivots(false, true), looseBoth: pivots(false, false) };
const tFirst = bars[L][1], tLastPivot = bars[lc - R][1];
const key = (t, kind, price) => t + '|' + kind + '|' + fx(price);
const result = { mode, tag, at: rec.at, study: snap.study, loadedBars: bars.length, firstBarTime: bars[0][1], formingBarTime: bars[last][1], lastConfirmedTime: bars[lc][1], determinableWindow: [tFirst, tLastPivot] };
const diff = (a, b) => ({ missing: [...a].filter(k => !b.has(k)), extra: [...b].filter(k => !a.has(k)) });
if (mode === 'labels') {
  const labs = snap.labels;
  const resolved = labs.filter(l => l.t !== null);
  const kindOf = l => l.text.startsWith('PH') ? 1 : -1;
  const inWin = resolved.filter(l => l.t >= tFirst && l.t <= tLastPivot);
  const actual = new Set(inWin.map(l => key(l.t, kindOf(l), l.y)));
  result.labelsTotal = labs.length; result.labelsResolved = resolved.length; result.labelsInWindow = inWin.length;
  result.labelsAfterLastConfirmablePivot = resolved.filter(l => l.t > tLastPivot).map(l => ({ t: l.t, text: l.text }));
  result.textMismatches = labs.filter(l => l.text !== (l.text.startsWith('PH') ? 'PH ' : 'PL ') + fx(l.y)).length;
  result.variants = {};
  for (const [name, ps] of Object.entries(variants)) { const exp = new Set(ps.map(x => key(x.t, x.kind, x.price))); const d = diff(exp, actual); result.variants[name] = { expected: exp.size, missing: d.missing.length, extra: d.extra.length, missingSample: d.missing.slice(0, 5), extraSample: d.extra.slice(0, 5) }; }
} else {
  const keep = Number(keepArg), ttl = ttlArg === undefined ? null : Number(ttlArg);
  const variantName = process.env.PIVOT_VARIANT || 'strictBoth';
  const piv = variants[variantName];
  const byConfirm = new Map(); for (const x of piv) { if (!byConfirm.has(x.c)) byConfirm.set(x.c, []); byConfirm.get(x.c).push(x); }
  let zones = []; let created = 0, delLimit = 0, delTtl = 0, broken = 0;
  for (let i = 0; i <= lc; i++) {
    const close = bars[i][5];
    for (const z of zones) if (z.state === 0) { z.right = i; if ((z.kind === 1 && close > z.top) || (z.kind === -1 && close < z.bot)) { z.state = 1; z.breakBar = i; z.breakClose = close; broken++; } }
    if (ttl !== null) { const before = zones.length; zones = zones.filter(z => !(z.state === 1 && i - z.breakBar >= ttl)); delTtl += before - zones.length; }
    // creation order in Pine: pivot high first, then pivot low
    for (const x of (byConfirm.get(i) || []).sort((a, b) => b.kind - a.kind)) {
      const p = x.p; const bodyHi = Math.max(bars[p][2], bars[p][5]), bodyLo = Math.min(bars[p][2], bars[p][5]);
      const top = x.kind === 1 ? x.price : bodyLo, bot = x.kind === 1 ? bodyHi : x.price;
      zones.push({ kind: x.kind, p, top, bot, state: 0, right: i, breakBar: -1, breakClose: null }); created++;
    }
    while (zones.length > keep) { zones.shift(); delLimit++; }
  }
  const T = i => bars[i][1];
  const text = z => (z.kind === 1 ? 'R ' + fx(z.top) : 'S ' + fx(z.bot)) + (z.state === 0 ? ' INTACT' : (ttl !== null ? ' BROKEN@' + fx(z.breakClose) : ' BROKEN'));
  const expected = zones.map(z => ({ kind: z.kind, t1: T(z.p), t2: T(z.right), top: z.top, bot: z.bot, mid: (z.top + z.bot) / 2, state: z.state, text: text(z), breakTime: z.breakBar >= 0 ? T(z.breakBar) : null }));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const boxes = snap.boxes.map(b => ({ t1: b.t1, t2: b.t2, top: Math.max(b.y1, b.y2), bot: Math.min(b.y1, b.y2), gray: null, raw: b }));
  const lines = snap.lines; const labels = snap.labels;
  const matches = expected.map(e => {
    const bx = boxes.filter(b => b.t1 === e.t1 && near(b.top, e.top) && near(b.bot, e.bot));
    const ln = lines.filter(l => l.t1 === e.t1 && near(l.y1, e.mid) && near(l.y2, e.mid));
    const lb = labels.filter(l => l.t === e.t1 && near(l.y, e.kind === 1 ? e.top : e.bot));
    return { t1: e.t1, kind: e.kind, expText: e.text, state: e.state, boxN: bx.length, lineN: ln.length, labelN: lb.length,
      boxRightOk: bx.length === 1 && bx[0].t2 === e.t2, lineRightOk: ln.length === 1 && ln[0].t2 === e.t2, textOk: lb.length === 1 && lb[0].text === e.text,
      actualText: lb[0]?.text ?? null, actualBoxT2: bx[0]?.t2 ?? null, expT2: e.t2 };
  });
  result.pivotVariant = variantName; result.keep = keep; result.ttl = ttl;
  result.simulatedWindowCounters = { created, deletedLimit: delLimit, deletedTtl: delTtl, broken, live: zones.length };
  result.actualCounts = { boxes: snap.boxes.length, lines: lines.length, labels: labels.length, boxesUnresolved: snap.boxes.filter(b => b.t1 === null).length, linesUnresolved: lines.filter(l => l.t1 === null).length, labelsUnresolved: labels.filter(l => l.t === null).length };
  result.expectedCount = expected.length;
  result.allMatched = matches.every(m => m.boxN === 1 && m.lineN === 1 && m.labelN === 1 && m.boxRightOk && m.lineRightOk && m.textOk) && snap.boxes.length === expected.length && lines.length === expected.length && labels.length === expected.length;
  result.preConfirmationObjects = snap.boxes.filter(b => b.t1 !== null && b.t1 > tLastPivot).length + labels.filter(l => l.t !== null && l.t > tLastPivot).length + lines.filter(l => l.t1 !== null && l.t1 > tLastPivot).length;
  result.newestExpectedPivotTime = expected.length ? Math.max(...expected.map(e => e.t1)) : null;
  result.matches = matches;
}
fs.writeFileSync(OUT + '/verify-' + tag + '.json', JSON.stringify(result, null, 2));
const brief = { ...result }; if (brief.matches) brief.matches = brief.matches.filter(m => !(m.boxN === 1 && m.lineN === 1 && m.labelN === 1 && m.boxRightOk && m.lineRightOk && m.textOk)).slice(0, 8);
console.log(JSON.stringify(brief));

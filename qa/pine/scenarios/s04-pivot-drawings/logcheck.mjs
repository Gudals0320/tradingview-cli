// Cross-check visible Pine log rows (read via pine console) against OHLC-derived pivots/breaks.
// Usage: node logcheck.mjs CONSOLE_TAG RESOLVE_TAG
import fs from 'node:fs';
const OUT = 'results/pine-scenarios/s04-pivot-drawings';
const [ctag, rtag] = process.argv.slice(2);
const entries = JSON.parse(fs.readFileSync(OUT + '/raw/' + ctag + '.json', 'utf8')).json.entries;
const snap = JSON.parse(JSON.parse(fs.readFileSync(OUT + '/raw/' + rtag + '.json', 'utf8')).json.result);
const bars = snap.bars; const byTime = new Map(bars.map((b, i) => [b[1], i]));
const num = s => Number(String(s).replace(/,/g, ''));
const rows = entries.filter(e => /CREATE|BREAK|DELETE/.test(e.message)).map(e => {
  const m = e.message.match(/^\[([^\]]+)\]: (\w+) (.*)$/); const kv = {}; for (const p of m[3].split(' ')) { const [k, v] = p.split('='); if (v !== undefined) kv[k] = v; }
  return { t: Date.parse(m[1]) / 1000, ev: m[2], kind: m[3].startsWith('ttl') ? 'ttl' : m[3].startsWith('limit') ? 'limit' : null, kv };
});
const res = { console: ctag, resolve: rtag, scriptRows: rows.length, byEvent: {}, checks: [] };
for (const r of rows) res.byEvent[r.ev + (r.kind ? ':' + r.kind : '')] = (res.byEvent[r.ev + (r.kind ? ':' + r.kind : '')] || 0) + 1;
for (const r of rows) {
  const i = byTime.get(r.t); const c = { t: r.t, ev: r.ev, inLoaded: i !== undefined };
  if (r.ev === 'CREATE') {
    c.confirmMinusPivot = num(r.kv.confirmBar) - num(r.kv.pivotBar);
    if (i !== undefined && i - 5 >= 0) { const p = bars[i - 5]; const k = Number(r.kv.kind);
      const top = k === 1 ? p[3] : Math.min(p[2], p[5]); const bot = k === 1 ? Math.max(p[2], p[5]) : p[4];
      c.priceOk = Math.abs(num(r.kv.top) - top) < 1e-6 && Math.abs(num(r.kv.bot) - bot) < 1e-6; }
  } else if (r.ev === 'BREAK') { if (i !== undefined) c.closeOk = Math.abs(num(r.kv.close) - bars[i][5]) < 1e-6; }
  res.checks.push(c);
}
res.createConfirmLagAll5 = res.checks.filter(c => c.ev === 'CREATE').every(c => c.confirmMinusPivot === 5);
res.createPriceChecked = res.checks.filter(c => c.priceOk !== undefined).length; res.createPriceOk = res.checks.filter(c => c.priceOk === true).length;
res.breakCloseChecked = res.checks.filter(c => c.closeOk !== undefined).length; res.breakCloseOk = res.checks.filter(c => c.closeOk === true).length;
fs.writeFileSync(OUT + '/logcheck-' + ctag + '.json', JSON.stringify(res, null, 2));
const { checks, ...brief } = res; console.log(JSON.stringify(brief));

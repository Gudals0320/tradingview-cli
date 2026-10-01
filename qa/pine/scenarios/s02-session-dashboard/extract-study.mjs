// S02 study-series extractor: reads the dashboard study's per-bar plot series straight from
// the chart model so verification does not depend on the (lossy) Pine console buffer.
// Usage: node qa/pine/scenarios/s02-session-dashboard/extract-study.mjs LABEL STUDY_ID
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'results/pine-scenarios/s02-session-dashboard';
mkdirSync(OUT + '/raw', { recursive: true });
const [label, studyId] = process.argv.slice(2);
if (!/^[a-z0-9_.-]+$/i.test(label || '')) throw new Error('safe label required');
if (!/^[A-Za-z0-9]{4,12}$/.test(studyId || '')) throw new Error('study id required');
const target = existsSync(OUT + '/target.txt') ? readFileSync(OUT + '/target.txt', 'utf8').trim() : null;

// NOTE: series values are laid out as [time, plot0, plot1, ...] — plot index i lives at value index i+1.
const expression = `(function(){
  var w=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model();
  var m=w.model();
  var s=m.dataSources().find(function(x){try{return x.id()==='${studyId}'}catch(e){return false}});
  if(!s) return JSON.stringify({error:'no study'});
  var meta=s.metaInfo();
  var titles=meta.plots.map(function(p){return (meta.styles&&meta.styles[p.id]&&meta.styles[p.id].title)||p.id});
  var at={}; titles.forEach(function(t,i){at[t]=i+1});
  var barSeries=m.mainSeries().bars();
  var barTimes=[], barVol=[], barHigh=[], barLow=[]; var byTime={};
  barSeries.each(function(i,v){barTimes.push(v[0]);barVol.push(v[5]);barHigh.push(v[2]);barLow.push(v[3]);
    byTime[v[0]]={v:v[5],h:v[2],l:v[3]};return false});
  var d=s.data(); var rows=[]; var prevH=null, prevR=null, prevIn=null, prevRb=null;
  var pick=function(i,val){return {i:i,t:val[0],hc:val[at.histCount],rm:val[at.removed],ins:val[at.inSession],
    rb:val[at.runBars],rv:val[at.runVol],rh:val[at.runHigh],rl:val[at.runLow],rt:val[at.runStartTs],
    lb:val[at.lastBars],lv:val[at.lastVol],lh:val[at.lastHigh],ll:val[at.lastLow],lr:val[at.lastRange],av:val[at.avgVol]}};
  for(var i=d.firstIndex();i<=d.lastIndex();i++){
    var v=d.valueAt(i); if(!v) continue;
    var row=pick(i,v); var b=byTime[row.t]||{}; row.bv=b.v; row.bh=b.h; row.bl=b.l;
    var changed=(prevH!==null&&row.hc!==prevH)||(prevR!==null&&row.rm!==prevR)
      ||(prevIn!==null&&row.ins!==prevIn)||(prevRb!==null&&row.rb!==prevRb&&row.rb===1);
    if(changed||rows.length<4) rows.push(row);
    prevH=row.hc; prevR=row.rm; prevIn=row.ins; prevRb=row.rb;
  }
  var lastIdx=d.lastIndex(); var lv=d.valueAt(lastIdx);
  var last={};
  titles.forEach(function(t,ii){last[t]=lv?lv[ii+1]:null});
  return JSON.stringify({study:'${studyId}',symbol:m.mainSeries().symbol(),resolution:m.mainSeries().interval(),
    barCount:barTimes.length,firstBar:barTimes[0],lastBar:barTimes[barTimes.length-1],titles:titles,
    seriesFirstIndex:d.firstIndex(),seriesLastIndex:lastIdx,seriesSize:d.size(),
    boundaryRows:rows,lastRow:{i:lastIdx,t:lv?lv[0]:null,values:last},barTimes:barTimes,barVol:barVol,barHigh:barHigh,barLow:barLow});
})()`;

const args = [...(target ? ['--target', target] : []), 'ui', 'eval', expression];
const started = Date.now();
const r = spawnSync(process.execPath, ['src/cli/index.js', ...args], { encoding: 'utf8', timeout: 65000, maxBuffer: 64 * 1024 * 1024 });
const rec = { label, at: new Date(started).toISOString(), args, elapsed_ms: Date.now() - started, exit_code: r.status, stdout: r.stdout, stderr: r.stderr };
writeFileSync(OUT + '/raw/' + label + '.json', JSON.stringify(rec, null, 2));
let summary = null;
try {
  const payload = JSON.parse(r.stdout);
  const data = JSON.parse(payload.result);
  summary = { exit_code: r.status, barCount: data.barCount, firstBar: new Date(data.firstBar * 1000).toISOString(),
    lastBar: new Date(data.lastBar * 1000).toISOString(), boundaryRowCount: data.boundaryRows.length, lastRow: data.lastRow };
} catch (e) { summary = { exit_code: r.status, parse_error: String(e), stdout_head: (r.stdout || '').slice(0, 400) }; }
console.log(JSON.stringify(summary, null, 1));


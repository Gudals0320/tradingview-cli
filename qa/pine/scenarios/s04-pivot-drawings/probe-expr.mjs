// Prints a read-only ui-eval expression resolving drawing x-coordinates of one study to bar times.
// Usage: node probe-expr.mjs STUDY_ID > file ; then run.mjs TAG -- ui eval <expr>
const id = process.argv[2];
if (!/^[A-Za-z0-9]{6}$/.test(id || '')) throw Error('study id required');
const body = `(()=>{const m=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().model();
const s=m.dataSources().find(s=>s.id&&s.id()==='${id}');if(!s)return {error:'study missing'};
const g=s._graphics,ix=g._indexes,bars=m.mainSeries().bars();
const t=x=>{const i=ix[x];if(i===undefined||i<=-1000000)return null;const v=bars.valueAt(i);return v?v[0]:null;};
const pc=g._primitivesCollection;const read=(k,sub)=>{const out=[];try{const c=pc[k].get(sub).get(false);c._primitivesDataById.forEach((v,pid)=>out.push(v));}catch(e){}return out;};
const labels=read('dwglabels','labels').map(v=>({id:v.id,x:v.x,t:t(v.x),y:v.y,text:v.t,ci:v.ci}));
const lines=read('dwglines','lines').map(v=>({id:v.id,x1:v.x1,x2:v.x2,t1:t(v.x1),t2:t(v.x2),y1:v.y1,y2:v.y2,ci:v.ci}));
const boxes=read('dwgboxes','boxes').map(v=>({id:v.id,x1:v.x1,x2:v.x2,t1:t(v.x1),t2:t(v.x2),y1:v.y1,y2:v.y2,c:v.c,bc:v.bc}));
const b=[];const f=bars.firstIndex(),l=bars.lastIndex();for(let i=f;i<=l;i++){const v=bars.valueAt(i);if(v)b.push([i,v[0],v[1],v[2],v[3],v[4]]);}
return {study:'${id}',studyName:s.metaInfo().description,indexes:ix.length,labels,lines,boxes,bars:b};})()`;
process.stdout.write('JSON.stringify(' + body.replace(/\n/g, '') + ')');

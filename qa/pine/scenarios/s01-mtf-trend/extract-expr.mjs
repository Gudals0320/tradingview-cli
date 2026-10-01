// Build a read-only ui-eval expression that dumps a study's plot rows + main series bars.
// Usage: node qa/pine/scenarios/s01-mtf-trend/extract-expr.mjs STUDY_ID > results/.../extract-expr.txt
const id = process.argv[2];
const expr = "(function(){var w=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model();var m=w.model();" +
 "var s=m.dataSources().find(function(x){try{return x.id()===" + JSON.stringify(id) + "}catch(e){return false}});if(!s)return JSON.stringify({error:'no study'});" +
 "var meta=s.metaInfo();var titles=meta.plots.map(function(p){return (meta.styles&&meta.styles[p.id]&&meta.styles[p.id].title)||p.id});" +
 "var d=s.data();var rows=[];d.each(function(i,v){rows.push(v.slice());return false;});" +
 "var b=m.mainSeries().bars();var bars=[];b.each(function(i,v){bars.push([v[0],v[1],v[2],v[3],v[4]]);return false;});" +
 "var inputs=null;try{inputs=JSON.parse(JSON.stringify(s.inputs()));delete inputs.text;}catch(e){};" +
 "return JSON.stringify({study:" + JSON.stringify(id) + ",resolution:m.mainSeries().interval(),symbol:m.mainSeries().symbol(),titles:titles,inputs:inputs,rows:rows,bars:bars});})()";
process.stdout.write(expr);

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { getOhlcv } from '../src/core/data.js';
import { setVisibleRange } from '../src/core/chart.js';

function fixture({size=365,first=1780790400,step=28800,more=false}={}) {
  let rows = Array.from({length:size},(_,i)=>[first+i*step,1,3,1,2,5]);
  let symbol='BINANCE:OPUSDT.P/BINANCE:BTCUSDT.P*1000000', loading=false, error=null, pages=0;
  const bars={firstIndex:()=>-20,lastIndex:()=>rows.length-21,size:()=>rows.length,valueAt:i=>rows[i+20]};
  const series={id:()=> 'series',bars:()=>bars,isLoading:()=>loading,status:()=>({error}),requestMoreDataAvailable:()=>more,
    requestMoreData:()=>{pages++;rows=Array.from({length:2},(_,i)=>[rows[0][0]-(2-i)*step,1,3,1,2,5]).concat(rows);}};
  const model={mainSeries:()=>series,timeScale:()=>({zoomToBarsRange:()=>{}})};
  const api={symbol:()=>symbol,resolution:()=> '480',chartType:()=>1,getVisibleRange:()=>({from:11,to:22}),_chartWidget:{id:()=> 'pane',model:()=>model}};
  const window={TradingViewApi:{_activeChartWidgetWV:{value:()=>api}},__tvCliWorkspace:{nonce:'generation'}};
  return {rows:()=>rows,setRows:v=>{rows=v;},setLoading:v=>{loading=v;},setError:v=>{error=v;},setSymbol:v=>{symbol=v;},pages:()=>pages,
    _deps:{evaluate:expr=>runInNewContext(expr,{window}),sleep:async()=>{},targetId:'qa'}};
}
it('synthetic range distinguishes overlap, outside, empty, loading and feed failure with common diagnostics',async()=>{
  const f=fixture(),from=1780963200,to=1782633600;
  const data=await getOhlcv({from,to,_deps:f._deps});
  const range=await setVisibleRange({from,to,_deps:f._deps});
  assert.equal(range.context.series_id,data.context.series_id);
  assert.equal(range.context.first_bar_time,data.context.first_bar_time);
  assert.equal(range.coverage.period_satisfied,true);
  await assert.rejects(setVisibleRange({from:1,to:2,_deps:f._deps}),e=>e.code==='RANGE_OUTSIDE_DATA'&&e.details.coverage.loaded.from===1780790400);
  f.setLoading(true);
  await assert.rejects(setVisibleRange({from,to,_deps:f._deps}),e=>e.code==='DATA_NOT_READY');
  f.setLoading(false); f.setError('feed unavailable');
  await assert.rejects(setVisibleRange({from,to,_deps:f._deps}),e=>e.code==='DATA_FEED_ERROR');
  f.setError(null);f.setRows([]);
  await assert.rejects(setVisibleRange({from,to,_deps:f._deps}),e=>e.code==='DATA_NOT_READY');
});
it('range history reports satisfied, feed_end, unknown and bounded guard termination',async()=>{
  const f=fixture({size:10,first:100,step:10,more:true});
  const result=await setVisibleRange({from:60,to:180,_deps:f._deps});
  assert.equal(f.pages(),2);assert.equal(result.loading.termination,'satisfied');
  for(const more of [false,null]){
    const f=fixture({size:10,first:100,step:10,more});
    const r=await setVisibleRange({from:60,to:180,_deps:f._deps});
    assert.equal(r.loading.termination,more===false?'feed_end':'unknown');assert.equal(f.pages(),0);
  }
  const g=fixture({size:10,first:10000,step:10,more:true});
  const r=await setVisibleRange({from:1,to:10080,_deps:g._deps});
  assert.equal(g.pages(),25);assert.equal(r.loading.termination,'guard');
});
it('20419 loaded bars export old period outside latest 20000 without filling session gaps',async()=>{
  const f=fixture({size:20419,first:100000,step:10});
  const tail=await getOhlcv({count:20000,_deps:f._deps});
  assert.equal(tail.bars[0].time,104190);
  const old=await getOhlcv({from:100000,to:100100,count:20,_deps:f._deps});
  assert.equal(old.bars[0].time,100000);assert.equal(old.bars.length,11);
  assert.equal(old.coverage.period_satisfied,true);assert.equal(old.count_satisfied,false);
  assert.equal(old.coverage.internal_gaps,'unknown');assert.equal(old.coverage.last_bar_complete,'unknown');
  const rows=f.rows().filter(r=>r[0]!==100050);f.setRows(rows);
  const gap=await getOhlcv({from:100000,to:100100,count:20,_deps:f._deps});assert.equal(gap.bars.length,10);
});
it('time cursor permits append and latest ticks, rejects prepend, past correction and changed identity',async()=>{
  for(const change of ['append','tick','prepend','past','symbol']){
    const f=fixture({size:20,first:100,step:10});
    const first=await getOhlcv({from:100,to:1000,count:5,_deps:f._deps});
    if(change==='append')f.setRows([...f.rows(),[300,1,3,1,2,5]]);
    if(change==='tick')f.rows().at(-1)[4]=3;
    if(change==='prepend')f.setRows([[90,1,3,1,2,5],...f.rows()]);
    if(change==='past')f.rows()[0][4]=3;
    if(change==='symbol')f.setSymbol('OTHER');
    const next=getOhlcv({cursor:first.next_cursor,count:5,_deps:f._deps});
    if(['append','tick'].includes(change)){const r=await next;assert.equal(r.bars[0].time,150);}
    else await assert.rejects(next,e=>e.code==='OHLCV_CONTEXT_CHANGED');
  }
});
it('final latest bar has no continuation; invalid cursor and range reject before evaluation',async()=>{
  const f=fixture({size:2,first:100,step:10});
  const r=await getOhlcv({from:100,to:110,count:2,_deps:f._deps});assert.equal(r.next_cursor,null);assert.equal(r.has_more,false);
  for(const options of [{cursor:'bad'},{from:1},{from:10,to:1}])await assert.rejects(getOhlcv({...options,_deps:{evaluate:()=>assert.fail('no evaluation')}}));
});

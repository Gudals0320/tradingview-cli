import { it } from 'node:test';
import assert from 'node:assert/strict';
import { symbolSearch } from '../src/core/chart.js';
import '../src/cli/commands/chart.js';
import { registeredCommands } from '../src/cli/router.js';

it('search exposes targets after result 15 and preserves provider identifiers and unknown total',async()=>{
  const rows=Array.from({length:20},(_,i)=>({symbol:`QA${i}`,prefix:'EX',type:i===18?'futures':'stock'}));
  let url;
  const _deps={fetch:async value=>{url=new URL(value);return {ok:true,json:async()=>({symbols:rows})};}};
  const first=await symbolSearch({query:'QA',exchange:'EX',type:'futures',_deps});
  assert.equal(url.searchParams.get('exchange'),'EX');assert.equal(url.searchParams.get('search_type'),'futures');
  assert.equal(first.count,15);assert.equal(first.cli_truncated,true);assert.equal(first.provider.total,null);assert.equal(first.provider.remaining,null);
  const page=await symbolSearch({query:'QA',offset:15,_deps});
  assert.equal(page.results[3].type,'futures');assert.equal(page.results[3].full_name,'EX:QA18');assert.equal(page.results[3].provider_symbol,'QA18');
  assert.equal(page.cli_truncated,false);assert.equal(page.count,5);assert.equal(page.provider.pagination,'unverified');
});
it('search separates observed provider remaining from CLI truncation and rejects blocked or malformed responses',async()=>{
  const r=await symbolSearch({query:'QA',_deps:{fetch:async()=>({ok:true,json:async()=>({symbols:[],symbols_remaining:200})})}});
  assert.equal(r.provider.remaining,200);assert.equal(r.provider.total,null);assert.equal(r.cli_truncated,false);
  for(const response of [{ok:false,status:403},{ok:true,status:200,json:async()=>{throw new Error('HTML');}}]){
    await assert.rejects(symbolSearch({query:'QA',_deps:{fetch:async()=>response}}),e=>e.code==='SEARCH_PROVIDER_BLOCKED');
  }
  await assert.rejects(symbolSearch({query:'QA',_deps:{fetch:async()=>({ok:true,json:async()=>({other:[]})})}}),e=>e.code==='SEARCH_PROVIDER_SCHEMA');
});
it('search CLI handler forwards exact filters, count and offset to provider behavior',async()=>{
  const original=globalThis.fetch;
  let url;
  globalThis.fetch=async value=>{url=new URL(value);return {ok:true,json:async()=>[{symbol:'A'},{symbol:'B',type:'swap',exchange:'EX'}]};};
  try{
    const r=await registeredCommands().get('search').handler({exchange:'EX',type:'swap',count:'1',offset:'1'},['A']);
    assert.equal(url.searchParams.get('search_type'),'swap');assert.equal(url.searchParams.get('exchange'),'EX');assert.equal(r.results[0].symbol,'B');
  }finally{globalThis.fetch=original;}
});

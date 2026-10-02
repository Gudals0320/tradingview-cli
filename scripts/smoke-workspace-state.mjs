import CDP from '../src/cdp.js';
import { WORKSPACE_PAGE_CODE } from '../src/workspace-page.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const targets=await CDP.List({host:'127.0.0.1',port:9222});
const rows=[];
for(const target of targets.filter(row=>/tradingview\.com\/chart\//.test(row.url))) {
  const client=await CDP({host:'127.0.0.1',port:9222,target:target.id});
  try {
    const result=await client.Runtime.evaluate({returnByValue:true,awaitPromise:true,expression:`(async()=>{${WORKSPACE_PAGE_CODE};const s=readWorkspacePage(window,document);const charts=await new Promise(resolve=>window.TradingViewApi.getSavedCharts(resolve));return {snapshot:s,charts:charts.map(c=>({id:c.id,uid:c.uid,short_id:c.short_id,name:c.name,url:c.url,keys:Object.keys(c)}))};})()`});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description);
    const value=result.result.value;
    rows.push({target:target.id,url:target.url,...value,snapshot:{...value.snapshot,source:undefined,source_hash:createHash('sha256').update(value.snapshot.source||'').digest('hex'),studies:value.snapshot.studies.map(s=>({...s,inputs:s.inputs.filter(i=>i.id!=='text')}))}});
  }finally{await client.close();}
}
writeFileSync(process.argv[2]||'results/issue29/state.json',JSON.stringify({at:new Date().toISOString(),rows},null,2));
console.log(JSON.stringify({success:true,targets:rows.length}));

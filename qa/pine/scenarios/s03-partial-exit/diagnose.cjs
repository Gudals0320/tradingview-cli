const fs=require('fs');
const CDP=require('chrome-remote-interface');
(async()=>{
 const targets=await (await fetch('http://127.0.0.1:9222/json/list')).json();
 const ids=['890408E3FA96D8076A7D49A8B3AF200A','358BB580C74E309A605A52D3EDC6BDF9'];
 const rows=[];
 for(const id of ids){
  const c=await CDP({host:'127.0.0.1',port:9222,target:id});
  const result=await c.Runtime.evaluate({expression:'JSON.stringify({url:location.href,studies:window.TradingViewApi?._activeChartWidgetWV.value().getAllStudies()})',returnByValue:true});
  rows.push({requested:id,metadata:targets.find(t=>t.id===id)?.url,result});
  await c.close();
 }
 fs.writeFileSync('results/pine-scenarios/s03-partial-exit/direct-target-diagnosis.json',JSON.stringify(rows,null,2));
 console.log(JSON.stringify(rows));
})();

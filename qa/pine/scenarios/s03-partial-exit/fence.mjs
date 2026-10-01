import CDP from 'chrome-remote-interface';
import fs from 'node:fs';
import {findPineController, findPineEditor} from '../../../../src/core/desktop-dom.js';
const [tag,expectedId]=process.argv.slice(2);
const client=await CDP({host:'127.0.0.1',port:9222,target:'890408E3FA96D8076A7D49A8B3AF200A'});
try {
 const {result,exceptionDetails}=await client.Runtime.evaluate({expression:`(()=>{const c=(${findPineController.toString()})(document);const e=(${findPineEditor.toString()})(document);return {url:location.href,id:c?.getScriptIdVersion()?.scriptIdPart||null,version:c?.getScriptIdVersion()?.version||null,title:e?.editor.getValue().split(String.fromCharCode(10)).find(s=>s.startsWith('strategy(')||s.startsWith('indicator('))?.split('"')[1]||null};})()`,returnByValue:true});
 const state=result.value;
 fs.writeFileSync(`results/pine-scenarios/s03-partial-exit/${tag}-fence.json`,JSON.stringify({expectedId,state,exceptionDetails},null,2));
 if(exceptionDetails||state?.url!=='https://kr.tradingview.com/chart/8b3vQsAK/'||state?.id!==expectedId)throw Error('Document/target fence mismatch: '+JSON.stringify(state));
 const expectedTitle=expectedId==='USER;6b325663a8a24b548558d60895ec3bc8'?'CLI-QA-S02 Session Dashboard 20261001':'CLI-QA-S03-EMA';
 if(state.title!==expectedTitle)throw Error('Title fence mismatch: '+state.title);
 console.log(JSON.stringify(state));
} finally {await client.close();}

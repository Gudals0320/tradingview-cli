import {evalPage,state} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const result=await evalPage(`(() => {const chart=window.TradingViewApi._activeChartWidgetWV.value();const source=chart._chartWidget.model().model().dataSources().find(s=>{try{return chart.getStudyById(s.id()).getInputValues().find(i=>i.id==='pineId')?.value===${JSON.stringify(state.activeId)}}catch{return false}});
let p=source,methods=[];for(let i=0;i<5&&p;i++,p=Object.getPrototypeOf(p))methods.push(...Object.getOwnPropertyNames(p));
const op=window.__tvCliPineCompile,epoch=window.__tvCliCompilation;
return {methods:[...new Set(methods)].filter(m=>/restart|reload|recalc|process|force|reset/i.test(m)),
 functions:Object.fromEntries([...new Set(methods)].filter(m=>/restart|recalc/i.test(m)&&typeof source[m]==='function').map(m=>[m,String(source[m])])),
 epoch:epoch?{phase:epoch.phase,allow:epoch.allow_same_identity_refresh,calculation:epoch.calculation,report_verified:epoch.report_verified}:null,
 operation:op?{started:op.started,completed:op.completed,actionDone:op.actionDone,error:op.error,validation:op.check?.()}:null};})()`);
writeFileSync('results/pine-issue-13/native-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

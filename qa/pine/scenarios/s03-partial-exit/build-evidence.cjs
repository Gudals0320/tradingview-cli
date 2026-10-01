const fs=require('fs'),crypto=require('crypto');
const qa='qa/pine/scenarios/s03-partial-exit/',raw='results/pine-scenarios/s03-partial-exit/';
const rec=tag=>JSON.parse(fs.readFileSync(raw+tag+'.json'));
const data=tag=>rec(tag).json;
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const source=fs.readFileSync(qa+'final.pine','utf8');
const meta=s=>Object.fromEntries(s.split(';').slice(1).map(p=>{const [k,v]=p.split('=');return[k,Number(v)]}));
const rows=data('128-last-tables').studies[0].tables[0].rows;
const trace=rows.slice(2).map(s=>{const p=s.split('|');return {trade:Number(p[0]),time:Number(p[1]),event:p[2],...Object.fromEntries(p.slice(3).map(a=>{const [k,v]=a.split('=');return[k,Number(v)]}))};});
function analyze(tag){
 const ledger=data(tag),groups=Object.groupBy(ledger.trades,t=>meta(t.raw.e.c).T);
 const trades=Object.entries(groups).map(([id,legs])=>{const entry=legs[0].raw.e;const m=meta(entry.c);return {trade:Number(id),entryPrice:entry.p,initialR:m.R,entryTime:legs[0].entry_time,totalExited:legs.reduce((n,t)=>n+t.raw.q,0),legs:legs.map(t=>({qty:t.raw.q,reason:t.raw.x.c.split(';')[0],exitPrice:t.raw.x.p,exitTime:t.exit_time,holdingBars:t.exit_bar-t.entry_bar,...meta(t.raw.x.c)}))};});
 return {tradeCount:ledger.total_trades,positionCount:trades.length,partialCount:trades.flatMap(t=>t.legs).filter(l=>l.reason==='TP1R').length,timeCount:trades.flatMap(t=>t.legs).filter(l=>l.reason==='TIME').length,residualTimeCount:trades.flatMap(t=>t.legs).filter(l=>l.reason==='TIME'&&l.qty===5).length,trades};
}
const normal=analyze('127-last-ledger'),time=analyze('110-fillcount-time-ledger'),timeWide=analyze('079-time-ledger');
const manage=trace.filter(t=>t.event==='MANAGE');
const tp=normal.trades.filter(t=>t.legs.some(l=>l.reason==='TP1R'));
const orders=data('129-last-trades').trades;
const fillChecks=orders.filter(o=>!o.entry).map(o=>({id:o.id,qty:o.qty,price:o.price,matched:normal.trades.some(t=>t.legs.some(l=>l.qty===o.qty&&Math.abs(l.exitPrice-o.price)<1e-8&&l.reason===(o.id==='TP50'?(o.type==='LIMIT'?'TP1R':'INITIAL'):'RUNNER')))}));
const assertions={
  allPositionsExitExactly10:normal.trades.every(t=>t.totalExited===10),
  allNormalLegs5:normal.trades.every(t=>t.legs.length===2&&t.legs.every(l=>l.qty===5)),
  actualTP1R:tp.length===6,
  tpPricesWithinOneTick:tp.every(t=>Math.abs(t.legs.find(l=>l.reason==='TP1R').exitPrice-t.entryPrice-t.initialR)<=0.01000001),
  allLedgerRConstant:normal.trades.every(t=>t.legs.every(l=>l.R===t.initialR)),
  allTraceRMatchesEntry:trace.every(t=>Math.abs(t.R-normal.trades.find(p=>p.trade===t.trade).initialR)<1e-8),
  allManageStopNondecreasing:manage.every(t=>t.stop>=t.prev),
  afterPartialStopAtLeastEntry:manage.filter(t=>t.qty===5).every(t=>t.stop>=t.entry),
  allPartialRunnerStopsAtLeastEntry:tp.every(t=>t.legs.find(l=>l.reason==='RUNNER').S>=t.entryPrice),
  runnerFillWithinOneTickOfIssuedStop:normal.trades.flatMap(t=>t.legs).filter(l=>l.reason==='RUNNER').every(l=>Math.abs(l.exitPrice-l.S)<=0.01000001),
  finalRunnerStopMatchesLastTrace:normal.trades.every(t=>{const events=trace.filter(e=>e.trade===t.trade&&e.event==='MANAGE');const last=events.at(-1)?.stop??t.entryPrice-t.initialR;const runner=t.legs.find(l=>l.reason==='RUNNER');return tp.some(p=>p.trade===t.trade)&&events.length===0 ? runner.S===t.entryPrice : Math.abs(runner.S-last)<1e-8;}),
  latestFilledOrdersMatchLedger:fillChecks.every(f=>f.matched),
  residualTimeActuallyOccurs:time.residualTimeCount===3,
  allTimeHoldingBarsExactly3:time.trades.flatMap(t=>t.legs).filter(l=>l.reason==='TIME').every(l=>l.holdingBars===3),
  allTimePositionsExitExactly10:time.trades.every(t=>t.totalExited===10),
  wideRiskTimeActuallyOccurs:timeWide.timeCount===17&&timeWide.trades.every(t=>t.legs.length===1&&t.legs[0].qty===10&&t.legs[0].holdingBars===1),
  counterMatchesPartialLedger:rows[0].startsWith('partialFills=6;timeFills=0;'),
  counterMatchesTimeLedger:data('111-fillcount-time-tables').studies[0].tables[0].rows[0].startsWith('partialFills=6;timeFills=4;'),
  localEditorReopenHashEqual:sha(source)===sha(data('121b-final-get').source)&&sha(source)===sha(data('121d-final-reopened-get').source),
  currentReportHashEqual:sha(source)===sha(data('121d-final-reopened-get').source)&&data('121-final-strategy').source_hash===sha(source),
  finalOnePineStudy:data('122-final-state').studies.filter(s=>s.name==='CLI-QA-S03-EMA').length===1,
  finalNoDialogs:JSON.parse(data('125-final-ui').result).dialogs===0,
  finalRawReportReady:data('120-final-raw').report_ready===true,
};
const sanitize=(value,key)=>{
 if(key==='text'&&typeof value==='string')return '[compiled payload omitted]';
 if(key==='source'&&typeof value==='string'&&value.includes('\n'))return {sha256:sha(value),chars:value.length};
 if(key==='scripts')return value.filter(s=>s.name==='CLI-QA-S03-EMA').map(s=>({id:s.id,name:s.name,title:s.title,version:s.version}));
 if(key==='tabs')return value.filter(s=>['8b3vQsAK','kdn7wAFi','nipHauoX'].includes(s.chart_id)).map(s=>({id:s.id,chart_id:s.chart_id,active:s.active,resolved:s.resolved}));
 if(key==='strategy_inputs'||key==='inputs')return value.filter(i=>i.id!=='text');
 if(Array.isArray(value))return value.map(v=>sanitize(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,k)]));
 return value;
};
const log=fs.readFileSync(raw+'commands.jsonl','utf8').trim().split('\n').map(JSON.parse);
const summarize=r=>{
 if(r.tag==='024-ui-state')return {success:r.json.success,note:'Private account labels omitted; see ignored raw.'};
 const j=sanitize(r.json);
 if(j?.trades){const list=j.trades;j.trades_summary={returned:list.length,first:list[0],last:list.at(-1)};delete j.trades;}
 if(j?.entries){j.entries_summary={returned:j.entries.length,first:j.entries[0],last:j.entries.at(-1)};delete j.entries;}
 if(j?.studies)for(const study of j.studies)if(study.tables)for(const table of study.tables){table.rows_summary={returned:table.rows.length,header:table.rows[0],last:table.rows.at(-1)};delete table.rows;}
 if(j?.strategy_inputs)j.strategy_inputs=j.strategy_inputs.filter(i=>['pineId','pineVersion','in_0','in_1','in_2','in_7','in_8'].includes(i.id));
 return j;
};
const commands=log.map(r=>({tag:r.tag,command:r.command,exit:r.status,duration_ms:r.duration_ms,started:r.started,raw:r.tag+'.json',eligibleAcceptance:Number.parseInt(r.tag)>=56,json_summary:summarize(r),stderr:r.stderr||undefined}));
const restoration=JSON.parse(fs.readFileSync(raw+'s02-restoration-verification.json'));
const criteria=[
 {id:'C1',status:'PASS',claim:'Dedicated saved baseline ran and emitted real full-size bracket fills.',refs:['063-named-baseline-compile','064-named-baseline-trades']},
 {id:'C2',status:'PASS',claim:'6 actual TP1R qty5 fills; 17 positions each exited exactly10, each normal leg5; report open PL0; latest filled orders independently matched ledger.',refs:['127-last-ledger','128-last-tables','129-last-trades']},
 {id:'C3',status:'PASS',claim:'Entry/exit/trace R matched; 28 observed MANAGE records have no stop retreat; all 6 TP runner issued stops at/above entry; all runner fills within one price tick.',refs:['127-last-ledger','128-last-tables']},
 {id:'C4',status:'PASS',claim:'Separate maxBars3 run: 4 actual TIME exits including 3 residual qty5; maxBars1 risk10 run: 17 TIME qty10 exits. maxBars12 has zero TIME and is not time-pass evidence.',refs:['110-fillcount-time-ledger','111-fillcount-time-tables','079-time-ledger','080-time-strategy','081-time-trades']},
 {id:'C5',status:'PASS',claim:'After documented recovery workaround one Pine study, same saved main ID/study ID, current report hash and successful raw report_ready true.',refs:['119b-freshen-compile','119c-freshen-retry','120-final-raw','121-final-strategy','122-final-state']},
 {id:'C6',status:'PASS',claim:'Entire source save/open/another-document switch preserved normalized SHA and exact saved ID/name.',refs:['113-final-save','114-final-get','115-switch-s02-open','116-switch-s02-get','117-switch-main-open','118-final-reopened-get','121a-final-save','121b-final-get','121c-final-open','121d-final-reopened-get','124-final-list']},
 {id:'C7',status:'FAIL',claim:'Expected direct saved valid-source recovery compile returned bare Rejected; later compile after CRLF reopen also Rejected. Workaround success is separate.',refs:['091-error-compile','092-error-diagnostics','095-fixed-compile','095c-fixed-strategy','119-final-retry']},
 {id:'C8',status:'FAIL',claim:'Early harness used shared QA fallback and continued after open failure, overwriting S02 saved source. Restored source/server-reopen hash/status; version history changed5→8. Excluded commands001–055 from functional acceptance.',refs:['026-page-identity','041-isolated-open','043-isolated-baseline-compile','046-isolated-final-compile','053-restore-s02-save','084-s02-restore-reopen','085-s02-reopened-get','s02-restoration-verification.json']},
 {id:'C9',status:'NOT TESTED',claim:'Real-time waiting, live broker execution, full unbounded history, and every intrabar stop transition were not tested.'},
];
criteria[2].claim=criteria[2].claim.replace('28 observed',manage.length+' observed');
const evidence={scenario:'S03 partial exits',outcome:'Functional acceptance PASS with recovery workaround; direct compile recovery and early isolation discipline FAIL',date:'2026-10-01 Asia/Seoul',target:'890408E3FA96D8076A7D49A8B3AF200A',layout:'CLI-QA-S03-20261001',chart:'8b3vQsAK',saved:{id:'USER;d90436c7ff524821b19882294c3c4548',name:'CLI-QA-S03-EMA',version:'9.0',study:'IC4e6I'},sourceHashes:{baseline:sha(fs.readFileSync(qa+'baseline.pine','utf8')),delayedProtection:sha(fs.readFileSync(qa+'delayed-protection.pine','utf8')),injected:sha(fs.readFileSync(qa+'function-error.pine','utf8')),final:sha(source),editor:sha(data('121b-final-get').source),reopened:sha(data('121d-final-reopened-get').source),report:data('121-final-strategy').source_hash},criteria,assertions,normal,time,timeWide,trace,fillChecks,diagnosticLimit:{observedPartialCounter:4,actualPartialFills:6,missingIntrabarTraceTrades:[1,8],reason:'Normal var/array end-of-bar trace omits same-bar round trips; final fill counter uses closed-trade records. Intrabar ledger stop comments prove both at breakeven; no claimed complete tick trace.'},restoration:{expectedHash:restoration.expectedHash,reopenedHash:restoration.reopenedHash,originalSavedVersion:'5.0',finalSavedVersion:'8.0',originalStudyVersion:'5.0',finalStudyVersion:'8.0',comparisons:restoration.comparisons,studyVersionMismatchRetained:true,secondSwitchReopenHash:sha(data('116-switch-s02-get').source)},defects:[{id:'D1',trigger:'set invalid function → save5 → compile rejected; set correct source → save6 → compile rejected; data strategy REPORT_PENDING',observations:1,independentReproductions:1,refs:['089-injected-set','090-injected-save','091-error-compile','092-error-diagnostics','093-fixed-set','094-fixed-save','095-fixed-compile','095c-fixed-strategy'],workaround:'Change harmless comment, then compile --save. Same document/study preserved.',suspected:'Native action rejects saved auto-applied source; CLI dispatch/freshness path fails to recognize current strategy.'},{id:'D2',trigger:'Source version8 saved/reopened as CRLF; normalized hash equal but raw hash different; compile after reopen rejected.',observations:1,independentReproductions:1,refs:['114-final-get','118-final-reopened-get','119-final-retry'],workaround:'Comment refresh plus compile --save; after final version9 save/open source hashes match and report remains readable.',suspected:'session.js sourceHash hashes raw line endings; strategy-state.js beginCompilation sees hash mismatch and dispatches disabled native action. Inference from code and observed source strings.'}],commands};
fs.writeFileSync(qa+'evidence.json',JSON.stringify(evidence,null,2));
fs.writeFileSync(raw+'numeric-verification.json',JSON.stringify({assertions,normal,time,timeWide,trace,fillChecks},null,2));
console.log(JSON.stringify({normalPositions:normal.positionCount,normalClosedLegs:normal.tradeCount,partialFills:normal.partialCount,manageRecords:manage.length,timeFills:time.timeCount,residualTimeFills:time.residualTimeCount,finalHash:sha(source),failedAssertions:Object.entries(assertions).filter(([k,v])=>!v).map(([k])=>k)}));
if(Object.values(assertions).some(v=>v!==true))throw Error('Independent numeric/source assertion failed; inspect evidence.json');

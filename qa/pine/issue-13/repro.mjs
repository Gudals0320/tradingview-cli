import {create,cli,open,state,inspect} from './harness.mjs';
import assert from 'node:assert/strict';
const strategy='CLI-QA-I13-Strategy',sentinel='CLI-QA-I13-Sentinel';
const source=`//@version=6\nstrategy("${strategy}")\nfast=ta.sma(close,5)\nslow=ta.sma(close,20)\nif ta.crossover(fast,slow)\n    strategy.entry("L",strategy.long)\nif ta.crossunder(fast,slow)\n    strategy.close("L")\nplot(fast)\n`;
if(!state.documents[strategy]){await create(strategy,'strategy',source);const applied=await cli('R1-first',['pine','compile']);assert.equal(applied.out.report_ready,true);await cli('R1-immediate',['pine','compile']);
 await create(sentinel,'indicator',`//@version=6\nindicator("${sentinel}")\nplot(close)\n`);}
await open(strategy,'R1-reopen');
const v=await inspect();assert.equal(v.source.replace(/\r\n/g,'\n'),source);
await cli('R1-reopened-raw',['pine','raw-compile'],{exit:1});await cli('R1-report-after-reject',['data','strategy'],{exit:1});
await cli('R2-set-valid',['pine','set'],{input:source.replace('close,5','close,9')});
await cli('R2-save-valid',['pine','save']);await cli('R2-compile-valid',['pine','compile'],{exit:1});

import {create,cli,open,state,inspect,evalPage} from './harness.mjs';
import assert from 'node:assert/strict';
const name='CLI-QA-I13-R1Fresh',sentinel='CLI-QA-I13-Sentinel';
const source=`//@version=6\nstrategy("${name}")\nfast=ta.sma(close,5)\nslow=ta.sma(close,20)\nif ta.crossover(fast,slow)\n    strategy.entry("L",strategy.long)\nif ta.crossunder(fast,slow)\n    strategy.close("L")\nplot(fast)\n`;
if(!state.documents[name]){await create(name,'strategy',source);assert.equal((await cli('R1fix-first',['pine','compile'])).out.report_ready,true);}
await open(sentinel,'R1fix-away');await open(name,'R1fix-back');
assert.equal((await cli('R1fix-normal',['pine','compile'])).out.unchanged,true);
assert.equal((await cli('R1fix-raw',['pine','raw-compile'])).out.unchanged,true);
await cli('R1fix-data',['data','strategy']);
await cli('R2fix-edit',['pine','set'],{input:source.replace('close,5','close,9')});await cli('R2fix-save',['pine','save']);
assert.equal((await cli('R2fix-compile',['pine','compile'])).out.report_ready,true);
// A cold-page equivalent loses CLI-only state, while keeping the real target,
// source/version/inputs. It must actually refresh and observe a new calculation.
await evalPage(`(() => {window.__tvCliCompilation?.dispose?.();for(const e of window.__tvCliVerifiedStrategies?.values()||[])e.dispose?.();delete window.__tvCliCompilation;delete window.__tvCliVerifiedStrategies;return true;})()`);
assert.equal((await cli('R2fix-no-cache-refresh',['pine','compile'])).out.report_ready,true);
const latest=await inspect();assert.equal(latest.studies.filter(s=>s.pine_id===state.documents[name]).length,1);

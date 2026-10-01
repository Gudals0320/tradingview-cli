import {create,cli,state,evalPage,inspect} from './harness.mjs';
import {findPineController} from '../../../src/core/desktop-dom.js';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const name=process.argv[2]||'CLI-QA-I13-OldApplied',kind=process.argv[3]==='strategy'?'strategy':'indicator';
const code=n=>kind==='strategy'?`//@version=6\nstrategy("${name}")\nfast=ta.sma(close,${n})\nslow=ta.sma(close,20)\nif ta.crossover(fast,slow)\n    strategy.entry("L",strategy.long)\nif ta.crossunder(fast,slow)\n    strategy.close("L")\nplot(fast)\n`:`//@version=6\nindicator("${name}")\nperiod=${n}\nplot(ta.sma(close,period))\n`;
assert.equal(state.documents[name],undefined);
await create(name,kind,code(5));await cli('R2old-edit-'+kind,['pine','set'],{input:code(11)});await cli('R2old-save-'+kind,['pine','save']);
// Native version-menu action: initially apply v1 while the saved editor is v2.
// This is setup, not a removal/re-add workaround or a fabricated input identity.
const before=await inspect();await evalPage(`(async()=>{const c=(${findPineController})(document);await c.addSpecificVersionToChart('1.0');return true;})()`);
let old=await inspect();for(let i=0;i<25&&old.studies.filter(s=>s.pine_id===state.documents[name]).length===0;i++){await new Promise(r=>setTimeout(r,200));old=await inspect();}
writeFileSync('results/pine-issue-13/old-applied-setup.json',JSON.stringify({before,old},null,2));
const found=old.studies.filter(s=>s.pine_id===state.documents[name]);assert.equal(found.length,1);assert.equal(found[0].version,'1.0');assert.equal(old.version,'2.0');assert.equal(old.modified,false);
const updated=await cli('R2old-refresh-'+kind,['pine','compile','--save']);assert.equal(updated.out.compiled,true);
const now=updated.after.studies.filter(s=>s.pine_id===state.documents[name]);assert.equal(now.length,1);assert.equal(now[0].version,'2.0');assert.equal(now[0].id,found[0].id);
assert.equal(updated.out.save_performed,false);if(kind==='strategy')assert.equal(updated.out.report_ready,true);

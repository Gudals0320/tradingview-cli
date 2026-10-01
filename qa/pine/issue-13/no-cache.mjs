import {cli,open,evalPage,state} from './harness.mjs';
import assert from 'node:assert/strict';
await open('CLI-QA-I13-R1Fresh','R2refresh-open');
await evalPage(`(() => {window.__tvCliCompilation?.dispose?.();for(const e of window.__tvCliVerifiedStrategies?.values()||[])e.dispose?.();delete window.__tvCliCompilation;delete window.__tvCliVerifiedStrategies;return true;})()`);
const refreshed=await cli('R2refresh-no-cache',['pine','compile']);assert.equal(refreshed.out.report_ready,true);
assert.equal(refreshed.out.button_clicked,'refreshSavedOnChart');
await cli('R2refresh-data',['data','strategy']);
const expected=state.documents['CLI-QA-I13-R1Fresh'];assert.equal(refreshed.after.studies.filter(s=>s.pine_id===expected).length,1);

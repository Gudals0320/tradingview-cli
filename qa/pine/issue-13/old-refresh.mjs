import {cli,open,state} from './harness.mjs';
import assert from 'node:assert/strict';
const name='CLI-QA-I13-OldApplied';await open(name,'R2old-final-open');
const r=await cli('R2old-final-refresh',['pine','compile','--save']);const target=r.after.studies.filter(s=>s.pine_id===state.documents[name]);
assert.equal(target.length,1);assert.equal(target[0].version,r.after.version);assert.equal(r.out.compiled,true);

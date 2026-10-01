import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cli, writeEvidence, identity } from './live-utils.mjs';
const iterations=Number(process.env.QA_ITERATIONS||500),evidence={iterations,started_at:new Date().toISOString(),steps:[]};
try {
  for(const name of process.env.QA_FOUR==='1'?['a','b','c','d']:['a','b']){
    const base=readFileSync(new URL(`fixture-${name==='b'?'b':'a'}.pine`,import.meta.url),'utf8').replace('Codex I14 A 20261001',`Codex I14 ${name.toUpperCase()} 20261001`);
    const source=base.replace('average = ta.sma(close, length)',`average = ta.sma(close, length)\naccumulator = 0.0\nfor index = 1 to ${iterations}\n    accumulator += math.sin(close + index) * math.cos(close - index)\nendDate = timestamp("UTC", 2026, 9, 30, 0, 0)`)
      .replace('if ta.crossover(close, average)','if ta.crossover(close, average) and time < endDate')
      .replace('if ta.crossunder(close, average)','if ta.crossunder(close, average) or time >= endDate')
      .replace('plot(average)','plot(average + accumulator / '+iterations+' * 0.01)');
    const path=new URL(`live/heavy-${name}.pine`,import.meta.url);writeFileSync(path,source);
    for(const args of [['pine','set','--file',`qa/parallel/issue-14/live/heavy-${name}.pine`],['pine','compile','--save']]){
      const result=await cli(args,{workspace:name});evidence.steps.push({worker:name,...result});writeEvidence(process.env.QA_FOUR==='1'?'prepare-heavy-four.json':'prepare-heavy.json',evidence);
      assert.equal(result.result?.success,true,result.stderr||JSON.stringify(result.result));console.log(name,args.join(' '),result.ms,'ms');
    }
  }
  evidence.identities=await Promise.all(['a','b'].map(identity));evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence(process.env.QA_FOUR==='1'?'prepare-heavy-four.json':'prepare-heavy.json',evidence);}

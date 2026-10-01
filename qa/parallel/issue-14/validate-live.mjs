import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { cli, identity, manifest, activeTabs, writeEvidence } from './live-utils.mjs';
const evidence={started_at:new Date().toISOString(),steps:[],active_before:await activeTabs()};
async function run(args,workspace='a',allowFailure=false){const result=await cli(args,{workspace});evidence.steps.push({workspace,...result});writeEvidence('validation.json',evidence);if(!allowFailure)assert.equal(result.result?.success,true,result.stderr||JSON.stringify(result.result));return result;}
try {
  const a=manifest('a'),b=manifest('b'),studyA=a.binding.snapshot.studies[0].id,studyB=b.binding.snapshot.studies[0].id;
  const originalVersion=(await identity('a')).version;
  for(const args of [['state'],['symbol'],['timeframe'],['type'],['info'],['pine','get'],['pine','set','--file','qa/parallel/issue-14/fixture-a.pine'],
    ['pine','errors'],['pine','console'],['pine','save'],['pine','compile'],['pine','raw-compile'],['indicator','get',studyA],
    ['indicator','set',studyA,'--inputs',JSON.stringify({in_0:26})],['workspace','wait'],['data','strategy'],['data','trades'],['data','ledger'],['data','equity']]){
    const result=await run(args,'a',args.join(' ')==='data equity');
    if(args.join(' ')==='data equity')assert.ok(result.result?.success===true||result.result?.code==='EQUITY_UNAVAILABLE');
  }
  evidence.identical_source_version_stable=(await identity('a')).version===originalVersion;
  assert.equal(evidence.identical_source_version_stable,true);
  const beforeB=await identity('b');
  await run(['symbol','BITSTAMP:ETHUSD']);await run(['timeframe','1D']);
  const afterB=await identity('b');assert.deepEqual(afterB,beforeB);evidence.symbol_timeframe_isolation={before:beforeB,after:afterB};
  await run(['symbol','BITSTAMP:BTCUSD']);await run(['timeframe','60']);await run(['workspace','wait']);
  // Editing the owned source must not switch B's document or change its source.
  const sourceBeforeB=await identity('b');
  const changed=await cli(['pine','set','--file','qa/parallel/issue-14/missing-fixture.pine'],{workspace:'a'});
  evidence.empty_source_validation=changed;
  writeFileSync(new URL('live/fixture-a-edited.pine',import.meta.url),readFileSync(new URL('fixture-a.pine',import.meta.url),'utf8')+'// Independent workspace source mutation\n');
  await run(['pine','set','--file','qa/parallel/issue-14/live/fixture-a-edited.pine']);
  assert.deepEqual(await identity('b'),sourceBeforeB);
  evidence.source_isolation={before:sourceBeforeB,after:await identity('b')};
  await Promise.all([run(['pine','compile','--save']),run(['indicator','set',studyB,'--inputs',JSON.stringify({in_0:27})],'b')]);
  await run(['data','strategy']);await run(['data','strategy'],'b');
  await run(['pine','set','--file','qa/parallel/issue-14/fixture-a.pine']);await run(['pine','compile','--save']);
  const failTarget=await cli(['--target',a.target,'state']);assert.equal(failTarget.exit,1);assert.match(failTarget.stderr,/WORKSPACE_RESERVED/);evidence.legacy_bypass=failTarget;
  const failOverride=await cli(['--target',b.target,'state'],{workspace:'a'});assert.equal(failOverride.exit,1);assert.match(failOverride.stderr,/WORKSPACE_TARGET_MISMATCH/);evidence.target_override=failOverride;
  evidence.active_after=await activeTabs();assert.deepEqual(evidence.active_after,evidence.active_before);
  evidence.final={a:await identity('a'),b:await identity('b')};evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();writeEvidence('validation.json',evidence);console.log({success:evidence.success,steps:evidence.steps.length,error:evidence.error});}

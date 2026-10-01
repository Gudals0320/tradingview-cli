import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import CDP from 'chrome-remote-interface';
import { cli, manifest, activeTabs, writeEvidence } from './live-utils.mjs';
const resources=Object.fromEntries(['a','b'].map(name=>{const resource=manifest(name);return [name,{target:resource.target,layout:resource.layout,pine:resource.pine}];})),evidence={started_at:new Date().toISOString(),active_before:await activeTabs(),steps:[]};
async function step(args){const r=await cli(args);evidence.steps.push(r);writeEvidence('prepare-four.json',evidence);assert.equal(r.result?.success,true,r.stderr||JSON.stringify(r.result));return r.result;}
try {
  for(const name of ['a','b']){
    await step(['workspace','release','--file',`qa/parallel/issue-14/live/worker-${name}.json`]);
    renameSync(new URL(`live/worker-${name}.json`,import.meta.url),new URL(`live/worker-${name}-previous-${Date.now()}.json`,import.meta.url));
  }
  for(const name of ['c','d']){
    const created=await step(['tab','new','--layout','new','--name',`Codex-I14-${name.toUpperCase()}-20261001`]);
    const target=(await CDP.List({port:9222})).find(target=>target.url.includes(`/chart/${created.chart_id}/`));assert.ok(target);
    resources[name]={target:target.id,layout:created.chart_id};
    const client=await CDP({port:9222,target:target.id});await client.Emulation.setDeviceMetricsOverride({width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await client.Emulation.setFocusEmulationEnabled({enabled:true});await client.Page.setWebLifecycleState({state:'active'});await client.close();
  }
  for(const name of ['a','b','c','d']){
    const resource=resources[name],base=readFileSync(new URL('fixture-a.pine',import.meta.url),'utf8').replace('Codex I14 A 20261001',`Codex I14 ${name.toUpperCase()} 20261001`);
    const source=base.replace('if ta.crossover(close, average)','if ta.crossover(close, average) and time < timestamp("UTC",2026,9,30,0,0)')
      .replace('if ta.crossunder(close, average)','if ta.crossunder(close, average) or time >= timestamp("UTC",2026,9,30,0,0)');
    writeFileSync(new URL(`live/four-${name}.pine`,import.meta.url),source);
    await step(['--target',resource.target,'symbol','BITSTAMP:BTCUSD']);await step(['--target',resource.target,'timeframe','60']);
    if(['c','d'].includes(name)){
      const tabs=await step(['tab','list']);const tab=tabs.tabs.find(tab=>tab.id===resource.target);assert.ok(tab?.resolved);
      await step(['tab','switch',String(tab.index)]);await step(['--target',resource.target,'pine','new','strategy']);
    }
    await step(['--target',resource.target,'pine','set','--file',`qa/parallel/issue-14/live/four-${name}.pine`]);
    if(['c','d'].includes(name)){const saved=await step(['--target',resource.target,'pine','save']);resource.pine=saved.script_id;}
    await step(['--target',resource.target,'pine','compile','--save']);
  }
  // All tab selection belongs to provisioning; keep original tab active for execution.
  evidence.restore=await step(['tab','switch','0']);evidence.active_after=await activeTabs();
  const original=evidence.active_before.find(tab=>tab.active);assert.ok(evidence.active_after.find(tab=>tab.id===original.id&&tab.active));
  for(const name of ['a','b','c','d'])await step(['workspace','init','--file',`qa/parallel/issue-14/live/worker-${name}.json`,'--target',resources[name].target,'--layout',resources[name].layout,'--pine',resources[name].pine]);
  evidence.resources=resources;evidence.success=true;
}catch(error){evidence.success=false;evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{evidence.finished_at=new Date().toISOString();evidence.ms=Date.parse(evidence.finished_at)-Date.parse(evidence.started_at);writeEvidence('prepare-four.json',evidence);console.log({success:evidence.success,ms:evidence.ms,error:evidence.error});}

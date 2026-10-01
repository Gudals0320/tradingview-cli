// Run only with dedicated layouts created for this issue, on the existing endpoint.
import CDP from 'chrome-remote-interface';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
const exec = promisify(execFile), directory = new URL('./live/', import.meta.url);
mkdirSync(directory, { recursive: true });
const targets = await CDP.List({ port: 9222 });
const evidence = { started_at: new Date().toISOString(), inventory_before: targets.filter(t => /\/chart\//.test(t.url)).map(({id,url}) => ({id,url})), steps: [] };
try {
  for (const [suffix, layout] of [['b','1yvV37Yp'],['a','2QKIbTsO']]) {
    const target = targets.find(t => t.url.includes(`/chart/${layout}/`));
    if (!target) throw new Error('Dedicated fixture target missing.');
    const client = await CDP({ port: 9222, target: target.id });
    // Fixed emulation on each dedicated target; never activates or alternates tabs.
    await client.Emulation.setDeviceMetricsOverride({width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await client.Emulation.setFocusEmulationEnabled({enabled:true});
    await client.Page.setWebLifecycleState({state:'active'}); await client.close();
    for (const args of [['symbol','BITSTAMP:BTCUSD'],['timeframe','60'],['pine','new','strategy'],
      ['pine','set','--file',`qa/parallel/issue-14/fixture-${suffix}.pine`],['pine','save'],['pine','compile']]) {
      const started = Date.now();
      const {stdout,stderr} = await exec(process.execPath,['src/cli/index.js','--target',target.id,...args],{timeout:60000});
      const result = JSON.parse(stdout); evidence.steps.push({suffix,target:target.id,args,ms:Date.now()-started,result,stderr});
      console.log(suffix,args.join(' '),result.success,Date.now()-started);
    }
  }
} catch (error) { evidence.error = { message:error.message, stdout:error.stdout, stderr:error.stderr }; console.error(evidence.error); process.exitCode=1; }
finally {
  evidence.finished_at = new Date().toISOString(); evidence.inventory_after = (await CDP.List({port:9222})).filter(t => /\/chart\//.test(t.url)).map(({id,url}) => ({id,url}));
  writeFileSync(new URL('prepare.json',directory),JSON.stringify(evidence,null,2));
}

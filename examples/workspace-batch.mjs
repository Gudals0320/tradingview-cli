/** Explicit workspace input experiments. Each result is checked against the requested inputs. */
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../src/cli/index.js',import.meta.url));
const {values}=parseArgs({options:{workspace:{type:'string'},study:{type:'string'},jobs:{type:'string'},out:{type:'string',default:'results/workspace-batch.json'}}});
const completed=[];
try {
  const workspace=values.workspace||process.env.TV_WORKSPACE;
  if(!workspace)throw Object.assign(new Error('Pass --workspace NAME. Prepare a dedicated saved layout and Pine document first.'),{code:'WORKSPACE_REQUIRED'});
  const jobs=values.jobs?JSON.parse(readFileSync(values.jobs,'utf8')):[{in_0:10,in_1:30},{in_0:20,in_1:60}];
  if(!Array.isArray(jobs)||!jobs.length)throw new Error('Jobs must be a nonempty array of input mappings.');
  function tv(args) {
    const result=spawnSync(process.execPath,[cli,'--workspace',workspace,...args],{encoding:'utf8',timeout:120000});
    const output=result.stdout.trim()?JSON.parse(result.stdout):JSON.parse(result.stderr||'{}');
    if(result.status!==0||output.success!==true)throw Object.assign(new Error(output.error||'Workspace command failed'),{code:output.code,details:output.details});
    return output;
  }
  const state=tv(['state']),study=values.study||state.provenance.study?.id;
  if(!study)throw new Error('Compile the owned strategy first, or pass its current --study ID.');
  for(const inputs of jobs) {
    tv(['indicator','set',study,'--inputs',JSON.stringify(inputs)]);
    tv(['workspace','wait']);
    const report=tv(['data','strategy','--strategy-id',study]);
    if(!Object.entries(inputs).every(([id,value])=>JSON.stringify(report.strategy_inputs?.find(input=>input.id===id)?.value)===JSON.stringify(value)))throw Object.assign(new Error('Inputs changed between dispatch and collection; mixed results rejected.'),{code:'BATCH_INPUT_CHANGED'});
    completed.push({inputs,report});
  }
  const output=resolve(values.out);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({success:true,workspace,results:completed},null,2));
  console.log(JSON.stringify({success:true,workspace,experiments:completed.length,output}));
}catch(error){console.error(JSON.stringify({success:false,code:error.code||'BATCH_FAILED',error:error.message,completed_results:completed}));process.exitCode=1;}

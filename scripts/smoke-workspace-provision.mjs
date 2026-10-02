// Explicit smoke setup, only for the newly created CLI-I29 layouts.
import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { acquireResources } from '../src/resource-lock.js';
import { configureTarget, evaluate, disconnect } from '../src/connection.js';
import * as pine from '../src/core/pine.js';
import { findPineController } from '../src/core/desktop-dom.js';
import { writeFileSync } from 'node:fs';
const name=process.argv[2],workspace=loadWorkspace(resolveWorkspace(name));
const lock=await acquireResources(['app',`layout:${workspace.layout}`,`workspace:${workspace.id}`],{command:'issue29 document setup'});
try { await withSharedSession(async()=>{
  configureTarget(workspace.target);
  const title=await evaluate(`document.querySelector('[data-qa-id="save-load-button"]')?.innerText?.split(String.fromCharCode(10))[0]`);
  if(!title?.startsWith('CLI-I29-'))throw new Error('Refusing to provision a document outside the dedicated issue29 test layouts.');
  await pine.ensurePineEditorOpen();
  const modified=await evaluate(`(${findPineController.toString()})(document)?.isModified?.()`);
  if(modified===true)throw new Error('Existing editor draft is modified; refusing to replace it.');
  const created=await pine.newScript({type:'strategy'});
  if(!created.success)throw new Error('New script creation failed.');
  const source=`//@version=6\nstrategy("CLI-I29-${name}-20261002", overlay=true)\nlength=input.int(10)\na=ta.sma(close,length)\nif ta.crossover(close,a)\n    strategy.entry("L",strategy.long)\nif ta.crossunder(close,a)\n    strategy.close("L")\nplot(a)\n`;
  await pine.setSource({source});
  const result=await pine.save({timeout:30000});
  writeFileSync(`results/issue29/document-${name}.json`,JSON.stringify({at:new Date().toISOString(),workspace_id:workspace.id,target:workspace.target,...result},null,2));
  console.log(JSON.stringify(result));if(!result.success)process.exitCode=1;
});}finally{await disconnect();lock.release();}

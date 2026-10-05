import { existsSync,readFileSync,writeFileSync,renameSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { secureDirectory } from './private-store.js';
import { workspaceArtifactDirectory } from './workspace-store.js';

export function nativeRequestStore(workspace,kind,requestId){
  if(!/^[a-z-]+$/.test(kind))throw Error('Invalid request kind');
  const directory=workspaceArtifactDirectory(workspace);secureDirectory(directory);
  const prefix=`${kind}-request-`,key=createHash('sha256').update(requestId).digest('hex'),path=join(directory,`${prefix}${key}.json`);
  const write=(file,value)=>{const temporary=`${file}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,file);};
  return {read:()=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null,write:value=>write(path,value),
    list:()=>readdirSync(directory).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).map(n=>({file:join(directory,n),record:JSON.parse(readFileSync(join(directory,n),'utf8'))})),update:(entry,value)=>write(entry.file,value)};
}

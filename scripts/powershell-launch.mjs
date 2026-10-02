// Windows PowerShell's legacy native binder loses embedded quotes. Transfer argv
// as UTF-8 data (no temporary source files), then execute the real CLI in this process.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
try {
  const payload=process.argv[2]==='--direct'?{entry:process.argv[3],args:process.argv.slice(4),stdin_encoding:'base64'}:JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'));
  if(typeof payload.entry!=='string'||!Array.isArray(payload.args)||payload.args.some(arg=>typeof arg!=='string'))throw new Error('Invalid private argv payload.');
  if(payload.stdin_encoding==='base64') {
    let encoded='';for await(const chunk of process.stdin)encoded+=chunk;
    Object.defineProperty(process,'stdin',{value:Readable.from([Buffer.from(encoded.trim(),'base64')]),configurable:true});
  }
  const entry=resolve(payload.entry);process.argv=[process.execPath,entry,...payload.args];await import(pathToFileURL(entry).href);
}catch(error){console.error(JSON.stringify({success:false,code:error.code||'POWERSHELL_LAUNCH_FAILED',error:error.message}));process.exitCode=1;}

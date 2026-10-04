import { resolveWorkspace } from '../src/workspace-registry.js';
import { loadWorkspace } from '../src/workspace-store.js';
import { withSharedSession } from '../src/session.js';
import { configureTarget, evaluateAsync, disconnect } from '../src/connection.js';
const workspace = loadWorkspace(resolveWorkspace(process.argv[2]));
try { await withSharedSession(async () => {
  configureTarget(workspace.target);
  console.log(JSON.stringify(await evaluateAsync(`(async()=>{
    const r=await fetch('/api/v1/symbols_list/custom/',{credentials:'include'});
    const data=await r.json();const row=document.querySelector('[data-symbol-full]'),key=Object.keys(row||{}).find(k=>k.startsWith('__reactFiber'));let fiber=row?.[key];const props=[];
    for(let i=0;i<60&&fiber;i++,fiber=fiber.return){const p=fiber.memoizedProps;if(p?.current)props.push({current_id:p.current.id,current_type:p.current.type,current_count:p.current.symbols?.length});}
    return {http:r.status,array:Array.isArray(data),keys:Object.keys(data),props,
      dom_rows:document.querySelectorAll('[data-symbol-full]').length,right_rows:document.querySelector('[class*=layout__area--right]')?.querySelectorAll('[data-symbol-full]').length,
      lists:(Array.isArray(data)?data:[]).map(x=>({id:x.id,keys:Object.keys(x),count:x.symbols?.length,types:[...new Set((x.symbols||[]).map(v=>typeof v))]}))};
  })()`)));
}); } finally { await disconnect(); }

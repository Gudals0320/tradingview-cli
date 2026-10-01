import {cli,open,state,evalPage,inspect} from './harness.mjs';
import {findPineController} from '../../../src/core/desktop-dom.js';
import {writeFileSync} from 'node:fs';
import CDP from 'chrome-remote-interface';
import assert from 'node:assert/strict';
const name='CLI-QA-I13-R1Fresh';
await cli('R5-before-close',['pine','open',name],{pre:'any',post:state.documents[name]});
await evalPage(`(() => {const c=(${findPineController})(document);c._editorStore.getStore();let node=document.querySelector('.monaco-editor.pine-editor-monaco'),fiber;for(let i=0;i<20&&node;i++,node=node.parentElement){const k=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(k){fiber=node[k];break;}}for(let i=0;i<30&&fiber;i++,fiber=fiber.return){const v=fiber.memoizedProps?.value;if(v?.monacoEnv&&typeof v.close==='function'){v.close();return true;}}throw new Error('Close control unavailable');})()`,{post:'any'});
const closed=await inspect('any');writeFileSync('results/pine-issue-13/R5-closed.json',JSON.stringify(closed,null,2));
const reopened=await cli('R5-closed-auto-open',['pine','open',name],{pre:'any',post:state.documents[name]});assert.equal(reopened.after.document_id,state.documents[name]);
const c=await CDP({host:'127.0.0.1',port:9222,target:state.target});try{await inspect();await c.Page.enable();await c.Page.reload();}finally{await c.close();}
const cold=await inspect('any');writeFileSync('results/pine-issue-13/R5-cold.json',JSON.stringify(cold,null,2));
const opened=await cli('R5-cold-auto-open',['pine','open',name],{pre:'any',post:state.documents[name]});
assert.ok(opened.after.viewport.width>0&&opened.after.viewport.height>0);
assert.equal((await cli('R5-cold-compile',['pine','compile'])).out.report_ready,true);

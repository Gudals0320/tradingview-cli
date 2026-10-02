import { it } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import CDP from '../src/cdp.js';

async function stalledTransport(mode) {
  const sockets=new Set();
  const server=mode==='upgrade'?net.createServer(()=>{}):http.createServer((request,response)=>{
    if(mode==='protocol'&&request.url==='/json/list')response.end(JSON.stringify([{id:'QA',type:'page',webSocketDebuggerUrl:`ws://127.0.0.1:${server.address().port}/QA`}]));
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const options=mode==='upgrade'?{target:`ws://127.0.0.1:${server.address().port}/QA`,local:true}:{host:'127.0.0.1',port:server.address().port};
  const action=mode==='static'?'CDP.List':'CDP';
  const code=`import CDP from ${JSON.stringify(new URL('../src/cdp.js',import.meta.url).href)};const start=Date.now();try{await ${action}(${JSON.stringify(options)});}catch(error){console.log(JSON.stringify({code:error.code,elapsed:Date.now()-start}));process.exitCode=1;}`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TV_CDP_TIMEOUT_MS:'100'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timer;
  child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});
  try {
    const [exit]=await Promise.race([once(child,'exit'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Child/socket survived transport deadline: ${stderr}`)),1500);})]);
    assert.equal(exit,1,stderr);assert.equal(JSON.parse(stdout).code,'CDP_TIMEOUT');
    for(let i=0;i<50&&sockets.size;i++)await delay(10);
    assert.equal(sockets.size,0,'The peer must observe cancellation without closing its own socket.');
  } finally {
    clearTimeout(timer);if(child.exitCode===null)child.kill();
    for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
  }
}
it('real CRI never-upgrade connection exits its child and closes the peer socket after deadline',async()=>{await stalledTransport('upgrade');});
it('never-responding target discovery and protocol fetch are canceled, not just raced',async()=>{await stalledTransport('discovery');await stalledTransport('protocol');});
it('static CDP discovery also closes a stalled HTTP request',async()=>{await stalledTransport('static');});
it('owned CRI transport still upgrades and executes a real protocol request',async()=>{
  const server=new WebSocket.Server({host:'127.0.0.1',port:0});await once(server,'listening');
  server.on('connection',socket=>socket.on('message',raw=>{const message=JSON.parse(raw);socket.send(JSON.stringify({id:message.id,result:{result:{type:'number',value:7}}}));}));
  let client;
  try {client=await CDP({target:`ws://127.0.0.1:${server.address().port}`,local:true});assert.equal((await client.Runtime.evaluate({expression:'7'})).result.value,7);}
  finally {if(client)await client.close();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserVTLClient} from '../src/engine/wasm-client.js';

// Simulates a worker blocked during VTL initialization, without real WASM.
test('WebAssembly client reports stalled native initialization and terminates worker',async()=>{
  const previous=global.Worker;
  let terminated=0;
  global.Worker=class {
    constructor(){this.onmessage=null;}
    postMessage({id}){ queueMicrotask(()=>this.onmessage({data:{id,phase:'calling vtlInitialize with embedded speaker model'}})); }
    terminate(){terminated++;}
  };
  try{
    const phases=[];
    const client=new BrowserVTLClient({initTimeoutMs:15,onProgress:s=>phases.push(s)});
    await assert.rejects(client.init(),/exceeded.*seconds.*last phase: calling vtlInitialize/);
    assert.equal(terminated,1);
    assert.equal(client.pending.size,0);
    assert.ok(phases.some(p=>p.includes('vtlInitialize')));
  }finally{global.Worker=previous;}
});

test('Worker initialization error includes the failing stage',async()=>{
  const previous=global.Worker;
  global.Worker=class {
    postMessage({id}){queueMicrotask(()=>this.onmessage({data:{id,ok:false,phaseAtFailure:'loading embedded speaker',error:'File not found'}}));}
    terminate(){}
  };
  try{
    const client=new BrowserVTLClient({initTimeoutMs:200});
    await assert.rejects(client.init(),/loading embedded speaker: File not found/);
    client.close();
  }finally{global.Worker=previous;}
});

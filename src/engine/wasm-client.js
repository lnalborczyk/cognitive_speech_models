/** Main-thread adapter for VTL WebAssembly with explicit startup diagnostics.
 * C++ static initialization and vtlInitialize are synchronous inside the Worker,
 * so we must time out and terminate the Worker if either gets stuck.
 */
export class BrowserVTLClient {
  constructor({initTimeoutMs=60000,synthesisTimeoutMs=180000,onProgress=()=>{}}={}){
    this.worker=null;
    this.nextId=0;
    this.pending=new Map();
    this.initTimeoutMs=initTimeoutMs;
    this.synthesisTimeoutMs=synthesisTimeoutMs;
    this.onProgress=onProgress;
  }
  async available(){
    const names=['web/vtl/vtl.js','web/vtl/vtl.wasm'];
    const status=await Promise.all(names.map(async url=>{
      try {
        const response=await fetch(url,{method:'HEAD',cache:'no-store'});
        return `${url}: HTTP ${response.status}`;
      } catch(error){return `${url}: ${error?.message||error}`;}
    }));
    this.assetStatus=status;
    return status.every(item=>item.endsWith('HTTP 200'));
  }
  ensureWorker(){
    if(this.worker)return;
    this.worker=new Worker(new URL('./wasm-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      const task=this.pending.get(data?.id);
      if(!task)return;
      if(data.phase){
        task.phase=data.phase;
        this.onProgress(`${task.method}: ${data.phase}`);
        return;
      }
      clearTimeout(task.timer);
      this.pending.delete(data.id);
      if(data.ok)task.resolve(data.result);
      else task.reject(Error(`VTL ${task.method} failed at ${data.phaseAtFailure||task.phase}: ${data.error||'unknown error'}`));
    };
    this.worker.onerror=event=>{
      this.failAll(`WebAssembly Worker error: ${event.message||'unknown error'} (${event.filename||'worker'}:${event.lineno||0})`);
    };
    this.worker.onmessageerror=()=>this.failAll('WebAssembly Worker returned an unreadable message');
  }
  failAll(detail){
    for(const task of this.pending.values()){
      clearTimeout(task.timer);
      task.reject(Error(`${detail}; last phase: ${task.phase}`));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker=null;
  }
  request(method,args={}){
    this.ensureWorker();
    const id=++this.nextId;
    const timeout=method==='init'?this.initTimeoutMs:this.synthesisTimeoutMs;
    return new Promise((resolve,reject)=>{
      const task={resolve,reject,method,phase:'worker request sent',timer:null};
      this.pending.set(id,task);
      task.timer=setTimeout(()=>{
        this.failAll(`VTL ${method} exceeded ${Math.round(timeout/1000)} seconds`);
      },timeout);
      try{this.worker.postMessage({id,method,args});}
      catch(error){this.failAll(`Cannot send ${method} to VTL worker: ${error.message}`);}
    });
  }
  init(){return this.request('init');}
  calibrate(){return this.request('calibrate');}
  simulateOnly(model,phrase,cfg){return this.request('simulate-only',{model,phrase,cfg});}
  simulate(model,phrase,cfg,options){return this.request('simulate',{model,phrase,cfg,options});}
  synthesize(frames,options){return this.request('synthesize',{frames,options});}
  close(){this.failAll('VTL worker closed');}
}

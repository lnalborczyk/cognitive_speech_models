/** Main-thread, Promise-based adapter for VocalTractLab WebAssembly Worker. */
export class BrowserVTLClient {
  constructor(){
    this.worker=null;this.nextId=0;this.pending=new Map();
  }
  async available(){
    try {
      const assets=['web/vtl/vtl.js','web/vtl/vtl.wasm'];
      const responses=await Promise.all(assets.map(url=>fetch(url,{method:'HEAD',cache:'no-store'})));
      return responses.every(r=>r.ok);
    }
    catch{return false;}
  }
  ensureWorker(){
    if(this.worker)return;
    this.worker=new Worker(new URL('./wasm-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      const task=this.pending.get(data.id);if(!task)return;
      this.pending.delete(data.id);data.ok?task.resolve(data.result):task.reject(Error(data.error));
    };
    this.worker.onerror=e=>{
      for(const task of this.pending.values())task.reject(Error(e.message||'VTL worker failed'));
      this.pending.clear();this.worker.terminate();this.worker=null;
    };
  }
  request(method,args={}){
    this.ensureWorker();const id=++this.nextId;
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,args});});
  }
  init(){return this.request('init');}
  synthesize(frames,options){return this.request('synthesize',{frames,options});}
  close(){if(this.worker)this.worker.terminate();this.worker=null;
    for(const task of this.pending.values())task.reject(Error('Worker closed'));this.pending.clear();}
}

/** Dedicated computation thread for browser-only VTL. */
import {WasmVTL} from './wasm-runtime.js';
let backend=null;
self.onmessage=async event=>{
  const {id,method,args={}}=event.data;
  try{
    let result;
    if(method==='init') {
      if(!backend){
        const {default:createVTLModule}=await import('../../web/vtl/vtl.js');
        const module=await createVTLModule({locateFile:path=>new URL(`../../web/vtl/${path}`,import.meta.url).href});
        const candidate=new WasmVTL(module);
        result=candidate.init('/speaker.speaker');
        backend=candidate;
      }else result=backend.speaker();
    } else if(method==='synthesize') {
      if(!backend)throw new Error('VTL engine not initialized');
      result=backend.synthesize(args.frames,args.options);
    }else throw new Error('Unknown method');
    self.postMessage({id,ok:true,result});
  }catch(e){ console.error('VTL WebAssembly worker:',e); self.postMessage({id,ok:false,error:e?.message||String(e)}); }
};

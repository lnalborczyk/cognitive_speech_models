/** Dedicated worker for real VocalTractLab WebAssembly.
 * Progress is sent before each synchronous C++ stage, making hangs diagnosable.
 */
import {WasmVTL} from './wasm-runtime.js';
let backend=null;
self.onmessage=async event=>{
  const {id,method,args={}}=event.data;
  let stage='received request';
  const progress=phase=>{
    stage=phase;
    self.postMessage({id,phase});
  };
  try{
    let result;
    if(method==='init'){
      if(!backend){
        progress('importing Emscripten JavaScript loader');
        const {default:createVTLModule}=await import('../../web/vtl/vtl.js');
        progress('instantiating WASM and initializing C++ statics');
        const module=await createVTLModule({
          locateFile:path=>new URL(`../../web/vtl/${path}`,import.meta.url).href,
          printErr:message=>progress(`Emscripten stderr: ${message}`),
          onAbort:reason=>progress(`Emscripten aborted: ${reason}`),
        });
        progress('binding VTL C API');
        const candidate=new WasmVTL(module);
        result=candidate.init('/speaker.speaker',progress);
        backend=candidate;
      }else result=backend.speaker();
    }else if(method==='synthesize'){
      if(!backend)throw new Error('VTL engine not initialized');
      progress('generating native waveform and geometry');
      result=backend.synthesize(args.frames,args.options);
    }else throw new Error('Unknown method');
    progress('completed');
    self.postMessage({id,ok:true,result});
  }catch(error){
    const message=error?.stack||error?.message||String(error);
    console.error(`VTL WebAssembly worker at ${stage}:`,error);
    self.postMessage({id,ok:false,phaseAtFailure:stage,error:message});
  }
};

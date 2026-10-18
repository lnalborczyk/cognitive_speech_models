/** Dedicated worker for real VocalTractLab WebAssembly.
 * Progress is sent before each synchronous C++ stage, making hangs diagnosable.
 */
import {WasmVTL} from './wasm-runtime.js';
import {VTLSensoryObserver} from './vtl-sensing.js';
import {simulate} from '../sim/runner.js';
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
    }else if(method==='calibrate'){
      if(!backend)throw new Error('VTL engine not initialized');
      progress('calibrating vowel goals from actual VTL speaker shapes');
      result=new VTLSensoryObserver(backend).calibrationReport();
    }else if(method==='simulate'||method==='simulate-only'){
      if(!backend)throw new Error('VTL engine not initialized');
      progress('measuring VTL sensory feedback during motor simulation');
      const observer=new VTLSensoryObserver(backend);
      const sim=simulate(args.model,args.phrase,backend.speaker(),args.cfg,s=>observer.at(s));
      if(method==='simulate-only')result=sim;
      else {
        progress('synthesizing VTL audio and anatomical geometry');
        const frames=sim.frames.map(f=>({t:f.t,x:f.x}));
        const references=sim.score.gestures.filter(g=>g.kind==='stop').map(g=>
          ({phone:g.phone,context:g.context,source:g.source,x:g.target}));
        const output=backend.synthesize(frames,{...(args.options||{}),referenceTargets:references});
        result={simulation:sim,output};
      }
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

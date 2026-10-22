/** Dedicated worker for real VocalTractLab WebAssembly.
 * Progress is sent before each synchronous C++ stage, making hangs diagnosable.
 */
import {WasmVTL} from './wasm-runtime.js';
import {VTLSensoryObserver} from './vtl-sensing.js';
import {simulate} from '../sim/runner.js';
import {babbleVTL,adaptFromAcousticError,evaluateInverseMapVTL,motorProgramRms} from '../cognitive/diva-learning.js';
let backend=null, learnedDiva=null;
const motorPrograms=new Map();
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
    }else if(method==='train-diva'){
      if(!backend)throw Error('VTL not initialized');
      progress('babbling: collecting VTL auditory consequences');
      learnedDiva=babbleVTL(new VTLSensoryObserver(backend),backend,args.options||{});
      result=learnedDiva.diagnostics;
    }else if(method==='practice-diva'){
      if(!backend)throw Error('VTL not initialized');
      if(!learnedDiva)learnedDiva=babbleVTL(new VTLSensoryObserver(backend),backend,{nTrials:64});
      const key=args.phrase;let memory=motorPrograms.get(key)||null;
      const trials=Math.min(12,Math.max(1,Number(args.trials||5)));
      const defaultCfg={rate:1,noise:0,feedback:.2,delay:40,
        perturbation:0,perturbationOnsetMs:450,sensorySafety:true,...args.cfg};
      const speaker=backend.speaker();
      const simulateWith=(mem,feedback)=>{
        const observer=new VTLSensoryObserver(backend);
        return simulate('diva',args.phrase,speaker,{
          ...defaultCfg,feedback,divaMode:'learned',learnedMaps:learnedDiva.maps,
          motorMemory:mem},s=>observer.at(s));
      };
      const reference=simulateWith(null,0);
      const summaries=[];
      for(let attempt=0;attempt<trials;attempt++){
        progress(`practice: attempt ${attempt+1}/${trials}`);
        const trial=simulateWith(memory,defaultCfg.feedback);
        const updated=adaptFromAcousticError(memory,trial.frames,reference.frames,learnedDiva.maps,{
          shiftHz:defaultCfg.perturbation,onset_s:defaultCfg.perturbationOnsetMs/1000,
          learningRate:args.learningRate??.12});
        memory=updated.memory;
        summaries.push({attempt:attempt+1,...trial.metrics,
          learningStatus:updated.diagnostic.status,
          learningErrorHz:updated.diagnostic.meanErrorHz,
          learningCommandRms:updated.diagnostic.commandIncrementRms});
      }
      motorPrograms.set(key,memory);
      result={summaries,nCommands:memory.length,trained:Boolean(learnedDiva),
        learningMechanism:'acoustic error to matched unperturbed baseline'};
    }else if(method==='evaluate-diva-map'){
      if(!backend)throw Error('VTL not initialized');
      if(!learnedDiva)learnedDiva=babbleVTL(new VTLSensoryObserver(backend),backend,{nTrials:64});
      progress('measuring held-out babbling states using VTL transfer functions');
      result=evaluateInverseMapVTL(new VTLSensoryObserver(backend),backend,
        learnedDiva.maps,args.options||{});
    }else if(method==='diva-washout'){
      if(!backend)throw Error('VTL not initialized');
      if(!learnedDiva)learnedDiva=babbleVTL(new VTLSensoryObserver(backend),backend,{nTrials:64});
      const phrase=args.phrase||'ahold';
      const cfg={rate:.6,noise:0,feedback:.2,delay:40,perturbationOnsetMs:450,
        useLearnedProgram:true,sensorySafety:true,...args.cfg};
      const exposure=Math.max(1,Math.min(12,Number(args.exposureTrials??5)));
      const washout=Math.max(1,Math.min(24,Number(args.washoutTrials??12)));
      const learningRate=Number(args.learningRate??.12);
      const retention=Number(args.washoutRetention??1);
      if(retention!==1)progress('warning: passive memory decay requested; this is NOT sensory-error washout');
      let memory=null;
      const run=(shift,feedback)=>{
        const observer=new VTLSensoryObserver(backend);
        return simulate('diva',phrase,backend.speaker(),{
          ...cfg,perturbation:shift,feedback,divaMode:'learned',
          learnedMaps:learnedDiva?.maps,motorMemory:memory
        },s=>observer.at(s));
      };
      const baseline=run(0,0);
      const referenceFrames=baseline.frames;
      const probe=()=>{
        const sim=run(0,0);
        const samples=sim.frames.filter(f=>f.t>=.85&&f.t<=1.75&&f.sensory?.observerUpdate)
          .map(f=>f.sensory?.auditory?.[0]).filter(Number.isFinite);
        return {probeF1_Hz:samples.length?samples.reduce((a,b)=>a+b,0)/samples.length:null,
          probeValidSamples:samples.length,probeTrackingRMS:sim.metrics.normalizedTrackingRMS};
      };
      const records=[{phase:'baseline',trial:0,memoryRms:0,
        learningStatus:'baseline',learningErrorHz:null,learningCommandRms:0,...probe()}];
      for(const [phase,number,shift] of [['exposure',exposure,Number(args.shiftHz??150)],['washout',washout,0]]){
        for(let i=1;i<=number;i++){
          progress(`${phase} trial ${i}/${number}`);
          const sim=run(shift,cfg.feedback);
          const learnt=adaptFromAcousticError(memory,sim.frames,referenceFrames,
            learnedDiva?.maps,{
              shiftHz:shift,onset_s:cfg.perturbationOnsetMs/1000,learningRate,
              commandGain:args.learningCommandGain??180,
              targetRegionHz:args.learningTargetRegionHz??0,
            });
          memory=learnt.memory;
          if(retention!==1 && phase==='washout')memory=memory.map(row=>row.map(x=>retention*x));
          records.push({phase,trial:i,shiftHz:shift,memoryRms:motorProgramRms(memory),
            trackingRMS:sim.metrics.normalizedTrackingRMS,
            effort:sim.metrics.effortMean,
            learningStatus:learnt.diagnostic.status,
            learningValidSamples:learnt.diagnostic.valid,
            learningErrorHz:learnt.diagnostic.meanErrorHz,
            learningAppliedErrorHz:learnt.diagnostic.meanAppliedErrorHz,
            learningCommandRms:learnt.diagnostic.commandIncrementRms,
            ...probe()});
        }
      }
      result={phrase,exposureTrials:exposure,washoutTrials:washout,
        washoutRetention:retention,learningMechanism:'acoustic error to matched unperturbed baseline',records};
    }else if(method==='calibrate-stops'){
      if(!backend)throw Error('VTL not initialized');
      progress('checking VTL reference closure sites and local articulatory sensitivity');
      result=new VTLSensoryObserver(backend).stopCalibrationReport(args.options||{});
    }else if(method==='f1-authority'){
      if(!backend)throw new Error('VTL engine not initialized');
      progress('measuring local acoustic sensitivity with real VTL transfer functions');
      result=new VTLSensoryObserver(backend).localF1Authority();
    }else if(method==='simulate'||method==='simulate-only'){
      if(!backend)throw new Error('VTL engine not initialized');
      progress('measuring VTL sensory feedback during motor simulation');
      if(args.model==='diva' && !learnedDiva){
        progress('learning DIVA inverse maps from VTL exploratory babbling');
        learnedDiva=babbleVTL(new VTLSensoryObserver(backend),backend,{nTrials:48});
      }
      const observer=new VTLSensoryObserver(backend);
      const cfg={...args.cfg,
        ...(args.model==='diva'?{
          divaMode:args.cfg?.divaMode??'learned',
          learnedMaps:learnedDiva?.maps,
          motorMemory:args.cfg?.useLearnedProgram?motorPrograms.get(args.phrase):null
        }:{})};
      const sim=simulate(args.model,args.phrase,backend.speaker(),cfg,s=>observer.at(s));
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

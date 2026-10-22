/** Data-driven miniature inverse map for DIVA-style babbling.
 * Training data consist of exploratory VTL tract displacements and their
 * acoustic consequences. This is local ridge regression, NOT the published
 * DIVA neural network or a developmental simulation of human babbling.
 */
const FORMANT_SCALES=[500,1200,1600];
import {solveLinear} from '../motor/task-dynamics-control.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rng(seed){let v=seed>>>0;return ()=>{v+=0x6D2B79F5;let x=v;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
/** Learn a sensory-error -> articulatory displacement transformation.
 * Only mutually valid formant bands enter the fit. Unresolved F1 for /i/
 * remains untrained; it is never fabricated or imputed.
 */
export function fitInverseMap(samples,{ridge=.025,ntract=null}={}){
  if(!samples?.length)throw Error('Inverse-map training requires babbling samples');
  const n=ntract??samples[0].dx.length;
  const valid=[0,1,2].filter(k=>samples.filter(s=>Number.isFinite(s.df?.[k])).length>=Math.max(4,Math.ceil(samples.length*.5)));
  if(!valid.length)return {validBands:[],weights:Array.from({length:n},()=>[0,0,0]),samples:samples.length,rms:null};
  const p=valid.length,Gram=Array.from({length:p},()=>Array(p).fill(0));
  const YX=Array.from({length:p},()=>Array(n).fill(0));
  const usable=samples.filter(s=>valid.every(k=>Number.isFinite(s.df?.[k])));
  for(const s of usable){
    const y=valid.map(k=>s.df[k]/FORMANT_SCALES[k]);
    for(let a=0;a<p;a++){
      for(let b=0;b<p;b++)Gram[a][b]+=y[a]*y[b];
      for(let j=0;j<n;j++)YX[a][j]+=y[a]*s.dx[j];
    }
  }
  for(let k=0;k<p;k++)Gram[k][k]+=ridge;
  const weights=Array.from({length:n},(_,j)=>{
    const fitted=solveLinear(Gram,YX.map(r=>r[j]));
    const w=Array(3).fill(0);
    valid.forEach((band,i)=>w[band]=fitted[i]);return w;
  });
  let err=0,count=0;
  for(const s of usable){
    const y=valid.map(k=>s.df[k]/FORMANT_SCALES[k]);
    for(let j=0;j<n;j++){
      const pred=valid.reduce((sum,k,i)=>sum+weights[j][k]*y[i],0);
      err+=(pred-s.dx[j])**2;count++;
    }
  }
  return {weights,validBands:valid,samples:usable.length,rms:count?Math.sqrt(err/count):null,ridge};
}
export function predictCorrection(map,sensoryErrorHz,n){
  const command=Array(n).fill(0);
  if(!map?.validBands)return command;
  for(let j=0;j<n;j++)for(const k of map.validBands){
    const e=sensoryErrorHz[k];
    if(Number.isFinite(e))command[j]-=(map.weights[j]?.[k]||0)*(e/FORMANT_SCALES[k]);
  }
  return command;
}
export function babbleVTL(observer,backend,{nTrials=64,amplitude=.065,seed=1024,ridge=.025}={}){
  const random=rng(seed),names=backend.tract.names;
  const movable=names.map((name,i)=>({name,i})).filter(({name})=>
    ['JA','TCX','TCY','TTX','TTY','LD','LP'].includes(name)).map(x=>x.i);
  const trained={},diagnostics=[];
  for(const phone of ['a','i','u']){
    const reference=backend.shapes[phone];
    if(!reference)continue;
    const acoustic=observer.formants(reference);
    const samples=[];
    for(let trial=0;trial<nTrials;trial++){
      const x=reference.slice();
      // Exploratory articulator variations, not random acoustic targets.
      for(const j of movable)x[j]=clamp(x[j]+amplitude*(random()*2-1),0,1);
      const measured=observer.formants(x,acoustic);
      const dx=x.map((v,i)=>v-reference[i]);
      const df=acoustic.map((f,k)=>Number.isFinite(f)&&Number.isFinite(measured[k])&&
        Math.abs(measured[k]-f)<200?measured[k]-f:null);
      samples.push({dx,df});
    }
    const fit=fitInverseMap(samples,{ridge,ntract:reference.length});
    trained[phone]=fit;
    diagnostics.push({phone,formants:acoustic,validBands:fit.validBands,
      nTrials:fit.samples,rms:fit.rms});
  }
  return {maps:trained,diagnostics,training:'VTL-derived exploratory local ridge inverse maps',version:1};
}
/** Small feedforward adaptation across explicit practice attempts.
 * A retained correction to the time-indexed motor program is learned from
 * auditory commands on preceding productions; no change occurs inside a trial.
 */
export function adaptMotorProgram(previous,frames,{learningRate=.12,limit=8,retention=1}={}){
  if(!frames?.length)throw Error('Adaptation needs a completed trial');
  const n=frames[0].x.length;
  if(!Number.isFinite(retention)||retention<0||retention>1)throw Error('retention must be between 0 and 1');
  const program=previous?.map(row=>row.slice()) || Array.from({length:frames.length},()=>Array(n).fill(0));
  for(let i=0;i<frames.length;i++){
    const observed=frames[i].control?.command || Array(n).fill(0);
    if(!program[i])program[i]=Array(n).fill(0);
    for(let j=0;j<n;j++)program[i][j]=clamp(retention*program[i][j]+learningRate*(observed[j]||0),-limit,limit);
  }
  return program;
}

/** Independent, held-out VTL evaluation of a learned inverse map.
 * Training samples and held-out configurations must be drawn with different
 * RNG seeds. We measure whether correction reduces REAL VTL F1 error.
 * Missing F1 readings are excluded, never imputed.
 */
export function evaluateInverseMapVTL(observer,backend,maps,{nTrials=24,amplitude=.055,seed=8911,correctionScale=1}={}){
  const random=rng(seed),results=[];
  const names=backend.tract.names;
  const movable=names.map((name,i)=>({name,i})).filter(({name})=>
    ['JA','TCX','TCY','TTX','TTY','LD','LP'].includes(name)).map(x=>x.i);
  for(const phone of ['a','i','u']){
    const ref=backend.shapes[phone],map=maps?.[phone];
    if(!ref||!map){results.push({phone,valid:0,attempted:0,meanAbsErrorBeforeHz:null,
      meanAbsErrorAfterHz:null,improvedFraction:null});continue;}
    const refF1=observer.formants(ref)[0];let valid=0,improved=0,before=0,after=0;
    for(let i=0;i<nTrials;i++){
      const x=ref.slice();
      for(const j of movable)x[j]=clamp(x[j]+amplitude*(random()*2-1),0,1);
      const f=observer.formants(x,[refF1,null,null])[0];
      if(!Number.isFinite(refF1)||!Number.isFinite(f)||!map.validBands?.includes(0))continue;
      const change=predictCorrection(map,[f-refF1,null,null],x.length);
      const corrected=x.map((v,j)=>clamp(v+correctionScale*change[j],0,1));
      const newF1=observer.formants(corrected,[refF1,null,null])[0];
      if(!Number.isFinite(newF1))continue;
      const oldErr=Math.abs(f-refF1),newErr=Math.abs(newF1-refF1);
      valid++;before+=oldErr;after+=newErr;
      if(newErr<oldErr)improved++;
    }
    results.push({phone,attempted:nTrials,valid,
      meanAbsErrorBeforeHz:valid?before/valid:null,
      meanAbsErrorAfterHz:valid?after/valid:null,
      improvedFraction:valid?improved/valid:null,
      heldoutSeed:seed,correctionScale});
  }
  return results;
}
/** Norm of persistent motor-command memory, for monitoring washout.
 * A declining norm by itself is not evidence of human-like adaptation.
 */
export function motorProgramRms(program){
  if(!program?.length)return 0;
  let sum=0,count=0;
  for(const row of program)for(const v of row){sum+=v*v;count++;}
  return count?Math.sqrt(sum/count):0;
}

/** Update a time-aligned feedforward command from a PHYSICAL F1 error.
 *
 * The reference is a matched, unperturbed VTL production with no learned
 * memory. Exposure error is produced F1 + heard perturbation - reference F1.
 * During washout the shift is zero: an acoustically ineffective stored
 * command receives no update, while a measurable aftereffect can drive a
 * reversal. This does not impose exponential forgetting or invent formants.
 *
 * DIVA-inspired error-based learning, not the official neural learning rule.
 */
export function adaptFromAcousticError(previous,frames,referenceFrames,inverseMap,{
  shiftHz=0,onset_s=.45,learningRate=.12,commandGain=180,
  targetRegionHz=0,commandLimit=8,maxErrorHz=250,
}={}){
  if(!frames?.length||frames.length!==referenceFrames?.length)
    throw Error('Learning requires time-aligned actual and unperturbed reference frames');
  const n=frames[0].x.length;
  const memory=previous?.map(row=>row.slice()) ||
    Array.from({length:frames.length},()=>Array(n).fill(0));
  if(memory.length!==frames.length || memory.some(row=>row.length!==n))
    throw Error('Motor memory dimension does not match the simulation');
  const mapFor=phone=>inverseMap?.validBands?inverseMap:inverseMap?.[phone];
  const someLearnedF1=frames.some(f=>mapFor(f.phone)?.validBands?.includes(0));
  if(!someLearnedF1)return {memory,diagnostic:{status:'no_learned_F1',valid:0,
    meanErrorHz:null,meanAppliedErrorHz:null,commandIncrementRms:0}};
  const samples=[];
  for(let i=0;i<frames.length;i++){
    const f=frames[i],ref=referenceFrames[i];
    if(f.t<onset_s+.025||f.t>frames.at(-1).t-.15||!f.sensory?.observerUpdate)continue;
    const map=mapFor(f.phone);
    if(!map?.validBands?.includes(0))continue;
    const observed=f.sensory.auditory?.[0],baseline=ref.sensory?.auditory?.[0];
    if(!Number.isFinite(observed)||!Number.isFinite(baseline))continue;
    const errorHz=observed+shiftHz-baseline;
    if(!Number.isFinite(errorHz)||Math.abs(errorHz)>maxErrorHz)continue;
    const appliedHz=Math.sign(errorHz)*Math.max(0,Math.abs(errorHz)-targetRegionHz);
    const correction=predictCorrection(map,[appliedHz,null,null],n)
      .map(v=>Math.max(-commandLimit,Math.min(commandLimit,learningRate*commandGain*v)));
    samples.push({time_s:f.t,phone:f.phone,errorHz,appliedHz,correction});
  }
  if(!samples.length)return {memory,diagnostic:{status:'unresolved_F1',valid:0,
    meanErrorHz:null,meanAppliedErrorHz:null,commandIncrementRms:0}};
  // Motor-program learning is time-indexed. A valid observer measurement drives
  // only the nearby segment of the matching speech gesture, rather than
  // applying one global error to every vowel in the entire utterance.
  let current=null,nextSample=0,incrementSq=0,incrementCount=0;
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    while(nextSample<samples.length&&samples[nextSample].time_s<=f.t+1e-9)
      current=samples[nextSample++];
    if(!current||f.t-current.time_s>.075||f.phone!==current.phone)continue;
    const fade=Math.min(1,Math.max(0,(f.t-onset_s)/.08));
    for(let j=0;j<n;j++){
      const increment=current.correction[j]*fade;
      memory[i][j]=clamp(memory[i][j]+increment,-commandLimit,commandLimit);
      incrementSq+=increment*increment;incrementCount++;
    }
  }
  const meanErrorHz=samples.reduce((s,x)=>s+x.errorHz,0)/samples.length;
  const meanAppliedErrorHz=samples.reduce((s,x)=>s+x.appliedHz,0)/samples.length;
  return {memory,diagnostic:{status:'updated',valid:samples.length,meanErrorHz,
    meanAppliedErrorHz,commandIncrementRms:incrementCount?Math.sqrt(incrementSq/incrementCount):0,
    firstSample_s:samples[0].time_s,lastSample_s:samples.at(-1).time_s,
    shiftHz,reference:'matched unperturbed VTL baseline'}};
}

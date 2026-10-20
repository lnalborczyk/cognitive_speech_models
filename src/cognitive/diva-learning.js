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
export function adaptMotorProgram(previous,frames,{learningRate=.12,limit=8}={}){
  if(!frames?.length)throw Error('Adaptation needs a completed trial');
  const n=frames[0].x.length;
  const program=previous?.map(row=>row.slice()) || Array.from({length:frames.length},()=>Array(n).fill(0));
  for(let i=0;i<frames.length;i++){
    const observed=frames[i].control?.command || Array(n).fill(0);
    if(!program[i])program[i]=Array(n).fill(0);
    for(let j=0;j<n;j++)program[i][j]=clamp(program[i][j]+learningRate*(observed[j]||0),-limit,limit);
  }
  return program;
}

import {makePlant,clamp} from '../motor/plant.js';
import {makeScore,activation,blendedTarget} from '../motor/gestures.js';
import {createController} from '../cognitive/registry.js';
export function mulberry32(seed){let v=seed>>>0;return ()=>{v+=0x6D2B79F5;let x=v;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
/** The exact same normalized controller states are supplied to both output
 * backends. VTL natively maps them into speaker-specific physical tract units.
 */
export function simulate(model,phrase,speaker,cfg={},sensoryProvider=null){
  const c={rate:1,overlap:.3,feedback:0,somatosensory:.5,perturbation:0,delay:60,noise:0,stiffness:1,feedforwardScale:1,seed:17,sensorySafety:true,...cfg};
  if(!Number.isFinite(c.rate)||c.rate<=0)throw new Error('rate must be positive');
  const score=makeScore(phrase,speaker,c);
  const plant=makePlant(speaker,c.stiffness);
  const controller=createController(model,c);
  const random=mulberry32(c.seed),dt=.005;
  const frames=[];
  const duration=score.duration+.12;
  for(let n=0;n<=Math.ceil(duration/dt);n++){
    const t=n*dt;
    const act=activation(score,t);
    const target=blendedTarget(score,t);
    const sensory=sensoryProvider?sensoryProvider({x:plant.x.slice(),target,phone:score.phones[act.chosen],context:score.gestures[act.chosen].context,step:n,t,cfg:c}):null;
    const result=controller.step({x:plant.x.slice(),v:plant.v.slice(),target,dt,t,sensory,
      weights:act.weight,selected:act.chosen,score,speaker});
    const command=result.u.map(u=>clamp(u,-75,75));
    plant.step(command,dt,()=>c.noise*(random()+random()-1)*18);
    frames.push({t:+t.toFixed(3),x:plant.x.slice(),v:plant.v.slice(),target,
      u:command,control:result.auditoryDiagnostics||null,
      sensory:sensory?{auditory:sensory.auditory,auditoryTarget:sensory.auditoryTarget,
        observerUpdate:Boolean(sensory.observerUpdate),measuredAt_s:sensory.measuredAt_s??null,
        area:sensory.constriction?.area??null,locationCm:sensory.constriction?.locationCm??null}:null,weights:result.planning,selected:result.selected,phone:score.phones[result.selected],
      kind:score.gestures[result.selected]?.kind||'vowel'});
  }
  return {model,phrase,cfg:c,score,frames,speaker:speaker.kind,
    metrics:calculateMetrics(frames)};
}
function calculateMetrics(frames){
  let error=0,effort=0,path=0;
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    error+=f.x.reduce((s,x,j)=>s+(x-f.target[j])**2,0)/f.x.length;
    effort+=f.u.reduce((s,u)=>s+u*u,0)/f.u.length;
    if(i)path+=f.x.reduce((s,x,j)=>s+Math.abs(x-frames[i-1].x[j]),0);
  }
  return {normalizedTrackingRMS:Math.sqrt(error/frames.length),effortMean:effort/frames.length,
    normalizedPathLength:path,duration:frames.at(-1).t};
}
export function csvOutput(data,speaker){
  const names=speaker.names.map((n,i)=>String(n||`tract_${i}`).replaceAll(',', '_'));
  const rows=[['model','t_s','phone','selected',...names,'tracking_rms','mean_effort','F1_Hz','F2_Hz','F3_Hz','task_area_cm2','task_location_cm'].join(',')];
  for(const f of data.frames)rows.push([data.model,f.t,f.phone,f.selected,...f.x.map(x=>x.toFixed(6)),
    data.metrics.normalizedTrackingRMS.toFixed(5),data.metrics.effortMean.toFixed(3),...(f.sensory?.auditory||[null,null,null]).map(v=>v??''),f.sensory?.area??'',f.sensory?.locationCm??''].join(','));
  return rows.join('\n');
}

/** Sensory control utilities. Every auditory observation in WASM mode comes
 * from vtlGetTransferFunction, and every constriction observation from
 * vtlTractToTube. The gains and control law remain exploratory.
 */
export const FORMANT_SCALES=[500,1200,1600];
export const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export function feedbackForce(sensory, cfg={}, n=0) {
  const force=Array(n).fill(0);
  if(!sensory)return force;
  const gain=Number(cfg.feedback??0);
  const auditory=sensory.auditory, target=sensory.auditoryTarget;
  if(gain>0 && auditory?.length===3 && target?.length===3) {
    const J=sensory.auditoryJacobian;
    if(Array.isArray(J)&&J.length===3) {
      const norm=Array(n).fill(0);
      for(let k=0;k<3;k++) {
        if(!Number.isFinite(auditory[k])||!Number.isFinite(target[k]))continue;
        // Shifts are added to *heard* F1; they never change the VTL synthesizer.
        const shift=k===0?Number(cfg.perturbation||0):0;
        const error=(auditory[k]+shift-target[k])/FORMANT_SCALES[k];
        for(let j=0;j<n;j++) {
          const derivative=(J[k]?.[j]||0)/FORMANT_SCALES[k];
          force[j]-=48*gain*error*derivative;
          norm[j]+=derivative*derivative;
        }
      }
      for(let j=0;j<n;j++)force[j]/=(.35+norm[j]);
    }
  }
  return force;
}
export function constrictionForce(sensory,n=0,{gain=65}={}){
  const u=Array(n).fill(0);
  if(!sensory?.constriction)return u;
  const {area,targetArea,jacobian}=sensory.constriction;
  if(!Number.isFinite(area)||!Number.isFinite(targetArea)||!Array.isArray(jacobian))return u;
  const norm=dot(jacobian,jacobian)+.05;
  // Negative gradient corrects an aperture greater than the closure target.
  const error=Math.max(-3,Math.min(3,area-targetArea));
  for(let j=0;j<n;j++)u[j]=-gain*error*(jacobian[j]||0)/norm;
  return u;
}
/** A peak finder for VTL's *physical tract transfer function*, not for a
 * guessed formant map. Null explicitly means an unresolvable resonance.
 */
export function formantsFromSpectrum(magnitude, sampleRate){
  const n=magnitude.length,step=sampleRate/n;
  const smoothed=magnitude.map((_,i)=>{
    let s=0,c=0;
    for(let j=Math.max(0,i-2);j<=Math.min(n-1,i+2);j++){s+=Math.max(0,Number(magnitude[j])||0);c++;}
    return s/c;
  });
  const peaks=[];
  for(let i=Math.max(3,Math.floor(180/step));i<Math.min(n/2-2,Math.floor(4600/step));i++){
    if(smoothed[i]>smoothed[i-1]&&smoothed[i]>=smoothed[i+1]){
      // Quadratic interpolation on log magnitude: the VTL transfer function
      // is sampled on a 43 Hz grid at N=1024, but motor derivatives can
      // require detecting much smaller resonant-frequency movements.
      const l=Math.log(Math.max(smoothed[i-1],1e-20));
      const c=Math.log(Math.max(smoothed[i],1e-20));
      const r=Math.log(Math.max(smoothed[i+1],1e-20));
      const denominator=l-2*c+r;
      const offset=Math.abs(denominator)>1e-12?Math.max(-.5,Math.min(.5,.5*(l-r)/denominator)):0;
      peaks.push({f:(i+offset)*step,m:smoothed[i]});
    }
  }
  const select=(lo,hi)=>peaks.filter(p=>p.f>=lo&&p.f<=hi).sort((a,b)=>b.m-a.m)[0]?.f??null;
  const f1=select(200,1150);
  const f2=select(Math.max(850,(f1||400)+350),3300);
  const f3=select(Math.max(1700,(f2||1300)+400),4600);
  return [f1,f2,f3];
}

/** Sensory control utilities. Every auditory observation in WASM mode comes
 * from vtlGetTransferFunction, and every constriction observation from
 * vtlTractToTube. The gains and control law remain exploratory.
 */
export const FORMANT_SCALES=[500,1200,1600];
export const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
/** Return both the applied auditory force and a diagnostic for the delayed
 * observation that generated it. Missing F1 is *not* interpreted as zero error.
 * This is the correction actually used by DIVA, not a later reconstruction.
 */
export function feedbackForceDetailed(sensory, cfg={}, n=0) {
  const force=Array(n).fill(0);
  const gain=Number(cfg.feedback??0);
  const auditory=sensory?.auditory, target=sensory?.auditoryTarget;
  const jacobian=sensory?.auditoryJacobian;
  const measured=Number.isFinite(auditory?.[0])?auditory[0]:null;
  const intended=Number.isFinite(target?.[0])?target[0]:null;
  const validF1=measured!==null&&intended!==null;
  const onset=Number(cfg.perturbationOnsetMs??0)/1000;
  const measuredAt=Number.isFinite(sensory?.measuredAt_s)?sensory.measuredAt_s:
    Number.isFinite(sensory?.time_s)?sensory.time_s:0;
  const shift=gain>0&&Number.isFinite(measuredAt)&&measuredAt>=onset?Number(cfg.perturbation||0):0;
  const jacF1=Array.isArray(jacobian?.[0])?jacobian[0]:[];
  const jacobianNormF1=Math.sqrt(jacF1.reduce((sum,v)=>sum+(Number.isFinite(v)?v*v:0),0));
  let validBands=0;
  if(gain>0&&auditory?.length===3&&target?.length===3&&jacobian?.length===3){
    const norm=Array(n).fill(0);
    for(let k=0;k<3;k++) {
      if(!Number.isFinite(auditory[k])||!Number.isFinite(target[k]))continue;
      validBands++;
      const appliedShift=k===0?shift:0;
      const error=(auditory[k]+appliedShift-target[k])/FORMANT_SCALES[k];
      for(let j=0;j<n;j++){
        const derivative=(jacobian[k]?.[j]||0)/FORMANT_SCALES[k];
        if(!Number.isFinite(derivative))continue;
        force[j]-=48*gain*error*derivative;
        norm[j]+=derivative*derivative;
      }
    }
    for(let j=0;j<n;j++){
      force[j]/=(.35+norm[j]);
      if(cfg.sensorySafety!==false)force[j]=Math.max(-18,Math.min(18,force[j]));
    }
  }
  const commandRms=n?Math.sqrt(force.reduce((s,v)=>s+v*v,0)/n):0;
  const status=!sensory?'no_observation':gain<=0?'gain_disabled':
    !validF1?'f1_unresolved':!Array.isArray(jacobian?.[0])?'jacobian_unavailable':
    jacobianNormF1<=1e-10?'f1_jacobian_zero':'available';
  return {force,diagnostic:{status,validF1,validBands,
    measuredF1Hz:measured,targetF1Hz:intended,
    errorF1Hz:validF1?measured+shift-intended:null,
    appliedShiftHz:shift,jacobianNormF1,commandRms,
    observationTime_s:Number.isFinite(measuredAt)?measuredAt:null}};
}
/** Backwards-compatible entry point for other controllers. */
export function feedbackForce(sensory,cfg={},n=0){
  return feedbackForceDetailed(sensory,cfg,n).force;
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
/** Candidate local maxima for spectral diagnostics; these are *not*
 * automatically accepted as formants. Higher resolution and a lower search
 * limit help distinguish a missing low-F1 resonance from a peak-assignment
 * error without changing the control law.
 */
export function lowBandPeakCandidates(magnitudes,rate,{lowHz=100,highHz=1200}={}){
  const step=rate/magnitudes.length,found=[];
  for(let i=Math.max(2,Math.ceil(lowHz/step));i<Math.min(magnitudes.length/2-1,Math.floor(highHz/step));i++){
    const left=Number(magnitudes[i-1]),cur=Number(magnitudes[i]),right=Number(magnitudes[i+1]);
    if(Number.isFinite(cur)&&cur>0&&cur>left&&cur>=right)found.push({hz:+(i*step).toFixed(1),magnitude:cur});
  }
  return found.sort((a,b)=>b.magnitude-a.magnitude).slice(0,6);
}
/** A peak finder for VTL's *physical tract transfer function*, not for a
 * guessed formant map. Null explicitly means an unresolvable resonance.
 */
export function formantsFromSpectrum(magnitude, sampleRate, reference=null){
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
  const select=(lo,hi,k)=>{
    const candidates=peaks.filter(p=>p.f>=lo&&p.f<=hi);
    // Within a finite-difference evaluation, track the same spectral peak
    // as the unperturbed VTL spectrum. If it disappears, mark it unresolved;
    // never jump to a different peak and call that a derivative.
    const anchor=reference?.[k];
    if(Number.isFinite(anchor)){
      const matches=candidates.filter(p=>Math.abs(p.f-anchor)<=180);
      return matches.sort((a,b)=>Math.abs(a.f-anchor)-Math.abs(b.f-anchor))[0]?.f??null;
    }
    return candidates.sort((a,b)=>b.m-a.m)[0]?.f??null;
  };
  const f1=select(200,1150,0);
  const f2=select(Math.max(850,(f1||400)+350),3300,1);
  const f3=select(Math.max(1700,(f2||1300)+400),4600,2);
  return [f1,f2,f3];
}

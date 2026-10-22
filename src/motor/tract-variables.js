/** Observable tract tasks derived from VTL tube section areas and lengths.
 * CD here is an EQUIVALENT aperture diameter sqrt(4A/pi), not the geometric
 * palate-to-articulator distance used by the published TADA/Task Dynamics.
 * CL is a soft minimum-area section centroid, in centimetres from glottis.
 * These tasks are VTL-calibrated proxies, not the original TADA tract variables.
 */
export const TASK_REGIONS = Object.freeze({
  LA: [.87, 1.00],
  TTCD: [.58, .91],
  TBCD: [.28, .79],
});
export const TASK_PARAMETER_NAMES = Object.freeze({
  LA:['LD','LP','JA'], TTCD:['TTY','TTX','JA'], TBCD:['TCY','TCX','JA'],
  TTCL:['TTX','TTY','JA'], TBCL:['TCX','TCY','JA'],
});
const finite = x => Number.isFinite(x);
export function tubeTractVariables(areas,lengths,{temperature=.35}={}){
  if(!Array.isArray(areas)||!Array.isArray(lengths)||areas.length!==lengths.length||!areas.length)
    throw Error('VTL tube measurements must provide matching nonempty areas and lengths');
  const total=lengths.reduce((s,l)=>s+Math.max(0,l),0);
  if(!finite(total)||total<=0)throw Error('VTL tube lengths must be positive');
  const sections=[];
  let position=0;
  for(let i=0;i<areas.length;i++){
    const length=Math.max(0,lengths[i]),p=position+length/2;
    sections.push({i,area:Math.max(0,areas[i]),fraction:p/total,cm:p});
    position+=length;
  }
  const values={};
  for(const [task,[lo,hi]] of Object.entries(TASK_REGIONS)){
    const region=sections.filter(s=>s.fraction>=lo && s.fraction<=hi);
    // Degenerate grids: use the nearest physical tube section.
    if(!region.length)region.push(sections.reduce((best,s)=>Math.abs(s.fraction-(lo+hi)/2)<Math.abs(best.fraction-(lo+hi)/2)?s:best));
    const minArea=Math.min(...region.map(s=>s.area));
    const w=region.map(s=>Math.exp(-(s.area-minArea)/temperature));
    const sw=w.reduce((a,b)=>a+b,0);
    const representativeArea=region.reduce((sum,s,i)=>sum+s.area*w[i],0)/sw;
    const locationCm=region.reduce((sum,s,i)=>sum+s.cm*w[i],0)/sw;
    values[task]=Math.sqrt(4*representativeArea/Math.PI);
    if(task==='TTCD')values.TTCL=locationCm;
    if(task==='TBCD')values.TBCL=locationCm;
  }
  return values;
}
/** Independent gestural goals. Bilabial stops activate LA, alveolar stops
 * TTCD/TTCL, and velars TBCD/TBCL; adjacent vowel body and lip tasks remain
 * independently active, instead of imposing an averaged global vocal shape.
 */
export function scoreTaskGoals(score,t,shapeTasks,{stopPriority=8}={}){
  const out={},weights={},stopWeights={},active=[];
  // A closure gesture must not be diluted by the simultaneous vowel target
  // for the SAME tract variable. Other vowel tasks remain fully independent.
  // The priority factor is a tunable reduced-order approximation, not TADA.
  for(const g of score.gestures){
    const dist=Math.abs(t-g.center),plateau=g.kind==='stop'?g.width*.36:0;
    const weight=dist<=plateau?1:dist<g.width ? .5*(1+Math.cos(Math.PI*(dist-plateau)/(g.width-plateau))) : 0;
    if(weight<=0)continue;
    const key=g.source||`${g.phone}:${g.context}`;
    const targets=shapeTasks.get(key);
    if(!targets)continue;
    const tasks=g.kind==='stop'
      ?(g.phone==='p'?['LA']:g.phone==='t'?['TTCD','TTCL']:['TBCD','TBCL'])
      :['LA','TBCD','TBCL'];
    for(const task of tasks){
      if(!finite(targets[task]))continue;
      // Stop weight takes precedence near peak constriction. We retain a
      // gradual weighting on approach/release to prevent discontinuous goals.
      const effective=weight*(g.kind==='stop'?stopPriority:1);
      out[task]=(out[task]||0)+effective*targets[task];
      weights[task]=(weights[task]||0)+effective;
      if(g.kind==='stop')stopWeights[task]=(stopWeights[task]||0)+effective;
    }
    active.push({phone:g.phone,weight,kind:g.kind});
  }
  const goals={},closureWeights={};
  for(const task of Object.keys(out)){
    goals[task]=out[task]/weights[task];
    closureWeights[task]=(stopWeights[task]||0)/weights[task];
  }
  return {goals,weights,stopWeights:closureWeights,active};
}
export function taskJacobianFromVTL(measure,x,names,{delta=.012}={}){
  const baseline=measure(x),jacobians={};
  for(const key of Object.keys(baseline))jacobians[key]=Array(x.length).fill(0);
  const union=new Set(Object.values(TASK_PARAMETER_NAMES).flat());
  for(let j=0;j<x.length;j++){
    if(!union.has(names[j]))continue;
    const shifted=x.slice(),step=x[j]+delta<=1?delta:-delta;
    if(shifted[j]+step<0)continue;
    shifted[j]+=step;
    const next=measure(shifted);
    for(const key of Object.keys(baseline)){
      const derivative=(next[key]-baseline[key])/step;
      if(finite(derivative))jacobians[key][j]=derivative;
    }
  }
  return {values:baseline,jacobians};
}

/** Identify the reference stop constriction active at a given instant.
 * The site itself is measured from that speaker's real VTL closure shape.
 */
export function activeStopGesture(score,t){
  let winner=null;
  for(const g of score?.gestures||[]){
    if(g.kind!=='stop')continue;
    const dist=Math.abs(t-g.center),plateau=g.width*.36;
    const a=dist<=plateau?1:dist<g.width
      ?.5*(1+Math.cos(Math.PI*(dist-plateau)/(g.width-plateau))):0;
    if(a>1e-4 && (!winner||a>winner.activation))winner={gesture:g,activation:a};
  }
  return winner;
}

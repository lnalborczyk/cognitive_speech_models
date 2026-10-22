/** Reference-guided, static closure inverse-kinematics diagnostic.
 *
 * The input area function is the genuine VTL tube solver in production.
 * The canonical stop articulatory shape acts as a feasibility prior; it is
 * never substituted for the state. The returned sequence contains actual
 * evaluated candidate states and may FAIL to converge.
 * Not a biomechanics solver or published TADA inverse kinematics.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function solveStaticClosure({start,reference,measure,indices,
    goalArea=.08,maxIterations=25,stepLimit=.075,
    lambda=.02,referenceBias=.18,delta=.008}={}){
  if(!start?.length||start.length!==reference?.length||!indices?.length||typeof measure!=='function')
    throw Error('Static closure solver requires normalized states, site-area function and articulator indices');
  const x=start.slice(),history=[];
  const targetArea=measure(reference);
  if(!Number.isFinite(targetArea))throw Error('Nonfinite VTL reference area');
  for(let iteration=0;iteration<=maxIterations;iteration++){
    const area=measure(x);
    if(!Number.isFinite(area))throw Error('Nonfinite VTL tube area during inverse solve');
    history.push({iteration,area_cm2:area,targetArea_cm2:targetArea});
    if(area<=goalArea)break;
    if(iteration===maxIterations)break;
    const gradient=Array(x.length).fill(0);
    for(const j of indices){
      const lo=x.slice(),hi=x.slice();
      hi[j]=Math.min(1,x[j]+delta);lo[j]=Math.max(0,x[j]-delta);
      const width=hi[j]-lo[j];
      if(width>1e-9)gradient[j]=(measure(hi)-measure(lo))/width;
    }
    const norm=indices.reduce((sum,j)=>sum+gradient[j]**2,0)+lambda;
    for(const j of indices){
      // Regularized local inverse plus anatomically feasible reference prior.
      const change=(targetArea-area)*gradient[j]/norm + referenceBias*(reference[j]-x[j]);
      x[j]=clamp(x[j]+clamp(change,-stepLimit,stepLimit),0,1);
    }
  }
  return {converged:history.at(-1).area_cm2<=goalArea,
    startArea_cm2:history[0].area_cm2,finalArea_cm2:history.at(-1).area_cm2,
    referenceArea_cm2:targetArea,iterations:history.length-1,
    history,solution:x};
}

/** Small paired, reproducible gain/delay sweep on the *same* VTL motor plant.
 * Reports target tracking and auditory perturbation RESPONSE, not intelligibility.
 */
export const GAIN_GRID = Object.freeze([0, .1, .2, .4]);
export const DELAY_GRID_MS = Object.freeze([40, 100]);
export function sweepConditions(cfg={}, gains=GAIN_GRID, delays=DELAY_GRID_MS){
  return delays.flatMap(delay=>gains.map(feedback=>({
    id:`g${feedback}-d${delay}`,feedback,delay,
    cfg:{...cfg,feedback,delay,perturbation:0,sensorySafety:true}
  })));
}
export function pairedF1Response(baseline,altered,{onsetMs=300,shiftHz=150}={}){
  const a=baseline.frames,b=altered.frames;
  if(!a?.length || a.length!==b?.length)throw new Error('Paired simulations require identical time grids');
  let sum=0, n=0, stateSum=0, nStates=0, delayWindowSum=0, nLate=0;
  for(let i=0;i<a.length;i++){
    if(Math.abs(a[i].t-b[i].t)>.00001)throw new Error('Paired time grids differ');
    if(a[i].t<(onsetMs+100)/1000)continue;
    const f0=a[i].sensory?.auditory?.[0], f1=b[i].sensory?.auditory?.[0];
    if(Number.isFinite(f0)&&Number.isFinite(f1)){
      const d=f1-f0;sum+=d;n++;
      if(a[i].t>=(onsetMs+200)/1000){delayWindowSum+=d;nLate++;}
    }
    for(let j=0;j<a[i].x.length;j++){
      stateSum+=(b[i].x[j]-a[i].x[j])**2;nStates++;
    }
  }
  const meanDeltaF1=nLate?delayWindowSum/nLate:n?sum/n:null;
  // For an upward shift of *heard* F1, lowering produced F1 is compensation.
  const compensationHz=meanDeltaF1===null?null:meanDeltaF1===0?0:-Math.sign(shiftHz)*meanDeltaF1;
  return {meanDeltaF1Hz:meanDeltaF1,compensationHz,
    compensationFraction:compensationHz===null?null:compensationHz/Math.abs(shiftHz),
    motorDivergenceRms:nStates?Math.sqrt(stateSum/nStates):0,validSamples:n};
}
export function sweepCsv(rows){
  const cols=['controller','phrase','feedback','delay','trackingRms','effort','meanDeltaF1Hz',
    'compensationHz','compensationFraction','validSamples'];
  return [cols.join(','),...rows.map(row=>cols.map(c=>row[c]??'').join(','))].join('\n')+'\n';
}

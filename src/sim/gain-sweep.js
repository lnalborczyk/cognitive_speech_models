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
  // This is an unperturbed sweep. Compensation metrics belong to the paired
  // perturbation export, and cannot be estimated from these runs.
  const cols=['controller','phrase','feedback','delay','trackingRms','effort'];
  return [cols.join(','),...rows.map(row=>cols.map(c=>row[c]??'').join(','))].join('\n')+'\n';
}

/** Paired time course for auditing auditory-perturbation experiments.
 * Values are VTL transfer-function resonance *estimates*, not LPC measurements
 * on emitted sound. Each 5-ms plant frame repeats the observer's most recent
 * estimate until the next ~40-ms observer update. `observerUpdate` is a
 * nominal sampling flag (with an extra flag on phoneme switches), so use only
 * flagged rows when summarizing acoustic responses, not every 5-ms row as an
 * independent observation. Do not use these time points as independent trials.
 */
export function pairedF1Csv(baseline,altered,{
  onsetMs=300,shiftHz=150,model='',phrase='',seed='',feedback='',delayMs=''
}={}){
  const a=baseline?.frames,b=altered?.frames;
  if(!Array.isArray(a)||!a.length||!Array.isArray(b)||a.length!==b.length)
    throw Error('Paired simulations require nonempty, identical time grids');
  const cols=['time_s','phone','observer_update','onset_s','shift_hz',
    'baseline_F1_Hz','shifted_F1_Hz','target_F1_Hz','baseline_error_Hz',
    'shifted_error_unperturbed_Hz','delta_produced_F1_Hz','compensation_Hz',
    'motor_divergence_RMS','model','phrase','seed','feedback_gain','delay_ms'];
  const fmt=x=>Number.isFinite(x)?String(x):'';
  const rows=a.map((f,i)=>{
    const g=b[i];
    if(!Number.isFinite(f.t)||Math.abs(f.t-g.t)>1e-5||f.x.length!==g.x.length)
      throw Error('Paired time grids or articulatory dimensions differ');
    const f1=f.sensory?.auditory?.[0],other=g.sensory?.auditory?.[0];
    const target=f.sensory?.auditoryTarget?.[0];
    const d=Number.isFinite(f1)&&Number.isFinite(other)?other-f1:null;
    const motor=Math.sqrt(f.x.reduce((sum,x,j)=>sum+(x-g.x[j])**2,0)/f.x.length);
    const values=[fmt(f.t),f.phone||'',(i%8===0||f.phone!==a[i-1]?.phone)?'1':'0',
      fmt(onsetMs/1000),fmt(shiftHz),fmt(f1),fmt(other),fmt(target),
      fmt(Number.isFinite(f1)&&Number.isFinite(target)?f1-target:null),
      fmt(Number.isFinite(other)&&Number.isFinite(target)?other-target:null),
      fmt(d),fmt(d===null?null:-Math.sign(shiftHz)*d),fmt(motor),
      String(model),String(phrase),fmt(seed),fmt(feedback),fmt(delayMs)];
    return values.join(',');
  });
  return [cols.join(','),...rows].join('\n')+'\n';
}

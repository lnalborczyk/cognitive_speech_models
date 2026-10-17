/** Reproducible within-controller auditory-feedback ablation.
 * All conditions use exactly the same speaker, phonetic targets, motor plant,
 * random seed and synthesize through the genuine VTL backend. There is no
 * claim that target tracking or WAV RMS measures perceptual intelligibility.
 */
import {decodeWavBase64} from './diagnostics.js';

export function feedbackConditions(cfg={}){
  const feedback=Number(cfg.feedback)>0?Number(cfg.feedback):0.8;
  const common={...cfg,feedback,perturbation:0};
  return [
    {id:'auditory-off',label:'Auditory feedback off',cfg:{...common,feedback:0,sensorySafety:true}},
    {id:'unguarded',label:'Legacy unguarded feedback',cfg:{...common,sensorySafety:false}},
    {id:'guarded',label:'Stabilized feedback',cfg:{...common,sensorySafety:true}},
  ];
}

export function feedbackSummary(sim,output){
  const frames=sim?.frames;
  if(!Array.isArray(frames)||frames.length<2)throw Error('Missing simulation frames');
  if(!output?.audioBase64)throw Error('Missing actual VTL audio');
  const {samples,rate}=decodeWavBase64(output.audioBase64);
  if(!samples.length||!Number.isFinite(rate)||rate<8000)throw Error('Empty or invalid VTL WAV');
  let wavSquare=0,wavClipped=0,commandPeak=0,changeSquared=0,changes=0;
  let formantJumps=0,formantMeasurements=0,lastFormants=null,lastSensoryTime=null;
  for(let i=0;i<samples.length;i++){
    const sample=samples[i];wavSquare+=sample*sample;
    if(Math.abs(sample)>=.995)wavClipped++;
  }
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    if(!f.x.every(Number.isFinite)||!f.u.every(Number.isFinite))throw Error('Nonfinite motor trajectory');
    for(const u of f.u)commandPeak=Math.max(commandPeak,Math.abs(u));
    if(i>0)for(let j=0;j<f.x.length;j++){
      changeSquared+=(f.x[j]-frames[i-1].x[j])**2;changes++;
    }
    // Observer updates occur at ~40 ms intervals, not every 5-ms plant step.
    const observed=f.sensory?.auditory;
    if(observed && observed.some(Number.isFinite) &&
       observed!==lastFormants && f.t!==lastSensoryTime){
      if(lastFormants)for(let k=0;k<3;k++){
        if(Number.isFinite(observed[k])&&Number.isFinite(lastFormants[k])&&
          Math.abs(observed[k]-lastFormants[k])>300)formantJumps++;
      }
      formantMeasurements++;
      lastFormants=observed;lastSensoryTime=f.t;
    }
  }
  return {
    trackingRms:sim.metrics.normalizedTrackingRMS,
    effort:sim.metrics.effortMean,
    audioRms:Math.sqrt(wavSquare/samples.length),
    clippingPercent:100*wavClipped/samples.length,
    commandPeak,
    stepRms:changes?Math.sqrt(changeSquared/changes):0,
    formantJumps,formantMeasurements,
    durationSeconds:samples.length/rate,
  };
}

export function feedbackCsv(rows,{model='',phrase='',seed=''}={}){
  const columns=['condition','model','phrase','seed','trackingRms','effort','audioRms',
    'clippingPercent','commandPeak','stepRms','formantJumps','formantMeasurements','durationSeconds'];
  const clean=v=>String(v??'').replaceAll(',',';');
  return [columns.join(','),...rows.map(r=>columns.map(c=>clean(r[c]??(
    c==='model'?model:c==='phrase'?phrase:c==='seed'?seed:''))).join(','))].join('\n')+'\n';
}

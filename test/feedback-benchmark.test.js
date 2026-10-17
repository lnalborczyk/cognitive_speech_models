import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackConditions,feedbackSummary,feedbackCsv} from '../src/sim/feedback-benchmark.js';
import {feedbackForce,formantsFromSpectrum} from '../src/motor/sensory-control.js';
import {wavBytes} from '../src/engine/wasm-runtime.js';

function fakeWav(){return btoa(String.fromCharCode(...wavBytes(new Float64Array([0,.25,-.25,.999,0]),16000)));}

test('three conditions share rate, overlap, perturbation-free goals and random seed',()=>{
 const cfg={feedback:1.1,seed:39,rate:1.3,overlap:.5,perturbation:150};
 const v=feedbackConditions(cfg);
 assert.deepEqual(v.map(r=>r.id),['auditory-off','unguarded','guarded']);
 assert.deepEqual(v.map(r=>r.cfg.feedback),[0,1.1,1.1]);
 assert.deepEqual(v.map(r=>r.cfg.sensorySafety),[true,false,true]);
 assert.ok(v.every(r=>r.cfg.seed===39&&r.cfg.rate===1.3&&r.cfg.perturbation===0));
});

test('feedback summaries derive WAV measurements from real PCM, not phonetic targets',()=>{
 const s={metrics:{normalizedTrackingRMS:.2,effort:3},frames:[
  {t:0,x:[.3],u:[2],sensory:{auditory:[520,1500,2800]}},
  {t:.005,x:[.4],u:[4],sensory:{auditory:[520,1500,2800]}},
  {t:.01,x:[.5],u:[1],sensory:{auditory:[950,1500,2800]}}
 ]};
 const r=feedbackSummary(s,{audioBase64:fakeWav()});
 assert.ok(r.audioRms>0);assert.ok(r.clippingPercent>0);
 assert.equal(r.commandPeak,4);assert.equal(r.formantJumps,1);
 assert.match(feedbackCsv([{condition:'guarded',...r}],{model:'diva',phrase:'aia',seed:17}),/guarded,diva,aia,17/);
});

test('auditory gain 0 preserves ablation and safe feedback limits motor correction',()=>{
 const sensor={auditory:[600,1600,2700],auditoryTarget:[900,1600,2700],auditoryJacobian:[[15000], [0], [0]]};
 assert.deepEqual(feedbackForce(sensor,{feedback:0},1),[0]);
 const legacy=feedbackForce(sensor,{feedback:1,sensorySafety:false},1)[0];
 const guarded=feedbackForce(sensor,{feedback:1,sensorySafety:true},1)[0];
 assert.ok(Number.isFinite(legacy));assert.ok(Math.abs(guarded)<=18);
 assert.ok(Math.abs(guarded)<=Math.abs(legacy));
});

test('formant tracking follows nearest same peak rather than amplitude takeover',()=>{
 const size=2048,rate=44100;
 const make=(amplitudeLeft,amplitudeRight)=>Array.from({length:size},(_,i)=>{
   const f=i*rate/size;
   return amplitudeLeft/(1+((f-550)/40)**2)+amplitudeRight/(1+((f-850)/40)**2)
     +1/(1+((f-1700)/70)**2)+1/(1+((f-3200)/70)**2);
 });
 const baseline=formantsFromSpectrum(make(2,1),rate);
 const swapped=formantsFromSpectrum(make(1,2),rate);
 const anchored=formantsFromSpectrum(make(1,2),rate,baseline);
 assert.ok(baseline[0]<650);assert.ok(swapped[0]>750);
 assert.ok(anchored[0]<650);
});

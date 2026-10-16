import test from 'node:test';import assert from 'node:assert/strict';
import {makeScore,PHRASES,activation} from '../src/motor/gestures.js';
import {taskMatrix,taskDrive} from '../src/motor/task-space.js';
import {oralMinimum,assessStops,spectrogram} from '../src/sim/diagnostics.js';
import {fixtureSpeaker} from './fixtures/speaker.js';
const baseSpeaker=fixtureSpeaker();
const makeSpeaker=()=>{
 const speaker=structuredClone(baseSpeaker);
 for(const [phone,source] of Object.entries({p:'ll-labial-closure',t:'tt-alveolar-closure',k:'tb-velar-closure'})){
  for(const v of 'aiu')speaker.shapes[`${phone}:${v}`]=speaker.shapes[v].map((n,i)=>i===0?.01:n*.85);
 }
 return speaker;
};
test('contextually maps a stop shape and prefers its following vowel',()=>{
 const s=makeScore('ipi',makeSpeaker());
 assert.equal(s.gestures[1].context,'i');assert.equal(s.gestures[1].kind,'stop');
 assert.equal(s.gestures[1].target[0],.01);
 assert.equal(activation(s,s.gestures[1].center).weight[1],1);
});
test('supports VTL closure benchmarks and does not invent missing targets',()=>{
 const missing=structuredClone(baseSpeaker);delete missing.shapes.p;
 assert.throws(()=>makeScore('apa',missing),/Missing speaker target/);
 const s=makeScore('aka',makeSpeaker());
 const m=assessStops({score:s},[{t:s.gestures[1].center,lengths_cm:[1,1,1,1],areas_cm2:[.2,.3,.04,.8]}]);
 assert.equal(m[0].candidateClosure,true);
 assert.equal(m[0].minOralArea_cm2,.04);
 assert.ok(oralMinimum({lengths_cm:[1,1,1,1],areas_cm2:[.01,.6,.5,.4]}).area_cm2>.01);
});
test('non-identity task Jacobian couples nearby articulators',()=>{
 const names=['LD','JA','TTY','TCY','TCX','LP','TTX'];
 const J=taskMatrix(names).rows;
 assert.ok(J.some(row=>row.filter(v=>v!==0).length>1));
 const u=taskDrive(names,Array(7).fill(.3),Array(7).fill(0),Array(7).fill(.7),{rate:1});
 assert.equal(u.length,7);assert.ok(u.every(Number.isFinite));
});
test('STFT returns finite spectral bins for synthesized waveform',()=>{
 const wave={rate:8000,samples:Float32Array.from({length:4000},(_,i)=>Math.sin(i*2*Math.PI*200/8000))};
 const spec=spectrogram(wave,{maxFrames:8});
 assert.equal(spec.frames.length,8);assert.ok(spec.frames.every(f=>f.bands.every(Number.isFinite)));
});

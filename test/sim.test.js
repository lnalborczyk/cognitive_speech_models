import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSpeaker} from './fixtures/speaker.js';
import {CONTROLLERS} from '../src/cognitive/registry.js';
import {simulate,csvOutput} from '../src/sim/runner.js';
import {makeScore,activation} from '../src/motor/gestures.js';
const sp=fixtureSpeaker();
test('all controllers produce finite bounded states using shared plant',()=>{
 for(const model of Object.keys(CONTROLLERS)){
  const s=simulate(model,'pataka',sp,{noise:.04});
  assert.ok(s.frames.length>150);
  assert.equal(s.frames[0].x.length,sp.names.length);
  for(const f of s.frames){assert.ok(f.x.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
   assert.ok(f.u.every(Number.isFinite));}
  assert.ok(s.metrics.normalizedTrackingRMS>=0);
 }
});
test('same configuration and seed deterministic',()=>{
 const a=simulate('diva','aia',sp,{noise:.2,seed:33});
 const b=simulate('diva','aia',sp,{noise:.2,seed:33});
 assert.deepEqual(a.frames.map(x=>x.x),b.frames.map(x=>x.x));
});
test('controllers can operate on arbitrary VTL parameter dimensionality',()=>{
 const extended={...sp,names:Array(19).fill(0).map((_,i)=>`T${i}`),
  neutral:Array(19).fill(.45),shapes:Object.fromEntries(Object.entries(sp.shapes).map(([p,x])=>[p,[...x,...Array(11).fill(.4)]]))};
 for(const model of Object.keys(CONTROLLERS)){
  const s=simulate(model,'aia',extended);
  assert.equal(s.frames.at(-1).x.length,19);
 }
});
test('absent speaker consonants produce explicit error',()=>{
 const speaker={...sp,shapes:{a:sp.shapes.a,i:sp.shapes.i,u:sp.shapes.u}};
 assert.throws(()=>simulate('td','apa',speaker),/Missing speaker target/);
});
test('gestures overlap smoothly',()=>{
 const score=makeScore('aia',sp,{rate:1,overlap:.65});
 const a=activation(score,score.gestures[0].end-.02);
 assert.ok(a.weight[0]>0);assert.ok(a.weight[1]>0);
});
test('CSV contains actual model and source parameter dimension',()=>{
 const s=simulate('diva','aia',sp),csv=csvOutput(s,sp);
 assert.ok(csv.startsWith('model,t_s,phone,selected,JX'));
 assert.equal(csv.trim().split('\n').length,s.frames.length+1);
});

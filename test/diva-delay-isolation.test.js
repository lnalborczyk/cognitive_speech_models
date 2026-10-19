import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSpeaker} from './fixtures/speaker.js';
import {simulate} from '../src/sim/runner.js';

const speaker=fixtureSpeaker();
// An auditory delay cannot influence the motor plan when auditory gain is 0.
test('auditory-delay negative control: trajectories and effort identical at gain zero',()=>{
 const base={feedback:0,somatosensory:.5,somatosensoryDelayMs:40,
  noise:0,seed:17,rate:.6};
 const a=simulate('diva','aia',speaker,{...base,delay:40});
 const b=simulate('diva','aia',speaker,{...base,delay:100});
 assert.deepEqual(a.frames.map(f=>f.x),b.frames.map(f=>f.x));
 assert.equal(a.metrics.normalizedTrackingRMS,b.metrics.normalizedTrackingRMS);
 assert.equal(a.metrics.effortMean,b.metrics.effortMean);
});

test('proprioceptive latency is independently configurable',()=>{
 const cfg={feedback:0,somatosensory:.5,noise:0,seed:17,rate:.6,delay:40};
 const a=simulate('diva','aia',speaker,{...cfg,somatosensoryDelayMs:20});
 const b=simulate('diva','aia',speaker,{...cfg,somatosensoryDelayMs:100});
 assert.notDeepEqual(a.frames.map(f=>f.x),b.frames.map(f=>f.x));
});

test('auditory delay affects trajectories when auditory gain is nonzero',()=>{
 const cfg={feedback:.3,somatosensory:.5,somatosensoryDelayMs:40,
  noise:0,seed:17,rate:.6};
 const observe=({x,t})=>({
  auditory:[600+250*x[0]+20*t,1600,2700],
  auditoryTarget:[600,1600,2700],
  auditoryJacobian:[x.map((_,j)=>j===0?250:0),x.map(()=>0),x.map(()=>0)],
  time_s:t
 });
 const a=simulate('diva','aia',speaker,{...cfg,delay:40},observe);
 const b=simulate('diva','aia',speaker,{...cfg,delay:100},observe);
 assert.notDeepEqual(a.frames.map(f=>f.x),b.frames.map(f=>f.x));
});

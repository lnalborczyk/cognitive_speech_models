import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackForce,constrictionForce,formantsFromSpectrum} from '../src/motor/sensory-control.js';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
import {CONTROLLERS} from '../src/cognitive/registry.js';
test('GEPPETO-OFC replaces original GEPPETO placeholder',()=>{
 assert.equal(CONTROLLERS.geppeto,undefined);
 assert.ok(CONTROLLERS['geppeto-ofc']);
});
test('VTL spectral peaks used for formants',()=>{
 const n=2048,rate=44100;
 const spectrum=Array.from({length:n},(_,i)=>{
  const f=i*rate/n;
  return [590,1550,3100].reduce((s,center)=>s+1/(1+((f-center)/90)**2),0);
 });
 const f=formantsFromSpectrum(spectrum,rate);
 assert.ok(Math.abs(f[0]-590)<90);
 assert.ok(Math.abs(f[1]-1550)<90);
 assert.ok(Math.abs(f[2]-3100)<90);
});
test('altered auditory feedback changes motor commands with physical Jacobian',()=>{
 const auditory={auditory:[600,1700,2900],auditoryTarget:[600,1700,2900],
  auditoryJacobian:[[250,-100],[0,400],[0,0]]};
 assert.deepEqual(feedbackForce(auditory,{feedback:1,perturbation:0},2),[0,0]);
 const modified=feedbackForce(auditory,{feedback:1,perturbation:200},2);
 assert.ok(modified[0]<0);
 assert.ok(modified[1]>0);
 assert.deepEqual(feedbackForce(auditory,{feedback:0,perturbation:200},2),[0,0]);
});
test('constriction-area error pushes against the VTL aperture gradient',()=>{
 const sensory={constriction:{area:1.5,targetArea:0.1,jacobian:[2,-1]}};
 const drive=constrictionForce(sensory,2);
 assert.ok(drive[0]<0&&drive[1]>0);
 assert.ok(constrictionForce({constriction:{...sensory.constriction,area:0.1}},2).every(v=>v===0));
});
test('browser sensing never falls back to parameter-space pseudo measurements',()=>{
 const b={tract:{names:['JA','LD']},ntract:2,shapes:{a:[.2,.2],'p:a':[.3,.3]}};
 const obs=new VTLSensoryObserver(b);
 assert.equal(obs.intervalSteps,8);
 assert.equal(obs.indices.p.length,2);
});

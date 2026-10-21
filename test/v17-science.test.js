import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScore} from '../src/motor/gestures.js';
import {scoreTaskGoals} from '../src/motor/tract-variables.js';
import {taskSpaceCommand} from '../src/motor/task-dynamics-control.js';
import {fixtureSpeaker} from './fixtures/speaker.js';
import {evaluateInverseMapVTL,adaptMotorProgram,motorProgramRms} from '../src/cognitive/diva-learning.js';

const speaker=fixtureSpeaker();
test('stop closure wins competing vowel lip target at high gestural activation',()=>{
 const score=makeScore('apa',speaker,{overlap:.65});
 const shapes=new Map(score.gestures.map(g=>[g.source,{
   LA:g.phone==='p'?.02:1.2,TBCD:.9,TBCL:9,TTCD:1,TTCL:12
 }]));
 const t=score.gestures[1].center-0.12;
 const defaultPriority=scoreTaskGoals(score,t,shapes);
 const weakPriority=scoreTaskGoals(score,t,shapes,{stopPriority:1});
 assert.ok(defaultPriority.goals.LA<weakPriority.goals.LA);
 assert.ok(defaultPriority.stopWeights.LA>.5);
 // Independent tongue-body vowel gestures remain present.
 assert.equal(defaultPriority.goals.TBCD,.9);
});
test('after stop deactivation vowel aperture target returns',()=>{
 const score=makeScore('apa',speaker,{overlap:.5});
 const shapes=new Map(score.gestures.map(g=>[g.source,{
   LA:g.phone==='p'?.02:1.1,TBCD:.8,TBCL:9,TTCD:1,TTCL:12
 }]));
 const during=scoreTaskGoals(score,score.gestures[1].center,shapes);
 const after=scoreTaskGoals(score,score.gestures[2].center+score.gestures[2].width*.7,shapes);
 assert.ok(after.goals.LA>during.goals.LA);
 assert.ok((after.stopWeights.LA||0)<(during.stopWeights.LA||0));
});
test('closure speed increases requested task command but not vowel-only command',()=>{
 const base={x:[.5],v:[0],target:[.5],neutral:[.5],
   sensory:{taskGeometry:{values:{LA:1},goals:{LA:.05},jacobians:{LA:[1]},stopWeights:{LA:1}}}};
 const slow=taskSpaceCommand({...base,stopOmega:5.5,taskAccelerationLimit:115});
 const fast=taskSpaceCommand({...base,stopOmega:18,taskAccelerationLimit:115});
 assert.ok(fast[0]<slow[0]);
 assert.ok(Number.isFinite(fast[0]));
 const vowel={...base,sensory:{taskGeometry:{...base.sensory.taskGeometry,stopWeights:{LA:0}}}};
 assert.deepEqual(taskSpaceCommand({...vowel,stopOmega:5.5}),taskSpaceCommand({...vowel,stopOmega:18}));
});
test('independently held-out VTL configurations measure F1 correction, do not hallucinate missing F1',()=>{
 const backend={tract:{names:['JA','TCX','TCY','LD']},shapes:{a:[.4,.4,.4,.4],i:[.5,.5,.5,.5]}};
 const observer={formants:(x)=>[250+400*x[0],1250,2600]};
 const maps={a:{validBands:[0],weights:[[1,0,0],[0,0,0],[0,0,0],[0,0,0]]},
   i:{validBands:[],weights:[[0,0,0]]}};
 const output=evaluateInverseMapVTL(observer,backend,maps,{nTrials:20,seed:44,correctionScale:1});
 assert.equal(output[0].valid,20);
 assert.ok(output[0].meanAbsErrorAfterHz<output[0].meanAbsErrorBeforeHz);
 assert.equal(output[1].valid,0);
 assert.equal(output[1].meanAbsErrorAfterHz,null);
});
test('motor-program retention permits separately measurable washout',()=>{
 const frames=[{x:[.5],control:{command:[0]}},{x:[.4],control:{command:[0]}}];
 let memory=[[5],[-3]];
 const before=motorProgramRms(memory);
 memory=adaptMotorProgram(memory,frames,{learningRate:.12,retention:.8});
 assert.ok(motorProgramRms(memory)<before);
 assert.deepEqual(memory,[[4],[-2.4000000000000004]]);
});

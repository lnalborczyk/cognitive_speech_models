import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSpeaker} from './fixtures/speaker.js';
import {makeScore} from '../src/motor/gestures.js';
import {tubeTractVariables,scoreTaskGoals,taskJacobianFromVTL} from '../src/motor/tract-variables.js';
import {taskSpaceCommand} from '../src/motor/task-dynamics-control.js';
import {coupleGestureTiming} from '../src/motor/gestural-oscillators.js';
import {fitInverseMap,predictCorrection,babbleVTL,adaptMotorProgram} from '../src/cognitive/diva-learning.js';
import {feedbackForceDetailed} from '../src/motor/sensory-control.js';
const speaker=fixtureSpeaker();
test('tube-derived aperture reacts to constriction and locations remain in the tube',()=>{
 const lengths=Array(20).fill(.85),areas=Array(20).fill(2);
 const opened=tubeTractVariables(areas,lengths);
 areas[19]=.025;const closed=tubeTractVariables(areas,lengths);
 assert.ok(closed.LA<opened.LA);
 assert.ok(closed.TTCL>=0&&closed.TTCL<=17);
});
test('independent scores preserve vowel tongue-body goal under bilabial closure',()=>{
 const score=makeScore('apa',speaker,{overlap:.7});
 const targets=new Map(score.gestures.map(g=>[g.source,{
   LA:g.phone==='p'?.05:1.3,TBCD:.9,TBCL:9.2,TTCD:.7,TTCL:13} ]));
 const t=score.gestures[1].center;
 const goal=scoreTaskGoals(score,t,targets);
 assert.ok(goal.goals.LA<.5);
 assert.ok(Number.isFinite(goal.goals.TBCD));
 assert.ok(goal.active.some(g=>g.phone==='p'));
});
test('tract-task Jacobian uses actual measured values',()=>{
 const values=x=>({LA:2*x[0],TTCD:x[1]**2});
 const result=taskJacobianFromVTL(values,[.4,.6],['LD','TTY'],{delta:.0001});
 assert.ok(Math.abs(result.jacobians.LA[0]-2)<.001);
 assert.ok(Math.abs(result.jacobians.TTCD[1]-1.2)<.005);
});
test('regularized task-space command changes articulators in useful direction',()=>{
 const data={taskGeometry:{values:{LA:1},goals:{LA:.5},jacobians:{LA:[1,0]}}};
 const force=taskSpaceCommand({x:[.5,.5],v:[0,0],target:[.5,.5],neutral:[.5,.5],sensory:data});
 assert.ok(force[0]<0);assert.ok(Math.abs(force[1])<1e-7);
});
test('gestural coupling shifts timing while preserving temporal ordering',()=>{
 const score=makeScore('apa',speaker),mod=coupleGestureTiming(score,{coupling:.6});
 assert.ok(mod.couplingGraph.length===2);
 assert.ok(mod.gestures[1].center<mod.gestures[2].center);
 assert.notDeepEqual(mod.gestures.map(g=>g.center),score.gestures.map(g=>g.center));
 assert.deepEqual(coupleGestureTiming(score,{coupling:0}).gestures.map(g=>g.center),score.gestures.map(g=>g.center));
});
test('inverse map learns sensory-to-motor response from synthetic babbling',()=>{
 const samples=Array.from({length:60},(_,i)=>{
   const dx=[(i-30)/100,Math.sin(i*1.1)/4];
   return {dx,df:[dx[0]*500,dx[1]*1200,null]};
 });
 const fit=fitInverseMap(samples,{ridge:.001});
 assert.deepEqual(fit.validBands,[0,1]);
 const correction=predictCorrection(fit,[100,-240,null],2);
 assert.ok(correction[0]<0&&correction[1]>0);
});
test('unresolved formant is not imputed in babbling map',()=>{
 const samples=Array.from({length:15},(_,i)=>({dx:[i/100],df:[null,i*12,0]}));
 const fit=fitInverseMap(samples,{ridge:.02});
 assert.ok(!fit.validBands.includes(0));
});
test('babbling references real VTL formant function with explicit validity',()=>{
 const names=['JA','TCX','TCY','LD'];
 const mock={tract:{names},shapes:{a:[.4,.4,.4,.4],i:[.6,.6,.6,.6]}};
 const sensor={formants:x=>[400+200*x[0],1200+150*x[1],2700+100*x[2]]};
 const learning=babbleVTL(sensor,mock,{nTrials:40,seed:21});
 assert.equal(learning.diagnostics.length,2);
 assert.ok(learning.maps.a.samples>20);
});
test('target region suppresses small F1 corrections with learned map',()=>{
 const map={validBands:[0],weights:[[.2,0,0]]};
 const sensing={auditory:[515,1200,2500],auditoryTarget:[500,1200,2500],auditoryJacobian:[[10],[0],[0]],measuredAt_s:1};
 const inside=feedbackForceDetailed(sensing,{feedback:.2,divaMode:'learned',learnedInverseMap:map,perturbation:0},1);
 assert.equal(inside.force[0],0);
 const outside=feedbackForceDetailed({...sensing,auditory:[650,1200,2500]},
   {feedback:.2,divaMode:'learned',learnedInverseMap:map},1);
 assert.ok(outside.force[0]<0);
 const disabled=feedbackForceDetailed({...sensing,auditory:[650,1200,2500]},
   {feedback:0,divaMode:'learned',learnedInverseMap:map},1);
 assert.equal(disabled.force[0],0);
});
test('feedforward practice retains limited learned corrections',()=>{
 const frames=[{x:[.5],control:{command:[10]}},{x:[.4],control:{command:[-5]}}];
 const trained=adaptMotorProgram(null,frames,{learningRate:.2});
 assert.deepEqual(trained,[[2],[-1]]);
 assert.deepEqual(adaptMotorProgram(trained,frames,{learningRate:.2}),[[4],[-2]]);
});

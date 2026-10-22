import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScore} from '../src/motor/gestures.js';
import {fixtureSpeaker} from './fixtures/speaker.js';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
import {taskSpaceCommand} from '../src/motor/task-dynamics-control.js';
import {adaptFromAcousticError,motorProgramRms} from '../src/cognitive/diva-learning.js';

const speaker=fixtureSpeaker();
function makeObserver(){
  const obs=Object.create(VTLSensoryObserver.prototype);
  obs.backend={tract:{names:speaker.names},shapes:{
    a:speaker.shapes.a,i:speaker.shapes.i,u:speaker.shapes.u,
    'p:a':speaker.shapes.p,'t:a':speaker.shapes.t,'k:a':speaker.shapes.k
  }};
  obs.calibratedTaskShapes=new Map(); obs.sites=new Map();
  // Analytic fixture for inverse-kinematics unit tests, not the live VTL engine.
  obs.area=x=>({
    lengths:Array(40).fill(.4),
    areas:Array.from({length:40},(_,j)=>j===37?.01+2*(x[7]-.02)**2:
      j===27?.01+3*(1-x[5])**2:
      j===19?.01+3*(1-x[3])**2:1.5),
  });
  obs.site=(phone)=>{
    const index={p:37,t:27,k:19}[phone];
    return {index,positionCm:(index+.5)*.4,
      targetArea:obs.area(obs.backend.shapes[`${phone}:a`]).areas[index]};
  };
  return obs;
}
for(const [phrase,phone] of [['apa','p'],['ata','t'],['aka','k']]){
  test(`static VTL site calibration anchors /${phone}/ closure to reference speaker shape`,()=>{
    const obs=makeObserver();
    const result=obs.stopCalibrationReport().find(r=>r.phone===phone);
    assert.equal(result.status,'measured');
    assert.ok(result.referenceAchievesClosure);
    assert.ok(result.vowelArea_cm2>result.referenceArea_cm2);
    assert.ok(result.initialGradientNorm_cm2>0);
  });
  test(`/${phone}/ adds feasible site-aperture control during gesture and removes it after`,()=>{
    const obs=makeObserver(),score=makeScore(phrase,speaker,{overlap:.5});
    const t=score.gestures[1].center;
    const measured=obs.taskMeasurement(speaker.shapes.a,score,t);
    assert.ok('SCD' in measured.values);
    assert.ok(Number.isFinite(measured.goals.SCD));
    assert.ok(measured.goals.SCD<measured.values.SCD);
    assert.ok(Array.isArray(measured.jacobians.SCD));
    assert.equal(measured.closurePhone,phone);
    const inactive=obs.taskMeasurement(speaker.shapes.a,score,score.duration+.06);
    assert.equal(inactive.closureReference,null);
    assert.equal(inactive.values.SCD,undefined);
  });
}
test('reference closure guide acts through motor commands and never rewrites positions',()=>{
  const input={x:[.3],v:[0],target:[.3],neutral:[.3],
    sensory:{taskGeometry:{values:{SCD:1},goals:{SCD:.05},
      jacobians:{SCD:[0]},stopWeights:{SCD:1},
      closureReference:[.95],closureActivity:1}}};
  const noGuide=taskSpaceCommand({...input,referenceAttraction:0});
  const guide=taskSpaceCommand({...input,referenceAttraction:65});
  assert.ok(guide[0]>noGuide[0]);
  assert.equal(input.x[0],.3);
  const removed=taskSpaceCommand({...input,sensory:{taskGeometry:{...input.sensory.taskGeometry,closureActivity:0}}});
  assert.deepEqual(removed,noGuide);
});
function makeFrames({produced=600,baseline=600,n=20,shiftAt=0}={}){
  return Array.from({length:n},(_,i)=>({
    t: +(i*.1).toFixed(3),x:[.5],
    sensory:{observerUpdate:true,auditory:[produced+(i>=shiftAt?0:0),1250,2400]}
  }));
}
const map={validBands:[0],weights:[[1,0,0]]};
test('DIVA learns compensatory command during positive heard-F1 exposure',()=>{
  const baseline=makeFrames();
  const exposed=makeFrames();
  const {memory,diagnostic}=adaptFromAcousticError(null,exposed,baseline,map,{shiftHz:150,onset_s:.45});
  assert.equal(diagnostic.status,'updated');
  assert.ok(diagnostic.valid>0);
  assert.ok(diagnostic.meanErrorHz>100);
  assert.ok(memory.at(-5)[0]<0,'positive heard shift should teach F1-lowering command');
  assert.equal(memory[0][0],0);
});
test('unperturbed acoustic baseline produces no memory drift',()=>{
  const baseline=makeFrames();
  const memory=Array.from({length:baseline.length},()=>[-1]);
  const out=adaptFromAcousticError(memory,baseline,baseline,map,{shiftHz:0,onset_s:.45});
  assert.deepEqual(out.memory,memory);
  assert.equal(out.diagnostic.commandIncrementRms,0);
});
test('an acoustically measurable aftereffect reverses the previous memory update during washout',()=>{
  const baseline=makeFrames();
  const exposure=adaptFromAcousticError(null,baseline,baseline,map,{shiftHz:150,onset_s:.45});
  const aftereffect=makeFrames({produced:594});
  const washout=adaptFromAcousticError(exposure.memory,aftereffect,baseline,map,{shiftHz:0,onset_s:.45});
  assert.ok(washout.diagnostic.meanErrorHz<0);
  assert.ok(motorProgramRms(washout.memory)<motorProgramRms(exposure.memory));
});
test('washout missing F1 never fabricates a corrective update',()=>{
  const baseline=makeFrames(),trial=makeFrames();
  trial.forEach(f=>f.sensory.auditory[0]=null);
  const before=Array.from({length:trial.length},()=>[.5]);
  const out=adaptFromAcousticError(before,trial,baseline,map,{onset_s:.45});
  assert.equal(out.diagnostic.status,'unresolved_F1');
  assert.deepEqual(out.memory,before);
});

test('static closure IK converges toward an actual reachable geometric site without state overwrite',async()=>{
  const {solveStaticClosure}=await import('../src/motor/closure-ik.js');
  const initial=[.2],target=[.8];
  const fit=solveStaticClosure({start:initial,reference:target,indices:[0],
    measure:x=>.01+2*(.8-x[0])**2,goalArea:.08});
  assert.ok(fit.converged);
  assert.ok(fit.finalArea_cm2<fit.startArea_cm2);
  assert.equal(initial[0],.2);
  assert.ok(fit.iterations>0);
});
test('static closure IK reports failure when tract geometry is insensitive',async()=>{
  const {solveStaticClosure}=await import('../src/motor/closure-ik.js');
  const fit=solveStaticClosure({start:[.2],reference:[.8],indices:[0],
    measure:()=>.5,goalArea:.08,maxIterations:3});
  assert.equal(fit.converged,false);
  assert.equal(fit.finalArea_cm2,.5);
});

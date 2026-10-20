import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScore} from '../src/motor/gestures.js';
import {feedbackForceDetailed,lowBandPeakCandidates} from '../src/motor/sensory-control.js';
import {simulate} from '../src/sim/runner.js';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
import {pairedF1Csv} from '../src/sim/gain-sweep.js';
import {responseWindows} from '../src/sim/response-windows.js';
import {fixtureSpeaker} from './fixtures/speaker.js';

const speaker=fixtureSpeaker();
test('held /a/ uses one continuous gesture and lasts longer than three-vowel sequence',()=>{
  const held=makeScore('ahold',speaker,{rate:.6});
  const short=makeScore('aia',speaker,{rate:.6});
  assert.deepEqual(held.phones,['a']);
  assert.equal(held.gestures.length,1);
  assert.ok(held.duration>short.duration);
  assert.ok(held.duration>1.5);
  const sim=simulate('diva','ahold',speaker,{rate:.6,noise:0});
  assert.ok(sim.frames.length>200);
  assert.ok(sim.frames.every(f=>f.phone==='a'));
});

test('feedback diagnostics never invent F1; zero auditory gain applies no shift',()=>{
  const s={time_s:.50,measuredAt_s:.48,auditory:[null,1500,3000],
    auditoryTarget:[650,1500,3000],auditoryJacobian:[[120],[80],[0]]};
  const z=feedbackForceDetailed(s,{feedback:0,perturbation:150,perturbationOnsetMs:450},1);
  assert.equal(z.diagnostic.status,'gain_disabled');
  assert.equal(z.diagnostic.appliedShiftHz,0);
  assert.deepEqual(z.force,[0]);
  const p=feedbackForceDetailed(s,{feedback:.2,perturbation:150,perturbationOnsetMs:450},1);
  assert.equal(p.diagnostic.status,'f1_unresolved');
  assert.equal(p.diagnostic.targetF1Hz,650);
  assert.equal(p.diagnostic.measuredF1Hz,null);
  assert.equal(p.diagnostic.appliedShiftHz,150);
  assert.equal(p.diagnostic.errorF1Hz,null);
});

test('feedback command starts when the delayed observed time reaches onset',()=>{
  const s={auditory:[600,1600,2800],auditoryTarget:[600,1600,2800],
    auditoryJacobian:[[250,-100],[0,0],[0,0]]};
  const cfg={feedback:.2,perturbation:150,perturbationOnsetMs:450};
  const before=feedbackForceDetailed({...s,measuredAt_s:.44},cfg,2);
  const after=feedbackForceDetailed({...s,measuredAt_s:.46},cfg,2);
  assert.equal(before.diagnostic.appliedShiftHz,0);
  assert.deepEqual(before.force,[0,0]);
  assert.equal(after.diagnostic.appliedShiftHz,150);
  assert.ok(after.diagnostic.commandRms>0);
  assert.ok(after.force[0]<0&&after.force[1]>0);
});

test('VTL observer distinguishes updates from cached measurements',()=>{
  const obs=new VTLSensoryObserver({tract:{names:['JA']}},{intervalSteps:8});
  obs.measure=()=>({auditory:[500,1600,2600],auditoryTarget:[500,1600,2600]});
  const q=n=>obs.at({x:[.5],target:[.5],phone:'a',context:'a',step:n});
  assert.equal(q(0).observerUpdate,true);
  const old=q(1);assert.equal(old.observerUpdate,false);
  assert.equal(old.measuredAt_s,0);
  assert.equal(old.time_s,.005);
  assert.equal(q(8).measuredAt_s,.04);
});

test('local maxima are candidates, not forced formant identities',()=>{
  const x=Array(2048).fill(0);x[8]=7;x[25]=4;
  const p=lowBandPeakCandidates(x,44100);
  assert.equal(p.length,2);
  assert.ok(Math.abs(p[0].hz-172.3)<1);
});

function pair({nullF1=false}={}){
 const score={gestures:[{start:0,end:1.5,phone:'a'}]};
 const make=shift=>({score,frames:Array.from({length:300},(_,i)=>{
  const t=i*.005,d=shift&&t>=.65?-40:0;
  return {t,phone:'a',x:[.5+d/4000],sensory:{auditory:[nullF1?null:600+d,1400,2600],
    auditoryTarget:[600,1400,2600],observerUpdate:i%8===0,measuredAt_s:Math.floor(i/8)*.04},
    control:{measuredF1Hz:nullF1?null:600+d,targetF1Hz:600,validF1:!nullF1,
     status:nullF1?'f1_unresolved':'available',appliedShiftHz:shift&&t>=.5?150:0,
     observationTime_s:t,commandRms:shift&&t>=.65?1:0,jacobianNormF1:250,errorF1Hz:!nullF1?d:null}};
 })});
 return [make(false),make(true)];
}

test('held vowel response is computed within vowel, not the final vowel',()=>{
 const [a,b]=pair();
 const r=responseWindows(a,b,{onsetMs:450,shiftHz:150});
 assert.equal(r.testVowel,'a');
 assert.equal(r.afterVowel,null);
 assert.ok(r.duringVowel.validF1>=3);
 assert.ok(r.duringVowel.compensationHz>0);
 const csv=pairedF1Csv(a,b,{onsetMs:450,shiftHz:150});
 const header=csv.split('\n')[0].split(',');
 for(const k of ['feedback_valid_F1','feedback_status','feedback_target_F1_Hz',
  'feedback_command_RMS','feedback_observation_time_s','observer_sample_time_s',
  'delta_auditory_command_RMS'])
  assert.ok(header.includes(k),k);
 const rows=csv.trim().split('\n');
 assert.equal(rows[1].split(',').length,header.length);
});

test('missing F1 returns no acoustic compensation estimate',()=>{
 const [a,b]=pair({nullF1:true});
 const r=responseWindows(a,b,{onsetMs:450,shiftHz:150});
 assert.equal(r.duringVowel.compensationHz,null);
 assert.equal(r.duringVowel.validF1,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {GAIN_GRID,DELAY_GRID_MS,sweepConditions,pairedF1Response,pairedF1Csv,sweepCsv} from '../src/sim/gain-sweep.js';

test('gain/delay grid contains zero gain and reproducible conditions',()=>{
  assert.deepEqual(GAIN_GRID,[0,.1,.2,.4]);
  assert.deepEqual(DELAY_GRID_MS,[40,100]);
  const grid=sweepConditions({seed:17,noise:0,perturbation:180});
  assert.equal(grid.length,8);
  assert.equal(grid[0].cfg.feedback,0);
  assert.ok(grid.every(row=>row.cfg.seed===17 && row.cfg.perturbation===0));
  assert.equal(new Set(grid.map(row=>row.id)).size,8);
});
const sampleFrames=(shift=0)=>({frames:Array.from({length:50},(_,i)=>({
 t:i*.01,x:[.5+(i>=35?shift*.001:0)],
 sensory:{auditory:[500+(i>=35?shift:0),1600,2700]}
}))});
test('upward perceived-F1 shift yields positive compensation when generated F1 falls',()=>{
  const out=pairedF1Response(sampleFrames(),sampleFrames(-60),{onsetMs:150,shiftHz:150});
  assert.ok(Math.abs(out.meanDeltaF1Hz+60)<1e-9);
  assert.ok(Math.abs(out.compensationFraction-.4)<1e-9);
  assert.ok(out.motorDivergenceRms>0);
  assert.ok(out.validSamples>0);
});
test('no compensation for identical paired trajectories',()=>{
  const x=sampleFrames();
  const out=pairedF1Response(x,x,{onsetMs:150,shiftHz:150});
  assert.equal(out.compensationHz,0);
  assert.equal(out.motorDivergenceRms,0);
});
test('paired results reject sampling grid mismatch',()=>{
 const x=sampleFrames(),y=sampleFrames();y.frames[4].t+=.02;
 assert.throws(()=>pairedF1Response(x,y),/grid/);
});
test('unperturbed sweep CSV exports only measured tracking and effort fields',()=>{
 const text=sweepCsv([{controller:'diva',phrase:'aia',feedback:.2,delay:40,trackingRms:.1,
  effort:42,meanDeltaF1Hz:-30,compensationHz:30,compensationFraction:.2,validSamples:10}]);
 assert.doesNotMatch(text,/compensationHz|validSamples|meanDeltaF1Hz/);assert.match(text,/diva,aia,0.2,40/);
});

test('paired F1 export contains actual, target and response with explicit sample flag',()=>{
 const a={frames:[
  {t:0,phone:'a',x:[.5,.5],sensory:{auditory:[600,1500,2600],auditoryTarget:[600,1500,2600]}},
  {t:.005,phone:'a',x:[.5,.5],sensory:{auditory:[600,1500,2600],auditoryTarget:[600,1500,2600]}}
 ]};
 const b={frames:[
  {t:0,phone:'a',x:[.5,.5],sensory:{auditory:[600,1500,2600]}},
  {t:.005,phone:'a',x:[.6,.5],sensory:{auditory:[570,1500,2600]}}
 ]};
 const text=pairedF1Csv(a,b,{shiftHz:150,onsetMs:0,model:'diva',phrase:'aia',seed:17,feedback:.2,delayMs:40});
 const lines=text.trim().split('\n');
 assert.equal(lines.length,3);
 const columns=lines[0].split(',');
 const data=lines[2].split(',');
 assert.equal(data[columns.indexOf('delta_produced_F1_Hz')],'-30');
 assert.equal(data[columns.indexOf('compensation_Hz')],'30');
 assert.equal(data[columns.indexOf('baseline_error_Hz')],'0');
 assert.equal(data[columns.indexOf('observer_update')],'0');
 assert.ok(Math.abs(Number(data[columns.indexOf('motor_divergence_RMS')])-Math.sqrt(.01/2))<1e-12);
});
test('paired F1 export rejects mismatched temporal grids',()=>{
 const a=sampleFrames();const b=sampleFrames();b.frames[5].t=.99;
 assert.throws(()=>pairedF1Csv(a,b),/grid/);
});

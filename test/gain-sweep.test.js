import test from 'node:test';
import assert from 'node:assert/strict';
import {GAIN_GRID,DELAY_GRID_MS,sweepConditions,pairedF1Response,sweepCsv} from '../src/sim/gain-sweep.js';

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
test('sweep CSV exports target and compensation columns',()=>{
 const text=sweepCsv([{controller:'diva',phrase:'aia',feedback:.2,delay:40,trackingRms:.1,
  effort:42,meanDeltaF1Hz:-30,compensationHz:30,compensationFraction:.2,validSamples:10}]);
 assert.match(text,/compensationHz/);assert.match(text,/diva,aia,0.2,40/);
});

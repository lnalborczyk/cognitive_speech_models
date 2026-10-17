import test from 'node:test';
import assert from 'node:assert/strict';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';

function observer() {
  const backend={
    tract:{names:['JA','TCX','TCY','LD']},
    shapes:{a:[.5,.4,.4,.4], 'p:a':[1,.4,.4,.4]},
  };
  const obs=new VTLSensoryObserver(backend,{intervalSteps:1});
  // Controlled differentiable stand-ins, not the VTL native functions.
  obs.formants=x=>[500+1000*x[0], 1500+600*x[1], 2700+400*x[2]];
  obs.area=x=>({areas:[1,1,1-.6*x[0]],lengths:[1,1,1]});
  return obs;
}

test('auditory finite differences use backward steps near parameter upper bound',()=>{
  const obs=observer();
  const result=obs.measure([.995,.3,.4,.4],[.5,.3,.4,.4],'a','a');
  assert.ok(Math.abs(result.auditoryJacobian[0][0]-1000)<1e-7,
    `Expected F1/JA derivative ≈1000, got ${result.auditoryJacobian[0][0]}`);
});

test('closure finite differences use backward steps near parameter upper bound',()=>{
  const obs=observer();
  const result=obs.measure([.995,.3,.4,.4],[1,.3,.4,.4],'p','a');
  assert.ok(result.constriction);
  assert.ok(Math.abs(result.constriction.jacobian[0]+.6)<1e-7,
    `Expected aperture/JA derivative ≈-0.6, got ${result.constriction.jacobian[0]}`);
});

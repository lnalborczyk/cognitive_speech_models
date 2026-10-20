import test from 'node:test';
import assert from 'node:assert/strict';
import {interpolateReference,compareTimeSeries} from '../src/sim/reference-comparison.js';
test('reference comparisons use external observations, not internal target copies',()=>{
 const ref=[{t:0,F1_Hz:100},{t:1,F1_Hz:200}];
 assert.equal(interpolateReference(ref,.5,'F1_Hz'),150);
 const sim=[{t:0,F1_Hz:110},{t:.5,F1_Hz:140},{t:1,F1_Hz:200}];
 const out=compareTimeSeries(sim,ref);
 assert.equal(out.validSamples,3);
 assert.ok(Math.abs(out.RMSE-Math.sqrt(200/3))<1e-6);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackForce} from '../src/motor/sensory-control.js';
function info(time){return {
 time_s:time,auditory:[600,1500,2800],auditoryTarget:[600,1500,2800],
 auditoryJacobian:[[150,0],[0,200],[0,0]]
};}
test('perceived F1 shift is inactive before onset and changes feedback after onset',()=>{
 const cfg={feedback:1,perturbation:180,perturbationOnsetMs:300};
 assert.deepEqual(feedbackForce(info(.20),cfg,2),[0,0]);
 const delayed=feedbackForce(info(.30),cfg,2);
 assert.ok(delayed[0]<0);
 assert.equal(delayed[1],0);
 assert.deepEqual(feedbackForce(info(.50),{...cfg,perturbation:0},2),[0,0]);
});

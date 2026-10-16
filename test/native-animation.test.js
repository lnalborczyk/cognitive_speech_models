import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestTimestampIndex} from '../src/view/native-animation.js';

test('VTL rendering chooses nearest actual timestamp, including endpoints',()=>{
 const frames=[{t:0},{t:.04},{t:.08},{t:.12}];
 assert.equal(nearestTimestampIndex(frames,-1),0);
 assert.equal(nearestTimestampIndex(frames,.061),2);
 assert.equal(nearestTimestampIndex(frames,.059),1);
 assert.equal(nearestTimestampIndex(frames,.3),3);
 assert.equal(nearestTimestampIndex([],0),-1);
});

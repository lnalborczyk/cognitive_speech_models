import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public HTML does not contain obsolete simulation and deployment panels',()=>{
 const h=fs.readFileSync('index.html','utf8');
 for(const id of ['feedback-test','compare-vtl','all-csv','geometry-fps','source'])
   assert.doesNotMatch(h,new RegExp(`id="${id}"`));
 for(const id of ['calibration-test','authority-test','balance-test','sweep-test','experiment','wav','native-geometry'])
   assert.match(h,new RegExp(`id="${id}"`));
 assert.ok(h.includes('<details class="disclosure" id="research-tools">'));
});
test('public repository references original CognitiveHands',()=>{
 const r=fs.readFileSync('README.md','utf8');
 assert.match(r,/https:\/\/github.com\/CrumpLabSandbox\/CognitiveHands/);
});

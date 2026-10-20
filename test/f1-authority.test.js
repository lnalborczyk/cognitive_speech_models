import test from 'node:test';
import assert from 'node:assert/strict';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
import {DIVA} from '../src/cognitive/diva.js';

test('local F1 sensitivity uses signed VTL differences without inventing missing estimates',()=>{
 const backend={tract:{names:['JA','TCX','TCY','LD']},shapes:{a:[.4,.5,.5,.5],i:[.4,.4,.5,.5]}};
 const observer=new VTLSensoryObserver(backend);
 observer.formants=(x)=>x[1]===.4?[null,2000,3000]:[600+200*x[0]-100*x[1],1800,3000];
 const r=observer.localF1Authority({vowels:['a','i']});
 assert.ok(Math.abs(r[0].slopes.find(s=>s.parameter==='JA').slopeHzPerUnit-200)<1e-6);
 assert.ok(Math.abs(r[0].slopes.find(s=>s.parameter==='TCX').slopeHzPerUnit+100)<1e-6);
 assert.equal(r[1].baselineF1,null);
 assert.ok(r[1].slopes.every(s=>s.slopeHzPerUnit===null));
});
test('DIVA feedforward strength scales restoring force without affecting zero-gain auditory delay',()=>{
 const sample={x:[.5],v:[0],target:[.6],t:0,sensory:null,weights:[1],selected:0};
 const a=new DIVA({feedback:0,somatosensory:0,feedforwardScale:1,delay:40}).step(sample).u[0];
 const b=new DIVA({feedback:0,somatosensory:0,feedforwardScale:.5,delay:100}).step(sample).u[0];
 assert.ok(Math.abs(b/a-.5)<1e-8);
});
test('interface exposes only WebAssembly VTL and retains the CognitiveHands attribution',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync('index.html','utf8'),readme=fs.readFileSync('README.md','utf8');
 assert.match(html,/id="engine" type="hidden" value="wasm"/);
 assert.doesNotMatch(html,/value="vtl"|server\/vtl\.py|id="feedback-test"|id="compare-vtl"/);
 assert.match(readme,/CrumpLabSandbox\/CognitiveHands/);
});

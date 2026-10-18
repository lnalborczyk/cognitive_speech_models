import test from 'node:test';
import assert from 'node:assert/strict';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
function setup(){
 const backend={tract:{names:['JA','TCX','TCY','LD']},
   shapes:{a:[.4,.1,.1,.2],i:[.5,.7,.7,.3],u:[.25,.3,.4,.2]}};
 const observer=new VTLSensoryObserver(backend,{intervalSteps:1});
 const calls=[];
 observer.formants=(x,ref=null)=>{
   calls.push({x:[...x],ref:ref?.slice()||null});
   return [500+100*x[0],1500+300*x[1],2750+250*x[2]];
 };
 return {observer,backend,calls};
}
test('speaker vowel targets come from VTL speaker tract shapes, not static human formants',()=>{
 const {observer}=setup(),refs=observer.calibrationReport();
 assert.equal(refs.length,3);
 assert.equal(refs.find(x=>x.phone==='a').formantsHz[0],540);
 assert.ok(refs.every(row=>row.zeroError));
 assert.ok(refs.every(row=>row.resolved===3));
});
test('zero perturbation gives zero auditory mismatch at an exact motor target',()=>{
 const {observer,backend}=setup();
 const measured=observer.measure(backend.shapes.a,backend.shapes.a,'a','a');
 assert.deepEqual(measured.auditory,measured.auditoryTarget);
 assert.equal(measured.calibrated,true);
});
test('observer tracks resonance identity across updates of the same vowel',()=>{
 const {observer,backend,calls}=setup();
 observer.measure(backend.shapes.a,backend.shapes.a,'a','a');
 const count=calls.length;
 observer.measure(backend.shapes.a,backend.shapes.a,'a','a');
 assert.ok(calls[count].ref?.length===3,'Expected last VTL formants to anchor next observation');
});
test('switching vowels resets temporal resonance anchors',()=>{
 const {observer,backend,calls}=setup();
 observer.measure(backend.shapes.a,backend.shapes.a,'a','a');
 const count=calls.length;
 observer.measure(backend.shapes.i,backend.shapes.i,'i','i');
 assert.equal(calls[count].ref,null);
});
test('unresolved vowels are not incorrectly classified as calibrated',()=>{
 const {observer}=setup();observer.formants=()=>[null,null,null];
 assert.ok(observer.calibrationReport().every(r=>!r.zeroError));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeStops,stopReferenceSite,apertureAtSite,placeSpecificSeries} from '../src/sim/closure-analysis.js';
const lens=Array(20).fill(1);
function tube(t,site=17,area=.02,wrong=5,wrongArea=.9){
 const areas=Array(20).fill(.7);areas[site]=area;areas[wrong]=wrongArea;
 return {t,lengths_cm:lens,areas_cm2:areas};
}
function model(phone='p'){
 return {score:{gestures:[{kind:'stop',phone,context:'a',index:0,start:.1,end:.4,source:'VTL closure'}]}};
}
test('site is obtained from the VTL reference and not global minimum elsewhere',()=>{
 const ref=tube(0,17,.01,5,.001);
 const site=stopReferenceSite(ref,'p');
 assert.equal(site.referenceSection,17);
 assert.ok(site.position>.78);
 assert.equal(apertureAtSite(tube(.2,17,.5,5,0),site).area_cm2,.5);
});
test('closure elsewhere does not count as /p/ closure',()=>{
 const refs=[{...tube(0,17,.01),phone:'p',context:'a'}];
 const frames=Array.from({length:60},(_,i)=>tube(i*.01,17,.65,5,0));
 const result=analyzeStops(model(),frames,refs)[0];
 assert.equal(result.verified,false);
 assert.equal(result.status,'incomplete closure');
 assert.equal(result.minimumArea_cm2,.65);
});
test('sustained closure and release time are measured independently from SVG fps',()=>{
 const refs=[{...tube(0,17,.01),phone:'p',context:'a'}];
 const frames=Array.from({length:61},(_,i)=>tube(i*.01,17,i>=17&&i<=23?.03:.55));
 const r=analyzeStops(model(),frames,refs)[0];
 assert.equal(r.verified,true);
 assert.ok(r.closureDuration_s>.05);
 assert.ok(Math.abs(r.closureOnset_s-.17)<1e-8);
 assert.ok(Math.abs(r.releaseTime_s-.24)<1e-8);
 assert.equal(placeSpecificSeries(frames,refs[0],'p').length,61);
});
test('a single 30fps frame is not evidence of a 25ms hold',()=>{
 const refs=[{...tube(0,17,.01),phone:'p',context:'a'}];
 const result=analyzeStops(model(),[tube(.1,17,.6),tube(.133,17,.6),tube(.166,17,.02),tube(.199,17,.6)],refs)[0];
 assert.equal(result.verified,false);
});
test('the target itself must constitute a closure',()=>{
 const refs=[{...tube(0,17,.3),phone:'p',context:'a'}];
 const frames=Array.from({length:61},(_,i)=>tube(i*.01,17,.01));
 assert.equal(analyzeStops(model(),frames,refs)[0].status,'reference does not meet closure threshold');
});

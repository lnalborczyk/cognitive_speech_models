import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClosureDiagnostics} from '../src/sim/closure-presentation.js';

const lengths = Array(20).fill(1);
function tube(t, closureArea, wrongPlaceArea = .001) {
  const areas = Array(20).fill(.7);
  areas[17] = closureArea;  // Bilabial target location (oral end)
  areas[5] = wrongPlaceArea; // Smaller but unrelated constriction
  return {t, lengths_cm:lengths, areas_cm2:areas};
}
const sim = {score:{gestures:[{kind:'stop',phone:'p',context:'a',index:0,start:.10,end:.40,source:'VTL shape'}]}};
const reference = {...tube(0,.01),phone:'p',context:'a'};

test('main simulation uses dense VTL diagnostics and reference-specific aperture',()=>{
  const diagnosticGeometry = Array.from({length:61},(_,i)=>tube(i*.01,i>=17&&i<=23?.03:.6));
  const geometry = [tube(0,.7),tube(.2,.7),tube(.4,.7)]; // animation alone misses closure
  const result = buildClosureDiagnostics(sim,{diagnosticGeometry,geometry,references:[reference]});
  assert.equal(result.stops.length,1);
  assert.equal(result.stops[0].verified,true);
  assert.equal(result.series.length,1);
  assert.equal(result.series[0].series.length,61);
  assert.equal(result.series[0].series[20].area_cm2,.03);
  assert.match(result.report,/\/p\/ at .*longest hold 60 ms.*sustained closure/);
});

test('an unrelated constriction cannot masquerade as bilabial closure',()=>{
  const diagnosticGeometry = Array.from({length:61},(_,i)=>tube(i*.01,.6,0));
  const result=buildClosureDiagnostics(sim,{diagnosticGeometry,references:[reference]});
  assert.equal(result.stops[0].verified,false);
  assert.equal(result.stops[0].minimumArea_cm2,.6);
  assert.match(result.report,/incomplete closure/);
});

test('vowels and missing target references degrade without throwing',()=>{
  const geometry=[tube(0,.5),tube(.03,.4)];
  const vowel=buildClosureDiagnostics({score:{gestures:[]}},{geometry});
  assert.equal(vowel.stops.length,0);
  assert.deepEqual(vowel.series,[]);
  assert.match(vowel.report,/Vowel-only sequence/);
  const noRef=buildClosureDiagnostics(sim,{geometry});
  assert.equal(noRef.stops[0].verified,false);
  assert.match(noRef.report,/reference missing/);
});

test('main entry point uses tested closure diagnostics, not removed v0.9 helpers',()=>{
  const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(src,/import\s*\{buildClosureDiagnostics\}/);
  assert.match(src,/buildClosureDiagnostics\(simulation,response\)/);
  assert.doesNotMatch(src,/\bconstrictionSeries\s*\(/);
  assert.doesNotMatch(src,/\bassessStops\s*\(/);
});

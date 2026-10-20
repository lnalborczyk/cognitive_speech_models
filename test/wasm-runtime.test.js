import test from 'node:test';
import assert from 'node:assert/strict';
import {WasmVTL,wavBytes} from '../src/engine/wasm-runtime.js';
import {VTLSensoryObserver} from '../src/engine/vtl-sensing.js';
import {simulate} from '../src/sim/runner.js';

// Controlled fake of the VTL C API for validating the JS memory marshalling.
// This does NOT test VTL's actual acoustic or anatomical algorithms.
function vtlModuleMock(){
 const buffer=new ArrayBuffer(16*1024*1024),u8=new Uint8Array(buffer),i32=new Int32Array(buffer),f64=new Float64Array(buffer);
 let next=64;const files=new Map();
 const writeText=(p,s)=>{u8.set(new TextEncoder().encode(s+'\0'),p);};
 const writeD=(p,x)=>f64.set(x,p/8);
 const api={
  vtlInitialize:()=>0,vtlClose:()=>0,
  vtlGetConstants:(a,b,c,d,e,f)=>{i32[a/4]=44100;i32[b/4]=3;i32[c/4]=2;i32[d/4]=2;i32[e/4]=220;f64[f/8]=200;return 0;},
  vtlGetTractParamInfo:(a,b,c,d,e,f)=>{writeText(a,'JA\tTCX');writeText(b,'jaw\ttongue');writeText(c,'cm\tcm');writeD(d,[0,0]);writeD(e,[10,10]);writeD(f,[5,5]);return 0;},
  vtlGetGlottisParamInfo:(a,b,c,d,e,f)=>{writeText(a,'f0\tpressure');writeText(b,'f0\tpressure');writeText(c,'Hz\tPa');writeD(d,[60,0]);writeD(e,[450,10000]);writeD(f,[120,0]);return 0;},
  vtlGetTractParams:(name,p)=>{if(!['a','i'].includes(name))return 2;writeD(p,name==='a'?[2,3]:[7,8]);return 0;},
  vtlSynthBlock:(pTract,pGlott,n,step,pAudio)=>{for(let i=0;i<(n-1)*step;i++)f64[pAudio/8+i]=0.1*Math.sin(i*.01);return 0;},
  vtlGetTransferFunction:(p,n,opts,mag,phase)=>{
    for(let i=0;i<n;i++){
      const f=i*44100/n;
      const tract0=f64[p/8],tract1=f64[p/8+1];
      f64[mag/8+i]=[540+18*tract0,1650+22*tract1,3120].reduce((s,c)=>s+1/(1+((f-c)/90)**2),0);
      f64[phase/8+i]=0;
    }
    return 0;
  },
  vtlTractToTube:(p,l,a,art,inc,tip,vel)=>{writeD(l,[1,2,3]);writeD(a,[.8,1.2,1]);i32.set([1,2,3],art/4);writeD(inc,[5]);writeD(tip,[0]);writeD(vel,[.1]);return 0;},
  vtlExportTractSvg:(p,path)=>{files.set(path,new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));return 0;},
 };
 return {
  HEAPU8:u8,HEAP32:i32,HEAPF64:f64,
  _malloc(bytes){const p=(next+7)&~7;next=p+bytes;if(next>buffer.byteLength)throw Error('mock OOM');return p;},
  _free(){}, cwrap(name){assert.ok(name in api,`Missing symbol ${name}`);return api[name];},
  FS:{readFile(path){if(!files.has(path))throw Error('file missing');return files.get(path)},unlink(path){files.delete(path)}},
 };
}
test('WAV encoding produces correct mono PCM header',()=>{
 const bytes=wavBytes([0,1,-1],44100);const view=new DataView(bytes.buffer);
 assert.equal(bytes.length,50);assert.equal(view.getUint32(24,true),44100);
 assert.equal(view.getInt16(46,true),32767);assert.equal(view.getInt16(48,true),-32767);
});
test('browser VTL interface obtains native metadata, frames, areas, SVG and audio',()=>{
 const backend=new WasmVTL(vtlModuleMock());const speaker=backend.init();
 assert.equal(speaker.kind,'wasm');assert.equal(speaker.names.length,2);
 assert.deepEqual(speaker.shapes.a,[.2,.3]);
 const frames=Array.from({length:11},(_,i)=>({t:+(i*.005).toFixed(3),x:[.2+i*.03,.4]}));
 const result=backend.synthesize(frames,{geometryFps:30,
   referenceTargets:[{phone:'p',context:'a',source:'ll-labial-closure(a)',x:[.2,.4]}]});
 assert.equal(result.sampleRate,44100);
 assert.ok(result.audioBase64.length>2000);
 assert.ok(result.svgs.length>=2);
 assert.ok(result.diagnosticGeometry.length>result.geometry.length);
 assert.deepEqual(result.diagnosticGeometry[0].lengths_cm,[1,2,3]);
 assert.equal(result.svgs.length,result.geometry.length);
 assert.deepEqual(result.geometry[0].lengths_cm,[1,2,3]);
 assert.equal(result.references[0].source,'ll-labial-closure(a)');
 assert.deepEqual(result.references[0].areas_cm2,[.8,1.2,1]);
 const head=Buffer.from(result.audioBase64,'base64').toString('ascii',0,4);
 assert.equal(head,'RIFF');
});
test('rejects invalid trajectories instead of accessing arbitrary Wasm memory',()=>{
 const b=new WasmVTL(vtlModuleMock());b.init();
 assert.throws(()=>b.synthesize([{t:0,x:[NaN,2]},{t:.005,x:[1,2]}]),/finite/);
 assert.throws(()=>b.synthesize([{t:0,x:[0,1]},{t:0,x:[1,2]}]),/regularly sampled/);
});

test('browser runner can close the sensory loop through VTL API observations',()=>{
 const b=new WasmVTL(vtlModuleMock()); const sp=b.init();
 const observer=new VTLSensoryObserver(b,{intervalSteps:4});
 const data=simulate('diva','aia',sp,{feedback:1,perturbation:150},args=>observer.at(args));
 assert.ok(data.frames.length>100);
 assert.ok(data.frames.some(frame=>frame.sensory?.auditory?.every(Number.isFinite)));
 assert.ok(data.frames.every(frame=>frame.x.every(Number.isFinite)));
});

test('auditory perturbation reaches physical motor trajectory through VTL transfer observer',()=>{
 const b=new WasmVTL(vtlModuleMock());const sp=b.init();
 const produce=perturbation=>{
   const obs=new VTLSensoryObserver(b,{intervalSteps:5});
   return simulate('diva','aia',sp,{feedback:1.6,perturbation,seed:9},a=>obs.at(a)).frames;
 };
 const baseline=produce(0),shifted=produce(200);
 const sum=baseline.reduce((acc,f,i)=>acc+Math.abs(f.x[0]-shifted[i].x[0]),0);
 assert.ok(sum>0.00000001,`Altered acoustic feedback did not modify articulatory output (${sum})`);
});

test('Task Dynamics observes VTL tube-based gestural targets throughout simulation',()=>{
 const b=new WasmVTL(vtlModuleMock()),sp=b.init();
 const observer=new VTLSensoryObserver(b,{intervalSteps:6});
 const data=simulate('td','aia',sp,{rate:.9,coupling:.5,noise:0},s=>observer.at(s));
 assert.ok(data.frames.every(f=>f.x.every(Number.isFinite)));
 const measured=data.frames.find(f=>f.taskState?.values?.TBCD!==undefined);
 assert.ok(measured,'No physical VTL tract task was recorded');
 assert.ok(Object.keys(measured.taskState.goals).length>0);
 assert.ok(data.score.couplingGraph.length>0);
});

/**
 * VocalTractLab C API adapter for the genuine upstream Emscripten module.
 * This is NOT an acoustic approximator. All tract geometry and sound are
 * computed by upstream VTL code compiled by scripts/build_vtl_wasm.py.
 * It runs in a dedicated Web Worker; no Python server is required.
 */
const LIMIT_FRAMES = 1800;
import {STOP_SHAPES,VOWEL_CONTEXTS} from '../motor/shape-map.js';
const CHECK_PHONES = ['a', 'i', 'u'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ensure = (code, operation) => { if (code !== 0) throw new Error(`${operation} failed (VTL ${code})`); };

function asBase64(bytes) {
  let s = '';
  for (let i=0; i<bytes.length; i+=16384) {
    s += String.fromCharCode(...bytes.subarray(i, i+16384));
  }
  return btoa(s);
}

export function wavBytes(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const text = (off,s) => { for (let i=0;i<s.length;i++) v.setUint8(off+i,s.charCodeAt(i)); };
  text(0,'RIFF');v.setUint32(4,36+samples.length*2,true);text(8,'WAVE');
  text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  text(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) {
    const x=clamp(Number.isFinite(samples[i])?samples[i]:0,-1,1);
    v.setInt16(44+i*2,Math.round(x*32767),true);
  }
  return new Uint8Array(b);
}

export class WasmVTL {
  constructor(module) {
    this.m=module;
    this.api=(name,ret,args)=>module.cwrap(name,ret,args);
    this.initialize=this.api('vtlInitialize','number',['string']);
    this.close=this.api('vtlClose','number',[]);
    this.getConstants=this.api('vtlGetConstants','number',Array(6).fill('number'));
    this.getTractInfo=this.api('vtlGetTractParamInfo','number',Array(6).fill('number'));
    this.getGlottisInfo=this.api('vtlGetGlottisParamInfo','number',Array(6).fill('number'));
    this.getTractParams=this.api('vtlGetTractParams','number',['string','number']);
    this.tractToTube=this.api('vtlTractToTube','number',Array(7).fill('number'));
    this.synthBlock=this.api('vtlSynthBlock','number',['number','number','number','number','number','number']);
    this.svgExport=this.api('vtlExportTractSvg','number',['number','string']);
    this.ready=false;
  }
  alloc(bytes) {
    const p=this.m._malloc(bytes);
    if(!p) throw new Error(`VTL ran out of WebAssembly memory allocating ${bytes} bytes`);
    return p;
  }
  // Re-acquire HEAP buffers after allocations, because Wasm memory can grow.
  doubles(p,n) { return Array.from(this.m.HEAPF64.subarray(p/8,p/8+n)); }
  writeDoubles(p,array) {this.m.HEAPF64.set(array,p/8);}
  readString(p,limit) {
    const data=this.m.HEAPU8.subarray(p,p+limit), end=data.indexOf(0);
    return new TextDecoder().decode(end<0?data:data.subarray(0,end));
  }
  using(sizes,fn) {
    const ptrs=[];
    try {for(const size of sizes)ptrs.push(this.alloc(size));return fn(...ptrs);}
    finally {for(const p of ptrs.reverse())this.m._free(p);}
  }
  infoFrom(get,n) {
    return this.using([10*n+512,100*n+512,10*n+512,n*8,n*8,n*8],(names,desc,units,lo,hi,neutral)=>{
      ensure(get(names,desc,units,lo,hi,neutral),'get parameter info');
      const list=this.readString(names,10*n+512).split('\t').map(s=>s.trim());
      return {
        names:list.length===n?list:Array.from({length:n},(_,i)=>`parameter_${i}`),
        min:this.doubles(lo,n),max:this.doubles(hi,n),neutral:this.doubles(neutral,n),
        units:this.readString(units,10*n+512).split('\t'),
      };
    });
  }
  init(path='/speaker.speaker',progress=()=>{}) {
    progress('calling vtlInitialize with embedded speaker model');
    ensure(this.initialize(path),'vtlInitialize');
    try {
      progress('reading VTL constants');
      const constants=this.using([4,4,4,4,4,8],(a,b,c,d,e,f)=>{
        ensure(this.getConstants(a,b,c,d,e,f),'vtlGetConstants');
        const heap=this.m.HEAP32;
        return {rate:heap[a/4],tube:heap[b/4],tract:heap[c/4],glottis:heap[d/4]};
      });
      if(constants.rate<8000||constants.tract<1||constants.glottis<2||constants.tract>100)
        throw new Error('Invalid speaker dimensions returned by VTL');
      this.rate=constants.rate;this.ntube=constants.tube;this.ntract=constants.tract;this.nglottis=constants.glottis;
      progress('reading tract parameter metadata');
      this.tract=this.infoFrom(this.getTractInfo,this.ntract);
      progress('reading glottis parameter metadata');
      this.glottis=this.infoFrom(this.getGlottisInfo,this.nglottis);
      progress('reading speaker phonetic shapes');
      this.shapes={};this.shapeSources={};
      const lookup=(key,source)=>{
        this.using([this.ntract*8],p=>{
          if(this.getTractParams(source,p)===0){
            this.shapes[key]=this.doubles(p,this.ntract).map((v,i)=>this.normalize(v,i));
            this.shapeSources[key]=source;
          }
        });
      };
      for(const phoneme of CHECK_PHONES)lookup(phoneme,phoneme);
      for(const [phoneme,base] of Object.entries(STOP_SHAPES)) {
        for(const context of VOWEL_CONTEXTS)lookup(`${phoneme}:${context}`,`${base}(${context})`);
        if(this.shapes[`${phoneme}:a`]){
          this.shapes[phoneme]=this.shapes[`${phoneme}:a`];
          this.shapeSources[phoneme]=this.shapeSources[`${phoneme}:a`];
        }
      }
      if(!this.shapes.a||!this.shapes.i)throw new Error('Speaker lacks the required a/i target shapes');
      progress('VTL initialization finished');
      this.ready=true;
      return this.speaker();
    } catch(e) {this.close();throw e;}
  }
  normalize(x,i) {
    const lo=this.tract.min[i],hi=this.tract.max[i];
    return hi>lo?clamp((x-lo)/(hi-lo),0,1):0;
  }
  denormalize(values) {
    if(!Array.isArray(values)||values.length!==this.ntract||values.some(v=>!Number.isFinite(v)))
      throw new Error(`Expected ${this.ntract} finite tract parameters`);
    return values.map((x,i)=>this.tract.min[i]+clamp(x,0,1)*(this.tract.max[i]-this.tract.min[i]));
  }
  speaker() {
    return {kind:'wasm',engine:'VocalTractLab in browser (WebAssembly)',isNative:true,
      names:this.tract.names,labels:this.tract.names,min:this.tract.min,max:this.tract.max,
      neutral:this.tract.neutral.map((x,i)=>this.normalize(x,i)),shapes:this.shapes,shapeSources:this.shapeSources,
      rate:this.rate,units:this.tract.units,tubeSections:this.ntube,glottisNames:this.glottis.names};
  }
  synthesize(frames,{geometryFps=24,geometry=true,referenceTargets=[]}={}) {
    if(!this.ready)throw new Error('VTL not initialized');
    if(!Array.isArray(frames)||frames.length<2||frames.length>LIMIT_FRAMES)throw new Error('Invalid trajectory length');
    if(!Number.isInteger(geometryFps)||geometryFps<5||geometryFps>30)throw new Error('Invalid frame rate');
    const times=frames.map(f=>f.t);
    const dt=times[1]-times[0];
    if(times[0]!==0||!Number.isFinite(dt)||dt<=0||dt>.1||times.some((t,i)=>!Number.isFinite(t)||Math.abs(t-dt*i)>1e-4))
      throw new Error('Trajectory must be a regularly sampled, zero-based timeline');
    const n=frames.length, samplesPerStep=Math.round(dt*this.rate);
    if(samplesPerStep<1)throw new Error('Invalid VTL sample step');
    const numberAudioSamples=(n-1)*samplesPerStep;
    const poses=frames.map(f=>this.denormalize(f.x));
    const tract=poses.flat();
    const glottis=[];
    for(let k=0;k<n;k++) {
      const g=[...this.glottis.neutral];
      g[0]=clamp(120,this.glottis.min[0],this.glottis.max[0]);
      const ramp=clamp(Math.min(k/12,(n-1-k)/12),0,1);
      g[1]=clamp(8000*ramp,this.glottis.min[1],this.glottis.max[1]);
      glottis.push(...g);
    }
    const audio=this.using([tract.length*8,glottis.length*8,numberAudioSamples*8],(pTract,pGlott,pAudio)=>{
      this.writeDoubles(pTract,tract);this.writeDoubles(pGlott,glottis);
      ensure(this.synthBlock(pTract,pGlott,n,samplesPerStep,pAudio,0),'vtlSynthBlock');
      return this.doubles(pAudio,numberAudioSamples);
    });
    const frameCount=Math.min(n,120,Math.max(2,Math.ceil(times[n-1]*geometryFps)+1));
    const indices=[...new Set(Array.from({length:frameCount},(_,i)=>Math.round(i*(n-1)/(frameCount-1))))];
    const area=[],svgs=[];let svgBytes=0,missing=0;
    this.using([this.ntract*8,this.ntube*8,this.ntube*8,this.ntube*4,8,8,8],
      (pTract,pLen,pArea,pArt,pIncisor,pTip,pVelum)=>{
        for(const idx of indices) {
          this.writeDoubles(pTract,poses[idx]);
          ensure(this.tractToTube(pTract,pLen,pArea,pArt,pIncisor,pTip,pVelum),'vtlTractToTube');
          const t=times[idx];
          area.push({t,lengths_cm:this.doubles(pLen,this.ntube),areas_cm2:this.doubles(pArea,this.ntube),
            articulators:Array.from(this.m.HEAP32.subarray(pArt/4,pArt/4+this.ntube)),
            velum_area_cm2:this.doubles(pVelum,1)[0]});
          if(!geometry)continue;
          const file=`/geometry_${idx}.svg`;
          try {
            ensure(this.svgExport(pTract,file),'vtlExportTractSvg');
            const data=this.m.FS.readFile(file);
            if(!data.length||data.length>750000||svgBytes+data.length>18000000){missing++;continue;}
            svgBytes+=data.length;
            svgs.push({t,svgBase64:asBase64(data)});
          } catch(err) {missing++;}
          finally { try{this.m.FS.unlink(file)}catch{} }
        }
      });
    const references=[];
    if(!Array.isArray(referenceTargets)||referenceTargets.length>12)
      throw new Error('Invalid VTL reference targets');
    this.using([this.ntract*8,this.ntube*8,this.ntube*8,this.ntube*4,8,8,8],
      (pTract,pLen,pArea,pArt,pIncisor,pTip,pVelum)=>{
        for(const item of referenceTargets){
          this.writeDoubles(pTract,this.denormalize(item.x));
          ensure(this.tractToTube(pTract,pLen,pArea,pArt,pIncisor,pTip,pVelum),'vtlTractToTube (reference)');
          references.push({phone:item.phone,context:item.context,source:item.source,
            lengths_cm:this.doubles(pLen,this.ntube),areas_cm2:this.doubles(pArea,this.ntube)});
        }
      });
    return {kind:'wasm',sampleRate:this.rate,audioBase64:asBase64(wavBytes(audio,this.rate)),
      geometry:area,references,svgs,geometryFps,numberAudioSamples,
      nominalDuration:times[n-1],audioDuration:numberAudioSamples/this.rate,
      warnings:[`VTL compiled to WebAssembly; controller and actuator dynamics remain theory-inspired and unvalidated.`,
      ...(missing?[`${missing} VTL SVG frames failed or exceeded transfer budget.`]:[])]};
  }
}

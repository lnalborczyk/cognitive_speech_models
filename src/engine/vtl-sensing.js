import {formantsFromSpectrum} from '../motor/sensory-control.js';

/** Online geometry/acoustic observer. All measurements invoke VTL C functions.
 * The derivatives are *local numerical derivatives* of those functions,
 * not fixed articulatory-coordinate heuristics. A relatively low update rate
 * avoids excessive VTL calls during a browser simulation.
 */
const PARAMS={p:['LD','LP','JA'],t:['TTX','TTY','JA','TCX'],k:['TCX','TCY','JA','TTY'],vowel:['JA','TCX','TCY','LD']};
const BOUNDS={p:[.81,1.0],t:[.59,.95],k:[.33,.82]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class VTLSensoryObserver {
  constructor(backend,{intervalSteps=8}={}){
    this.backend=backend;this.intervalSteps=intervalSteps;
    this.cached=null;this.lastPhone='';this.sites=new Map();this.spectralWarnings=0;
    this.indices={};
    for(const [kind,parameters] of Object.entries(PARAMS)) {
      this.indices[kind]=parameters.map(name=>backend.tract.names.indexOf(name)).filter(i=>i>=0);
    }
  }
  area(x){
    const b=this.backend,m=b.m;
    return b.using([b.ntract*8,b.ntube*8,b.ntube*8,b.ntube*4,8,8,8],(p,l,a,art,inc,tip,vel)=>{
      b.writeDoubles(p,b.denormalize(x));
      const code=b.tractToTube(p,l,a,art,inc,tip,vel);
      if(code!==0)throw Error(`VTL tube geometry failed (${code})`);
      return {areas:b.doubles(a,b.ntube),lengths:b.doubles(l,b.ntube)};
    });
  }
  formants(x){
    const b=this.backend,N=1024;
    if(!b.transferFunction)return [null,null,null];
    try {return b.using([b.ntract*8,N*8,N*8],(p,mag,phase)=>{
      b.writeDoubles(p,b.denormalize(x));
      const code=b.transferFunction(p,N,0,mag,phase);
      if(code!==0)return [null,null,null];
      return formantsFromSpectrum(b.doubles(mag,N),b.rate);
    });}catch(error){this.spectralWarnings++;return [null,null,null];}
  }
  site(phone,context='a'){
    const key=`${phone}:${context}`;
    if(this.sites.has(key))return this.sites.get(key);
    const shape=this.backend.shapes[key]||this.backend.shapes[phone];
    const vowel=this.backend.shapes[context]||this.backend.shapes.a;
    if(!shape||!vowel)return null;
    const tube=this.area(shape), total=tube.lengths.reduce((s,v)=>s+Math.max(0,v),0);
    let distance=0, candidates=[];
    const [lo,hi]=BOUNDS[phone]||[.25,1];
    for(let i=0;i<tube.areas.length;i++){
      const pos=(distance+.5*tube.lengths[i])/Math.max(.001,total);
      if(pos>=lo&&pos<=hi)candidates.push({index:i,area:tube.areas[i],positionCm:distance+.5*tube.lengths[i]});
      distance+=tube.lengths[i];
    }
    // Determine constriction location from the actual VTL *closure* geometry.
    const selected=candidates.sort((a,b)=>a.area-b.area)[0];
    if(!selected)return null;
    const result={...selected,targetArea:Math.max(0,selected.area),vowelArea:this.area(vowel).areas[selected.index]};
    this.sites.set(key,result);return result;
  }
  measure(x,target,phone,context){
    const n=x.length,stop=['p','t','k'].includes(phone),dims=this.indices[stop?phone:'vowel'];
    const actual=this.formants(x),targetFormants=this.formants(target);
    const jacobian=Array.from({length:3},()=>Array(n).fill(0));
    const d=.012;
    // Forward finite differences, each measured through VTL's transfer function.
    // Constrained to the articulators relevant to the active task.
    if(actual.every(Number.isFinite))for(const j of dims){
      const displaced=x.slice(),delta=(x[j]+d<=1?d:-d);
      if(delta<1e-5)continue;
      displaced[j]+=delta;
      const shifted=this.formants(displaced);
      for(let k=0;k<3;k++)if(Number.isFinite(shifted[k]))
        jacobian[k][j]=(shifted[k]-actual[k])/delta;
    }
    let constriction=null;
    if(stop){
      const place=this.site(phone,context);
      if(place){
        const area=this.area(x).areas[place.index];
        const gradient=Array(n).fill(0);
        for(const j of dims){
          const displaced=x.slice(),delta=(x[j]+d<=1?d:-d);
          if(delta<1e-5)continue;
          displaced[j]+=delta;
          gradient[j]=(this.area(displaced).areas[place.index]-area)/delta;
        }
        constriction={area,targetArea:place.targetArea,locationCm:place.positionCm,
          sectionIndex:place.index,jacobian:gradient};
      }
    }
    return {auditory:actual,auditoryTarget:targetFormants,auditoryJacobian:jacobian,constriction,
      source:'VTL vtlGetTransferFunction + vtlTractToTube',phone,context};
  }
  at({x,target,phone,context,step}){
    if(!this.cached||step%this.intervalSteps===0||phone!==this.lastPhone){
      this.cached=this.measure(x,target,phone,context);
      this.lastPhone=phone;
    }
    return this.cached;
  }
}

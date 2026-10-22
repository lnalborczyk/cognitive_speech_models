import {solveStaticClosure} from '../motor/closure-ik.js';
import {tubeTractVariables,taskJacobianFromVTL,scoreTaskGoals,activeStopGesture} from '../motor/tract-variables.js';
import {formantsFromSpectrum,lowBandPeakCandidates} from '../motor/sensory-control.js';

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
    this.cached=null;this.lastPhone='';this.lastMeasurementTime_s=null;this.sites=new Map();this.spectralWarnings=0;
    this.lastVowelObservation=null;this.calibratedVowels=new Map();this.sensoryUpdates=0;
    this.calibratedTaskShapes=new Map();
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
  formants(x,reference=null){
    const b=this.backend,N=1024;
    if(!b.transferFunction)return [null,null,null];
    try {return b.using([b.ntract*8,N*8,N*8],(p,mag,phase)=>{
      b.writeDoubles(p,b.denormalize(x));
      const code=b.transferFunction(p,N,0,mag,phase);
      if(code!==0)return [null,null,null];
      return formantsFromSpectrum(b.doubles(mag,N),b.rate,reference);
    });}catch(error){this.spectralWarnings++;return [null,null,null];}
  }
  /** Higher-resolution VTL transfer-function diagnostic, never fed back to
   * the motor controller until independently validated. */
  lowBandDiagnostics(x){
    const b=this.backend,N=2048;
    if(!b.transferFunction)return [];
    try{return b.using([b.ntract*8,N*8,N*8],(p,mag,phase)=>{
      b.writeDoubles(p,b.denormalize(x));
      if(b.transferFunction(p,N,0,mag,phase)!==0)return [];
      return lowBandPeakCandidates(b.doubles(mag,N),b.rate);
    });}catch{return [];}
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
  /** Canonical speaker closure benchmark: each requested stop is checked
   * directly against the actual JD3 closure target, not a guessed target.
   * Used to distinguish unreachable targets from ill-conditioned IK.
   */
  stopCalibrationReport({context='a'}={}){
    const vowel=this.backend.shapes[context]||this.backend.shapes.a;
    return ['p','t','k'].map(phone=>{
      const site=this.site(phone,context);
      if(!site||!vowel)return {phone,context,status:'missing_reference'};
      const stop=this.backend.shapes[`${phone}:${context}`]||this.backend.shapes[phone];
      if(!stop)return {phone,context,status:'missing_reference'};
      const index=site.index,measure=x=>this.area(x).areas[index];
      const vowelArea=measure(vowel),referenceArea=measure(stop);
      const gradients={};
      for(const name of PARAMS[phone]||[]){
        const j=this.backend.tract.names.indexOf(name);
        if(j<0)continue;
        const hi=vowel.slice(),lo=vowel.slice();
        hi[j]=Math.min(1,hi[j]+.012);lo[j]=Math.max(0,lo[j]-.012);
        const width=hi[j]-lo[j];
        gradients[name]=width>1e-8?(measure(hi)-measure(lo))/width:null;
      }
      const gradientNorm=Math.sqrt(Object.values(gradients)
        .filter(Number.isFinite).reduce((sum,v)=>sum+v*v,0));
      const indices=(PARAMS[phone]||[]).map(name=>this.backend.tract.names.indexOf(name)).filter(i=>i>=0);
      const staticIK=solveStaticClosure({start:vowel,reference:stop,
        measure,indices,maxIterations:25});
      return {phone,context,status:'measured',sectionIndex:index,
        locationCm:site.positionCm,vowelArea_cm2:vowelArea,
        referenceArea_cm2:referenceArea,referenceAchievesClosure:referenceArea<=.08,
        initialGradientNorm_cm2:gradientNorm,
        staticIKConverged:staticIK.converged,
        staticIKFinalArea_cm2:staticIK.finalArea_cm2,
        staticIKIterations:staticIK.iterations,
        gradients_cm2_per_unit:gradients};
    });
  }
  /** Reference task targets are measured from actual VTL tube sections and
   * cached by speaker shape. No fixed consonant-area values are invented. */
  taskShapeTargets(score){
    for(const gesture of score.gestures){
      const key=gesture.source||`${gesture.phone}:${gesture.context}`;
      if(!this.calibratedTaskShapes.has(key)){
        const tube=this.area(gesture.target);
        this.calibratedTaskShapes.set(key,tubeTractVariables(tube.areas,tube.lengths));
      }
    }
    return this.calibratedTaskShapes;
  }
  /** Stop-specific constriction calibration at the section selected from
   * the canonical, context-dependent VTL closure shape. Broad tube regions
   * alone may report the wrong anatomical site (particularly alveolars).
   */
  stopReference(gesture){
    if(!gesture||gesture.kind!=='stop')return null;
    const site=this.site(gesture.phone,gesture.context);
    if(!site)return null;
    return {site,source:gesture.source,parameters:gesture.target.slice(),
      apertureCm:Math.sqrt(4*Math.max(0,site.targetArea)/Math.PI)};
  }
  /** Geometry-based task Jacobian plus a separate place-specific closure
   * coordinate. The target is feasible by construction (a speaker shape),
   * but the inverse transform may still fail to reach it dynamically.
   */
  taskMeasurement(x,score,t,{stopPriority=8}={}){
    const targets=this.taskShapeTargets(score);
    const active=activeStopGesture(score,t);
    const reference=active?this.stopReference(active.gesture):null;
    const measure=state=>{
      const tube=this.area(state);
      const values=tubeTractVariables(tube.areas,tube.lengths);
      if(reference){
        const area=tube.areas[reference.site.index];
        values.SCD=Math.sqrt(4*Math.max(0,area)/Math.PI);
      }
      return values;
    };
    const {values,jacobians}=taskJacobianFromVTL(measure,x,this.backend.tract.names);
    const goals=scoreTaskGoals(score,t,targets,{stopPriority});
    if(reference){
      goals.goals.SCD=reference.apertureCm;
      goals.stopWeights.SCD=active.activation;
    }
    return {values,jacobians,...goals,
      closureReference:reference?.parameters??null,
      closurePhone:active?.gesture.phone??null,
      closureSource:reference?.source??null,
      closureActivity:active?.activation??0,
      closureSite:reference?.site??null,
      source:'VTL tube geometry + reference-site aperture',
      units:{LA:'cm equivalent diameter',TTCD:'cm equivalent diameter',TBCD:'cm equivalent diameter',
        TTCL:'cm',TBCL:'cm',SCD:'cm equivalent diameter at speaker stop site'}};
  }
  /** F1–F3 of the actual VTL speaker's canonical vowel tract shapes.
   * These are model-specific acoustic goals, not generic human formant tables.
   */
  calibrateVowels(){
    for(const phone of ['a','i','u']){
      const shape=this.backend.shapes?.[phone];
      if(shape && !this.calibratedVowels.has(phone))
        this.calibratedVowels.set(phone,this.formants(shape));
    }
    return Object.fromEntries(this.calibratedVowels);
  }
  calibrationReport(){
    this.calibrateVowels();
    return [...this.calibratedVowels].map(([phone,target])=>{
      const shape=this.backend.shapes[phone];
      const measurement=this.formants(shape,target);
      const errors=target.map((f,k)=>Number.isFinite(f)&&Number.isFinite(measurement[k])?measurement[k]-f:null);
      return {phone,formantsHz:target,errorsHz:errors,
        lowBandCandidatesHz:this.lowBandDiagnostics(shape).map(x=>x.hz),
        resolved:errors.filter(Number.isFinite).length,
        zeroError:errors.filter(Number.isFinite).length===3 &&
          errors.every(e=>Number.isFinite(e)&&Math.abs(e)<1)};
    });
  }
  /** Local acoustic control authority at speaker vowel targets.
   * Each slope is a central finite difference of real VTL transfer-function
   * resonances, with peak identity anchored to the unperturbed shape.
   * A null slope means the resonance is unresolved, not zero sensitivity.
   */
  localF1Authority({vowels=['a','i','u'],delta=.01}={}){
    const selected=['JA','TCX','TCY','LD'];
    return vowels.map(phone=>{
      const x=this.backend.shapes?.[phone];
      if(!x)return {phone,baselineF1:null,slopes:[],valid:false};
      const reference=this.formants(x);
      const baselineF1=Number.isFinite(reference[0])?reference[0]:null;
      const slopes=selected.map(name=>{
        const index=this.backend.tract.names.indexOf(name);
        if(index<0||baselineF1===null)return {parameter:name,slopeHzPerUnit:null};
        const hi=x.slice(),lo=x.slice();
        hi[index]=Math.min(1,hi[index]+delta);
        lo[index]=Math.max(0,lo[index]-delta);
        const width=hi[index]-lo[index];
        if(width<1e-8)return {parameter:name,slopeHzPerUnit:null};
        const a=this.formants(hi,reference)[0],b=this.formants(lo,reference)[0];
        const slope=Number.isFinite(a)&&Number.isFinite(b)&&(Math.abs(a-baselineF1)<=150)&&(Math.abs(b-baselineF1)<=150)
          ?(a-b)/width:null;
        return {parameter:name,slopeHzPerUnit:slope};
      });
      const valid=slopes.some(v=>Number.isFinite(v.slopeHzPerUnit));
      return {phone,baselineF1,slopes,valid};
    });
  }
  measure(x,target,phone,context,{sensorySafety=true}={}){
    const n=x.length,stop=['p','t','k'].includes(phone),dims=this.indices[stop?phone:'vowel'];
    // Track identities across observer updates, not just within Jacobian probes.
    // Reset across phoneme switches rather than forcing /a/ peaks into /i/.
    const previous=sensorySafety && this.lastVowelObservation?.phone===phone
      ?this.lastVowelObservation.formants:null;
    const actual=this.formants(x,previous);
    // Acoustic goal is measured from the *same VTL tract configuration* as
    // the feedforward motor target, including between blended gestures.
    const targetFormants=this.formants(target,sensorySafety?actual:null);
    if(!stop && sensorySafety && actual.some(Number.isFinite)){
      this.lastVowelObservation={phone,formants:actual};
    }else if(stop)this.lastVowelObservation=null;
    this.sensoryUpdates++;
    const jacobian=Array.from({length:3},()=>Array(n).fill(0));
    const d=.012;
    // Forward finite differences, each measured through VTL's transfer function.
    // Constrained to the articulators relevant to the active task.
    if(actual.every(Number.isFinite))for(const j of dims){
      const displaced=x.slice(),delta=(x[j]+d<=1?d:-d);
      if(Math.abs(delta)<1e-5)continue;
      displaced[j]+=delta;
      const shifted=this.formants(displaced,sensorySafety?actual:null);
      for(let k=0;k<3;k++)if(Number.isFinite(shifted[k])){
        const jump=shifted[k]-actual[k];
        // A >150 Hz shift from just 0.012 normalized units is more likely
        // a formant-identity switch than a locally meaningful derivative.
        if(sensorySafety && Math.abs(jump)>150)continue;
        jacobian[k][j]=jump/delta;
      }
    }
    let constriction=null;
    if(stop){
      const place=this.site(phone,context);
      if(place){
        const area=this.area(x).areas[place.index];
        const gradient=Array(n).fill(0);
        for(const j of dims){
          const displaced=x.slice(),delta=(x[j]+d<=1?d:-d);
          if(Math.abs(delta)<1e-5)continue;
          displaced[j]+=delta;
          gradient[j]=(this.area(displaced).areas[place.index]-area)/delta;
        }
        constriction={area,targetArea:place.targetArea,locationCm:place.positionCm,
          sectionIndex:place.index,jacobian:gradient};
      }
    }
    // A fully occluded oral tract has no reliable radiated vowel formants;
    // do not feed numerical transfer-function peaks back as vowel targets.
    if(stop && constriction?.area <= .08){
      actual.fill(null);targetFormants.fill(null);
      for(const row of jacobian)row.fill(0);
    }
    return {auditory:actual,auditoryTarget:targetFormants,auditoryJacobian:jacobian,constriction,
      source:'VTL vtlGetTransferFunction + vtlTractToTube',phone,context,
      calibrated:true,validAuditoryBands:actual.filter(Number.isFinite).length};
  }
  at({x,target,phone,context,step,cfg={},score,model,t}){
    const observerUpdate=!this.cached||step%this.intervalSteps===0||phone!==this.lastPhone;
    if(observerUpdate){
      this.cached=this.measure(x,target,phone,context,{sensorySafety:cfg.sensorySafety!==false});
      if(model==='td' && score)this.cached.taskGeometry=this.taskMeasurement(x,score,t??step*.005,{stopPriority:cfg.taskStopPriority??8});
      this.lastPhone=phone;
      this.lastMeasurementTime_s=step*.005;
    }
    // Planning targets evolve every motor time step, whereas expensive VTL
    // geometry/Jacobian measurements are updated at the observer cadence.
    const sampled=this.cached;
    let taskGeometry=sampled.taskGeometry;
    if(model==='td' && score && taskGeometry){
      const now=t??step*.005;
      const targets=scoreTaskGoals(score,now,this.calibratedTaskShapes,{stopPriority:cfg.taskStopPriority??8});
      const active=activeStopGesture(score,now);
      const sameClosure=active && active.gesture.source===taskGeometry.closureSource;
      if(sameClosure){
        targets.goals.SCD=taskGeometry.closureSite
          ?Math.sqrt(4*Math.max(0,taskGeometry.closureSite.targetArea)/Math.PI):null;
        targets.stopWeights.SCD=active.activation;
      }else{
        // Drop a stale closure task immediately after the gesture releases.
        const {SCD:_value,...values}=taskGeometry.values;
        const {SCD:_row,...jacobians}=taskGeometry.jacobians;
        taskGeometry={...taskGeometry,values,jacobians,closureReference:null,
          closureActivity:0,closurePhone:null,closureSource:null};
      }
      taskGeometry={...taskGeometry,...targets,
        closureActivity:sameClosure?active.activation:0};
    }
    return {...sampled,taskGeometry,time_s:step*.005,
      measuredAt_s:this.lastMeasurementTime_s,observerUpdate};
  }
}

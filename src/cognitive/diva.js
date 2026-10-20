import {feedbackForceDetailed} from '../motor/sensory-control.js';
/** DIVA-inspired controller with VTL-measured, delayed acoustic feedback when
 * the browser worker supplies a sensory observer. Not a trained DIVA map.
 */
export class DIVA {
  static id='diva';static label='DIVA-inspired sensory feedback';
  constructor(cfg){this.cfg=cfg;this.history=[];}
  step(s){
    const {x,v,target,t}=s,c=this.cfg;
    this.history.push({t,x:x.slice(),sensory:s.sensory||null});
    // The exposed delay parameter manipulates *auditory* feedback only.
    // Proprioception uses its own fixed latency, so zero auditory gain is a
    // valid negative control in the gain/delay sweep.
    const auditoryLatency=Math.max(0,Number(c.delay??0))/1000;
    const proprioLatency=Math.max(0,Number(c.somatosensoryDelayMs??40))/1000;
    const atLatency=latency=>{
      for(let i=this.history.length-1;i>=0;i--){
        if(this.history[i].t<=t-latency+1e-9)return this.history[i];
      }
      return this.history[0];
    };
    const delayedAuditory=atLatency(auditoryLatency);
    const delayedProprio=atLatency(proprioLatency);
    const phone=s.score?.phones?.[s.selected] || s.sensory?.phone || 'a';
    const learnedInverseMap=c.learnedMaps?.[phone] || c.learnedMaps?.[s.score?.gestures?.[s.selected]?.context];
    const auditoryResult=feedbackForceDetailed(delayedAuditory.sensory,
      {...c,learnedInverseMap},x.length);
    const aud=auditoryResult.force;
    const u=x.map((xi,j)=>{
      const scale=Number.isFinite(c.feedforwardScale)?c.feedforwardScale:1;
      const ff=scale*(68*(target[j]-xi)-14*v[j]);
      const proprio=32*Number(c.somatosensory??0)*(target[j]-delayedProprio.x[j]);
      const learnedProgram=c.motorMemory?.[Math.round(t/(s.dt||.005))]?.[j]||0;
      return ff+proprio+aud[j]+learnedProgram;
    });
    const maxLatency=Math.max(auditoryLatency,proprioLatency);
    while(this.history.length>2 && this.history[1].t<t-maxLatency-.05)this.history.shift();
    return {u,planning:s.weights.slice(),selected:s.selected,
      auditoryDiagnostics:{...auditoryResult.diagnostic,command:aud.slice()},
      details:delayedAuditory.sensory?.auditory?'VTL transfer-function sensory feedback':'Feedforward and delayed proprioception only'};
  }
}

import {feedbackForce} from '../motor/sensory-control.js';
/** DIVA-inspired controller with VTL-measured, delayed acoustic feedback when
 * the browser worker supplies a sensory observer. Not a trained DIVA map.
 */
export class DIVA {
  static id='diva';static label='DIVA-inspired sensory feedback';
  constructor(cfg){this.cfg=cfg;this.history=[];}
  step(s){
    const {x,v,target,t}=s,c=this.cfg;
    this.history.push({t,x:x.slice(),sensory:s.sensory||null});
    const latency=Number(c.delay||0)/1000;
    let delayed=this.history[0];
    for(let i=this.history.length-1;i>=0;i--){
      if(this.history[i].t<=t-latency+1e-9){delayed=this.history[i];break;}
    }
    const sensory=delayed.sensory;
    const aud=feedbackForce(sensory,c,x.length);
    const u=x.map((xi,j)=>{
      const ff=68*(target[j]-xi)-14*v[j];
      const proprio=32*Number(c.somatosensory??0)*(target[j]-delayed.x[j]);
      return ff+proprio+aud[j];
    });
    while(this.history.length>2 && this.history[1].t<t-latency-.05)this.history.shift();
    return {u,planning:s.weights.slice(),selected:s.selected,
      details:sensory?.auditory?'VTL transfer-function sensory feedback':'Feedforward and delayed proprioception only'};
  }
}

/** Conceptual DIVA controller: forward motor template plus delayed sensory error.
 * No claim to reproduce learned neural maps of Tourville & Guenther (2011).
 */
export class DIVA {
  static id='diva'; static label='DIVA-inspired feedback';
  constructor(cfg){this.cfg=cfg;this.history=[];}
  step(s){
    const {x,v,target,dt,t}=s, c=this.cfg;
    this.history.push({t,x:x.slice()});
    const latency=c.delay/1000;
    let delayed=this.history[0].x;
    for(let i=this.history.length-1;i>=0;i--){if(this.history[i].t<=t-latency+1e-9){delayed=this.history[i].x;break;}}
    // The auditory channel is a heuristic projection in VTL parameter space,
    // not acoustic error computed from a learned VTL forward model.
    const aud=t>=latency?c.feedback:0;
    const som=c.somatosensory;
    const u=x.map((xi,j)=>{
      const ff=68*(target[j]-xi)-14*v[j];
      const sensory=32*som*(target[j]-delayed[j]);
      const perceived=delayed[j]+(j===0?c.perturbation/6000:0);
      const auditory=26*aud*(target[j]-perceived);
      return ff+sensory+auditory;
    });
    while(this.history.length>2 && this.history[1].t<t-latency-.04)this.history.shift();
    return {u,planning:s.weights.slice(),selected:s.selected,details:'Delayed feedback + feedforward trajectory'};
  }
}

/** Task Dynamics-inspired second-order task attractors and gestural overlap.
 * Articulatory mapping is identity in normalized VTL parameter coordinates;
 * thus this is NOT the full task Jacobian/pseudoinverse framework.
 */
export class TaskDynamics {
  static id='td';static label='Task Dynamics-inspired gestures';
  constructor(cfg){this.cfg=cfg;this.velocity=null;}
  step(s){
    const {x,v,target}=s;
    const omega=9*this.cfg.rate;
    const u=x.map((xi,j)=>omega*omega*(target[j]-xi)-2*omega*v[j]);
    return {u,planning:s.weights.slice(),selected:s.selected,details:'Overlapping critically damped gestural attractors'};
  }
}

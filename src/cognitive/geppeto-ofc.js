import {feedbackForce,constrictionForce} from '../motor/sensory-control.js';
/** GEPPETO-OFC-inspired reduced-order multisensory cost controller.
 * A local receding-horizon (one-step) regularized policy with memory of the
 * preceding command. VTL is NOT the GEPPETO finite-element tongue plant;
 * these commands are NOT the original lambda muscle commands.
 */
export class GEPPETOOFC {
  static id='geppeto-ofc';static label='GEPPETO-OFC-inspired';
  constructor(cfg){this.cfg=cfg;this.previous=null;}
  step(s){
    const n=s.x.length;
    const auditory=feedbackForce(s.sensory,{...this.cfg,feedback:Math.min(1.5,this.cfg.feedback??.7)},n);
    const tactile=constrictionForce(s.sensory,n,{gain:42});
    const previous=this.previous||Array(n).fill(0);
    // Weighted tracking, sensory errors and change-in-command penalty.
    const u=s.x.map((xi,j)=>{
      const tracking=43*(s.target[j]-xi)-12*s.v[j];
      const optimal=(tracking+.75*auditory[j]+.8*tactile[j]+.28*previous[j])/1.28;
      return Math.max(-75,Math.min(75,optimal));
    });
    this.previous=u;
    return {u,planning:s.weights.slice(),selected:s.selected,
      details:s.sensory?'Local multisensory receding-step objective (VTL feedback)':'Proprioceptive-only local OFC surrogate'};
  }
}

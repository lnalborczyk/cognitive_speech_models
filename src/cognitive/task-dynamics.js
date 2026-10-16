import {taskDrive} from '../motor/task-space.js';
import {constrictionForce,feedbackForce} from '../motor/sensory-control.js';
/** VTL-informed constriction task (if sensory backend present). Geometry
 * targets and gradients are measured online via vtlTractToTube; otherwise
 * use the explicitly labelled legacy surrogate in offline fixture tests.
 */
export class TaskDynamics {
  static id='td';static label='VTL-informed Task Dynamics';
  constructor(cfg){this.cfg=cfg;}
  step(s){
    if(!s.sensory){
      const u=taskDrive(s.speaker.names,s.x,s.v,s.target,this.cfg);
      return {u,planning:s.weights.slice(),selected:s.selected,details:'Offline surrogate (no VTL sensor)'};
    }
    const n=s.x.length,goal=s.sensory.constriction;
    const task=goal?constrictionForce(s.sensory,n,{gain:55}):feedbackForce(s.sensory,{feedback:.65,perturbation:0},n);
    const u=task.map((value,j)=>value+25*(s.target[j]-s.x[j])-13*s.v[j]);
    return {u,planning:s.weights.slice(),selected:s.selected,
      details:goal?'VTL constriction-area task with finite-difference Jacobian':'VTL vowel resonance task'};
  }
}

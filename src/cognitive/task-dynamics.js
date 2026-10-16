import {taskDrive,taskMatrix} from '../motor/task-space.js';
/** Task Dynamics-inspired *coupled task coordinates* with damped Jacobian-transpose.
 * Unlike v0.8 this is not an identity mapping. Task coordinates remain
 * parameter-based surrogates, not physical VTL constriction variables.
 */
export class TaskDynamics {
  static id='td';static label='Task Dynamics-inspired task control';
  constructor(cfg){this.cfg=cfg;}
  step(s){
    const names=s.speaker.names;
    const u=taskDrive(names,s.x,s.v,s.target,this.cfg);
    return {u,planning:s.weights.slice(),selected:s.selected,
      details:`${taskMatrix(names).rows.length} coupled task coordinates; VTL tube Jacobian not yet estimated`};
  }
}

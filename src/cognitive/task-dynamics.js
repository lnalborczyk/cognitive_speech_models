import {taskDrive} from '../motor/task-space.js';
import {constrictionForce} from '../motor/sensory-control.js';
import {taskSpaceCommand} from '../motor/task-dynamics-control.js';
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
    if(s.sensory.taskGeometry){
      const u=taskSpaceCommand({x:s.x,v:s.v,target:s.target,sensory:s.sensory,
        rate:this.cfg.rate??1,stiffness:this.cfg.stiffness??1,
        neutral:s.speaker.neutral,taskOmega:this.cfg.taskOmega??5.5,
        regularization:this.cfg.taskRegularization??.08,
        stopOmega:this.cfg.taskStopOmega??18,
        taskAccelerationLimit:this.cfg.taskStopAccelerationLimit??115,
        referenceAttraction:this.cfg.taskReferenceAttraction??65});
      return {u,planning:s.weights.slice(),selected:s.selected,
        details:'Overlapping gestures, VTL-derived tract tasks, critically damped task dynamics'};
    }
    // Legacy compatibility for offline tests against incomplete observer stubs.
    const goal=s.sensory.constriction;
    const u=goal?constrictionForce(s.sensory,s.x.length,{gain:55}):taskDrive(s.speaker.names,s.x,s.v,s.target,this.cfg);
    return {u,planning:s.weights.slice(),selected:s.selected,
      details:'Legacy observer without task geometry (non-production fallback)'};
  }
}

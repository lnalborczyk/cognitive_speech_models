import {DIVA} from './diva.js';
import {TaskDynamics} from './task-dynamics.js';

/** Only the two theory-inspired controllers maintained by this project. */
export const CONTROLLERS = Object.freeze({diva:DIVA, td:TaskDynamics});
export function createController(name,cfg){
  if(!Object.hasOwn(CONTROLLERS,name))throw new Error(`Unknown controller ${name}`);
  return new CONTROLLERS[name](cfg);
}

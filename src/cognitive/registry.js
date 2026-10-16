import {DIVA} from './diva.js';
import {GODIVA} from './godiva.js';
import {GEPPETO} from './geppeto.js';
import {TaskDynamics} from './task-dynamics.js';
export const CONTROLLERS={diva:DIVA,godiva:GODIVA,geppeto:GEPPETO,td:TaskDynamics};
export function createController(name,cfg){if(!CONTROLLERS[name])throw new Error(`Unknown controller ${name}`);return new CONTROLLERS[name](cfg);}

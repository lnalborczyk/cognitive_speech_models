/** Shared normalized command integration for all VTL-driven controllers.
 * This is a deliberately reduced-order mass-spring command filter, NOT
 * VocalTractLab biomechanics, GEPPETO finite-element muscle dynamics, or a
 * standalone articulatory/acoustic approximation. Its trajectories require
 * a successfully initialized VTL speaker for mapping into tract parameters.
 */
export const clamp = (x,lo=0,hi=1) => Math.max(lo,Math.min(hi,x));
/** Normalized state is used by *all* controllers and the native bridge. */
export function makePlant(speaker, stiffness=1){
  const x=speaker.neutral.slice(); const v=x.map(()=>0);
  const rest=speaker.neutral;
  return {
    x, v,
    step(command,dt,noise=()=>0){
      for(let j=0;j<x.length;j++){
        // Common normalized actuator dynamics; VTL maps the resulting trajectory into physical tract parameters.
        // The VTL API synthesizes this resulting articulatory trajectory.
        const accel=(command[j]-3.4*v[j]-1.9*stiffness*(x[j]-rest[j]) + noise()) / 1.0;
        v[j]=clamp(v[j]+dt*accel,-2.5,2.5);
        const next=x[j]+dt*v[j];
        if(next<=0 || next>=1){v[j]=0;}
        x[j]=clamp(next);
      }
      return x;
    }
  };
}

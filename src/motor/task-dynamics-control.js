/** Task-space point attractors and damped inverse kinematics.
 * Based on Task Dynamics principles, but using VTL tube-derived proxies and a
 * reduced-order shared actuator, not Haskins TADA muscle/articulator equations.
 */
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function solveLinear(A,b){
 const n=b.length,m=A.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){
  let p=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[p][k]))p=i;
  if(Math.abs(m[p][k])<1e-10)return Array(n).fill(0);
  [m[p],m[k]]=[m[k],m[p]];
  const pivot=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=pivot;
  for(let i=0;i<n;i++)if(i!==k){const scale=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=scale*m[k][j];}
 }
 return m.map(row=>row[n]);
}
export function taskSpaceCommand({x,v,target,sensory,rate=1,stiffness=1,neutral=null,
                                    taskOmega=5.5,taskDamping=1,regularization=.08,
                                    stopOmega=18,taskAccelerationLimit=115}){
 const d=sensory?.taskGeometry,n=x.length;
 if(!d?.values||!d.goals||!d.jacobians)return Array(n).fill(0);
 const keys=Object.keys(d.goals).filter(k=>Number.isFinite(d.values[k])&&Array.isArray(d.jacobians[k]));
 if(!keys.length)return Array(n).fill(0);
 const J=keys.map(k=>d.jacobians[k]);
 const omega=taskOmega*rate;
 const errors=keys.map((k,i)=>{
  const velocity=dot(J[i],v);
  const priority=Math.min(1,Math.max(0,d.stopWeights?.[k]||0));
  // Stiffer closure-specific task attractors. The high-rate onset is
  // restricted to closure gestures, leaving vowel gestures unchanged.
  const localOmega=omega*(1-priority)+stopOmega*rate*priority;
  const acc=localOmega*localOmega*(d.goals[k]-d.values[k])-2*taskDamping*localOmega*velocity;
  const limit=22*(1-priority)+taskAccelerationLimit*priority;
  return Math.max(-limit,Math.min(limit,acc));
 });
 // Damped pseudoinverse: J^T (J J^T + lambda I)^-1 a_task.
 const gram=J.map((row,i)=>J.map((r,j)=>dot(row,r)+(i===j?regularization:0)));
 const alpha=solveLinear(gram,errors);
 const command=Array.from({length:n},(_,j)=>J.reduce((s,row,i)=>s+row[j]*alpha[i],0));
 // Convert desired articulator acceleration to the shared plant's command
 // units, explicitly compensating for the known shared plant damping/rest term.
 // Gentle articulator regularization avoids uncontrolled null-space drift.
 return command.map((u,j)=>Math.max(-75,Math.min(75,u+3.4*v[j]+
   1.9*stiffness*(x[j]-(neutral?.[j]??.5)) +
   3*(target[j]-x[j])-.8*v[j])));
}

/** Low-dimensional, anatomically interpretable task coordinates.
 * The Jacobian maps jaw/lip/tongue VTL parameters to task-space surrogates.
 * These are NOT VTL-derived constriction degrees/locations. The latter would
 * require a numerical Jacobian of the VTL tube/geometry solver online.
 */
const TASKS=[
 {name:'lip aperture',terms:{LD:1,JA:.12}},
 {name:'tongue tip elevation',terms:{TTY:1,JA:-.12,TTX:.08}},
 {name:'tongue dorsum elevation',terms:{TCY:1,JA:-.10,TCX:.10}},
 {name:'lip protrusion',terms:{LP:1,LD:-.06}},
 {name:'tongue body advancement',terms:{TCX:1,TCY:.08}},
];
export function taskMatrix(names){
  const rows=TASKS.map(task=>names.map(name=>task.terms[name]||0));
  return {names:TASKS.map(t=>t.name),rows:rows.filter(r=>r.some(x=>x!==0))};
}
export function multiply(matrix,x){return matrix.map(row=>row.reduce((a,v,i)=>a+v*x[i],0));}
export function taskDrive(names,x,v,target,{rate=1,taskWeight=.65}={}){
  const J=taskMatrix(names).rows,n=x.length;
  const tx=multiply(J,x),td=multiply(J,target),tv=multiply(J,v);
  const omega=8*rate;
  const commands=Array(n).fill(0);
  for(let i=0;i<J.length;i++){
    const norm=J[i].reduce((s,z)=>s+z*z,0)+0.15; // damped Jacobian transpose
    const force=(omega*omega*(td[i]-tx[i])-2*omega*tv[i])/norm;
    for(let j=0;j<n;j++)commands[j]+=J[i][j]*force;
  }
  // Null-space stabilizer keeps parameters not represented by the task map bounded.
  return commands.map((u,j)=>taskWeight*u+(1-taskWeight)*(65*(target[j]-x[j])-15*v[j]));
}

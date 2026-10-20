/** Reduced gestural coupling graph. The original TADA oscillator network has
 * language-specific learned gesture couplings; here the relationships are
 * explicit and inspectable (CV stronger synchronization than VC).
 */
export function coupleGestureTiming(score,{coupling=.35}={}){
 const g=score.gestures.map(x=>({...x}));
 if(g.length<2||coupling<=0)return {...score,gestures:g,couplingGraph:[]};
 const original=g.map(x=>x.center),unit=original[1]-original[0];
 const edges=g.slice(1).map((gesture,i)=>{
   const prev=g[i],cv=prev.kind==='stop'&&gesture.kind==='vowel';
   const vc=prev.kind==='vowel'&&gesture.kind==='stop';
   return {from:i,to:i+1,relation:cv?'CV-in-phase tendency':vc?'VC-anti-phase tendency':'sequential',
     preferredGap:unit*(cv?.78:vc?1.12:1),weight:coupling};
 });
 // Minimize squared mismatch to the coupling graph while retaining each
 // intrinsic oscillator's rhythm. Anchoring to the intrinsic timing prevents
 // drift and keeps ordering monotonic.
 let centers=original.slice();
 for(let n=0;n<160;n++){
  const gradient=centers.map((t,i)=>.8*(t-original[i]));
  for(const edge of edges){
    const error=(centers[edge.to]-centers[edge.from])-edge.preferredGap;
    gradient[edge.from]-=coupling*error;
    gradient[edge.to]+=coupling*error;
  }
  const next=centers.map((t,i)=>t-.15*gradient[i]);
  next[0]=Math.max(original[0]-.1*unit,next[0]);
  for(let i=1;i<next.length;i++)next[i]=Math.max(next[i-1]+.35*unit,next[i]);
  centers=next;
 }
 for(let i=0;i<g.length;i++){
  const shift=centers[i]-original[i];
  g[i].center+=shift;g[i].start+=shift;g[i].end+=shift;
 }
 return {...score,gestures:g,duration:Math.max(score.duration,g.at(-1).end),couplingGraph:edges};
}

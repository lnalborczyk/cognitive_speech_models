/** Time-windowed paired VTL F1 summaries, with no invented values for missing F1. */
export function responseWindows(baseline,shifted,{onsetMs=350,shiftHz=150,lateMs=200}={}){
  const a=baseline?.frames,b=shifted?.frames;
  if(!a?.length||a.length!==b?.length)throw Error('Paired frames are required');
  const onset=onsetMs/1000,late=onset+lateMs/1000;
  const targetPhone=baseline.score?.gestures?.find(g=>g.start<=onset&&g.end>=onset)?.phone
    ??a.find(f=>f.t>=onset)?.phone??null;
  const firstFollowing=baseline.score?.gestures?.find(g=>g.start>onset&&g.phone!==targetPhone);
  const end=Math.min(a.at(-1).t,firstFollowing?.start??a.at(-1).t);
  const summary=(lo,hi,phone)=>{
    const values=[];let observations=0,missing=0,motor=0,motorN=0;
    for(let i=0;i<a.length;i++){
      const f=a[i],g=b[i];if(f.t<lo||f.t>=hi||(phone&&f.phone!==phone))continue;
      motor+=f.x.reduce((s,x,j)=>s+(g.x[j]-x)**2,0)/f.x.length;motorN++;
      if(f.sensory?.observerUpdate!==true)continue;
      observations++;
      const v=f.sensory?.auditory?.[0],w=g.sensory?.auditory?.[0];
      if(Number.isFinite(v)&&Number.isFinite(w))values.push(w-v);else missing++;
    }
    const delta=values.length?values.reduce((s,x)=>s+x,0)/values.length:null;
    return {observations,validF1:values.length,missingF1:missing,
      meanDeltaF1Hz:delta,compensationHz:delta===null?null:-Math.sign(shiftHz)*delta,
      rmsMotorDifference:motorN?Math.sqrt(motor/motorN):null};
  };
  return {onset_s:onset,lateStart_s:late,testVowel:targetPhone,testVowelEnd_s:end,
    duringVowel:summary(late,end,targetPhone),
    afterVowel:firstFollowing?summary(end,a.at(-1).t+1e-8,null):null};
}

/** Controller/reference trajectory comparison. The reference must be supplied
 * independently (e.g. VTL gestural-score output or recorded EMA), not the
 * controller's own phonetic target. No Haskins/TADA source is redistributed.
 */
export function interpolateReference(reference,t,key){
 if(!reference?.length)return null;
 if(t<=reference[0].t)return reference[0][key];
 if(t>=reference.at(-1).t)return reference.at(-1)[key];
 let lo=0,hi=reference.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;
   if(reference[mid].t<=t)lo=mid;else hi=mid;}
 const a=reference[lo],b=reference[hi],p=(t-a.t)/(b.t-a.t);
 if(!Number.isFinite(a[key])||!Number.isFinite(b[key]))return null;
 return a[key]*(1-p)+b[key]*p;
}
export function compareTimeSeries(simulated,reference,{time='t',variable='F1_Hz'}={}){
 let n=0,sse=0,bias=0;
 for(const row of simulated){
  const target=interpolateReference(reference,Number(row[time]),variable),value=Number(row[variable]);
  if(target===null||!Number.isFinite(value))continue;
  const error=value-target;sse+=error*error;bias+=error;n++;
 }
 return {variable,validSamples:n,RMSE:n?Math.sqrt(sse/n):null,bias:n?bias/n:null,
   status:n?'MEASURED_AGAINST_EXTERNAL_REFERENCE':'NO_MATCHING_OBSERVATIONS'};
}

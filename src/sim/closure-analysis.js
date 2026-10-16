/** Place-specific stop diagnostics derived from VTL tract-to-tube sections.
 * These are geometry criteria, NOT phoneme-recognition or perceptual accuracy.
 * Target location comes from each speaker's *actual* consonant reference pose.
 */
export const CLOSURE_THRESHOLD_CM2 = 0.08;
export const MIN_HOLD_S = 0.025;
// Anatomical search intervals are only safeguards against distant constrictions;
// the actual constriction site is estimated from VTL reference geometry.
export const STOP_BANDS = Object.freeze({p:[.78,1],t:[.55,.97],k:[.30,.86]});
const finite = Number.isFinite;
function sections(sample) {
  const a=sample?.areas_cm2,l=sample?.lengths_cm;
  if(!Array.isArray(a)||!Array.isArray(l)||a.length!==l.length)return [];
  const total=l.reduce((s,v)=>s+(finite(v)&&v>0?v:0),0);
  if(!(total>0))return [];
  let cursor=0;
  return a.map((area,i)=>{
    const len=finite(l[i])&&l[i]>0?l[i]:0;
    const point={i,area,relativePosition:(cursor+len/2)/total};
    cursor+=len;
    return point;
  }).filter(p=>finite(p.area)&&p.area>=0);
}
export function stopReferenceSite(reference,phone){
  const band=STOP_BANDS[phone];
  if(!band)return null;
  const candidates=sections(reference).filter(p=>p.relativePosition>=band[0]&&p.relativePosition<=band[1]);
  if(!candidates.length)return null;
  const site=candidates.reduce((a,b)=>b.area<a.area?b:a);
  return {phone,position:site.relativePosition,targetArea_cm2:site.area,referenceSection:site.i};
}
/** Find aperture at reference-derived location, allowing small geometric shifts.
 * The allowed search window is narrow so an unrelated closure is not counted.
 */
export function apertureAtSite(sample,site,{tolerance=.035}={}){
  if(!site)return null;
  const points=sections(sample);
  if(!points.length)return null;
  const distance=x=>Math.abs(x.relativePosition-site.position);
  const local=points.filter(p=>distance(p)<=tolerance);
  const candidates=local.length?local:[points.reduce((a,b)=>distance(b)<distance(a)?b:a)];
  const minimum=candidates.reduce((a,b)=>b.area<a.area?b:a);
  return {area_cm2:minimum.area,position:minimum.relativePosition,sectionIndex:minimum.i};
}
function longestClosedRun(samples,threshold){
  let best=0,first=null,last=null,open=null;
  for(let i=0;i<samples.length;i++){
    const v=samples[i];
    if(v.area_cm2!==null&&v.area_cm2<=threshold){
      if(first===null)first=i;
      last=i;
    }else if(first!==null){
      const dur=samples[last].t-samples[first].t;
      if(dur>best){best=dur;open={start:samples[first].t,end:samples[last].t,after:v.t};}
      first=null;last=null;
    }
  }
  if(first!==null){
    const dur=samples[last].t-samples[first].t;
    if(dur>best){best=dur;open={start:samples[first].t,end:samples[last].t,after:null};}
  }
  return {duration:best,run:open};
}
export function analyzeStops(simulation,geometry,references,{threshold=CLOSURE_THRESHOLD_CM2,minHold=MIN_HOLD_S}={}){
  if(!simulation?.score?.gestures) return [];
  return simulation.score.gestures.filter(g=>g.kind==='stop').map(g=>{
    const reference=references.find(r=>r.phone===g.phone&&r.context===g.context);
    const site=stopReferenceSite(reference,g.phone);
    const all=(geometry||[]).map(sample=>({t:sample.t,...(apertureAtSite(sample,site)||{area_cm2:null})}));
    // Evaluate the closure in the planned gesture interval; the release can
    // occur a little later, and is searched in the surrounding tail.
    const samples=all.filter(s=>s.t>=g.start-1e-6&&s.t<=g.end+1e-6);
    const valid=samples.filter(s=>finite(s.area_cm2));
    const closest=valid.length?valid.reduce((a,b)=>b.area_cm2<a.area_cm2?b:a):null;
    const {duration,run}=longestClosedRun(samples,threshold);
    let releaseTime_s=null;
    if(run){
      const tail=all.find(s=>s.t>run.end+1e-6&&s.t<=g.end+.15&&finite(s.area_cm2)&&s.area_cm2>threshold);
      releaseTime_s=tail?.t??null;
    }
    const targetClosed=site&&site.targetArea_cm2<=threshold;
    const sufficientResolution=valid.length>=4 && valid.at(-1).t-valid[0].t>=minHold;
    const success=targetClosed&&sufficientResolution&&duration>=minHold;
    return {phone:g.phone,context:g.context,source:g.source,gestureIndex:g.index,
      plannedStart_s:g.start,plannedEnd_s:g.end,sitePosition:site?.position??null,
      referenceArea_cm2:site?.targetArea_cm2??null,minimumArea_cm2:closest?.area_cm2??null,
      closestTime_s:closest?.t??null,closureDuration_s:valid.length?duration:null,
      closureOnset_s:run?.start??null,releaseTime_s,
      targetClosed:!!targetClosed,validSamples:valid.length,verified:!!success,
      status:!site?'reference missing':!targetClosed?'reference does not meet closure threshold':
        !sufficientResolution?'insufficient temporal resolution':success?'sustained closure':'incomplete closure',
      threshold_cm2:threshold,minHold_s:minHold};
  });
}
export function placeSpecificSeries(geometry,reference,phone){
  const site=stopReferenceSite(reference,phone);
  return (geometry||[]).map(s=>({t:s.t,area_cm2:apertureAtSite(s,site)?.area_cm2??null}));
}

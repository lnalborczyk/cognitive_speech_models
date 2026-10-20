import { clamp } from './plant.js';
import { resolvedShape, STOP_SHAPES } from './shape-map.js';
export const PHRASES={
  ahold:{label:'/aː/ sustained',phones:['a'],durationMultiplier:4},
  ihold:{label:'/iː/ sustained (F1 diagnostic)',phones:['i'],durationMultiplier:4},
  uhold:{label:'/uː/ sustained',phones:['u'],durationMultiplier:4},
  aia:{label:'/a i a/',phones:['a','i','a']},
  aua:{label:'/a u a/',phones:['a','u','a']},
  iai:{label:'/i a i/',phones:['i','a','i']},
  apa:{label:'/a p a/',phones:['a','p','a']},
  ata:{label:'/a t a/',phones:['a','t','a']},
  aka:{label:'/a k a/',phones:['a','k','a']},
  ipi:{label:'/i p i/',phones:['i','p','i']},
  iti:{label:'/i t i/',phones:['i','t','i']},
  iki:{label:'/i k i/',phones:['i','k','i']},
  upu:{label:'/u p u/',phones:['u','p','u']},
  utu:{label:'/u t u/',phones:['u','t','u']},
  uku:{label:'/u k u/',phones:['u','k','u']},
  pataka:{label:'/p a t a k a/',phones:['p','a','t','a','k','a']},
};
export function isStop(phone) {return Boolean(STOP_SHAPES[phone]);}
function contextFor(phones,index){
  // Choose the nearest following vowel, otherwise the nearest preceding vowel.
  for(let i=index+1;i<phones.length;i++)if('aiu'.includes(phones[i]))return phones[i];
  for(let i=index-1;i>=0;i--)if('aiu'.includes(phones[i]))return phones[i];
  return 'a';
}
export function makeScore(phrase,speaker,{rate=1,overlap=.3}={}){
  const definition=PHRASES[phrase],phones=definition?.phones;
  if(!phones)throw new Error(`Unknown utterance '${phrase}'`);
  const unit=(.29/rate)*(definition.durationMultiplier||1);
  const gestures=phones.map((phone,index)=>{
    const context=contextFor(phones,index),resolved=resolvedShape(speaker,phone,context);
    if(!resolved)throw new Error(`Missing speaker target for /${phone}/ (vowel context /${context}/). No target was synthesized or guessed.`);
    const start=index*unit,end=(index+1)*unit;
    return {phone,index,context,kind:isStop(phone)?'stop':'vowel',source:resolved.source,
      start,end,center:(start+end)/2,width:unit*(.5+overlap*.75),target:resolved.target};
  });
  return {gestures,duration:phones.length*unit,phones};
}
export function activation(score,t){
  const strength=score.gestures.map(g=>{
    const dist=Math.abs(t-g.center);
    // Raised cosine transitions, with a narrow target-hold plateau for consonant closure.
    const extent=g.width, plateau=g.kind==='stop'?g.width*.36:0;
    if(dist<=plateau)return 1;
    return dist<extent ? .5*(1+Math.cos(Math.PI*(dist-plateau)/(extent-plateau))):0;
  });
  const sum=strength.reduce((a,b)=>a+b,0);
  const weight=sum?strength.map(v=>v/sum):strength;
  const chosen=score.gestures.reduce((best,g,i)=>Math.abs(t-g.center)<Math.abs(t-score.gestures[best].center)?i:best,0);
  return {strength,weight,chosen};
}
export function blendedTarget(score,t){
  const {weight,chosen}=activation(score,t);
  if(!weight.some(Boolean))return score.gestures[chosen].target.slice();
  return score.gestures[0].target.map((_,j)=>clamp(score.gestures.reduce((sum,g,i)=>sum+g.target[j]*weight[i],0)));
}

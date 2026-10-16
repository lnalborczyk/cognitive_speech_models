import { clamp } from './plant.js';
export const PHRASES={
  aia:{label:'/a i a/',phones:['a','i','a']},
  aua:{label:'/a u a/',phones:['a','u','a']},
  iai:{label:'/i a i/',phones:['i','a','i']},
  apa:{label:'/a p a/',phones:['a','p','a']},
  ata:{label:'/a t a/',phones:['a','t','a']},
  aka:{label:'/a k a/',phones:['a','k','a']},
  pataka:{label:'/p a t a k a/',phones:['p','a','t','a','k','a']},
};
export function makeScore(phrase,speaker,{rate=1,overlap=.3}={}){
  const phones=PHRASES[phrase]?.phones;
  if(!phones) throw new Error(`Unknown utterance '${phrase}'`);
  const missing=phones.filter(p=>!speaker.shapes[p]);
  if(missing.length) throw new Error(`Speaker model lacks shape(s): ${[...new Set(missing)].join(', ')}. Use a vowel-only utterance or add calibrated targets.`);
  const duration=.29 / rate;
  const gestures=phones.map((phone,index)=>({
    phone,index,start:index*duration, end:(index+1)*duration,
    center:(index+.5)*duration,
    width:duration*(.5+overlap*.75), target:speaker.shapes[phone]
  }));
  return {gestures,duration:phones.length*duration,phones};
}
export function activation(score,t){
  const strength=score.gestures.map(g=>{
    const dist=Math.abs(t-g.center);
    return dist<g.width ? .5*(1+Math.cos(Math.PI*dist/g.width)):0;
  });
  const sum=strength.reduce((a,b)=>a+b,0);
  const weight= sum?strength.map(v=>v/sum):strength;
  let chosen=score.gestures.reduce((best,g,i)=>Math.abs(t-g.center)<Math.abs(t-score.gestures[best].center)?i:best,0);
  return {strength,weight,chosen};
}
export function blendedTarget(score,t){
  const {weight,chosen}=activation(score,t);
  if(!weight.some(Boolean))return score.gestures[chosen].target.slice();
  return score.gestures[0].target.map((_,j)=>clamp(score.gestures.reduce((sum,g,i)=>sum+g.target[j]*weight[i],0)));
}

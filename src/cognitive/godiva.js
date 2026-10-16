/** GODIVA-inspired competitive serial selection preceding the DIVA controller. */
import {DIVA} from './diva.js';
export class GODIVA {
  static id='godiva';static label='GODIVA-inspired sequencing';
  constructor(cfg){this.diva=new DIVA(cfg);this.activation=[];}
  step(s){
    const n=s.score.gestures.length;
    if(this.activation.length!==n)this.activation=Array(n).fill(0);
    const chosen=s.selected;
    for(let i=0;i<n;i++){
      // Excitatory bias to current unit, competitive inhibition to alternatives.
      const goal=i===chosen?1.0:0;
      const inhibition=.4*(this.activation.reduce((a,b)=>a+b,0)-this.activation[i]);
      this.activation[i]=Math.max(0,this.activation[i]+s.dt*(13*(goal-this.activation[i])-inhibition));
    }
    const winner=this.activation.indexOf(Math.max(...this.activation));
    const target=s.score.gestures[winner].target;
    const result=this.diva.step({...s,target});
    return {...result,planning:this.activation.slice(),selected:winner,details:'Competitive queue → DIVA-inspired actuation'};
  }
}

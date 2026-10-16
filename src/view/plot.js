/** Responsive Canvas 2D plots. Canvas backing bitmaps are fixed at 910px;
 * CSS scales them *inside* the panel, never beyond their containing column.
 * Area functions use cumulative tube-length coordinates, not equal tube bins.
 */
const PALETTE=['#72d5e4','#efb676','#f17f9b','#a5db8a','#b6a3e2','#d9d078','#8ea8f5','#df9eda'];
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function channels(names,n=5){return names.slice(0,n).map((name,i)=>({name,color:PALETTE[i%PALETTE.length],idx:i}));}
const chartPadding={left:54,top:13,right:18,bottom:28};
function board(canvas,ymin,ymax,{xStart='',xEnd='',unit=''}={}){
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 const {left,top,right,bottom}=chartPadding;
 const plotW=W-left-right,plotH=H-top-bottom;
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b1725';ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#23435a';ctx.lineWidth=1;
 ctx.font='12px system-ui, sans-serif';ctx.fillStyle='#9cb0c4';
 for(let i=0;i<=4;i++){
   const y=top+plotH*i/4;
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(W-right,y);ctx.stroke();
   const v=ymax-(ymax-ymin)*i/4;
   ctx.fillText(v.toFixed(ymax>=10?1:2),6,y+4);
 }
 ctx.fillStyle='#93aabd';
 if(unit)ctx.fillText(unit,left+7,top+13);
 if(xStart)ctx.fillText(xStart,left,H-7);
 if(xEnd){ctx.textAlign='right';ctx.fillText(xEnd,W-right,H-7);ctx.textAlign='left';}
 return {ctx,W,H,x:p=>left+clamp(p,0,1)*plotW,y:p=>top+plotH*(1-clamp((p-ymin)/(ymax-ymin||1),0,1))};
}
export function plotLines(id,lines,cursor=0,min=0,max=1,opts={}){
 const canvas=document.getElementById(id);if(!canvas)return;
 const {ctx,x,y,H}=board(canvas,min,max,opts);
 for(let j=0;j<lines.length;j++){
   const data=lines[j].data;if(!data?.length)continue;
   const xs=lines[j].xs;
   ctx.beginPath();ctx.lineWidth=2.3;ctx.strokeStyle=lines[j].color||PALETTE[j%PALETTE.length];
   let started=false;
   for(let i=0;i<data.length;i++){
     if(!Number.isFinite(data[i])){started=false;continue;}
     const xx=x(xs?.[i]??(i/(data.length-1||1))),yy=y(data[i]);
     if(!started)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
     started=true;
   }
   ctx.stroke();
 }
 if(cursor!==null){
   ctx.beginPath();ctx.lineWidth=1;ctx.strokeStyle='#dce8f5';ctx.moveTo(x(cursor),13);ctx.lineTo(x(cursor),H-chartPadding.bottom);ctx.stroke();
 }
}
export function areaCoordinates(lengths,n){
 if(!Array.isArray(lengths)||lengths.length!==n||lengths.some(v=>!Number.isFinite(v)||v<0))
   return Array.from({length:n},(_,i)=>(i+.5)/n);
 const sum=lengths.reduce((s,v)=>s+v,0);
 if(sum<=0)return Array.from({length:n},(_,i)=>(i+.5)/n);
 let dist=0;
 return lengths.map(v=>{const pos=(dist+v/2)/sum;dist+=v;return pos;});
}
export function plotArea(sample){
 if(!sample){plotLines('area',[],null,0,1,{xStart:'Glottis',xEnd:'Lips',unit:'cm²'});return;}
 const areas=(sample.areas_cm2||[]).map(v=>Number.isFinite(v)?Math.max(0,v):NaN);
 const maxFinite=Math.max(0,...areas.filter(Number.isFinite));
 const xcoords=areaCoordinates(sample.lengths_cm,areas.length);
 const limit=Math.max(1,Math.ceil(maxFinite*1.1*2)/2);
 plotLines('area',[{data:areas,xs:xcoords,color:'#70d4cb'}],null,0,limit,{xStart:'Glottis',xEnd:'Lips',unit:'cm²'});
}
/** Precomputed spectrogram of the actual synthesized VTL waveform. */
export function plotSpectrogram(id,spec,cursor=0){
 const canvas=document.getElementById(id);if(!canvas)return;
 const {ctx,x,y,W,H}=board(canvas,0,4,{xStart:'Onset',xEnd:spec?`${spec.duration.toFixed(2)} s`:'Time',unit:'kHz'});
 if(!spec?.frames?.length)return;
 const cols=spec.frames,ny=Math.min(128,cols[0].bands.length);
 const left=chartPadding.left,top=chartPadding.top;
 const plotW=W-left-chartPadding.right,plotH=H-top-chartPadding.bottom;
 const cellW=plotW/cols.length+1,cellH=plotH/ny+1;
 for(let i=0;i<cols.length;i++)for(let k=0;k<ny;k++){
  const db=cols[i].bands[k],f=clamp((db+86)/75,0,1);
  const r=Math.round(14+210*f*f),g=Math.round(22+155*f),b=Math.round(35+65*f);
  ctx.fillStyle=`rgb(${r},${g},${b})`;
  ctx.fillRect(left+i*plotW/cols.length,top+plotH-(k+1)*plotH/ny,cellW,cellH);
 }
 ctx.strokeStyle='#eff5ff';ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(x(cursor),top);ctx.lineTo(x(cursor),H-chartPadding.bottom);ctx.stroke();
}

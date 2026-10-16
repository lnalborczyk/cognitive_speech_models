/**
 * Native VTL vector animation, synchronized to an external clock (the WAV
 * HTMLAudioElement or a silent performance.now() timeline).
 *
 * Every image is exported by vtlExportTractSvg from a real tract pose. We
 * preload all frames as Image elements and move already-loaded elements into
 * the DOM; no browser-side pseudo-anatomy is inferred from tract parameters.
 * Frames are discrete samples and are held until the next available pose.
 */
export function nearestTimestampIndex(frames,t){
  if(!frames.length)return -1;
  let low=0,high=frames.length;
  while(low<high){const mid=(low+high)>>1;if(frames[mid].t<t)low=mid+1;else high=mid;}
  if(low===0)return 0;
  if(low===frames.length)return frames.length-1;
  return Math.abs(frames[low].t-t)<Math.abs(t-frames[low-1].t)?low:low-1;
}
export class NativeTractAnimation {
  constructor(container){this.container=container;this.frames=[];this.current=-1;}
  clear(text='Native VTL animation is not available.'){
    this.frames=[];this.current=-1;this.container.replaceChildren();
    this.container.textContent=text;
  }
  load(svgFrames){
    this.frames=svgFrames.map(frame=>{
      const img=new Image();
      img.alt='VocalTractLab midsagittal tract rendering at '+frame.t.toFixed(3)+' seconds';
      img.decoding='async';
      img.src='data:image/svg+xml;base64,'+frame.svgBase64;
      return {t:frame.t,img};
    }).sort((a,b)=>a.t-b.t);
    this.current=-1;
    if(this.frames.length)this.show(0);
    else this.clear('VTL did not return any SVG geometry frames.');
  }
  show(t){
    const i=nearestTimestampIndex(this.frames,t);
    if(i===-1 || i===this.current)return;
    this.current=i;
    this.container.replaceChildren(this.frames[i].img);
  }
}

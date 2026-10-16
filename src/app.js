import {PHRASES} from './motor/gestures.js';
import {simulate,csvOutput} from './sim/runner.js';
import {CONTROLLERS} from './cognitive/registry.js';
import {plotLines,plotArea,channels} from './view/plot.js';
import {NativeTractAnimation,nearestTimestampIndex} from './view/native-animation.js';
import {BrowserVTLClient} from './engine/wasm-client.js';
import {decodeWavBase64,spectrogram} from './sim/diagnostics.js';
import {plotSpectrogram} from './view/plot.js';
import {analyzeStops,placeSpecificSeries,CLOSURE_THRESHOLD_CM2} from './sim/closure-analysis.js';

const $=id=>document.getElementById(id);
const SOURCES=['src/engine/wasm-client.js','src/engine/wasm-worker.js','src/engine/wasm-runtime.js','src/engine/vtl-sensing.js','src/motor/sensory-control.js','scripts/build_vtl_wasm.py','docs/webassembly.md','src/app.js','src/motor/plant.js','src/view/native-animation.js','src/motor/gestures.js','src/motor/shape-map.js','src/motor/task-space.js','src/sim/diagnostics.js','src/sim/closure-analysis.js','src/cognitive/registry.js','src/cognitive/diva.js','src/cognitive/godiva.js','src/cognitive/geppeto-ofc.js','src/cognitive/task-dynamics.js','src/sim/runner.js','src/view/plot.js','server/vtl.py','server/app.py','scripts/launch.py','docs/models.md','docs/deployment.md','docs/embedded-vtl.md','docs/vtl-setup.md','docs/validation.md'];
const specs=[['rate','Speech rate',.6,1.8,.1,1,'×'],['overlap','Gesture overlap',0,.8,.05,.3,''],['feedback','Auditory feedback gain',0,1.8,.1,.8,''],['somatosensory','Somatosensory gain',0,1.8,.1,.5,''],['delay','Feedback delay',0,180,10,60,' ms'],['perturbation','Shift of heard F1 (WASM only)',-200,200,20,0,' Hz'],['perturbationOnsetMs','Auditory shift onset',0,800,50,300,' ms'],['noise','Motor noise',0,.3,.02,.02,''],['stiffness','Plant stiffness',.6,2,.1,1,'×'],['seed','Random seed',1,99,1,17,'']];
let native=null,wasm=null,speaker=null,simulation=null,nativeResult=null;
let acousticSpec=null,constrictionData=[],benchmarkRows=[];
const wasmClient=new BrowserVTLClient({onProgress: phase => {
  $('engine-status').textContent='Loading browser VTL: '+phase;
  console.info('[VTL]',phase);
}});
let playing=false,animation=null,started=0,playOffset=0,timeline='silent';
let activeAudio=null,audioURL=null,requestId=0;
const nativePlayer=new NativeTractAnimation($('native-geometry'));

for(const [key,name,min,max,step,def,suffix] of specs){
 const el=document.createElement('div');el.className='slider';
 el.innerHTML=`<label for="${key}">${name}<output id="${key}-value">${def}${suffix}</output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${def}">`;
 $('sliders').append(el);
 $(key).addEventListener('input',()=>{$(key+'-value').textContent=$(key).value+suffix;});
 $(key).addEventListener('change',()=>{if(speaker)void run()});
}
function config(){return Object.fromEntries(specs.map(([k])=>[k,Number($(k).value)]));}
function message(text){$('audio-status').textContent=text;}
function requireVTL(){
 if(!speaker?.isNative)throw new Error('VocalTractLab is not connected. Build WASM or run python3 scripts/launch.py.');
}
function setConnected(ready){
 for(const id of specs.map(([key])=>key))$(id).disabled=!ready;
 for(const id of ['run','play','compare','compare-vtl','bench-csv','all-csv','download','model','phrase','geometry-fps','scrub','experiment'])$(id).disabled=!ready;
 $('engine').disabled=!ready;
 $('audio').disabled=!ready||!nativeResult;
 $('wav').disabled=!ready||!nativeResult;
}
async function connect(){
 pausePlayback();clearAudio();++requestId;
 speaker=null;simulation=null;nativeResult=null;wasm=null;native=null;
 wasmClient.close();
 for(const opt of $('engine').options)opt.disabled=true;
 $('geometry-label').textContent='Waiting for VTL';$('area-label').textContent='Requires VTL';
 nativePlayer.clear('Connecting to VocalTractLab…');plotArea(null);
 setConnected(false);
 $('reconnect').disabled=true;
 $('engine-status').dataset.state='connecting';
 $('engine-status').textContent='Connecting to VocalTractLab…';
 const notes=[];
 try{
   // Check native VTL first: on macOS, native VTL may be working even if
   // an experimental WASM build is missing or crashes on initialization.
   if (!location.hostname.endsWith('.github.io')) try{
     const response=await fetch('/api/status',{cache:'no-store'});
     if(!response.ok)throw Error(`No VTL API on this web origin (HTTP ${response.status})`);
     const status=await response.json();
     if(status.appVersion!=='1.1.0')throw Error(`Unexpected server version: ${status.appVersion||'unknown'}. Restart scripts/launch.py from the updated project.`);
     if(!status.available)throw Error(status.error||'Native VTL is unavailable');
     const res=await fetch('/api/speaker',{cache:'no-store'});
     if(!res.ok)throw Error(`Native VTL speaker unavailable (HTTP ${res.status})`);
     native=await res.json();
     const opt=$('engine').querySelector('[value="vtl"]');opt.disabled=false;
     opt.textContent='VocalTractLab native (connected)';
     notes.push(`Native VTL connected (${native.names.length} tract parameters).`);
   }catch(e){
     notes.push('Native API: '+e.message+'. If VTL works in the terminal, open the URL printed by python3 scripts/launch.py (usually http://127.0.0.1:8000/), not the static server on port 5173.');
   }
   else notes.push('GitHub Pages: native server is not used; checking the browser-embedded VTL engine.');
   // Browser-only WASM is attempted only when there is no working native
   // engine; a failing WASM build cannot block the known-good native path.
   if(!native){
     $('engine-status').textContent=notes.join(' ')+' Checking browser VTL WebAssembly…';
     try{
       if(await wasmClient.available()){
         wasm=await wasmClient.init();
         const opt=$('engine').querySelector('[value="wasm"]');opt.disabled=false;
         opt.textContent='VocalTractLab WebAssembly (in-browser)';
         notes.push(`Browser VTL initialized (${wasm.names.length} tract parameters).`);
       }else notes.push('Browser WASM assets unavailable: '+wasmClient.assetStatus.join('; '));
     }catch(e){
       notes.push(`Browser WASM initialization failed: ${e.message}.`);
       wasmClient.close();
     }
   }
   speaker=native||wasm;
   if(speaker)$('engine').value=native?'vtl':'wasm';
   $('engine-status').textContent=notes.join(' ');
   $('engine-status').classList.toggle('ready',!!speaker);
   $('engine-status').dataset.state=speaker?'ready':'error';
   if(!speaker)console.error('[VTL] Engine initialization failed:',notes.join(' '));
   setConnected(!!speaker);
   setEngineDetails();
   if(speaker)await run();
   else {
     $('quality').textContent='VTL is required. No browser approximation is available.';
     $('geometry-mode').textContent='VTL unavailable';
     nativePlayer.clear('VTL could not initialize. Open the native launcher URL or compile browser WASM.');
     message('No VTL engine connected. Simulation and audio are disabled.');
   }
 }catch(e){
   $('engine-status').dataset.state='error';
   $('engine-status').textContent='Unexpected connection error: '+e.message;
   nativePlayer.clear('VTL connection failed. See the status message.');
   console.error('VTL connection error:',e);
 }finally{$('reconnect').disabled=false;}
}
function fileView(){let val=$('source').value;$('raw-source').href=val;
 fetch(val).then(r=>{if(!r.ok)throw Error(r.status);return r.text();}).then(text=>{$('code').textContent=text}).catch(e=>{$('code').textContent='Cannot retrieve source ('+e.message+'). Serve over HTTP, not file://.'});}
for(const file of SOURCES){let option=document.createElement('option');option.value=file;option.textContent=file;$('source').append(option)}
$('source').value='src/view/native-animation.js';$('source').addEventListener('change',fileView);
const descriptions={
 diva:'Feedforward commands with delayed proprioception and, in WASM mode, VTL transfer-function resonance feedback. This does not reproduce trained DIVA neural maps.',
 godiva:'Competitive sequencing and DIVA-inspired control. VTL sensory feedback is available in browser WebAssembly mode.',
 'geppeto-ofc':'Reduced-order multisensory local optimal-feedback controller inspired by GEPPETO-OFC (2025). VTL is not the published finite-element tongue.',
 td:'VTL-measured stop constriction area and finite-difference articulatory Jacobian in WebAssembly mode; vowel goals use VTL transfer-function resonances.'
};
function updatePhraseAvailability(){
 if(!speaker)return;
 const p=$('phrase');for(const opt of p.options){
   const phones=PHRASES[opt.value].phones;
   opt.disabled=phones.some((k,i)=>{
     if(!'ptk'.includes(k))return !speaker.shapes[k];
     let context='a';for(let j=i+1;j<phones.length;j++)if('aiu'.includes(phones[j])){context=phones[j];break;}
     return !speaker.shapes[`${k}:${context}`]&&!speaker.shapes[k];
   });
 }
 if(p.selectedOptions[0]?.disabled)p.value='aia';
}
function setEngineDetails(){
 if(!speaker)return;
 updatePhraseAvailability();
 $('quality').textContent=speaker.kind==='wasm'
   ?'Browser VTL measures tube areas and acoustic resonances *during* controller simulation. Controllers and actuator are reduced-order approximations, not validated model reproductions.'
   :'Native VTL produces geometry and audio after a proprioceptive-only control simulation. Online VTL acoustic/constriction feedback requires the WebAssembly backend.';
 $('feedback').disabled=speaker.kind!=='wasm';
 $('perturbation').disabled=speaker.kind!=='wasm';
 $('geometry-mode').textContent=`VTL sagittal anatomy · ${speaker.kind==='wasm'?'browser WebAssembly':'native C API'}`;
}
function pausePlayback(){
 playing=false;if(animation!==null)cancelAnimationFrame(animation);animation=null;
 if(activeAudio && !activeAudio.paused)activeAudio.pause();
 $('play').textContent='Play animation';$('audio').textContent='Play speech + animation';
}
function clearAudio(){
 pausePlayback();if(activeAudio){activeAudio.src='';activeAudio.load();activeAudio=null;}
 if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null;}
}
function fileDownload(name,data,mime){const blob=new Blob([data],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function metricsTable(sims){let html='<table><thead><tr><th>Model</th><th>RMS</th><th>Effort</th></tr></thead><tbody>';
 for(const s of sims)html+=`<tr><td>${s.model}</td><td>${s.metrics.normalizedTrackingRMS.toFixed(3)}</td><td>${s.metrics.effortMean.toFixed(1)}</td></tr>`;
 $('comparison').innerHTML=html+'</tbody></table><p class="mini">Metrics use normalized coordinates; browser WebAssembly comparisons include VTL-measured sensory feedback. Not human-data benchmarks.</p>';
}
async function compare(){
 requireVTL();const sims=[];
 for(const m of Object.keys(CONTROLLERS)){
   $('comparison').textContent=`Calculating ${m} (${sims.length+1} of ${Object.keys(CONTROLLERS).length})…`;
   sims.push(speaker.kind==='wasm'
     ?await wasmClient.simulateOnly(m,$('phrase').value,config())
     :simulate(m,$('phrase').value,speaker,config()));
 }
 metricsTable(sims);return sims;
}
// Controlled within-controller perturbation experiment. Both trajectories use
// identical targets, settings and RNG seed, changing perceived F1 only.
async function perturbationExperiment(){
  if(speaker?.kind!=='wasm')throw Error('Requires the browser VTL sensory observer');
  const button=$('experiment'),cfg=config(),phrase=$('phrase').value,model=$('model').value;
  const onset=cfg.perturbationOnsetMs/1000;
  const shift=cfg.perturbation===0?150:cfg.perturbation;
  button.disabled=true;
  try{
    $('experiment-report').textContent='Calculating baseline VTL sensory control…';
    const baseline=await wasmClient.simulateOnly(model,phrase,{...cfg,perturbation:0});
    $('experiment-report').textContent='Calculating shifted-auditory-feedback condition…';
    const altered=await wasmClient.simulateOnly(model,phrase,{...cfg,perturbation:shift});
    const a=baseline.frames,b=altered.frames;
    if(a.length!==b.length)throw Error('Paired trajectories have different sampling grids');
    let motorError=0,nMotor=0;
    const change=[],obsChange=[];
    for(let i=0;i<a.length;i++){
      const f=a[i],g=b[i];
      let diff=0;
      for(let j=0;j<f.x.length;j++){
        const d=g.x[j]-f.x[j];diff+=d*d;
        if(f.t>=onset){motorError+=d*d;nMotor++;}
      }
      change.push(Math.sqrt(diff/f.x.length));
      const f1a=f.sensory?.auditory?.[0],f1b=g.sensory?.auditory?.[0];
      obsChange.push(Number.isFinite(f1a)&&Number.isFinite(f1b)?f1b-f1a:NaN);
    }
    const rms=nMotor?Math.sqrt(motorError/nMotor):0;
    const samples=obsChange.filter((v,i)=>Number.isFinite(v)&&a[i].t>=onset);
    const meanHz=samples.length?samples.reduce((sum,v)=>sum+v,0)/samples.length:null;
    const max=Math.max(.001,...change);
    plotLines('experiment-plot',[{data:change,color:'#74bcd4'},
      {data:[0,0],xs:[onset/Math.max(.001,duration()),onset/Math.max(.001,duration())],color:'#aaa'}],null,0,max*1.15,
      {xStart:'Start',xEnd:baseline.frames.at(-1).t.toFixed(2)+' s'});
    $('experiment-report').textContent=`${model}: ${shift>0?'+':''}${shift} Hz shift in perceived F1 starting at ${onset.toFixed(2)} s. Paired normalized articulatory RMS divergence: ${rms.toFixed(5)}; mean change in VTL tract-predicted F1: ${meanHz===null?'not estimable':meanHz.toFixed(1)+' Hz'}. No difference is expected for controllers without effective auditory feedback. A shift in perceived F1 is not a change in emitted audio and these results are not calibrated to human compensation.`;
  }catch(e){$('experiment-report').textContent='Perturbation experiment failed: '+e.message;}
  finally{button.disabled=false;}
}
async function comparePhysical(){
 requireVTL();
 const button=$('compare-vtl');button.disabled=true;benchmarkRows=[];
 const models=Object.keys(CONTROLLERS),cfg=config();
 try{
  for(const name of models){
   $('physical-report').textContent=`Synthesizing ${name} (${benchmarkRows.length+1} of ${models.length})…`;
   let s,response;
   if(speaker.kind==='wasm'){
     const result=await wasmClient.simulate(name,$('phrase').value,cfg,{geometry:false,geometryFps:16});
     s=result.simulation;response=result.output;
   }else{
     s=simulate(name,$('phrase').value,speaker,cfg);
     const frames=s.frames.map(f=>({t:f.t,x:f.x}));
     const res=await fetch('/api/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({frames,geometry:false,geometryFps:16,
          referenceTargets:s.score.gestures.filter(g=>g.kind==='stop').map(g=>({phone:g.phone,context:g.context,source:g.source,x:g.target}))})});
     response=await res.json();if(!res.ok)throw Error(response.error||'VTL synthesis failed');
   }
    const stops=analyzeStops(s,response.diagnosticGeometry||response.geometry||[],response.references||[]);
    const closures=stops.filter(x=>x.verified).length;
    const areas=stops.map(x=>x.minimumArea_cm2).filter(Number.isFinite);
    const holds=stops.map(x=>x.closureDuration_s).filter(Number.isFinite);
    const wav=decodeWavBase64(response.audioBase64);
    let square=0;for(const value of wav.samples)square+=value*value;
    benchmarkRows.push({model:name,trackingRms:s.metrics.normalizedTrackingRMS,effort:s.metrics.effortMean,
      minOralArea:areas.length?Math.min(...areas):null,closures,stops:stops.length,
      maxClosureHold_s:holds.length?Math.max(...holds):null,
      audioRms:Math.sqrt(square/wav.samples.length)});
  }
  let html='<table><thead><tr><th>Controller</th><th>Target RMS</th><th>Min oral area (cm²)</th><th>Sustained closures</th><th>Longest hold (ms)</th><th>Audio RMS</th></tr></thead><tbody>';
  for(const r of benchmarkRows)html+=`<tr><td>${r.model}</td><td>${r.trackingRms.toFixed(3)}</td><td>${r.minOralArea?.toFixed(3)??'n/a'}</td><td>${r.stops?r.closures+'/'+r.stops:'—'}</td><td>${r.maxClosureHold_s===null?'—':(1000*r.maxClosureHold_s).toFixed(0)}</td><td>${r.audioRms.toFixed(4)}</td></tr>`;
  $('physical-report').innerHTML=html+'</tbody></table><p class="mini">All four used the same speaker, score, plant, and noise seed. Closures require ≥25 ms at ≤0.08 cm² at the VTL reference-derived place, not simply a narrow area elsewhere. These are geometrical criteria, not validated phoneme detections. These are demonstrations, not human-data fits.</p>';
 }catch(error){$('physical-report').textContent='VTL benchmark failed: '+error.message;}
 finally{button.disabled=false;}
}

function duration(){return simulation?.frames.at(-1)?.t||0;}
function draw(t){
 if(!simulation)return;
 const f=simulation.frames,i=Math.max(0,Math.min(f.length-1,Math.round(t/.005)));
 const current=f[i],pct=i/(f.length-1);
 $('time').textContent=current.t.toFixed(3)+' s';$('unit').textContent='/'+current.phone+'/';
 $('track').textContent=simulation.metrics.normalizedTrackingRMS.toFixed(3);
 $('effort').textContent=simulation.metrics.effortMean.toFixed(1);$('scrub').value=String(Math.round(pct*1000));
 const selected=channels(speaker.names,Math.min(6,speaker.names.length));
 const downs=f.filter((_,ix)=>ix%3===0);
 plotLines('trajectory',selected.map(ch=>({data:downs.map(v=>v.x[ch.idx]),color:ch.color})),pct,0,1,{xStart:'Onset',xEnd:duration().toFixed(2)+' s'});
 plotLines('activations',simulation.score.phones.map((_,j)=>({data:downs.map(v=>v.weights[j]||0)})),pct,0,1,{xStart:'Onset',xEnd:duration().toFixed(2)+' s'});
 if(nativeResult){
  nativePlayer.show(t);
  const samples=nativeResult.geometry||[];
  const nearest=nearestTimestampIndex(samples,t);
  plotArea(nearest<0?null:samples[nearest]);
 }else plotArea(null);
 plotSpectrogram('spectrogram',acousticSpec,pct);
 if($('formants')){
   const sampled=f.filter((frame,index)=>index%8===0 && frame.sensory?.auditory);
   const vals=sampled.flatMap(z=>(z.sensory?.auditory||[]).filter(Number.isFinite));
   const maxHz=vals.length?Math.max(3500,...vals):4000;
   plotLines('formants',[0,1,2].map((k)=>({
      data:sampled.map(z=>z.sensory.auditory?.[k]??NaN),
      xs:sampled.map(z=>z.t/Math.max(.001,duration()))
   })),pct,0,Math.ceil(maxHz/500)*500,{xStart:'Onset',xEnd:duration().toFixed(2)+' s',unit:'Hz'});
 }

  if(constrictionData.length){
    const maxArea=Math.max(.3,...constrictionData.flatMap(entry=>entry.series.map(z=>Number.isFinite(z.area_cm2)?z.area_cm2:0)));
    plotLines('constriction',[
      ...constrictionData.map((entry,i)=>({data:entry.series.map(s=>s.area_cm2??NaN),
        xs:entry.series.map(s=>s.t/Math.max(.001,duration())),
        color:['#e3a65b','#71b6da','#b68de0'][i%3]})),
      {data:[CLOSURE_THRESHOLD_CM2,CLOSURE_THRESHOLD_CM2],xs:[0,1],color:'#838c96'},
    ],pct,0,Math.ceil(maxArea*4)/4,{xStart:'Onset',xEnd:duration().toFixed(2)+' s',unit:'cm²'});
  }else plotLines('constriction',[],null,0,1,{xStart:'Onset',xEnd:duration().toFixed(2)+' s'});
}
function renderNames(){
 const selected=channels(speaker.names,Math.min(6,speaker.names.length));
 $('channels').innerHTML=selected.map(v=>`<span><b class="key" style="background:${v.color}"></b>${v.name}</span>`).join('');
 $('state-label').textContent=`${speaker.names.length} parameter dimensions · first ${selected.length} plotted`;
}
async function run(){
 requireVTL();
 pausePlayback();clearAudio();const seq=++requestId;
 const btn=$('run');btn.disabled=true;nativeResult=null;acousticSpec=null;constrictionData=[];
 $('closure-report').textContent='Waiting for VTL acoustic and tract calculations…';
 $('wav').disabled=true;$('audio').disabled=true;
 const model=$('model').value,phrase=$('phrase').value;
 try{
  $('description').textContent=descriptions[model];
  if(speaker.isNative){
   nativePlayer.clear('Computing VocalTractLab sensory control and animation…');
   message(`Generating VTL audio, sensory feedback and geometry using ${speaker.kind}…`);
   const geometryFps=Number($('geometry-fps').value);
   let response;
   if(speaker.kind==='wasm') {
     const result=await wasmClient.simulate(model,phrase,config(),{geometry:true,geometryFps});
     simulation=result.simulation;response=result.output;
   }else{
     simulation=simulate(model,phrase,speaker,config());
     const trajectory=simulation.frames.map(f=>({t:f.t,x:f.x}));
     const referenceTargets=simulation.score.gestures.filter(g=>g.kind==='stop').map(g=>
       ({phone:g.phone,context:g.context,source:g.source,x:g.target}));
     const res=await fetch('/api/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({frames:trajectory,geometry:true,geometryFps,referenceTargets})});
     response=await res.json();
     if(!res.ok)throw Error(response.error||'VTL synthesis failed');
   }
   if(seq!==requestId)return;
   nativeResult=response;nativePlayer.load(response.svgs||[]);renderNames();
   try{acousticSpec=spectrogram(decodeWavBase64(response.audioBase64));}
   catch(err){acousticSpec=null;console.warn('VTL spectrogram unavailable:',err);}
   constrictionData=constrictionSeries(response.geometry||[]);
   const stops=assessStops(simulation,response.geometry||[]);
    const report=stops.map(stop=>{
      const place=stop.sitePosition===null?'unknown':`${(100*stop.sitePosition).toFixed(0)}% of tract`;
      const min=stop.minimumArea_cm2===null?'n/a':stop.minimumArea_cm2.toFixed(3)+' cm²';
      const hold=stop.closureDuration_s===null?'n/a':Math.round(1000*stop.closureDuration_s)+' ms';
      const release=stop.releaseTime_s===null?'not detected':stop.releaseTime_s.toFixed(3)+' s';
      return `/${stop.phone}/ at ${place}: minimum ${min}; longest hold ${hold}; release ${release}; ${stop.status}`;
    });
   $('closure-report').textContent=report.length?report.join(' · '):'Vowel-only sequence; no stop closure targets.';
   $('audio').disabled=false;$('wav').disabled=false;
   $('geometry-label').textContent=`${response.svgs.length} VTL anatomical frames (${response.geometryFps} fps target)`;
   $('area-label').textContent=`VTL · ${speaker.tubeSections} sections`;
   message(`VTL (${speaker.kind}): ${response.sampleRate} Hz audio · ${response.audioDuration.toFixed(2)} s · ${response.svgs.length} tract frames. Press “Play speech + animation”.`);
   draw(0);
  }
 }catch(e){if(seq===requestId){nativeResult=null;acousticSpec=null;constrictionData=[];nativePlayer.clear('VTL synthesis or geometry failed.');$('audio').disabled=true;$('wav').disabled=true;message('Error: '+e.message);}}
 finally{if(seq===requestId)btn.disabled=false;}
}
function playStep(ts){
 if(!playing||!simulation)return;
 const t=timeline==='audio' && activeAudio ? activeAudio.currentTime : playOffset+(ts-started)/1000;
 draw(Math.min(duration(),t));
 if(t>=duration()-0.002 || (timeline==='audio'&&activeAudio?.ended)){
   pausePlayback();draw(duration());return;
 }
 animation=requestAnimationFrame(playStep);
}
function silentPlay(){
 if(!simulation)return;
 if(playing && timeline==='silent'){pausePlayback();return;}
 pausePlayback();let t=Number($('scrub').value)/1000*duration();if(t>=duration()-.005)t=0;
 playOffset=t;started=performance.now();timeline='silent';playing=true;$('play').textContent='Pause animation';
 animation=requestAnimationFrame(playStep);
}
function wavBlob(){const bin=atob(nativeResult.audioBase64),array=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)array[i]=bin.charCodeAt(i);return new Blob([array],{type:'audio/wav'});}
function getAudio(){
 if(activeAudio)return activeAudio;
 audioURL=URL.createObjectURL(wavBlob());activeAudio=new Audio(audioURL);activeAudio.preload='auto';
 activeAudio.addEventListener('ended',()=>{pausePlayback();draw(duration());});
 activeAudio.addEventListener('error',()=>{pausePlayback();message('VTL audio playback failed.');});
 return activeAudio;
}
async function speechPlay(){
 if(!nativeResult)return;
 if(playing && timeline==='audio'){pausePlayback();return;}
 pausePlayback();const audio=getAudio();
 let t=Number($('scrub').value)/1000*duration();if(t>=audio.duration-.01 || t>=duration()-.005)t=0;
 audio.currentTime=t;timeline='audio';playing=true;$('audio').textContent='Pause speech + animation';
 // This starts in the user click handler. requestAnimationFrame reads
 // audio.currentTime to avoid drifting against the sound hardware clock.
 try{await audio.play();animation=requestAnimationFrame(playStep);}catch(e){playing=false;message('Audio permission/playback error: '+e.message);}
}
$('play').onclick=silentPlay;
$('audio').onclick=()=>{void speechPlay()};
$('scrub').addEventListener('input',()=>{
 if(!simulation)return;pausePlayback();const t=Number($('scrub').value)/1000*duration();
 if(activeAudio && Number.isFinite(activeAudio.duration) && t<activeAudio.duration)activeAudio.currentTime=t;
 draw(t);
});
$('run').onclick=()=>{if(speaker)void run()};
$('model').addEventListener('change',()=>{if(speaker)void run()});$('phrase').addEventListener('change',()=>{if(speaker)void run()});
$('geometry-fps').addEventListener('change',()=>{if(speaker)void run()});
$('engine').addEventListener('change',()=>{const e=$('engine').value;speaker=e==='wasm'?wasm:native;setEngineDetails();void run()});
$('compare').onclick=()=>{void compare().catch(e=>message(e.message))};
$('compare-vtl').onclick=()=>{void comparePhysical()};
$('experiment').onclick=()=>{void perturbationExperiment()};
$('bench-csv').onclick=()=>{if(benchmarkRows.length){const cols=['model','trackingRms','effort','minOralArea','closures','stops','maxClosureHold_s','audioRms'];fileDownload('vtl-controller-benchmark.csv',[cols.join(','),...benchmarkRows.map(r=>cols.map(k=>r[k]??'').join(','))].join('\n'),'text/csv')}};
$('download').onclick=()=>{if(simulation&&speaker)fileDownload(`cognitive_speech_models-${simulation.model}.csv`,csvOutput(simulation,speaker),'text/csv')};
$('all-csv').onclick=()=>{void compare().then(sims=>{const csv=sims.map((s,i)=>csvOutput(s,speaker).split('\n').slice(i?1:0).join('\n')).join('\n');fileDownload('cognitive_speech_models-comparison.csv',csv,'text/csv')}).catch(e=>message(e.message))};
$('wav').onclick=()=>{if(nativeResult)fileDownload('cognitive_speech_models-vtl.wav',wavBlob(),'audio/wav')};
$('reconnect').onclick=()=>{void connect()};
fileView();await connect();

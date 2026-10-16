import {PHRASES} from './motor/gestures.js';
import {simulate,csvOutput} from './sim/runner.js';
import {CONTROLLERS} from './cognitive/registry.js';
import {plotLines,plotArea,channels} from './view/plot.js';
import {NativeTractAnimation,nearestTimestampIndex} from './view/native-animation.js';
import {BrowserVTLClient} from './engine/wasm-client.js';

const $=id=>document.getElementById(id);
const SOURCES=['src/engine/wasm-client.js','src/engine/wasm-worker.js','src/engine/wasm-runtime.js','scripts/build_vtl_wasm.py','docs/webassembly.md','src/app.js','src/motor/plant.js','src/view/native-animation.js','src/motor/gestures.js','src/cognitive/registry.js','src/cognitive/diva.js','src/cognitive/godiva.js','src/cognitive/geppeto.js','src/cognitive/task-dynamics.js','src/sim/runner.js','src/view/plot.js','server/vtl.py','server/app.py','scripts/launch.py','docs/models.md','docs/deployment.md','docs/embedded-vtl.md','docs/vtl-setup.md','docs/validation.md'];
const specs=[['rate','Speech rate',.6,1.8,.1,1,'×'],['overlap','Gesture overlap',0,.8,.05,.3,''],['feedback','Auditory feedback gain',0,1.8,.1,.8,''],['somatosensory','Somatosensory gain',0,1.8,.1,.5,''],['delay','Feedback delay',0,180,10,60,' ms'],['perturbation','Auditory perturbation (proxy)',-200,200,20,0,' Hz'],['noise','Motor noise',0,.3,.02,.02,''],['stiffness','Plant stiffness',.6,2,.1,1,'×'],['seed','Random seed',1,99,1,17,'']];
let native=null,wasm=null,speaker=null,simulation=null,nativeResult=null;
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
 for(const id of ['run','play','compare','all-csv','download','model','phrase','geometry-fps','scrub'])$(id).disabled=!ready;
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
     if(status.appVersion!=='0.8.1')throw Error(`Unexpected server version: ${status.appVersion||'unknown'}. Restart scripts/launch.py from the updated project.`);
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
 diva:'Feedforward motor target with delayed auditory and somatosensory correction. Auditory error is a normalized-coordinate proxy rather than a learned acoustic prediction.',
 godiva:'Competitive activation and serial selection, followed by the same DIVA-inspired sensorimotor controller.',
 geppeto:'Local quadratic target tracking with movement/effort regularization. No finite-element muscles or GEPPETO horizon-wide optimizer.',
 td:'Overlap between gestures and critically damped task attractors. The articulatory task Jacobian is approximated by identity.'
};
function updatePhraseAvailability(){
 if(!speaker)return;
 const p=$('phrase');for(const opt of p.options){const phones=PHRASES[opt.value].phones;opt.disabled=phones.some(k=>!speaker.shapes[k]);}
 if(p.selectedOptions[0]?.disabled)p.value='aia';
}
function setEngineDetails(){
 if(!speaker)return;
 updatePhraseAvailability();
 $('quality').textContent=speaker.kind==='wasm'
   ?'VocalTractLab WebAssembly is experimental; native/WASM equivalence is unverified. Controller dynamics are reduced-order, theory-inspired approximations.'
   :'Geometry, tube areas and sound come from native VocalTractLab. Controller dynamics are reduced-order, theory-inspired approximations.';
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
 $('comparison').innerHTML=html+'</tbody></table><p class="mini">Metrics use normalized coordinates; not human-data benchmarks.</p>';
}
function compare(){requireVTL();const sims=Object.keys(CONTROLLERS).map(m=>simulate(m,$('phrase').value,speaker,config()));metricsTable(sims);return sims;}
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
}
function renderNames(){
 const selected=channels(speaker.names,Math.min(6,speaker.names.length));
 $('channels').innerHTML=selected.map(v=>`<span><b class="key" style="background:${v.color}"></b>${v.name}</span>`).join('');
 $('state-label').textContent=`${speaker.names.length} parameter dimensions · first ${selected.length} plotted`;
}
async function run(){
 requireVTL();
 pausePlayback();clearAudio();const seq=++requestId;
 const btn=$('run');btn.disabled=true;nativeResult=null;
 $('wav').disabled=true;$('audio').disabled=true;
 const model=$('model').value,phrase=$('phrase').value;
 try{
  simulation=simulate(model,phrase,speaker,config());$('description').textContent=descriptions[model];
  renderNames();draw(0);message('Articulatory trajectory generated.');
  if(speaker.isNative){
   nativePlayer.clear('Computing VocalTractLab vector animation…');
   message(`Generating VTL audio and anatomical animation using ${speaker.kind}…`);
   const trajectory=simulation.frames.map(f=>({t:f.t,x:f.x}));
   const geometryFps=Number($('geometry-fps').value);
   let response;
   if(speaker.kind==='wasm') {
     response=await wasmClient.synthesize(trajectory,{geometry:true,geometryFps});
   }else{
     const res=await fetch('/api/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({frames:trajectory,geometry:true,geometryFps})});
     response=await res.json();
     if(!res.ok)throw Error(response.error||'VTL synthesis failed');
   }
   if(seq!==requestId)return;
   nativeResult=response;nativePlayer.load(response.svgs||[]);
   $('audio').disabled=false;$('wav').disabled=false;
   $('geometry-label').textContent=`${response.svgs.length} VTL anatomical frames (${response.geometryFps} fps target)`;
   $('area-label').textContent=`VTL · ${speaker.tubeSections} sections`;
   message(`VTL (${speaker.kind}): ${response.sampleRate} Hz audio · ${response.audioDuration.toFixed(2)} s · ${response.svgs.length} tract frames. Press “Play speech + animation”.`);
   draw(0);
  }
 }catch(e){if(seq===requestId){nativeResult=null;nativePlayer.clear('VTL synthesis or geometry failed.');$('audio').disabled=true;$('wav').disabled=true;message('Error: '+e.message);}}
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
$('compare').onclick=()=>{try{compare()}catch(e){message(e.message)}};
$('download').onclick=()=>{if(simulation&&speaker)fileDownload(`cognitive_speech_models-${simulation.model}.csv`,csvOutput(simulation,speaker),'text/csv')};
$('all-csv').onclick=()=>{const sims=compare();const csv=sims.map((s,i)=>csvOutput(s,speaker).split('\n').slice(i?1:0).join('\n')).join('\n');fileDownload('cognitive_speech_models-comparison.csv',csv,'text/csv')};
$('wav').onclick=()=>{if(nativeResult)fileDownload('cognitive_speech_models-vtl.wav',wavBlob(),'audio/wav')};
$('reconnect').onclick=()=>{void connect()};
fileView();await connect();

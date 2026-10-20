import {PHRASES} from './motor/gestures.js';
import {csvOutput} from './sim/runner.js';
import {plotLines,plotArea,channels} from './view/plot.js';
import {NativeTractAnimation,nearestTimestampIndex} from './view/native-animation.js';
import {BrowserVTLClient} from './engine/wasm-client.js';
import {decodeWavBase64,spectrogram} from './sim/diagnostics.js';
import {plotSpectrogram} from './view/plot.js';
import {CLOSURE_THRESHOLD_CM2} from './sim/closure-analysis.js';
import {buildClosureDiagnostics} from './sim/closure-presentation.js';
import {sweepConditions,pairedF1Response,pairedF1Csv,sweepCsv} from './sim/gain-sweep.js';
import {responseWindows} from './sim/response-windows.js';

const $=id=>document.getElementById(id);
const specs=[['rate','Speech rate',.6,1.8,.1,1,'×'],['overlap','Gesture overlap',0,.8,.05,.3,''],['coupling','Gestural coupling',0,1,.05,.35,''],['taskOmega','Task stiffness (ω)',3,12,.5,5.5,' rad/s'],['feedback','Auditory feedback gain',0,1.8,.1,0,''],['somatosensory','Somatosensory gain',0,1.8,.1,.5,''],['delay','Auditory feedback delay',0,180,10,60,' ms'],['perturbation','Shift of heard F1',-200,200,20,0,' Hz'],['perturbationOnsetMs','Auditory shift onset',0,800,50,300,' ms'],['noise','Motor noise',0,.3,.02,.02,''],['stiffness','Plant stiffness',.6,2,.1,1,'×'],['feedforwardScale','DIVA feedforward strength',.3,1.5,.1,1,'×'],['seed','Random seed',1,99,1,17,'']];
let wasm=null,speaker=null,simulation=null,nativeResult=null;
let acousticSpec=null,constrictionData=[],sweepRows=[],perturbationCsvText="",authorityCsvText="",balanceCsvText="";
const wasmClient=new BrowserVTLClient({onProgress: phase => {
  $('engine-status').textContent='VocalTractLab: '+phase;
  console.info('[VTL]',phase);
}});
let playing=false,animation=null,started=0,playOffset=0,timeline='silent';
let activeAudio=null,audioURL=null,requestId=0;
const nativePlayer=new NativeTractAnimation($('native-geometry'));

for(const [key,name,min,max,step,def,suffix] of specs){
 const el=document.createElement('div');el.className='slider';
 el.innerHTML=`<label for="${key}">${name}<output id="${key}-value">${def}${suffix}</output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${def}">`;
 (['rate','feedback'].includes(key)?$('sliders'):$('advanced-sliders')).append(el);
 $(key).addEventListener('input',()=>{$(key+'-value').textContent=$(key).value+suffix;});
 $(key).addEventListener('change',()=>{if(speaker)void run()});
}
function config(){return {...Object.fromEntries(specs.map(([k])=>[k,Number($(k).value)])),
  divaMode:$('diva-mode')?.value||'learned'};}
function showModelControls(){
 const model=$('model').value;
 for(const el of document.querySelectorAll('[data-model]'))
   el.hidden=el.dataset.model!=='all'&&el.dataset.model!==model;
 $('learning-tools').hidden=model!=='diva';
 $('description').textContent=descriptions[model];
}
function message(text){$('audio-status').textContent=text;}
function requireVTL(){
 if(speaker?.kind!=='wasm')throw new Error('VocalTractLab WebAssembly is not connected.');
}
function setConnected(ready){
 for(const [key] of specs)$(key).disabled=!ready;
 for(const id of ['run','play','download','model','phrase','scrub','experiment','sweep-test','calibration-test','authority-test','balance-test'])$(id).disabled=!ready;
 $('audio').disabled=!ready||!nativeResult;
 $('wav').disabled=!ready||!nativeResult;
 $('perturbation-csv').disabled=!ready||!perturbationCsvText;
}
async function connect(){
 pausePlayback();clearAudio();++requestId;
 speaker=null;simulation=null;nativeResult=null;wasm=null;wasmClient.close();
 nativePlayer.clear('Loading VocalTractLab…');plotArea(null);
 setConnected(false);$('reconnect').disabled=true;
 $('engine-status').dataset.state='connecting';$('engine-status').classList.remove('ready');
 $('engine-status').textContent='Loading VocalTractLab…';
 try{
   if(!await wasmClient.available())throw Error('VTL WebAssembly files are missing. Run the GitHub Pages build first.');
   wasm=await wasmClient.init();speaker=wasm;
   updatePhraseAvailability();showModelControls();
   $('engine-status').textContent=`VocalTractLab ready · ${speaker.names.length} tract parameters`;
   $('engine-status').dataset.state='ready';$('engine-status').classList.add('ready');
   setConnected(true);await run();
 }catch(error){$('engine-status').dataset.state='error';$('engine-status').textContent='VTL startup failed: '+error.message;nativePlayer.clear('VTL unavailable');console.error(error);}
 finally{$('reconnect').disabled=false;}
}
const descriptions={
 diva:'DIVA-inspired: locally learned VTL sensory inverse maps, sensory target ranges, and separate feedforward/feedback commands. The neural learning model is reduced-order.',
 td:'Task Dynamics-inspired: coupled gestural timing, VTL tube-derived tract variables, and damped task-space attractors.'};
function updatePhraseAvailability(){
 if(!speaker)return;
 for(const option of $('phrase').options){
   option.disabled=PHRASES[option.value].phones.some((phone,i,phones)=>{
     if(!'ptk'.includes(phone))return !speaker.shapes[phone];
     let context='a';for(let j=i+1;j<phones.length;j++)if('aiu'.includes(phones[j])){context=phones[j];break;}
     return !speaker.shapes[`${phone}:${context}`]&&!speaker.shapes[phone];
   });
 }
 if($('phrase').selectedOptions[0]?.disabled)$('phrase').value='aia';
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
// Controlled within-controller perturbation experiment. Both trajectories use
// identical targets, settings and RNG seed, changing perceived F1 only.
async function perturbationExperiment(){
  if(speaker?.kind!=='wasm')throw Error('Requires the browser VTL sensory observer');
  const button=$('experiment'),cfg=config(),phrase=$('phrase').value,model=$('model').value;
  const onset=cfg.perturbationOnsetMs/1000;
  const shift=cfg.perturbation===0?150:cfg.perturbation;
  button.disabled=true;perturbationCsvText='';$('perturbation-csv').disabled=true;
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
    const paired=pairedF1Response(baseline,altered,{onsetMs:cfg.perturbationOnsetMs,shiftHz:shift});
    const windows=responseWindows(baseline,altered,{onsetMs:cfg.perturbationOnsetMs,shiftHz:shift});
    perturbationCsvText=pairedF1Csv(baseline,altered,{onsetMs:cfg.perturbationOnsetMs,shiftHz:shift,model,phrase,seed:cfg.seed,feedback:cfg.feedback,delayMs:cfg.delay});
    $('perturbation-csv').disabled=false;
    const max=Math.max(.001,...change);
    plotLines('experiment-plot',[{data:change,color:'#74bcd4'},
      {data:[0,0],xs:[onset/Math.max(.001,duration()),onset/Math.max(.001,duration())],color:'#aaa'}],null,0,max*1.15,
      {xStart:'Start',xEnd:baseline.frames.at(-1).t.toFixed(2)+' s'});
    $('experiment-report').textContent=`${model}: ${shift>0?'+':''}${shift} Hz shift in perceived F1 starting at ${onset.toFixed(2)} s. Paired normalized articulatory RMS divergence: ${rms.toFixed(5)}; mean change in VTL tract-predicted F1: ${meanHz===null?'not estimable':meanHz.toFixed(1)+' Hz'}. No difference is expected for controllers without effective auditory feedback. Across the entire post-shift utterance, compensation (may include later vowels): ${paired.compensationHz===null?'not estimable':paired.compensationHz.toFixed(1)+' Hz'}; valid observer samples: ${paired.validSamples}. During /${windows.testVowel||'?'} / (from ${(windows.lateStart_s).toFixed(2)} to ${windows.testVowelEnd_s.toFixed(2)} s): ${windows.duringVowel.compensationHz===null?'F1 unresolved':windows.duringVowel.compensationHz.toFixed(2)+' Hz'} compensation from ${windows.duringVowel.validF1}/${windows.duringVowel.observations} new observer samples. ${windows.afterVowel?'Following-vowel compensation: '+(windows.afterVowel.compensationHz===null?'unresolved':windows.afterVowel.compensationHz.toFixed(2)+' Hz')+'.':''} A shift in perceived F1 is not a change in emitted audio; these are exploratory controller responses, not human compensation estimates.`;
  }catch(e){$('experiment-report').textContent='Perturbation experiment failed: '+e.message;}
  finally{button.disabled=false;}
}
async function runAuthority(){
 const button=$('authority-test'),report=$('authority-report');
 button.disabled=true;$('authority-csv').disabled=true;authorityCsvText='';
 report.textContent='Measuring local F1 authority with VTL…';
 try{
   const rows=await wasmClient.f1Authority();
   const entries=rows.flatMap(r=>r.slopes.map(s=>({vowel:r.phone,F1_Hz:r.baselineF1??'',parameter:s.parameter,slope_Hz_per_normalized_unit:s.slopeHzPerUnit??''})));
   authorityCsvText=['vowel,F1_Hz,parameter,slope_Hz_per_normalized_unit',...entries.map(e=>Object.values(e).join(','))].join('\n');
   report.innerHTML='<table><thead><tr><th>Vowel</th><th>Reference F1</th><th>JA</th><th>TCX</th><th>TCY</th><th>LD</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>/'+r.phone+'/</td><td>'+(r.baselineF1?.toFixed(1)??'unresolved')+'</td>'+r.slopes.map(s=>'<td>'+(s.slopeHzPerUnit?.toFixed(0)??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>Slopes are local VTL derivatives in Hz per normalized tract parameter. Missing or inconsistent resonances are not replaced with guesses. This does not calibrate a learned DIVA auditory map.</p>';
   $('authority-csv').disabled=false;
 }catch(error){report.textContent='F1 sensitivity failed: '+error.message;}
 finally{button.disabled=false;}
}

async function runBalanceSweep(){
 const button=$('balance-test'),report=$('balance-report'),cfg=config();
 button.disabled=true;$('balance-csv').disabled=true;balanceCsvText='';
 const rows=[];
 try{
  const shift=cfg.perturbation===0?150:cfg.perturbation;
  for(const scale of [.5,.75,1])for(const gain of [0,.2]){
   report.textContent=`Running VTL simulations: feedforward ×${scale}, auditory gain ${gain}…`;
   const baseCfg={...cfg,feedforwardScale:scale,feedback:gain,perturbation:0};
   const base=await wasmClient.simulateOnly('diva',$('phrase').value,baseCfg);
   const shifted=await wasmClient.simulateOnly('diva',$('phrase').value,{...baseCfg,perturbation:shift});
   const response=pairedF1Response(base,shifted,{onsetMs:cfg.perturbationOnsetMs,shiftHz:shift});
   rows.push({feedforwardScale:scale,feedback:gain,shiftHz:shift,
     compensationHz:response.compensationHz,validSamples:response.validSamples,
     trackingRms:shifted.metrics.normalizedTrackingRMS,
     motorEffort:shifted.metrics.effortMean});
  }
  const columns=['feedforwardScale','feedback','shiftHz','compensationHz','validSamples','trackingRms','motorEffort'];
  balanceCsvText=[columns.join(','),...rows.map(r=>columns.map(k=>r[k]??'').join(','))].join('\n');
  report.innerHTML='<table><thead><tr><th>FF scale</th><th>Aud. gain</th><th>Compensation</th><th>Valid F1</th><th>Tracking RMS</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.feedforwardScale+'</td><td>'+r.feedback+'</td><td>'+(r.compensationHz?.toFixed(2)??'unresolved')+' Hz</td><td>'+r.validSamples+'</td><td>'+r.trackingRms.toFixed(3)+'</td></tr>').join('')+'</tbody></table><p>Paired VTL-predicted F1 changes across the post-perturbation utterance; lower feedforward strength may worsen target tracking. These outcomes are diagnostics, not fitted compensation.</p>';
  $('balance-csv').disabled=false;
 }catch(e){report.textContent='Balance experiment failed: '+e.message;}
 finally{button.disabled=false;}
}

// VTL calibration is an independent observer check, not an estimated human norm.
async function runCalibration(){
  const out=$('calibration-report'),button=$('calibration-test');
  if(speaker?.kind!=='wasm'){
    out.textContent='Calibration requires the browser WebAssembly VTL transfer function.';return;
  }
  button.disabled=true;out.textContent='Measuring /a/, /i/ and /u/ from the loaded VTL speaker…';
  try{
    const rows=await wasmClient.calibrate();
    const table=rows.map(r=>`<tr><td>/${r.phone}/</td><td>${r.formantsHz.map(x=>Number.isFinite(x)?Math.round(x):'unresolved').join(' / ')}</td><td>${r.errorsHz.map(x=>Number.isFinite(x)?x.toFixed(2):'—').join(' / ')}</td><td>${r.resolved<3?'Incomplete ('+r.resolved+'/3)':r.zeroError?'Repeatable':'Inconsistent'}</td><td>${(r.lowBandCandidatesHz||[]).map(x=>Math.round(x)).join(' / ')||'—'}</td></tr>`).join('');
    out.innerHTML=`<table><thead><tr><th>Vowel</th><th>VTL F1/F2/F3 (Hz)</th><th>Re-measurement error (Hz)</th><th>Consistency</th><th>Low-band candidates (Hz)</th></tr></thead><tbody>${table}</tbody></table><p>Reference formants are computed from each loaded speaker shape. A repeatable result indicates numerical consistency, not phonetic accuracy. Low-band candidates come from a finer-resolution VTL transfer-function spectrum and are not validated F1 measurements. Unresolved peaks or unusually high F2 require independent spectral validation.</p>`;
  }catch(error){out.textContent='Calibration failed: '+error.message;}
  finally{button.disabled=false;}
}

async function runGainSweep(){
  const out=$('sweep-report'),button=$('sweep-test');
  if(speaker?.kind!=='wasm'){
    out.textContent='The gain/delay sweep requires browser VTL WebAssembly.';return;
  }
  const cfg=config(),model=$('model').value,phrase=$('phrase').value;
  const list=sweepConditions(cfg);
  button.disabled=true;$('sweep-csv').disabled=true;sweepRows=[];
  try{
    for(const [i,item] of list.entries()){
      out.textContent=`Running ${i+1}/${list.length}: gain ${item.feedback}, delay ${item.delay} ms…`;
      const baseline=await wasmClient.simulateOnly(model,phrase,item.cfg);
      sweepRows.push({controller:model,phrase,feedback:item.feedback,delay:item.delay,
        trackingRms:baseline.metrics.normalizedTrackingRMS,effort:baseline.metrics.effortMean});
    }
    const table=sweepRows.map(r=>`<tr><td>${r.feedback.toFixed(1)}</td><td>${r.delay}</td><td>${r.trackingRms.toFixed(4)}</td><td>${r.effort.toFixed(1)}</td></tr>`).join('');
    out.innerHTML=`<table><thead><tr><th>Gain</th><th>Delay ms</th><th>Tracking RMS</th><th>Motor effort</th></tr></thead><tbody>${table}</tbody></table><p>Unperturbed, one seed; lower tracking error is not necessarily better perceptual speech. The separate paired F1 experiment tests compensation.</p>`;
    $('sweep-csv').disabled=false;
  }catch(error){out.textContent='Gain/delay sweep failed: '+error.message;}
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
 pausePlayback();clearAudio();perturbationCsvText='';$('perturbation-csv').disabled=true;const seq=++requestId;
 const btn=$('run');btn.disabled=true;nativeResult=null;acousticSpec=null;constrictionData=[];
 $('closure-report').textContent='Waiting for VTL acoustic and tract calculations…';
 $('wav').disabled=true;$('audio').disabled=true;
 const model=$('model').value,phrase=$('phrase').value;
 try{
  showModelControls();
  const geometryFps=24;
  message('Computing VTL waveform, geometry, and sensory diagnostics…');
  const result=await wasmClient.simulate(model,phrase,config(),{geometry:true,geometryFps});
  simulation=result.simulation;
  const response=result.output;
  if(seq!==requestId)return;
  nativeResult=response;nativePlayer.load(response.svgs||[]);renderNames();
  try{acousticSpec=spectrogram(decodeWavBase64(response.audioBase64));}
  catch(err){acousticSpec=null;console.warn('VTL spectrogram unavailable:',err);}
  const closure=buildClosureDiagnostics(simulation,response);
  constrictionData=closure.series;
  $('closure-report').textContent=closure.report;
  $('audio').disabled=false;$('wav').disabled=false;
  $('geometry-label').textContent=`${response.svgs.length} VTL frames`;
  $('area-label').textContent=`${speaker.tubeSections} tube sections`;
  message(`VocalTractLab · ${response.sampleRate} Hz · ${response.audioDuration.toFixed(2)} s`);
  draw(0);
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
$('model').addEventListener('change',()=>{showModelControls();if(speaker)void run()});$('phrase').addEventListener('change',()=>{if(speaker)void run()});
$('experiment').onclick=()=>{void perturbationExperiment()};
$('perturbation-csv').onclick=()=>{if(perturbationCsvText)fileDownload('vtl-paired-f1-perturbation.csv',perturbationCsvText,'text/csv')};
$('sweep-test').onclick=()=>{void runGainSweep()};
$('sweep-csv').onclick=()=>{if(sweepRows.length)fileDownload('vtl-gain-delay-sweep.csv',sweepCsv(sweepRows),'text/csv')};
$('calibration-test').onclick=()=>{void runCalibration()};
$('download').onclick=()=>{if(simulation&&speaker)fileDownload(`cognitive_speech_models-${simulation.model}.csv`,csvOutput(simulation,speaker),'text/csv')};
$('wav').onclick=()=>{if(nativeResult)fileDownload('cognitive_speech_models-vtl.wav',wavBlob(),'audio/wav')};
$('authority-test').onclick=()=>{void runAuthority()};
$('balance-test').onclick=()=>{void runBalanceSweep()};
$('balance-csv').onclick=()=>{if(balanceCsvText)fileDownload('vtl-feedback-feedforward-balance.csv',balanceCsvText,'text/csv')};
$('authority-csv').onclick=()=>{if(authorityCsvText)fileDownload('vtl-local-f1-sensitivity.csv',authorityCsvText,'text/csv')};
$('reconnect').onclick=()=>{void connect()};
$('diva-mode')?.addEventListener('change',()=>{if(speaker&&$('model').value==='diva')void run()});
$('train-diva')?.addEventListener('click',async()=>{
 const output=$('learning-report'),button=$('train-diva');
 button.disabled=true;output.textContent='Exploring VTL tract positions and learning inverse sensorimotor maps…';
 try{
   const rows=await wasmClient.trainDiva({nTrials:64,seed:17});
   output.textContent=rows.map(x=>`/${x.phone}/: learned bands ${x.validBands.map(k=>`F${k+1}`).join(', ')||'none'}, ${x.nTrials} usable samples, inverse-fit RMS ${x.rms?.toFixed(3)??'unresolved'}`).join(' | ');
   if($('model').value==='diva')await run();
 }catch(error){output.textContent='Learning failed: '+error.message;}
 finally{button.disabled=false;}
});
$('practice-diva')?.addEventListener('click',async()=>{
 const output=$('learning-report'),button=$('practice-diva');
 button.disabled=true;output.textContent='Practicing five utterances with feedback-based feedforward updating…';
 try{
   const result=await wasmClient.practiceDiva($('phrase').value,config(),{trials:5});
   output.innerHTML='<table><thead><tr><th>Attempt</th><th>Target error</th><th>Motor effort</th></tr></thead><tbody>'+
     result.summaries.map(s=>`<tr><td>${s.attempt}</td><td>${s.normalizedTrackingRMS.toFixed(4)}</td><td>${s.effortMean.toFixed(1)}</td></tr>`).join('')+
     '</tbody></table><p>Practice updates a stored motor-command template from auditory corrections; it is a simplified learning demonstration, not the original DIVA adaptation rule.</p>';
   if($('model').value==='diva')await run();
 }catch(error){output.textContent='Practice failed: '+error.message;}
 finally{button.disabled=false;}
});
await connect();

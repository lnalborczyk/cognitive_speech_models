#!/usr/bin/env python3
"""Experimental v1.6 DIVA/Task Dynamics validation against real VTL WebAssembly.

Requires a deployed v1.6+ application with getResearchEngineForValidation()
exported by src/app.js. Does not use synthetic acoustics, mock geometry, or
model-validity pass thresholds. Technical invariants are strict; scientific
results are recorded regardless of whether their values look plausible.

Examples:
    python scripts/validate_v16_models.py --url https://USER.github.io/cognitive_speech_models/ --artifacts artifacts/v16-models
    python scripts/validate_v16_models.py --url http://127.0.0.1:5173/ --artifacts artifacts/local-models
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import traceback
from pathlib import Path
from typing import Any

DEFAULT_URL = 'https://lnalborczyk.github.io/cognitive_speech_models/'
PHRASES = ('apa', 'ata', 'aka')
OVERLAPS = (0.15, 0.65)
MODES = ('numerical', 'learned')
SHIFTS = (150, -150)


def finite(x: Any) -> float | None:
    try:
        n = float(x)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def validate_version(text: str, minimum=(1, 6, 0)) -> tuple[int, int, int]:
    match = re.search(r'(?<!\d)(\d+)\.(\d+)\.(\d+)(?!\d)', text)
    if not match:
        raise RuntimeError(f'Cannot identify deployed app version: {text!r}')
    version = tuple(map(int, match.groups()))
    if version < minimum:
        raise RuntimeError(
            f'v{version[0]}.{version[1]}.{version[2]} is deployed; '
            'DIVA learning and VTL task-space experiments require v1.6.0 or later. '
            'Deploy the v1.6 update before running this workflow.'
        )
    return version


def validate_closure(report: dict, phrase: str) -> dict:
    records = report.get('closures', [])
    expected = {'apa': 'p', 'ata': 't', 'aka': 'k'}[phrase]
    if len(records) != 1 or records[0].get('phone') != expected:
        raise AssertionError(f'Wrong or missing /{expected}/ stop analysis in {phrase}: {records!r}')
    item = records[0]
    if finite(item.get('sitePosition')) is None:
        raise AssertionError(f'Missing VTL-derived closure location for {phrase}: {item!r}')
    if finite(item.get('referenceArea_cm2')) is None:
        raise AssertionError(f'Missing speaker closure reference area for {phrase}')
    if not report.get('geometrySamples') or report['geometrySamples'] < 10:
        raise AssertionError(f'Too few real VTL area measurements for {phrase}')
    # Whether closure is actually achieved is a measured scientific result.
    return item


def validate_dynamics_zero_gain(rows: list[dict], *, tolerance=1e-7) -> None:
    if not rows:
        raise AssertionError('No zero-feedback negative-control measurements')
    for r in rows:
        d = finite(r.get('maxMotorDifference'))
        if d is None or abs(d) > tolerance:
            raise AssertionError(f'Zero-gain auditory perturbation altered motor output: {r}')


def validate_pair(report: dict, *, tolerance=1e-7) -> dict:
    observations = report.get('timeseries', [])
    if not observations:
        raise AssertionError('Empty paired VTL F1 trajectory')
    onset = report['onset_s']
    premature = [finite(r.get('motor_difference')) for r in observations
                 if finite(r.get('time_s')) is not None and r['time_s'] < onset]
    premature = [x for x in premature if x is not None]
    if not premature or max(premature) > tolerance:
        raise AssertionError(f'Articulatory divergence precedes perturbation onset: {report}')
    if finite(report.get('trackingRms')) is None:
        raise AssertionError('Missing finite tracking RMS')
    return {
        'valid_observer_samples': sum(finite(r.get('delta_F1_Hz')) is not None for r in observations
                                      if r.get('observer_update')),
        'max_pre_onset_motor_difference': max(premature),
    }


def write_csv(path: Path, rows: list[dict], columns: list[str] | None = None) -> None:
    rows = list(rows)
    if not rows:
        path.write_text('', encoding='utf-8')
        return
    columns = columns or list(dict.fromkeys(k for r in rows for k in r))
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: ('' if v is None else v) for k, v in row.items()})


def init_browser_client(page, timeout: int) -> str:
    page.wait_for_function("""() => {
      const s=document.querySelector('#engine-status');
      return s?.dataset.state==='ready' || s?.dataset.state==='error';
    }""", timeout=timeout)
    state = page.locator('#engine-status').get_attribute('data-state')
    if state != 'ready':
        raise RuntimeError('VTL browser initialization failed: ' + page.locator('#engine-status').inner_text())
    if page.locator('#engine').input_value() != 'wasm':
        raise RuntimeError('Unexpected non-WebAssembly engine')
    page.wait_for_function("""() => {
      const a=document.querySelector('#audio-status')?.textContent||'';
      return !document.querySelector('#wav')?.disabled || a.startsWith('Error:');
    }""", timeout=timeout)
    if page.locator('#wav').is_disabled():
        raise RuntimeError('Initial VTL waveform failed: '+page.locator('#audio-status').inner_text())
    # Reuse the app's initialized Worker; otherwise two VTL libraries could
    # double memory use and cause unrelated browser crashes.
    return page.evaluate(r"""async () => {
      const source=[...document.querySelectorAll('script[type="module"]')]
        .map(el=>el.textContent||'').find(text=>text.includes('./src/app.js'));
      const match=source?.match(/import\(['\"]([^'\"]*src\/app\.js[^'\"]*)['\"]\)/);
      if(!match)throw Error('Could not locate the public app entrypoint');
      const app=await import(match[1]);
      if(typeof app.getResearchEngineForValidation!=='function')
        throw Error('v1.6 validation API unavailable. Deploy source changes before testing.');
      window.__csmResearchClient=app.getResearchEngineForValidation();
      return document.querySelector('.brand small')?.textContent||'';
    }""")


# On-browser computation, using the real VTL worker, returning only the
# required measurements instead of serializing large WAV/SVG payloads.
TASK_SCRIPT = """async ({phrase,overlap}) => {
  const client=window.__csmResearchClient;
  const cfg={rate:1,overlap,coupling:.35,stiffness:1,noise:0,
             feedback:0,seed:17,taskOmega:5.5,taskRegularization:.08};
  const {simulation:s,output:o}=await client.simulate('td',phrase,cfg,{geometry:true,geometryFps:24});
  const {analyzeStops}=await import('./src/sim/closure-analysis.js');
  const closures=analyzeStops(s,o.diagnosticGeometry||o.geometry||[],o.references||[]);
  const trajectory=s.frames.filter((_,i)=>i%8===0).map(f=>({
    time_s:f.t, phone:f.phone,
    lip_aperture_task:f.taskState?.values?.LA??null,
    lip_aperture_goal:f.taskState?.goals?.LA??null,
    tongue_tip_task:f.taskState?.values?.TTCD??null,
    tongue_tip_goal:f.taskState?.goals?.TTCD??null,
    tongue_body_task:f.taskState?.values?.TBCD??null,
    tongue_body_goal:f.taskState?.goals?.TBCD??null
  }));
  return {phrase,overlap,coupling:cfg.coupling,metrics:s.metrics,
    closures,referenceCount:o.references?.length||0,
    geometrySamples:(o.diagnosticGeometry||o.geometry||[]).length,
    gestures:s.score.gestures.map(g=>({phone:g.phone,start:g.start,end:g.end,
      center:g.center,width:g.width,source:g.source})),trajectory};
}"""

TRAIN_SCRIPT = """async ({trials}) => {
  const diagnostics=await window.__csmResearchClient.trainDiva({nTrials:trials,seed:17});
  return diagnostics;
}"""

DIVA_SCRIPT = """async ({mode,shift,feedback}) => {
  const client=window.__csmResearchClient;
  const base={rate:.6,overlap:.3,feedback,noise:0,seed:17,
    somatosensory:.5,somatosensoryDelayMs:40,delay:40,stiffness:1,
    feedforwardScale:1,perturbationOnsetMs:450,
    sensorySafety:true,divaMode:mode,useLearnedProgram:false};
  const first=await client.simulateOnly('diva','ahold',{...base,perturbation:0});
  const second=await client.simulateOnly('diva','ahold',{...base,perturbation:shift});
  if(first.frames.length!==second.frames.length)throw Error('Paired frame counts differ');
  const timeSeries=first.frames.filter((_,i)=>i%8===0).map((a,i)=>{
    const b=second.frames[i*8];
    const f0=a.sensory?.auditory?.[0], f1=b.sensory?.auditory?.[0];
    const d=Number.isFinite(f0)&&Number.isFinite(f1)?f1-f0:null;
    const motor=Math.sqrt(a.x.reduce((sum,v,j)=>sum+(v-b.x[j])**2,0)/a.x.length);
    return {time_s:a.t,observer_update:!!a.sensory?.observerUpdate,
      baseline_F1_Hz:Number.isFinite(f0)?f0:null,
      shifted_F1_Hz:Number.isFinite(f1)?f1:null,
      delta_F1_Hz:d,
      motor_difference:motor,
      mapping:b.control?.mapping||'',
      feedback_status:b.control?.status||'',
      command_rms:b.control?.commandRms??null};
  });
  const late=timeSeries.filter(r=>r.observer_update&&r.time_s>=.85&&r.time_s<=1.85&&r.delta_F1_Hz!==null);
  const compensate=late.length ? -Math.sign(shift)*late.reduce((s,r)=>s+r.delta_F1_Hz,0)/late.length : null;
  const maxMotor=Math.max(...timeSeries.map(r=>r.motor_difference));
  const mappings=[...new Set(timeSeries.map(r=>r.mapping).filter(Boolean))];
  const expectedMapping=mode==='learned'?'VTL-babbling inverse map':'numerical Jacobian';
  if(!mappings.includes(expectedMapping))
    throw Error('Requested '+mode+' map, but motor diagnostics show '+mappings.join(','));
  return {mode,shift,feedback,mappings,onset_s:.45,
    compensation_Hz:compensate,validLateSamples:late.length,
    maxMotorDifference:maxMotor,
    trackingRms:second.metrics.normalizedTrackingRMS,
    motorEffort:second.metrics.effortMean,
    timeseries:timeSeries};
}"""

PRACTICE_SCRIPT = """async ({trials}) => {
  const client=window.__csmResearchClient;
  const base={rate:.6,overlap:.3,feedback:.2,noise:0,seed:17,
    delay:40,somatosensory:.5,somatosensoryDelayMs:40,
    stiffness:1,feedforwardScale:1,perturbationOnsetMs:450,
    divaMode:'learned',sensorySafety:true};
  // Held-out, unperturbed evaluation before learning.
  const pre=await client.simulateOnly('diva','ahold',{
    ...base,feedback:0,perturbation:0,useLearnedProgram:true});
  // Repeated exposure to an altered perceptual F1.
  const practice=await client.practiceDiva('ahold',{
    ...base,perturbation:150,useLearnedProgram:true},{trials,learningRate:.12});
  const post=await client.simulateOnly('diva','ahold',{
    ...base,feedback:0,perturbation:0,useLearnedProgram:true});
  const noMemory=await client.simulateOnly('diva','ahold',{
    ...base,feedback:0,perturbation:0,useLearnedProgram:false});
  const samples=pre.frames.filter((_,i)=>i%8===0).map((a,i)=>{
    const b=post.frames[i*8],c=noMemory.frames[i*8];
    const f=(x)=>Number.isFinite(x?.sensory?.auditory?.[0])?x.sensory.auditory[0]:null;
    const before=f(a),after=f(b),without=f(c);
    return {time_s:a.t,pre_F1_Hz:before,post_F1_Hz:after,
      without_memory_F1_Hz:without,
      delta_F1_Hz:before!==null&&after!==null?after-before:null,
      memory_effect_RMS:Math.sqrt(a.x.reduce((s,v,j)=>s+(v-b.x[j])**2,0)/a.x.length),
      no_memory_difference_RMS:Math.sqrt(a.x.reduce((s,v,j)=>s+(v-c.x[j])**2,0)/a.x.length)};
  });
  const late=samples.filter(r=>r.time_s>=.85&&r.time_s<=1.85&&r.delta_F1_Hz!==null);
  return {nPracticeTrials:trials,nCommands:practice.nCommands,
    trained:practice.trained,practiceSummaries:practice.summaries,
    preMetrics:pre.metrics,postMetrics:post.metrics,
    aftereffect_Hz:late.length?late.reduce((sum,r)=>sum+r.delta_F1_Hz,0)/late.length:null,
    validLateSamples:late.length,
    maxWithoutMemoryDifference:Math.max(...samples.map(r=>r.no_memory_difference_RMS)),
    trajectory:samples};
}"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=DEFAULT_URL)
    parser.add_argument('--artifacts', type=Path, default=Path('artifacts/v16-models'))
    parser.add_argument('--timeout', type=int, default=360000, help='Browser wait timeout per operation in ms')
    parser.add_argument('--practice-trials', type=int, default=5)
    parser.add_argument('--babbling-trials', type=int, default=64)
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=True)

    result: dict[str, Any] = {'url': args.url, 'status': 'STARTED',
                              'experiments': {}, 'scientific_validation': False}
    console: list[str] = []
    page = None
    browser = None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1240, 'height': 900}, accept_downloads=True)
            page = context.new_page()
            page.on('console', lambda message: console.append('console '+message.type+': '+message.text))
            page.on('pageerror', lambda exc: console.append('pageerror: '+str(exc)))
            page.goto(args.url + ('&' if '?' in args.url else '?') + 'v16_validation=1',
                      wait_until='domcontentloaded', timeout=60000)
            version_text = init_browser_client(page, args.timeout)
            result['version_text'] = version_text
            result['version'] = validate_version(version_text)
            result['experiments']['task_dynamics'] = []
            td_rows: list[dict] = []
            for phrase in PHRASES:
                for overlap in OVERLAPS:
                    print(f'Task Dynamics: /{phrase}/ overlap={overlap}', flush=True)
                    run = page.evaluate(TASK_SCRIPT, {'phrase': phrase, 'overlap': overlap})
                    close = validate_closure(run, phrase)
                    td_rows.append({'phrase': phrase, 'overlap': overlap,
                                    'trackingRms': run['metrics']['normalizedTrackingRMS'],
                                    'effortMean': run['metrics']['effortMean'],
                                    'geometrySamples': run['geometrySamples'],
                                    **close})
                    write_csv(args.artifacts / f'td_trajectory_{phrase}_overlap{overlap:.2f}.csv', run['trajectory'])
                    result['experiments']['task_dynamics'].append(
                        {k: v for k, v in run.items() if k != 'trajectory'})
            write_csv(args.artifacts / 'task-dynamics-closure-summary.csv', td_rows)

            print(f'DIVA: exploratory VTL babbling ({args.babbling_trials} samples per vowel)', flush=True)
            training = page.evaluate(TRAIN_SCRIPT, {'trials': args.babbling_trials})
            result['experiments']['diva_training'] = training
            diva_rows: list[dict] = []
            controls: list[dict] = []
            for mode in MODES:
                for shift in SHIFTS:
                    for gain in (0, .2):
                        print(f'DIVA mapping={mode}, gain={gain}, shift={shift:+d}', flush=True)
                        r = page.evaluate(DIVA_SCRIPT, {'mode': mode, 'shift': shift, 'feedback': gain})
                        validate_pair(r)
                        if gain == 0:
                            controls.append({'mode': mode, 'shift': shift,
                                             'maxMotorDifference': r['maxMotorDifference']})
                        diva_rows.append({k: v for k, v in r.items() if k != 'timeseries'})
                        if gain > 0:
                            path = args.artifacts / f'diva_{mode}_shift{shift:+d}_gain{gain}.csv'
                            write_csv(path, r['timeseries'])
            validate_dynamics_zero_gain(controls)
            write_csv(args.artifacts / 'diva-mapping-perturbation-summary.csv', diva_rows)
            result['experiments']['diva_mapping_comparison'] = diva_rows
            result['experiments']['diva_zero_gain_controls'] = controls

            print('DIVA: repeated perturbed practice and unperturbed retention', flush=True)
            learning = page.evaluate(PRACTICE_SCRIPT, {'trials': args.practice_trials})
            if learning.get('maxWithoutMemoryDifference', 1) > 1e-7:
                raise AssertionError('Unexpected change when learned motor memory is disabled')
            write_csv(args.artifacts / 'diva-practice-trajectories.csv', learning['trajectory'])
            write_csv(args.artifacts / 'diva-practice-trial-metrics.csv', learning['practiceSummaries'])
            result['experiments']['diva_practice'] = {k: v for k, v in learning.items()
                                                     if k not in ('trajectory', 'practiceSummaries')}
            result['experiments']['diva_practice']['practiceSummaries'] = learning['practiceSummaries']
            result['status'] = 'PASS_SOFTWARE_INVARIANTS'
            browser.close()
    except Exception as exc:
        result['status'] = 'FAILED'
        result['error'] = str(exc)
        result['traceback'] = traceback.format_exc()
        if page:
            try:
                page.screenshot(path=str(args.artifacts / 'failure.png'), full_page=True)
            except Exception:
                pass
        raise
    finally:
        (args.artifacts / 'v16-experiment-result.json').write_text(
            json.dumps(result, indent=2, default=str), encoding='utf-8')
        (args.artifacts / 'browser-console.log').write_text('\n'.join(console)+'\n', encoding='utf-8')
        create_report(result, args.artifacts)
    print('Completed:', result['status'])


def create_report(result: dict, artifacts: Path) -> None:
    lines = ['# Cognitive Speech Models v1.6 experiments', '',
             'Status: **'+result['status']+'**', '',
             'These are deterministic VTL-adapted computational models; software '
             'invariants are not scientific validation.', '']
    experiments = result.get('experiments', {})
    rows = experiments.get('task_dynamics', [])
    if rows:
        lines += ['## Task Dynamics: place-specific stop closures', '',
                  '| Utterance | Overlap | Min area (cm²) | Closure (s) | Release (s) | Criterion met |',
                  '|---|---:|---:|---:|---:|---|']
        for x in rows:
            for c in x['closures']:
                def fmt(k):
                    v = c.get(k)
                    return f'{v:.4f}' if isinstance(v, (int, float)) else '—'
                lines += [f"| /{x['phrase']}/ | {x['overlap']} | {fmt('minimumArea_cm2')} | "
                          f"{fmt('closureDuration_s')} | {fmt('releaseTime_s')} | {c.get('status')} |"]
    rows = experiments.get('diva_mapping_comparison', [])
    if rows:
        lines += ['', '## DIVA: learned map versus numerical Jacobian', '',
                  '| Mapping | Auditory gain | Shift (Hz) | Compensation (Hz) | Valid late F1 samples |',
                  '|---|---:|---:|---:|---:|']
        for x in rows:
            lines += [f"| {x['mode']} | {x['feedback']} | {x['shift']} | "
                      f"{x['compensation_Hz'] if x['compensation_Hz'] is not None else 'unresolved'} | "
                      f"{x['validLateSamples']} |"]
    learning = experiments.get('diva_practice')
    if learning:
        lines += ['', '## DIVA: across-trial practice', '',
                  f"Practice trials: {learning.get('nPracticeTrials')}",
                  f"Aftereffect (post − pre produced F1): {learning.get('aftereffect_Hz')}",
                  f"Valid late samples: {learning.get('validLateSamples')}",
                  'An aftereffect does not establish that learning matches human DIVA.']
    (artifacts / 'experiment-report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')


if __name__ == '__main__':
    main()

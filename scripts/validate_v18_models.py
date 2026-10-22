#!/usr/bin/env python3
"""Real-VTL closure calibration and DIVA sensory-error washout benchmark.

Runs inside Playwright against the deployed WebAssembly application.
Software/measurement availability invariants can fail CI. Scientific outcomes
(sustained closures, learning, forgetting) are always reported, never hardcoded
as pass criteria. This is a reduced-order VTL-adapted model, not TADA/DIVA.
"""
from __future__ import annotations

import argparse
import json
import traceback
from pathlib import Path
from validate_v16_models import init_browser_client, write_csv, validate_closure, validate_version

DEFAULT_URL='https://lnalborczyk.github.io/cognitive_speech_models/'

CALIBRATION = """async () => window.__csmResearchClient.calibrateStops({context:'a'})"""
TD = r"""async ({phrase,referenceAttraction}) => {
 const client=window.__csmResearchClient;
 const cfg={rate:1,overlap:.65,coupling:.35,stiffness:1,noise:0,
  feedback:0,seed:17,taskOmega:5.5,taskStopOmega:18,
  taskStopAccelerationLimit:115,taskStopPriority:8,
  taskRegularization:.08,taskReferenceAttraction:referenceAttraction};
 const {simulation:s,output:o}=await client.simulate('td',phrase,cfg,{geometry:true,geometryFps:24});
 const {analyzeStops}=await import('./src/sim/closure-analysis.js');
 const closures=analyzeStops(s,o.diagnosticGeometry||o.geometry||[],o.references||[]);
 const trajectory=s.frames.filter((_,i)=>i%8===0).map(f=>({
  t_s:f.t,phone:f.phone,
  measured_lip_cm:f.taskState?.values?.LA??null,
  measured_tongue_tip_cm:f.taskState?.values?.TTCD??null,
  measured_tongue_body_cm:f.taskState?.values?.TBCD??null,
  site_aperture_cm:f.taskState?.values?.SCD??null,
  site_target_cm:f.taskState?.goals?.SCD??null}));
 return {phrase,referenceAttraction,closures,trajectory,metrics:s.metrics,
  geometrySamples:(o.diagnosticGeometry||o.geometry||[]).length};
}"""
WASHOUT = r"""async ({exposure,washout}) => {
 const c=window.__csmResearchClient;
 return await c.divaWashout('ahold',{
  rate:.6,noise:0,feedback:.2,delay:40,perturbationOnsetMs:450,
  somatosensory:.5,somatosensoryDelayMs:40,feedforwardScale:1,
  seed:17,stiffness:1,sensorySafety:true},
  {exposureTrials:exposure,washoutTrials:washout,shiftHz:150,
   learningRate:.12,washoutRetention:1,
   learningCommandGain:180,learningTargetRegionHz:0});
}"""

def check_static_references(rows):
    if {r.get('phone') for r in rows}!={'p','t','k'}:
        raise AssertionError('Stop reference calibration omitted /p/, /t/ or /k/')
    for row in rows:
        if row.get('status')!='measured' or not isinstance(row.get('referenceAchievesClosure'),bool):
            raise AssertionError(f'Incomplete VTL reference geometry: {row}')
        for metric in ('referenceArea_cm2','vowelArea_cm2','initialGradientNorm_cm2'):
            if row.get(metric) is None:raise AssertionError(f'Missing {metric}: {row}')
    return rows

def check_washout(out,exposure,washout):
    rows=out.get('records',[])
    if len(rows)!=1+exposure+washout:
        raise AssertionError('Wrong exposure/washout trial count')
    if out.get('learningMechanism')!='acoustic error to matched unperturbed baseline':
        raise AssertionError('Outdated DIVA learning mechanism deployed')
    if any(row.get('learningStatus') not in ('updated','unresolved_F1','no_learned_F1')
           for row in rows[1:]):
        raise AssertionError('Missing feedback-learning diagnostics')
    if out.get('washoutRetention')!=1:
        raise AssertionError('Passive forgetting was enabled in the control experiment')
    return rows

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default=DEFAULT_URL)
    parser.add_argument('--artifacts',type=Path,default=Path('artifacts/v18-models'))
    parser.add_argument('--timeout',type=int,default=240000)
    parser.add_argument('--exposure-trials',type=int,default=5)
    parser.add_argument('--washout-trials',type=int,default=12)
    args=parser.parse_args()
    args.artifacts.mkdir(parents=True,exist_ok=True)
    report={'status':'INCOMPLETE','source':args.url,'modelVersion':'1.8'}
    logs=[];page=None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1280,'height':900})
            page.on('console',lambda m:logs.append(f'console {m.type}: {m.text}'))
            page.on('pageerror',lambda e:logs.append('pageerror: '+str(e)))
            page.goto(args.url+('?' if '?' not in args.url else '&')+'validate=1.8',
                      wait_until='domcontentloaded',timeout=60000)
            version=init_browser_client(page,args.timeout)
            validate_version(version,minimum=(1,8,0));report['version']=version
            print('Real VTL stop references',flush=True)
            references=check_static_references(page.evaluate(CALIBRATION))
            write_csv(args.artifacts/'static-vtl-stop-reference.csv',references)
            report['referenceCalibration']=references
            closures=[]
            for phrase in ('apa','ata','aka'):
                for referenceAttraction in (0,35,65):
                    print(f'VTL Task Dynamics {phrase} reference attraction {referenceAttraction}',flush=True)
                    run=page.evaluate(TD,dict(phrase=phrase,referenceAttraction=referenceAttraction))
                    measured=validate_closure(run,phrase)
                    closures.append({'phrase':phrase,'referenceAttraction':referenceAttraction,
                       'trackingRMS':run['metrics']['normalizedTrackingRMS'],
                       'effortMean':run['metrics']['effortMean'],**measured})
                    write_csv(args.artifacts/f'td_{phrase}_reference{referenceAttraction}.csv',run['trajectory'])
            write_csv(args.artifacts/'task-dynamics-closure-release.csv',closures)
            report['taskDynamics']=closures
            print('DIVA matched-baseline acoustic learning and washout',flush=True)
            learned=page.evaluate(WASHOUT,dict(exposure=args.exposure_trials,washout=args.washout_trials))
            records=check_washout(learned,args.exposure_trials,args.washout_trials)
            write_csv(args.artifacts/'diva-error-driven-adaptation-washout.csv',records)
            report['divaWashout']=learned
            report['status']='PASS_SOFTWARE_INVARIANTS'
            browser.close()
    except Exception as exc:
        report.update(status='FAILED',error=str(exc),traceback=traceback.format_exc())
        if page:
            try:page.screenshot(path=str(args.artifacts/'failure.png'),full_page=True)
            except Exception:pass
        raise
    finally:
        (args.artifacts/'v18-result.json').write_text(json.dumps(report,indent=2,default=str))
        (args.artifacts/'browser-console.log').write_text('\n'.join(logs)+'\n')
        lines=['# VTL model-fidelity experiment v1.8','',
          'Status: **'+report['status']+'**','',
          'Software checks are not evidence of scientific validity. Actual results are in the CSV files.','']
        for r in report.get('taskDynamics',[]):
            lines.append(f"- {r['phrase']}, attraction={r['referenceAttraction']}: "
                         f"minimum area={r.get('minimumArea_cm2')} cm², "
                         f"closure={r.get('status')}, release={r.get('releaseTime_s')}")
        for r in report.get('divaWashout',{}).get('records',[]):
            lines.append(f"- {r['phase']} {r['trial']}: probe F1={r.get('probeF1_Hz')} Hz; "
                         f"memory RMS={r.get('memoryRms')}; learning error={r.get('learningErrorHz')} Hz")
        (args.artifacts/'experiment-report.md').write_text('\n'.join(lines)+'\n')
    print(report['status'])

if __name__=='__main__':main()

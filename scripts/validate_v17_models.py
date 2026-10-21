#!/usr/bin/env python3
"""Validate v1.7 VTL-adapted controllers in a real Chromium/WebAssembly session.

Measured science (closure success, generalization, aftereffects) is reported,
NOT artificially required to pass. Software invariants and missing assets fail.
"""
from __future__ import annotations
import argparse
import json
import traceback
from pathlib import Path
from validate_v16_models import init_browser_client, write_csv, validate_version, validate_closure

DEFAULT_URL = 'https://lnalborczyk.github.io/cognitive_speech_models/'
TD = r"""async ({phrase,stopOmega,stopPriority,overlap}) => {
 const client=window.__csmResearchClient;
 const cfg={rate:1,overlap,coupling:.35,stiffness:1,noise:0,
   feedback:0,seed:17,taskOmega:5.5,taskStopOmega:stopOmega,
   taskStopAccelerationLimit:115,taskStopPriority:stopPriority,taskRegularization:.08};
 const {simulation:s,output:o}=await client.simulate('td',phrase,cfg,{geometry:true,geometryFps:24});
 const {analyzeStops}=await import('./src/sim/closure-analysis.js');
 const closures=analyzeStops(s,o.diagnosticGeometry||o.geometry||[],o.references||[]);
 const rows=s.frames.filter((_,i)=>i%8===0).map(f=>({
   t_s:f.t,phone:f.phone,task_LA:f.taskState?.values?.LA??null,
   goal_LA:f.taskState?.goals?.LA??null,
   task_TTCD:f.taskState?.values?.TTCD??null,
   goal_TTCD:f.taskState?.goals?.TTCD??null,
   task_TBCD:f.taskState?.values?.TBCD??null,
   goal_TBCD:f.taskState?.goals?.TBCD??null}));
 return {phrase,stopOmega,stopPriority,overlap,closures,rows,metrics:s.metrics,
   geometrySamples:(o.diagnosticGeometry||o.geometry||[]).length};
}"""
HELDOUT = r"""async ({trials,seed}) => {
 const c=window.__csmResearchClient;
 await c.trainDiva({nTrials:64,seed:17});
 return await c.evaluateDivaMap({nTrials:trials,seed,correctionScale:1});
}"""
WASHOUT = r"""async ({exposure,washout,retention}) => {
 const c=window.__csmResearchClient;
 return await c.divaWashout('ahold',{
   rate:.6,noise:0,feedback:.2,delay:40,perturbationOnsetMs:450,
   somatosensory:.5,somatosensoryDelayMs:40,feedforwardScale:1,
   seed:17,stiffness:1,sensorySafety:true
 },{exposureTrials:exposure,washoutTrials:washout,
    shiftHz:150,learningRate:.12,washoutRetention:retention});
}"""

def check_version(text: str) -> None:
    v=validate_version(text,minimum=(1,7,0))
    assert v >= (1,7,0)

def summarize_closure(runs):
    out=[]
    for run in runs:
        item=validate_closure(run,run['phrase'])
        out.append({'phrase':run['phrase'], 'overlap':run['overlap'],
            'stopOmega':run['stopOmega'], 'stopPriority':run['stopPriority'],
            'trackingRMS':run['metrics']['normalizedTrackingRMS'],
            'effortMean':run['metrics']['effortMean'],**item})
    return out

def check_map_results(rows):
    assert {r['phone'] for r in rows} == {'a','i','u'}, 'missing vowel from map evaluation'
    for row in rows:
        assert 0 <= row['valid'] <= row['attempted']
        if row['valid']:
            for field in ('meanAbsErrorBeforeHz','meanAbsErrorAfterHz','improvedFraction'):
                assert row[field] is not None, f'{field} missing for {row["phone"]}'
    return rows

def check_washout(records, exposure, washout):
    assert len(records)==1+exposure+washout, 'unexpected washout trial count'
    assert records[0]['phase']=='baseline'
    assert sum(r['phase']=='exposure' for r in records)==exposure
    assert sum(r['phase']=='washout' for r in records)==washout
    assert all(r['memoryRms']>=0 for r in records)
    return records

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default=DEFAULT_URL)
    parser.add_argument('--artifacts',type=Path,default=Path('artifacts/v17-models'))
    parser.add_argument('--timeout',type=int,default=900000)
    parser.add_argument('--exposure-trials',type=int,default=5)
    parser.add_argument('--washout-trials',type=int,default=6)
    parser.add_argument('--retention',type=float,default=1.0,
      help='1.0 = feedback-driven washout only; less than 1 adds explicit passive decay')
    args=parser.parse_args()
    args.artifacts.mkdir(parents=True,exist_ok=True)
    log=[];report={'status':'STARTED','url':args.url,'scientifically_validated':False}
    page=None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1280,'height':900})
            page.on('console',lambda m:log.append('console '+m.type+': '+m.text))
            page.on('pageerror',lambda e:log.append('pageerror: '+str(e)))
            page.goto(args.url+('?' if '?' not in args.url else '&')+'v17_validate=1',wait_until='domcontentloaded',timeout=60000)
            version=init_browser_client(page,args.timeout)
            check_version(version);report['version']=version
            runs=[]
            for phrase in ('apa','ata','aka'):
                for stopPriority,stopOmega in ((1,5.5),(8,5.5),(8,18)):
                    print('Task Dynamics',phrase,'stopPriority',stopPriority,'stopOmega',stopOmega,flush=True)
                    r=page.evaluate(TD,{'phrase':phrase,'stopOmega':stopOmega,'stopPriority':stopPriority,'overlap':.65})
                    runs.append(r)
                    write_csv(args.artifacts/f'td_{phrase}_priority{stopPriority}_omega{stopOmega}.csv',r['rows'])
            closures=summarize_closure(runs)
            write_csv(args.artifacts/'task-dynamics-closure-release.csv',closures)
            report['taskDynamics']=closures
            print('Held-out DIVA maps',flush=True)
            generalization=check_map_results(page.evaluate(HELDOUT,{'trials':24,'seed':8911}))
            write_csv(args.artifacts/'diva-heldout-mapping.csv',generalization)
            report['divaHeldout']=generalization
            print('DIVA perturbation, adaptation and washout',flush=True)
            w=page.evaluate(WASHOUT,{'exposure':args.exposure_trials,
                 'washout':args.washout_trials,'retention':args.retention})
            records=check_washout(w['records'],args.exposure_trials,args.washout_trials)
            write_csv(args.artifacts/'diva-adaptation-washout.csv',records)
            report['divaWashout']=w
            report['status']='PASS_SOFTWARE_INVARIANTS'
            browser.close()
    except Exception as e:
        report['status']='FAILED';report['error']=str(e);report['traceback']=traceback.format_exc()
        if page:
            try:page.screenshot(path=str(args.artifacts/'failure.png'),full_page=True)
            except Exception:pass
        raise
    finally:
        (args.artifacts/'v17-result.json').write_text(json.dumps(report,indent=2,default=str))
        (args.artifacts/'browser-console.log').write_text('\n'.join(log)+'\n')
        lines=['# v1.7 model evaluation', '', '**Status:** '+report['status'],
         '', 'The measurements are from VTL WebAssembly, not empirical articulatory recordings.',
         'Scientific success is NOT required by CI.']
        if 'taskDynamics' in report:
            lines+=['','## Stop closures','',
             '|Sequence|Stop priority|Stop omega|Closure|Release|Minimum area cm²|','|---|---:|---:|---|---|---:|']
            for c in report['taskDynamics']:
                lines.append(f"| /{c['phrase']}/ | {c['stopPriority']} | {c['stopOmega']} | {c.get('status')} | {c.get('releaseTime_s')} | {c.get('minimumArea_cm2')} |")
        if 'divaHeldout' in report:
            lines+=['','## Held-out DIVA inverse map','',
              '|Vowel|Valid|Mean before Hz|Mean after Hz|Fraction improved|','|---|---:|---:|---:|---:|']
            for x in report['divaHeldout']:
                lines.append(f"| /{x['phone']}/ | {x['valid']}/{x['attempted']} | {x['meanAbsErrorBeforeHz']} | {x['meanAbsErrorAfterHz']} | {x['improvedFraction']} |")
        if 'divaWashout' in report:
            lines+=['','## DIVA adaptation and washout', '',
                    f"Unperturbed washout trials: {report['divaWashout']['washoutTrials']}.",
                    'See `diva-adaptation-washout.csv`; an aftereffect is not proof of human-like adaptation.']
        (args.artifacts/'experiment-report.md').write_text('\n'.join(lines)+'\n')
    print(report['status'])

if __name__=='__main__':main()

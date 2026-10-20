#!/usr/bin/env python3
"""Run the v1.5 local-F1-authority and DIVA feedback-balance experiments.

Operates the public application's *actual* VTL WebAssembly engine using
Chromium. A passing run means the experiment executed and software invariants
held; it does not establish a physiologically accurate DIVA controller.

  python3 scripts/test_online_v15.py --artifacts artifacts/v15
  python3 scripts/test_online_v15.py --chromium-path /usr/bin/chromium
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

from validate_live_feedback import browser_ready, save_download, set_controls

URL = 'https://lnalborczyk.github.io/cognitive_speech_models/'
FEEDFORWARD = (0.5, 0.75, 1.0)
GAINS = (0.0, 0.2)


def parse_csv(path):
    with path.open(newline='', encoding='utf-8-sig') as handle:
        return list(csv.DictReader(handle))


def validate_authority(rows):
    required = {'vowel', 'F1_Hz', 'parameter', 'slope_Hz_per_normalized_unit'}
    if not rows or not required.issubset(rows[0]):
        raise AssertionError('Missing local F1 sensitivity CSV columns')
    vowels = {r['vowel'].strip('/ ') for r in rows}
    if not {'a', 'i', 'u'}.issubset(vowels):
        raise AssertionError(f'Missing vowel targets: {vowels}')
    valid = {v: 0 for v in ('a', 'i', 'u')}
    for row in rows:
        vowel = row['vowel'].strip('/ ')
        s = row['slope_Hz_per_normalized_unit'].strip()
        f = row['F1_Hz'].strip()
        if s:
            x = float(s)
            if not math.isfinite(x):
                raise AssertionError(f'Nonfinite F1 slope: {row}')
            if vowel in valid:
                valid[vowel] += 1
        if f and not math.isfinite(float(f)):
            raise AssertionError(f'Nonfinite reference F1: {row}')
    # /i/ may be unresolved in JD3: record it, do not replace with invented F1.
    if valid['a'] == 0:
        raise AssertionError('No usable local F1 derivatives for reference /a/')
    return {'valid_slopes_per_vowel': valid, 'n_rows': len(rows)}


def validate_balance(rows, shift_hz):
    required = {'feedforwardScale','feedback','shiftHz','compensationHz',
                'validSamples','trackingRms','motorEffort'}
    if len(rows) != 6 or not required.issubset(rows[0]):
        raise AssertionError(f'Expected six rows with balance columns, got {len(rows)}')
    keys = set()
    for row in rows:
        scale, gain, shift = (float(row[k]) for k in ('feedforwardScale','feedback','shiftHz'))
        keys.add((scale, gain))
        if abs(shift - shift_hz) > 1e-9:
            raise AssertionError(f'Unexpected shift {shift}, expected {shift_hz}')
        for metric in ('trackingRms','motorEffort'):
            if not math.isfinite(float(row[metric])):
                raise AssertionError(f'Nonfinite {metric}: {row}')
        valid_samples = int(row['validSamples'])
        if valid_samples < 0:
            raise AssertionError('Invalid number of samples')
        comp = row['compensationHz'].strip()
        if gain == 0 and comp and abs(float(comp)) > 1e-5:
            raise AssertionError(f'Zero-gain perturbation altered F1: {row}')
        if comp and not math.isfinite(float(comp)):
            raise AssertionError(f'Nonfinite compensation: {row}')
    if keys != {(f,g) for f in FEEDFORWARD for g in GAINS}:
        raise AssertionError(f'Unexpected experimental grid: {keys}')
    return {'rows': len(rows), 'negative_controls_passed': True,
            'unresolved_conditions': sum(not r['compensationHz'].strip() for r in rows)}


def check_version(page):
    text = page.locator('.brand small').inner_text()
    import re
    match = re.search(r'\b(\d+)\.(\d+)\.(\d+)\b', text)
    if not match or tuple(int(x) for x in match.groups()) < (1,5,0):
        raise RuntimeError('The public website is not yet at v1.5 or later: ' + text)
    return text


def run_authority(page, artifacts, timeout):
    page.locator('#authority-test').click()
    page.wait_for_function('''() => {
      const report=document.querySelector('#authority-report')?.textContent||'';
      return !document.querySelector('#authority-csv')?.disabled ||
             report.startsWith('F1 sensitivity failed:');
    }''', timeout=timeout)
    if page.locator('#authority-csv').is_disabled():
        raise RuntimeError(page.locator('#authority-report').inner_text())
    path = artifacts / 'vtl-local-f1-sensitivity.csv'
    save_download(page, '#authority-csv', path)
    rows = parse_csv(path)
    return {'file': path.name, **validate_authority(rows)}


def run_balance(page, artifacts, shift_hz, timeout):
    set_controls(page, {'perturbation': shift_hz})
    # Reset the previous run's enabled CSV button; the app disables it on click.
    page.locator('#balance-test').click()
    page.wait_for_function('''() => {
      const report=document.querySelector('#balance-report')?.textContent||'';
      return !document.querySelector('#balance-csv')?.disabled ||
             report.startsWith('Balance experiment failed:');
    }''', timeout=timeout)
    if page.locator('#balance-csv').is_disabled():
        raise RuntimeError(page.locator('#balance-report').inner_text())
    suffix = 'positive' if shift_hz > 0 else 'negative'
    path = artifacts / f'vtl-feedforward-feedback-{suffix}.csv'
    save_download(page, '#balance-csv', path)
    rows = parse_csv(path)
    return {'file':path.name, 'shift_hz': shift_hz,
            **validate_balance(rows,shift_hz)}


def report_markdown(result, artifacts):
    lines = ['# VTL feedback/feedforward experimental results', '',
             f'App version: {result.get("version", "unknown")}', '',
             'All acoustic results are **VTL transfer-function predictions**, not independent waveform measurements.',
             'These are deterministic controller simulations, not independent trials.', '',
             '## Local F1 sensitivity', '',
             'Valid local F1 slopes by vowel: '+str(result.get('authority',{}).get('valid_slopes_per_vowel','not measured')), '',
             '## Paired ±150 Hz F1 perturbations on sustained /aː/', '',
             '| Heard F1 shift | FF strength | Auditory gain | Compensation (Hz) | Valid observer samples | Tracking RMS | Motor effort |',
             '|---:|---:|---:|---:|---:|---:|---:|']
    for shift in (150,-150):
        path = artifacts / ('vtl-feedforward-feedback-positive.csv' if shift>0 else 'vtl-feedforward-feedback-negative.csv')
        if not path.exists():
            continue
        for r in parse_csv(path):
            lines.append('| '+ ' | '.join([str(shift),r['feedforwardScale'],r['feedback'],r['compensationHz'] or 'unresolved',r['validSamples'],r['trackingRms'],r['motorEffort']])+' |')
    lines += ['', 'Interpret cautiously: a numerically nonzero response is not evidence of human-like compensation.',
              'Compare feedback-gain-zero rows as software negative controls.']
    (artifacts/'experiment-report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=URL)
    parser.add_argument('--artifacts',type=Path,default=Path('artifacts/v15-feedback'))
    parser.add_argument('--timeout',type=int,default=300000, help='Per-test timeout in ms')
    parser.add_argument('--chromium-path',default='')
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True,exist_ok=True)
    result = {'url':args.url,'status':'STARTED','vowel':'ahold',
              'rate':0.6,'onset_s':0.45,'auditory_delay_ms':40,
              'motor_noise':0,'seed':17,'conditions':[]}
    page = None
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as p:
            launch_options = {'headless':True, 'args':['--no-sandbox']}
            if args.chromium_path:
                launch_options['executable_path'] = args.chromium_path
            browser = p.chromium.launch(**launch_options)
            ctx = browser.new_context(viewport={'width':1200,'height':950},accept_downloads=True)
            page = ctx.new_page()
            page.goto(args.url, wait_until='domcontentloaded', timeout=60000)
            browser_ready(page,args.timeout)
            result['version']=check_version(page)
            page.locator('#research-tools').evaluate('(el) => el.open = true')
            result['authority']=run_authority(page,args.artifacts,args.timeout)
            page.locator('#model').evaluate('(el) => el.value = "diva"')
            page.locator('#phrase').evaluate('(el) => el.value = "ahold"')
            set_controls(page,{'rate':0.6,'noise':0,'seed':17,
                               'delay':40,'perturbationOnsetMs':450,
                               'feedback':0.2, 'somatosensory':0.5})
            for shift in (150,-150):
                print(f'Running DIVA /aː/ feedforward × auditory-feedback grid: {shift:+d} Hz',flush=True)
                result['conditions'].append(run_balance(page,args.artifacts,shift,args.timeout))
            result['status']='PASS_SOFTWARE_INVARIANTS'
            browser.close()
    except Exception as exc:
        result['status']='FAILED'
        result['error']=str(exc)
        if page:
            try:
                page.screenshot(path=str(args.artifacts/'failure.png'),full_page=True)
            except Exception:
                pass
        raise
    finally:
        (args.artifacts/'validation-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        report_markdown(result,args.artifacts)
    print('Completed v1.5 experiments:',result['status'])


if __name__=='__main__':
    main()

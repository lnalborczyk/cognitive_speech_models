#!/usr/bin/env python3
"""End-to-end validation of the public Cognitive Speech Models WebAssembly app.

Executes the *actual online UI* in Chromium, downloads its exported CSVs,
and distinguishes hard software invariants from exploratory speech predictions.

Examples:
  python3 scripts/validate_live_feedback.py --artifacts artifacts/live-validation
  python3 scripts/validate_live_feedback.py --seeds 17,23,41 --artifacts artifacts/full-validation

Requires: pip install playwright; python -m playwright install chromium
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
import re
import sys

from analyze_perturbation import analyze, finite

DEFAULT_URL = 'https://lnalborczyk.github.io/cognitive_speech_models/'


def parse_seeds(value):
    seeds = [int(x.strip()) for x in value.split(',') if x.strip()]
    if not seeds or any(s < 1 or s > 99 for s in seeds):
        raise ValueError('Seeds must be comma-separated integers between 1 and 99')
    return seeds


def validate_sweep(rows, tolerance=1e-8):
    """Software invariant: auditory delay has no effect at auditory gain zero."""
    if len(rows) != 8:
        raise AssertionError(f'Expected eight gain/delay rows; received {len(rows)}')
    if {(float(r['feedback']), int(r['delay'])) for r in rows} != {
        (g, d) for g in (0, .1, .2, .4) for d in (40, 100)
    }:
        raise AssertionError('Gain/delay grid does not match the intended experiment')
    for row in rows:
        if not all(math.isfinite(float(row[k])) for k in ('trackingRms', 'effort')):
            raise AssertionError(f'Nonfinite sweep measurements: {row}')
    controls = sorted((r for r in rows if float(r['feedback']) == 0), key=lambda r: int(r['delay']))
    differences = {k: abs(float(controls[0][k]) - float(controls[1][k]))
                   for k in ('trackingRms', 'effort')}
    if any(v > tolerance for v in differences.values()):
        raise AssertionError('Zero-auditory-gain negative control depends on auditory delay: '
                             + str(differences))
    return differences


def validate_pair_rows(rows, *, gain, onset, tolerance=1e-6):
    if not rows:
        raise AssertionError('Empty paired perturbation output')
    if not {'time_s', 'shift_hz', 'delta_produced_F1_Hz', 'motor_divergence_RMS'}.issubset(rows[0]):
        raise AssertionError('Missing required perturbation columns')
    pre = [r for r in rows if finite(r['time_s']) is not None and float(r['time_s']) < onset - 1e-8]
    if not pre:
        raise AssertionError('No pre-onset observations')
    pre_max = max(abs(finite(r['motor_divergence_RMS']) or 0) for r in pre)
    if pre_max > tolerance:
        raise AssertionError(f'Motor divergence before perturbation onset: {pre_max}')
    if gain == 0:
        all_max = max(abs(finite(r['motor_divergence_RMS']) or 0) for r in rows)
        f1_valid = [abs(finite(r['delta_produced_F1_Hz'])) for r in rows
                    if finite(r['delta_produced_F1_Hz']) is not None]
        if all_max > tolerance or (f1_valid and max(f1_valid) > 1e-4):
            raise AssertionError(f'Auditory gain=0 allowed perturbation response: '
                                 f'motor={all_max}, F1={max(f1_valid, default=0)}')
    return {'pre_onset_max_motor_divergence': pre_max,
            'n_valid_f1_samples': sum(finite(r['delta_produced_F1_Hz']) is not None for r in rows)}


def set_controls(page, values):
    """Set inputs without firing `change` (which launches costly synthesis)."""
    page.evaluate('''values => {
      for (const [name, value] of Object.entries(values)) {
        const el = document.getElementById(name);
        if (!el) throw Error('Missing UI control: ' + name);
        // 150 Hz is not on the old 20-Hz range step; a browser test should
        // nevertheless be able to request the intended experimental shift.
        if (name === 'perturbation') el.step = '10';
        el.value = String(value);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        if (Math.abs(Number(el.value) - Number(value)) > 1e-8)
          throw Error('Control ' + name + ' was clamped to ' + el.value);
      }
    }''', values)


def save_download(page, button, path):
    with page.expect_download(timeout=20000) as info:
        page.locator(button).click()
    info.value.save_as(str(path))
    if path.stat().st_size < 60:
        raise AssertionError(f'Exported CSV is unexpectedly small: {path}')


def browser_ready(page, timeout):
    page.wait_for_function('''() => {
      const s = document.querySelector('#engine-status');
      return s?.dataset.state === 'ready' || s?.dataset.state === 'error';
    }''', timeout=timeout)
    state = page.locator('#engine-status').get_attribute('data-state')
    if state != 'ready':
        raise RuntimeError('VTL failed to initialize: ' + page.locator('#engine-status').inner_text())
    if page.locator('#engine').input_value() != 'wasm':
        raise AssertionError('Test must use browser VTL WebAssembly, not native API')
    page.wait_for_function('''() => {
      const status=document.querySelector('#audio-status')?.textContent||'';
      return !document.querySelector('#wav')?.disabled || status.startsWith('Error:');
    }''', timeout=timeout)
    if page.locator('#wav').is_disabled():
        raise RuntimeError('Initial VTL synthesis failed: '+page.locator('#audio-status').inner_text())


def run_sweep(page, artifacts, timeout):
    set_controls(page, {'rate': .6, 'noise': 0, 'seed': 17,
                        'feedback': 0, 'perturbation': 0, 'perturbationOnsetMs': 550})
    page.locator('#model').evaluate('(el) => el.value = "diva"')
    page.locator('#phrase').evaluate('(el) => el.value = "aia"')
    page.locator('#sweep-test').click()
    page.wait_for_function('''() => {
      const txt = document.querySelector('#sweep-report')?.textContent||'';
      return !document.querySelector('#sweep-csv')?.disabled || txt.startsWith('Gain/delay sweep failed:');
    }''', timeout=timeout)
    if page.locator('#sweep-csv').is_disabled():
        raise RuntimeError('VTL gain/delay sweep failed: ' + page.locator('#sweep-report').inner_text())
    path = artifacts / 'vtl-gain-delay-sweep.csv'
    save_download(page, '#sweep-csv', path)
    with path.open(newline='') as stream:
        rows = list(csv.DictReader(stream))
    control_differences = validate_sweep(rows)
    return {'rows': len(rows), 'zero_gain_delay_differences': control_differences,
            'path': str(path)}


def run_perturbation(page, artifacts, *, gain, delay, shift, seed, timeout,
                     phrase='aia', onset_ms=550):
    set_controls(page, {'rate': .6, 'noise': 0, 'seed': seed, 'feedback': gain,
                        'delay': delay, 'perturbation': shift, 'perturbationOnsetMs': onset_ms})
    page.locator('#phrase').evaluate('(el, phrase) => el.value = phrase', phrase)
    page.locator('#experiment').click()
    page.wait_for_function('''() => {
      const txt=document.querySelector('#experiment-report')?.textContent||'';
      return !document.querySelector('#perturbation-csv')?.disabled ||
             txt.startsWith('Perturbation experiment failed:');
    }''', timeout=timeout)
    if page.locator('#perturbation-csv').is_disabled():
        raise RuntimeError('VTL perturbation comparison failed: '
                           + page.locator('#experiment-report').inner_text())
    condition = f'{phrase}_g{gain:.1f}_d{delay}_s{shift:+d}_seed{seed}'
    path = artifacts / f'paired_f1_{condition}.csv'
    save_download(page, '#perturbation-csv', path)
    result, rows = analyze(path)
    invariants = validate_pair_rows(rows, gain=gain, onset=onset_ms/1000)
    return {**result, **invariants, 'report': page.locator('#experiment-report').inner_text(),
            'file': str(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=DEFAULT_URL)
    parser.add_argument('--artifacts', type=Path, default=Path('artifacts/live-validation'))
    parser.add_argument('--seeds', default='17', help='Comma-separated seeds, e.g. 17,23,41')
    parser.add_argument('--timeout', type=int, default=240_000,
                        help='Milliseconds per VTL experiment')
    parser.add_argument('--include-sustained', action='store_true',
                        help='Also test a longer held-/a/ vowel with perturbations during steady articulation')
    parser.add_argument('--chromium-path', default='', help='Custom Chromium executable')
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    seeds = parse_seeds(args.seeds)
    result = {'url': args.url, 'seeds': seeds, 'status': 'STARTED', 'browser_errors': [],
              'scientific_caveats': [
                 'VTL resonance peaks are exploratory transfer-function estimates, not independently validated formants',
                 'An opposite-direction response is an empirical outcome, not a deployment requirement',
                 'Single-trial observer samples are autocorrelated, not independent replications']}
    from playwright.sync_api import sync_playwright
    page = None
    try:
        with sync_playwright() as pw:
            chromium = pw.chromium.launch(headless=True, args=['--no-sandbox'],
                **({'executable_path': args.chromium_path} if args.chromium_path else {}))
            context = chromium.new_context(viewport={'width': 1440, 'height': 900},
                                           accept_downloads=True)
            page = context.new_page()
            page.on('pageerror', lambda e: result['browser_errors'].append(str(e)))
            page.goto(args.url, wait_until='domcontentloaded', timeout=45000)
            browser_ready(page, args.timeout)
            result['website_version'] = page.locator('.brand small').inner_text()
            if not page.locator('#sweep-test').count() or not page.locator('#perturbation-csv').count():
                raise RuntimeError('Hosted application is an older version without validation controls: '
                                   + result['website_version'])
            result['vowel_calibration'] = None
            page.locator('#calibration-test').click()
            page.wait_for_function('''() => {
              const el=document.querySelector('#calibration-report');
              return el?.querySelectorAll('tbody tr').length === 3 ||
                     (el?.textContent||'').startsWith('Calibration failed:');
            }''', timeout=args.timeout)
            calibration = page.locator('#calibration-report').inner_text()
            if calibration.startswith('Calibration failed:'):
                raise RuntimeError(calibration)
            result['vowel_calibration'] = page.locator('#calibration-report tbody tr').evaluate_all(
                'rows => rows.map(r => Array.from(r.querySelectorAll("td"), x => x.textContent.trim()))')
            result['gain_delay_sweep'] = run_sweep(page, args.artifacts, args.timeout)
            results = []
            for seed in seeds:
                conditions = [(0, 40, 150), (0, 40, -150),
                              (.2, 40, 150), (.2, 40, -150),
                              (.2, 100, 150), (.2, 100, -150)]
                for gain, delay, shift in conditions:
                    print(f'Paired VTL: seed={seed}, gain={gain}, delay={delay}, shift={shift}', flush=True)
                    results.append(run_perturbation(page, args.artifacts, gain=gain,
                                  delay=delay, shift=shift, seed=seed, timeout=args.timeout))
            result['paired_conditions'] = results
            if args.include_sustained:
                if not page.locator('#phrase option[value="ahold"]').count():
                    raise RuntimeError('Sustained /a/ is not available in the deployed app')
                held = []
                for gain, delay, shift in [(0,40,150),(.2,40,150),(.2,40,-150),(.2,100,150)]:
                    held.append(run_perturbation(page,args.artifacts,gain=gain,
                         delay=delay,shift=shift,seed=seeds[0],timeout=args.timeout,
                         phrase='ahold',onset_ms=450))
                result['sustained_conditions'] = held
                print('Held-vowel conditions:',len(held),flush=True)
            # A missing F1 estimate is recorded as incomplete scientific evidence,
            # not silently treated as zero or a pass/fail prediction.
            result['incomplete_conditions'] = [r['file'] for r in results
                if r['n_late_observer_samples'] < 3]
            result['status'] = 'PASS_SOFTWARE_INVARIANTS'
            print('Gain/delay and pre-onset invariants PASS')
            for r in results:
                print(Path(r['file']).name, ':', r['interpretation'],
                      '; late ΔF1=',r['late_delta_produced_f1_hz'],
                      'Hz; late samples=',r['n_late_observer_samples'])
            chromium.close()
    except Exception as exc:
        result['status'] = 'FAILED'
        result['error'] = str(exc)
        if page is not None:
            try:
                page.screenshot(path=str(args.artifacts / 'failure.png'), full_page=True)
                result['last_browser_text'] = page.locator('body').inner_text()[:2000]
            except Exception:
                pass
        raise
    finally:
        (args.artifacts / 'live-feedback-result.json').write_text(json.dumps(result, indent=2))
        if result.get('paired_conditions'):
            rows=result.get('paired_conditions',[])+result.get('sustained_conditions',[])
            cols=['seed','feedback_gain','delay_ms','shift_hz','n_late_observer_samples',
                  'late_delta_produced_f1_hz','late_compensation_hz','late_compensation_fraction',
                  'pre_onset_max_motor_divergence','first_motor_divergence_s',
                  'fraction_feedback_f1_valid','first_shift_at_feedback_s',
                  'first_nonzero_auditory_command_s','first_perturbation_changed_command_s',
                  'interpretation','file']
            with (args.artifacts/'live-feedback-summary.csv').open('w',newline='') as stream:
                writer=csv.DictWriter(stream,cols,extrasaction='ignore')
                writer.writeheader();writer.writerows(rows)


if __name__ == '__main__':
    main()

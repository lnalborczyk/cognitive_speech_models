#!/usr/bin/env python3
"""Fail-fast, instrumented browser VTL test. Saves diagnostics even on failure.

If the browser reports a definitive startup or synthesis error, report it
immediately rather than hiding the root cause behind a 180-second timeout.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import json
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


@contextmanager
def serve(port):
    server = subprocess.Popen(
        ['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                with urlopen(f'http://127.0.0.1:{port}/', timeout=1):
                    break
            except OSError:
                time.sleep(.2)
        else:
            raise RuntimeError('Static HTTP server failed to start')
        yield
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


def snapshot(page):
    return page.evaluate('''() => {
      const e=document.querySelector('#engine-status');
      const a=document.querySelector('#audio-status');
      const n=document.querySelector('#native-geometry');
      const w=document.querySelector('#wav');
      return {
        title: document.title,
        engineStatus: e?.textContent||'missing',
        engineState: e?.dataset.state||'unknown',
        engine: document.querySelector('#engine')?.value||null,
        audioStatus: a?.textContent||'missing',
        wavReady: w ? !w.disabled : false,
        svgCount: n?.querySelectorAll('img').length||0,
        svgReady: !!n?.querySelector('img')?.complete,
      };
    }''')


def validate_vowel_calibration(rows):
    """Check browser calibration as a *smoke test*, not a phonetic gold standard.

    Each row begins with [vowel, measured F1/F2/F3, repeat errors, status].
    Additional trailing columns (e.g. low-band spectral candidates) are
    scientific diagnostics and do not affect the calibration smoke test.
    An unresolved formant is a legitimate diagnostic finding; it must not
    prevent a functioning VTL synthesizer from being deployed.
    """
    expected = {'/a/', '/i/', '/u/'}
    if len(rows) != 3 or {row[0] for row in rows if row} != expected:
        raise AssertionError(f'Expected calibration rows for /a/, /i/, /u/: {rows!r}')

    repeatable = 0
    incomplete = []
    for row in rows:
        if len(row) < 4:
            raise AssertionError(f'Malformed vowel calibration row: {row!r}')
        # The UI added a fifth column for low-band spectral candidates in v1.4.
        # Validate the stable four-field contract; preserve optional columns
        # in the diagnostic JSON, without mistaking them for a software error.
        vowel, formants, errors, status = [str(value).strip() for value in row[:4]]
        measured = [value.strip() for value in formants.split(' / ')]
        if len(measured) != 3:
            raise AssertionError(f'Expected three reported formant fields for {vowel}: {row!r}')
        if status == 'Repeatable':
            if 'unresolved' in formants.lower():
                raise AssertionError(f'{vowel} was marked Repeatable despite missing a formant')
            if any(value == '—' for value in errors.split(' / ')):
                raise AssertionError(f'{vowel} was marked Repeatable despite missing an error')
            repeatable += 1
        elif status.startswith('Incomplete (') and status.endswith('/3)'):
            try:
                count = int(status[len('Incomplete ('):-len('/3)')])
            except ValueError as exc:
                raise AssertionError(f'Invalid incomplete status for {vowel}: {status}') from exc
            if count not in (1, 2) or sum(x != 'unresolved' for x in measured) != count:
                raise AssertionError(f'Incorrect resolved formant count for {vowel}: {row!r}')
            incomplete.append(f'{vowel}: {status}')
        elif status == 'Inconsistent':
            raise AssertionError(f'{vowel} produced non-repeatable formant measurements: {row!r}')
        else:
            raise AssertionError(f'Unexpected vowel calibration status for {vowel}: {status!r}')

    if repeatable == 0:
        raise AssertionError('No fully resolved, repeatable vowel in VTL calibration')
    return incomplete


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, default=ROOT/'artifacts')
    parser.add_argument('--timeout', type=int, default=180_000)
    parser.add_argument('--feedback-ablation', action='store_true',
                        help='Also run controlled three-condition VTL feedback benchmark')
    parser.add_argument('--chromium-path', default='', help='Use a local Chromium binary instead of Playwright-managed Chromium')
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    port = free_port()
    log = {'url': f'http://127.0.0.1:{port}/', 'events': [], 'network': [], 'result': 'not_started'}
    page = None
    try:
        with serve(port), sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=['--no-sandbox'],
                                         **({'executable_path': args.chromium_path} if args.chromium_path else {}))
            page = browser.new_page(viewport={'width': 1280, 'height': 880})
            page.set_default_timeout(args.timeout)
            page.on('console', lambda msg: log['events'].append(f'console {msg.type}: {msg.text}'))
            page.on('pageerror', lambda error: log['events'].append('pageerror: ' + str(error)))
            page.on('requestfailed', lambda req: log['events'].append(f'requestfailed: {req.url} {req.failure}'))
            page.on('response', lambda res: log['network'].append({'url': res.url, 'status': res.status})
                    if any(x in res.url for x in ('vtl.', 'wasm-worker', 'wasm-runtime')) else None)
            try:
                page.goto(log['url'], wait_until='domcontentloaded', timeout=30000)
                # Wait for a terminal state (ready OR error), not just success.
                page.wait_for_function('''() => {
                  const e=document.querySelector('#engine-status');
                  return e?.classList.contains('ready') || e?.dataset.state==='error';
                }''', timeout=min(args.timeout, 75000))
                state = snapshot(page)
                if state['engineState'] == 'error':
                    raise RuntimeError('VTL initialization failed: ' + state['engineStatus'])
                # VTL synthesis can be more expensive than startup. Stop if it
                # reports an error, and record the displayed error verbatim.
                page.wait_for_function('''() => {
                  const wav=document.querySelector('#wav');
                  const status=document.querySelector('#audio-status')?.textContent||'';
                  return (wav && !wav.disabled) || status.startsWith('Error:');
                }''', timeout=args.timeout)
                state = snapshot(page)
                if not state['wavReady']:
                    raise RuntimeError('VTL synthesis failed: ' + state['audioStatus'])
                page.locator('#native-geometry img').first.wait_for(state='visible', timeout=15000)
                state = snapshot(page)
                log['checks'] = state
                if state['engine'] != 'wasm':
                    raise AssertionError('Test did not use browser WebAssembly VTL')
                if not state['svgReady'] or state['svgCount'] == 0:
                    raise AssertionError('No rendered VTL SVG anatomy')
                if not any('vtl.wasm' in item['url'] and item['status']==200 for item in log['network']):
                    raise AssertionError('Compiled VTL WASM binary was not successfully fetched')
                # Verify that the online speaker's canonical vowel targets
                # can be measured twice consistently with the same VTL model.
                page.locator('#calibration-test').click()
                page.wait_for_function("""() => {
                  const element=document.querySelector('#calibration-report');
                  return element?.querySelectorAll('tbody tr').length===3 ||
                    (element?.textContent||'').startsWith('Calibration failed:');
                }""",timeout=args.timeout)
                calibration=page.locator('#calibration-report').inner_text()
                if 'Calibration failed:' in calibration:
                    raise AssertionError('VTL vowel calibration failed: '+calibration)
                calibration_rows = page.locator('#calibration-report tbody tr').evaluate_all(
                    "rows => rows.map(row => Array.from(row.querySelectorAll('td'), "
                    "cell => cell.textContent.trim()))")
                calibration_warnings = validate_vowel_calibration(calibration_rows)
                log['vowelCalibration'] = calibration
                log['vowelCalibrationRows'] = calibration_rows
                if calibration_warnings:
                    log['vowelCalibrationWarnings'] = calibration_warnings
                    print('VTL vowel calibration incomplete (not a deployment failure): '
                          + ', '.join(calibration_warnings), flush=True)
                # Confirm that simplification really exposes only two controllers.
                options=page.locator('#model option').evaluate_all('(xs)=>xs.map(x=>x.value)')
                if options != ['diva','td']:
                    raise AssertionError('Unexpected public controller list: '+repr(options))
                # Integration gate for the actual JD3 consonant target and
                # high-resolution VTL tube diagnostics (not phoneme accuracy).
                page.locator('#phrase').select_option('apa')
                page.wait_for_function("""() => {
                  const value=document.querySelector('#closure-report')?.textContent||'';
                  const wav=document.querySelector('#wav');
                  const status=document.querySelector('#audio-status')?.textContent||'';
                  return value.includes('/p/ at ') || status.startsWith('Error:');
                }""",timeout=args.timeout)
                report=page.locator('#closure-report').inner_text()
                status=page.locator('#audio-status').inner_text()
                if status.startswith('Error:') or '/p/ at ' not in report:
                    raise AssertionError('Consonant geometry diagnostics failed: '+status+'; '+report)
                if 'minimum n/a' in report:
                    raise AssertionError('No VTL tube aperture reported for /p/: '+report)
                log['closureDiagnostic'] = report
                if args.feedback_ablation:
                    # These three runs synthesize actual VTL WAVs. We do not
                    # assert that any condition sounds better: the reported
                    # values are experimental diagnostics, not intelligibility.
                    page.evaluate("""() => {
                      document.querySelector('#model').value='diva';
                      document.querySelector('#phrase').value='aia';
                      document.querySelector('#noise').value='0';
                      document.querySelector('#feedback').value='0.8';
                    }""")
                    page.locator('#feedback-test').click()
                    page.wait_for_function("""() => {
                      const state=document.querySelector('#feedback-test-report')?.dataset.state;
                      return state==='done' || state==='error';
                    }""",timeout=args.timeout)
                    ablation = page.locator('#feedback-test-report').inner_text()
                    if page.locator('#feedback-test-report').get_attribute('data-state') != 'done':
                        raise AssertionError('VTL feedback ablation failed: '+ablation)
                    if not all(label in ablation for label in
                        ('Auditory feedback off','Legacy unguarded feedback','Stabilized feedback')):
                        raise AssertionError('Missing conditions in VTL feedback ablation: '+ablation)
                    log['feedbackAblation']=ablation
                    print('Real VTL three-condition feedback ablation completed:', ablation,flush=True)
                log['result'] = 'PASS'
                print('Real VTL WebAssembly browser test PASSED:', state)
                print('Reference-place stop diagnostic:', report)
            finally:
                try:
                    log['lastScreen'] = snapshot(page)
                    page.screenshot(path=str(args.artifacts/'vtl-browser.png'), full_page=True, timeout=15000)
                except Exception as error:
                    log['events'].append('could not save browser screenshot: ' + str(error))
                browser.close()
    except Exception as error:
        log['result'] = 'FAIL'
        log['exception'] = str(error)
        print('VTL browser test FAILED:', error, flush=True)
        if 'lastScreen' in log:
            print('Browser status:', json.dumps(log['lastScreen'], indent=2), flush=True)
        print('Recent console messages:', *log['events'][-15:], sep='\n  ', flush=True)
        raise
    finally:
        (args.artifacts/'vtl-browser-result.json').write_text(json.dumps(log, indent=2))


if __name__ == '__main__':
    main()

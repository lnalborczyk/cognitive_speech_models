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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, default=ROOT/'artifacts')
    parser.add_argument('--timeout', type=int, default=180_000)
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

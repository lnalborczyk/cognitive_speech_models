#!/usr/bin/env python3
"""Require actual VTL WebAssembly synthesis + anatomy before Pages release.

Creates screenshot and JSON logs for debugging in GitHub Actions, including on
failure. This is an integration check: compiled VTL must execute in Chromium.
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
    p = subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1'],
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
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--artifacts', type=Path, default=ROOT/'artifacts')
    p.add_argument('--timeout', type=int, default=180_000, help='Browser timeout (milliseconds)')
    a = p.parse_args()
    a.artifacts.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    port = free_port()
    observations = {'url':f'http://127.0.0.1:{port}/', 'events':[], 'responses':{}, 'result':'not_started'}
    try:
        with serve(port), sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width':1280,'height':880})
            page.set_default_timeout(a.timeout)
            page.on('console', lambda msg: observations['events'].append('console '+msg.type+': '+msg.text) if msg.type in ('error','warning') else None)
            page.on('pageerror', lambda err: observations['events'].append('pageerror: '+str(err)))
            page.on('requestfailed', lambda req: observations['events'].append('requestfailed: '+req.url+' '+str(req.failure)))
            page.on('response', lambda res: observations['responses'].update({res.url.split('/')[-1]:res.status})
                    if any(res.url.split('?')[0].endswith(x) for x in ('vtl.js','vtl.wasm','vtl.data')) else None)
            try:
                page.goto(observations['url'], wait_until='domcontentloaded', timeout=30000)
                page.wait_for_function("document.querySelector('#engine-status')?.classList.contains('ready')", timeout=a.timeout)
                page.wait_for_function("!document.querySelector('#audio')?.disabled && !document.querySelector('#wav')?.disabled", timeout=a.timeout)
                page.locator('#native-geometry img').first.wait_for(state='visible', timeout=a.timeout)
                result = page.evaluate('''() => ({
                  engine: document.querySelector('#engine').value,
                  status: document.querySelector('#engine-status').textContent,
                  svgCount: document.querySelectorAll('#native-geometry img').length,
                  svgReady: !!document.querySelector('#native-geometry img')?.complete,
                  wavReady: !document.querySelector('#wav').disabled,
                  areaText: document.querySelector('#area-label')?.textContent,
                })''')
                observations['checks'] = result
                assert result['engine'] == 'wasm', 'Test did not use the browser WebAssembly engine'
                assert result['svgReady'] and result['svgCount'] >= 1, 'No rendered VTL SVG anatomy'
                assert result['wavReady'], 'VTL did not synthesize playable audio'
                assert any(name.startswith('vtl.wasm') and code == 200 for name,code in observations['responses'].items()), 'WASM binary not fetched successfully'
                observations['result'] = 'PASS'
                print('Real VTL WebAssembly browser test PASSED:',result)
            finally:
                page.screenshot(path=str(a.artifacts/'vtl-browser.png'),full_page=True,timeout=15000)
                observations['statusText'] = page.locator('#engine-status').inner_text(timeout=1000) if page.locator('#engine-status').count() else 'missing'
                browser.close()
    except Exception as error:
        observations['result']='FAIL'
        observations['exception'] = repr(error)
        raise
    finally:
        (a.artifacts/'vtl-browser-result.json').write_text(json.dumps(observations, indent=2))


if __name__ == '__main__':
    main()

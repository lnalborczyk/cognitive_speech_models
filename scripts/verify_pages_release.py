#!/usr/bin/env python3
"""Verify static GitHub Pages release includes usable assets at project subpath."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
MUST_EXIST = [
  'index.html', 'src/app.js', 'src/engine/wasm-client.js',
  'src/engine/wasm-worker.js', 'src/engine/wasm-runtime.js',
  'src/view/native-animation.js', 'src/view/style.css',
  'src/sim/closure-analysis.js',
  'web/vtl/vtl.js', 'web/vtl/vtl.wasm', 'web/vtl/build.json',
]
for path in MUST_EXIST:
    file = DIST/path
    if not file.is_file() or file.stat().st_size == 0:
        raise SystemExit(f'GitHub Pages release missing: {path}')
if (DIST/'web/vtl/vtl.wasm').read_bytes()[:4] != b'\0asm':
    raise SystemExit('Invalid WebAssembly binary signature in dist/')
index=(DIST/'index.html').read_text()
app=(DIST/'src/app.js').read_text()
if 'src/body/preview' in index+app or 'Browser approximation' in index:
    raise SystemExit('Legacy schematic component found in release')
if 'src/app.js' not in index or 'VocalTractLab' not in index:
    raise SystemExit('Entry point is not configured correctly')
# Absolute-origin URLs for assets would break username.github.io/repository-name/.
for offender in ('src="/src/', 'href="/src/', "import('/src/", 'src="/web/'):
    if offender in index:
        raise SystemExit(f'Absolute URL breaks GitHub Pages project sites: {offender}')
manifest=json.loads((DIST/'web/vtl/build.json').read_text())
assert manifest.get('revision'), 'Missing upstream commit identifier'
print('GitHub Pages static release verified (no API server required).')

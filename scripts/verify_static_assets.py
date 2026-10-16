#!/usr/bin/env python3
"""Basic artifact validation; does NOT replace a browser runtime smoke test."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
folder = root/'web'/'vtl'
for name in ('vtl.js', 'vtl.wasm', 'build.json'):
    file = folder/name
    if not file.is_file() or not file.stat().st_size:
        raise SystemExit(f'Missing compiled VTL asset: {name}')
if (folder/'vtl.wasm').read_bytes()[:4] != b'\0asm':
    raise SystemExit('Invalid WebAssembly binary magic')
manifest = json.loads((folder/'build.json').read_text())
if not manifest.get('revision') or not manifest.get('speaker_file'):
    raise SystemExit('Missing reproducibility metadata')
print('Compiled VTL assets exist; browser runtime validation still required.')

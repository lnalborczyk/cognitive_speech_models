#!/usr/bin/env python3
"""Build the real VocalTractLab C++ backend as a browser WebAssembly module.

Use the Emscripten SDK, not a native CMake build. No toy acoustic solver.
This experimental port depends on upstream source and has NOT been
validated as a successful Emscripten build on the author's machine.

Usage:
  source /path/to/emsdk/emsdk_env.sh
  python3 scripts/build_vtl_wasm.py --speaker /path/to/JD3.speaker
  python3 -m http.server 5173

For reproducibility, pass --source to a checked-out upstream revision.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
UPSTREAM='https://github.com/TUD-STKS/VocalTractLabBackend-dev.git'
# Keep the JS-facing memory views exported: newer Emscripten versions no
# longer expose HEAP* views on Module unless listed explicitly.
# src/engine/wasm-runtime.js relies on these views for C API marshalling.
RUNTIME_EXPORTS = ['cwrap', 'FS', 'HEAPU8', 'HEAP32', 'HEAPF64']

EXPORTS=[
    '_malloc','_free','_vtlInitialize','_vtlClose','_vtlGetConstants',
    '_vtlGetTractParamInfo','_vtlGetGlottisParamInfo','_vtlGetTractParams',
    '_vtlSynthBlock','_vtlTractToTube','_vtlExportTractSvg','_vtlGetTransferFunction',
]


def source_paths(root:Path)->list[Path]:
    cmake=(root/'CMakeLists.txt').read_text(encoding='utf-8-sig')
    match=re.search(r'set\s*\(\s*BackendSources\b(.*?)\)',cmake,re.S)
    if not match:
        raise RuntimeError('Cannot locate upstream BackendSources; upstream CMake may have changed')
    cpp=[root/item for item in re.findall(r'\bsrc/[^\s)]+\.cpp\b',match.group(1))]
    cpp.append(root/'src/VocalTractLabApi/VocalTractLabApi.cpp')
    missing=[str(p) for p in cpp if not p.is_file()]
    if missing:raise RuntimeError(f'Missing upstream C++ files: {missing}')
    if len(cpp)<20:raise RuntimeError('Upstream source set suspiciously small')
    return cpp


def build_command(source:Path,speaker:Path,out:Path,diagnostic:bool=False)->list[str]:
    return [
        'em++',('-O0' if diagnostic else '-O2'),'-std=c++17','-D_USE_MATH_DEFINES','-D_CRT_SECURE_NO_WARNINGS',
        '-I'+str(source/'include'),'-I'+str(source/'include/VocalTractLabApi'),
        *(str(p) for p in source_paths(source)),
        '--no-entry','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createVTLModule',
        '-sENVIRONMENT=worker,web','-sALLOW_MEMORY_GROWTH=1','-sFILESYSTEM=1',
        # VTL's C++ static initialization can exceed Emscripten's 64 KiB
        # default stack; memory growth does NOT make the stack grow.
        '-sSTACK_SIZE=16777216', # 16 MiB fixed C/C++ stack
        '-sINITIAL_MEMORY=268435456', # 256 MiB initial linear memory
        '-sMAXIMUM_MEMORY=1073741824', # cap browser memory at 1 GiB
        '-sASSERTIONS='+('2' if diagnostic else '1'),
        '-sSTACK_OVERFLOW_CHECK=2',
        *(['-g3','-sSAFE_HEAP=1'] if diagnostic else []),
        '-sEXPORTED_FUNCTIONS='+json.dumps(EXPORTS),
        '-sEXPORTED_RUNTIME_METHODS='+json.dumps(RUNTIME_EXPORTS),
        '--embed-file',str(speaker)+'@/speaker.speaker',
        '-o',str(out/'vtl.js'),
    ]


def main()->int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,default=ROOT/'.upstream'/'VocalTractLabBackend-dev',help='Local upstream checkout')
    p.add_argument('--speaker',type=Path,help='Existing .speaker file to embed (e.g., JD3.speaker)')
    p.add_argument('--ref',default='',help='Git commit/tag to check out after cloning (optional)')
    p.add_argument('--dry-run',action='store_true',help='Print the compile command without running it')
    p.add_argument('--diagnostic',action='store_true',help='Slow unoptimized build with source names, assertions and heap/stack checks')
    a=p.parse_args()
    source=a.source.expanduser().resolve()
    speaker=a.speaker or (Path(os.environ['VTL_SPEAKER']) if 'VTL_SPEAKER' in os.environ else None)
    if speaker is None:
        print('Missing VTL speaker. Pass --speaker /path/to/JD3.speaker or set VTL_SPEAKER.',file=sys.stderr)
        return 2
    speaker=speaker.expanduser().resolve()
    if not speaker.is_file() or speaker.suffix!='.speaker':
        print(f'Invalid speaker file: {speaker}',file=sys.stderr);return 2
    if not source.is_dir():
        if a.dry_run:
            print('Upstream source checkout does not exist; cannot dry run until it is present.',file=sys.stderr);return 2
        if not shutil.which('git'):print('git not found',file=sys.stderr);return 2
        source.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(['git','clone',UPSTREAM,str(source)],check=True)
    if a.ref:
        subprocess.run(['git','-C',str(source),'checkout',a.ref],check=True)
    out=ROOT/'web'/'vtl';out.mkdir(parents=True,exist_ok=True)
    try:cmd=build_command(source,speaker,out,diagnostic=a.diagnostic)
    except (OSError,RuntimeError) as e:
        print(f'Build configuration error: {e}',file=sys.stderr);return 2
    if a.dry_run:
        print(shlex.join(cmd));return 0
    if not shutil.which('em++'):
        print('Emscripten not found (em++). Run `source emsdk_env.sh` from your installed emsdk.',file=sys.stderr)
        return 2
    revision=subprocess.run(['git','-C',str(source),'rev-parse','HEAD'],text=True,
        capture_output=True,check=False).stdout.strip()
    # Remove stale compiled assets before attempting a new build.
    # Otherwise a failed build can leave broken files that the app retries.
    for name in ('vtl.js','vtl.wasm','vtl.data','build.json'):
        (out/name).unlink(missing_ok=True)
    print(f'Compiling {len(source_paths(source))} upstream C++ files to WebAssembly…',flush=True)
    subprocess.run(cmd,check=True,cwd=ROOT)
    manifest={'upstream':UPSTREAM,'revision':revision or 'unrecorded',
        'speaker_file':speaker.name,'speaker_embedded_path':'/speaker.speaker',
        'compiler':subprocess.run(['em++','--version'],text=True,capture_output=True).stdout.splitlines()[:1],
        'status':'compiled-not-yet-validated-against-reference-audio',
        'diagnostic':a.diagnostic,'stack_size_bytes':16777216,'initial_memory_bytes':268435456,
        'runtime_exports':RUNTIME_EXPORTS}
    (out/'build.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for name in ('vtl.js','vtl.wasm','vtl.data'):
        f=out/name
        print(f'{name}: '+(f'{f.stat().st_size:,} bytes' if f.exists() else 'not produced'))
    print('Serve the repository with python3 -m http.server 5173 and run the browser smoke check.')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except subprocess.CalledProcessError as e:
        print(f'Command failed with exit code {e.returncode}: {e.cmd}',file=sys.stderr);sys.exit(e.returncode)

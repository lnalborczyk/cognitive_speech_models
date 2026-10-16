#!/usr/bin/env python3
"""Compile the upstream VocalTractLab C API as a Linux shared object.

This skips upstream's GoogleTest FetchContent dependency for production-only
builds. No VocalTractLab sources are copied into this repository.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys
from build_vtl_wasm import source_paths


def command(source: Path, output: Path) -> list[str]:
    return [
        'g++', '-O2', '-fPIC', '-shared', '-std=c++17',
        '-D_USE_MATH_DEFINES', '-D_CRT_SECURE_NO_WARNINGS',
        '-I' + str(source/'include'),
        '-I' + str(source/'include/VocalTractLabApi'),
        *(str(p) for p in source_paths(source)),
        '-o', str(output),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    cmd = command(source, output)
    if args.dry_run:
        print(' '.join(cmd))
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, check=True)
    print(f'Built {output} ({output.stat().st_size:,} bytes)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

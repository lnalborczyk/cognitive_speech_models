#!/usr/bin/env python3
"""Stage only public static assets after a successful VTL WASM build/test."""
from pathlib import Path
from shutil import copy2, rmtree
from json import loads

root=Path(__file__).resolve().parents[1]
dist=root/'dist'
if dist.exists():rmtree(dist)
for relative in ('index.html','LICENSE','README.md'):
    source=root/relative
    destination=dist/relative
    destination.parent.mkdir(parents=True,exist_ok=True)
    copy2(source,destination)
for folder,exts in [('src',{'.js','.css'}),('docs',{'.md','.txt'}),
                    ('server',{'.py'}),('scripts',{'.py'})]:
    for source in (root/folder).rglob('*'):
        if source.is_file() and source.suffix in exts:
            dest=dist/source.relative_to(root)
            dest.parent.mkdir(parents=True,exist_ok=True)
            copy2(source,dest)
for name in ('vtl.js','vtl.wasm','build.json','vtl.data'):
    source=root/'web'/'vtl'/name
    if not source.exists():
        if name=='vtl.data':continue
        raise SystemExit(f'Missing VTL WebAssembly asset: {name}')
    dest=dist/'web'/'vtl'/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    copy2(source,dest)
(dist/'.nojekyll').write_text('')
print('GitHub Pages static files staged in dist/; .nojekyll disables Jekyll asset filtering')

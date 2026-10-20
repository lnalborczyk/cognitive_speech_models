#!/usr/bin/env python3
"""Run Cognitive Speech as one app (native VTL when installed, requires VTL).

    python3 scripts/launch.py                      # detect VTL, open browser
    python3 scripts/launch.py --install-vtl        # if necessary build VTL
    python3 scripts/launch.py --check              # print detection status
    python3 scripts/launch.py --no-browser --port 8000

The engine and HTML UI share ONE localhost process. No separate VTL GUI or
hand-written shell exports are required when the setup script generated its
environment file. This is *not* a WebAssembly port, so GitHub Pages cannot
run native VTL without a server.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import sys
import webbrowser

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts import setup_vtl


def load_generated_config(path:Path)->dict[str,str]:
    """Read only known, generated export assignments, without running shell."""
    env={}
    if not path.is_file():return env
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.startswith('export '):continue
        parts=shlex.split(line[7:])
        if len(parts)!=1 or '=' not in parts[0]:continue
        key,value=parts[0].split('=',1)
        if key in ('VTL_LIBRARY','VTL_SPEAKER') and Path(value).is_file():
            env[key]=str(Path(value).expanduser().resolve())
    return env


def locate_vtl(env_file:Path,prefix:Path)->tuple[str|None,str|None]:
    saved=load_generated_config(env_file)
    # Explicit environment takes precedence over installer-generated values.
    library=os.environ.get('VTL_LIBRARY') or saved.get('VTL_LIBRARY')
    speaker=os.environ.get('VTL_SPEAKER') or saved.get('VTL_SPEAKER')
    if library and speaker and Path(library).is_file() and Path(speaker).is_file():
        return library,speaker
    libs,speakers=setup_vtl.discover(prefix)
    pair=setup_vtl.pick_pair(libs,speakers)
    return (str(pair[0]) if pair[0] else None,str(pair[1]) if pair[1] else None)


def main()->int:
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--install-vtl',action='store_true',help='Build/install VTL if needed, using the existing installer')
    parser.add_argument('--check',action='store_true',help='Check for a compatible native engine and exit')
    parser.add_argument('--no-browser',action='store_true',help='Do not automatically open the interface in a browser')
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--prefix',type=Path,default=Path.home()/'.local/share/cognitive-speech/vtl')
    args=parser.parse_args()
    env_file=ROOT/'scripts/vtl-env.sh'
    prefix=args.prefix.expanduser().resolve()
    library,speaker=locate_vtl(env_file,prefix)
    if args.install_vtl and not (library and speaker):
        cmd=[sys.executable,str(ROOT/'scripts/setup_vtl.py'),'--prefix',str(prefix)]
        print('Setting up native VTL:', ' '.join(cmd),flush=True)
        result=subprocess.run(cmd,check=False)
        if result.returncode:
            print('VTL installation failed. VTL is required to run simulations.',file=sys.stderr)
        library,speaker=locate_vtl(env_file,prefix)
    if library and speaker:
        ok,detail=setup_vtl.smoke_test(Path(library),Path(speaker))
        if not ok:
            print('VTL found but cannot initialize:',detail,file=sys.stderr)
            library=speaker=None
    if args.check:
        print('VTL ready:' if library and speaker else 'VTL not available')
        if library:print('  library:',library)
        if speaker:print('  speaker:',speaker)
        return 0 if library and speaker else 1
    if library and speaker:
        os.environ['VTL_LIBRARY']=library
        os.environ['VTL_SPEAKER']=speaker
        print('Integrated native VTL found — browser will show real tract movement.')
    else:
        # Do not retain stale/broken environment settings.
        os.environ.pop('VTL_LIBRARY',None);os.environ.pop('VTL_SPEAKER',None)
        print('VTL absent — simulation disabled until VTL is connected.')
        print('Run python3 scripts/launch.py --install-vtl to install/build it.')
    os.environ['PORT']=str(args.port)
    url=f'http://127.0.0.1:{args.port}/?release=1.4.0'
    if not args.no_browser:
        # Wait until localhost server has started accepting connections.
        from threading import Timer
        Timer(1.0,lambda:webbrowser.open_new_tab(url)).start()
    print('Open the UPDATED UI at:',url,flush=True)
    print('If the page shows v0.5 or a schematic, close old tabs and open this exact URL.',flush=True)
    from server.app import main as serve
    serve()
    return 0

if __name__=='__main__':raise SystemExit(main())

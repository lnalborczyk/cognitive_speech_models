"""Minimal same-origin HTTP server for browser UI and optional native VTL.

Start with: VTL_LIBRARY=/path/to/libVocalTractLabApi.so
            VTL_SPEAKER=/path/to/JD3.speaker python3 -m server.app
"""
import json
import gzip
import os
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Lock
from urllib.parse import urlsplit
from .vtl import VocalTractLab, VTLError

ROOT=Path(__file__).resolve().parent.parent
APP_VERSION="0.9.0"


def get_vtl():
    library=os.environ.get('VTL_LIBRARY')
    speaker=os.environ.get('VTL_SPEAKER')
    if not library or not speaker:
        return None, 'Set both VTL_LIBRARY and VTL_SPEAKER environment variables.'
    try:return VocalTractLab(library,speaker), None
    except Exception as exc:return None, str(exc)

class Handler(SimpleHTTPRequestHandler):
    synth_lock=Lock()
    engine=None
    native_error=None
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    # A public deployment must not expose .git, .env, generated configs or
    # arbitrary files; only the site's documented, inspectable source is served.
    def allowed_static_path(self):
        path=urlsplit(self.path).path
        if path in ('/', '/index.html', '/README.md', '/LICENSE', '/favicon.ico'):
            return True
        parts=Path(path.lstrip('/')).parts
        if not parts or any(p.startswith('.') or p == '__pycache__' for p in parts):
            return False
        if parts[0] in ('src','docs'):
            return Path(path).suffix in ('.html','.css','.js','.md','.txt','.json','.svg')
        if parts[0] in ('scripts','server'):
            return Path(path).suffix == '.py'
        if parts[:2] == ('web','vtl'):
            return path in ('/web/vtl/vtl.js','/web/vtl/vtl.wasm',
                            '/web/vtl/vtl.data','/web/vtl/build.json')
        return False

    def send_head(self):
        if not self.allowed_static_path():
            self.send_error(404, 'File not found')
            return None

        # Python SimpleHTTPRequestHandler normally returns 304 for a matching
        # If-Modified-Since, even after replacing a ZIP with preserved mtimes.
        # Avoid serving stale HTML/ES module code from a previous release.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        return super().send_head()

    def end_headers(self):
        # Applies to the HTML, JS, CSS and JSON responses. Disables stale
        # imports after upgrades; this is a local development server only.
        self.send_header('Cache-Control','no-store, max-age=0')
        super().end_headers()

    def response(self,value,code=200):
        payload=json.dumps(value,allow_nan=False).encode('utf-8')
        # SVG animations contain many vector paths. Compress JSON as a whole;
        # fetch() automatically decompresses it in modern browsers.
        compressed = len(payload) > 4096 and 'gzip' in self.headers.get('Accept-Encoding','')
        if compressed: payload=gzip.compress(payload, compresslevel=5)
        self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8')
        if compressed:self.send_header('Content-Encoding','gzip')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store');self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/status':
            self.response({'available':self.engine is not None,
               'error':self.native_error,'engine':self.engine.info()['engine'] if self.engine else None, 'appVersion':APP_VERSION})
        elif path=='/api/speaker':
            if self.engine:self.response(self.engine.info())
            else:self.response({'error':self.native_error},503)
        elif path.startswith('/api/'):
            self.response({'error':'Unknown endpoint'},404)
        else:super().do_GET()
    def do_POST(self):
        if urlsplit(self.path).path!='/api/synthesize':
            return self.response({'error':'Unknown endpoint'},404)
        if not self.engine:return self.response({'error':self.native_error},503)
        if not self.synth_lock.acquire(blocking=False):
            return self.response({'error':'VTL is synthesizing another request; please retry in a moment.'},429)
        try:
            nbytes=int(self.headers.get('Content-Length','0'))
            if nbytes<=0 or nbytes>3_000_000:raise ValueError('Request body exceeds 3 MB limit')
            body=json.loads(self.rfile.read(nbytes))
            result=self.engine.synthesize(body['frames'],include_geometry=bool(body.get('geometry',True)),
                geometry_fps=body.get('geometryFps',24),
                reference_targets=body.get('referenceTargets',[]))
            self.response(result)
        except (ValueError,TypeError,KeyError,VTLError) as err:
            self.response({'error':str(err)},400)
        except Exception as err:
            self.response({'error':f'Native synthesis failed: {err}'},500)
        finally:
            self.synth_lock.release()


def main():
    engine,error=get_vtl()
    Handler.engine=engine;Handler.native_error=error
    if not engine and os.environ.get('REQUIRE_VTL') == '1':
        raise RuntimeError('VTL_REQUIRED: native VocalTractLab could not initialize: '+str(error))
    port=int(os.environ.get('PORT','8000'))
    host=os.environ.get('VTL_HOST','127.0.0.1')
    server=ThreadingHTTPServer((host,port),Handler)
    print(f'Cognitive Speech: http://{host}:{port}/')
    print('Native VTL: '+('AVAILABLE' if engine else 'unavailable — '+error),flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        if engine:engine.close()
if __name__=='__main__':main()

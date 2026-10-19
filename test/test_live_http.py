"""Full HTTP path against the synthetic ABI stub (NOT real VTL)."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.request import urlopen, Request
from urllib.error import URLError

ROOT=Path(__file__).resolve().parents[1]
class TestNativeHostedAPI(unittest.TestCase):
    def test_server_status_and_synthesize_with_stub(self):
        with tempfile.TemporaryDirectory() as temp:
            temp=Path(temp)
            library=temp/'libVocalTractLabApi.so'
            speaker=temp/'test.speaker';speaker.write_text('<test/>')
            source=ROOT/'test/vtl_stub.c'
            try:subprocess.run(['gcc','-shared','-fPIC','-O2',str(source),'-lm','-o',str(library)],check=True,capture_output=True)
            except (FileNotFoundError,subprocess.CalledProcessError):self.skipTest('gcc not available')
            with socket.socket() as s:
                s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            env={**os.environ,'PORT':str(port),'VTL_HOST':'127.0.0.1',
                 'VTL_LIBRARY':str(library),'VTL_SPEAKER':str(speaker),'REQUIRE_VTL':'1'}
            proc=subprocess.Popen(['python3','-m','server.app'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            root=f'http://127.0.0.1:{port}'
            try:
                for i in range(80):
                    try:
                        with urlopen(root+'/api/status',timeout=1) as res: status=json.load(res)
                        break
                    except (OSError,URLError):time.sleep(.1)
                else:self.fail('native test server did not start')
                self.assertEqual(status['appVersion'],'1.3.2')
                self.assertTrue(status['available'])
                with urlopen(root+'/api/speaker') as res: speaker_info=json.load(res)
                self.assertEqual(len(speaker_info['names']),8)
                frames=[{'t':i*.005,'x':[.5]*8} for i in range(40)]
                req=Request(root+'/api/synthesize',
                    data=json.dumps({'frames':frames,'geometry':True,'geometryFps':24}).encode(),
                    headers={'Content-Type':'application/json'})
                with urlopen(req,timeout=20) as res: result=json.load(res)
                self.assertGreater(len(result['audioBase64']),1000)
                self.assertEqual(len(result['svgs']),6)
                self.assertEqual(len(result['geometry'][0]['areas_cm2']),12)
            finally:
                proc.terminate()
                try:proc.wait(timeout=3)
                except subprocess.TimeoutExpired:proc.kill()

"""Test the ABI mapping against a compiled test-only C stub, not real VTL."""
import base64
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import wave
import io
from server.vtl import VocalTractLab

class TestNativeStub(unittest.TestCase):
    def test_native_abi_end_to_end_with_synthetic_stub(self):
        source=Path(__file__).with_name('vtl_stub.c')
        with tempfile.TemporaryDirectory() as temp:
            speaker=Path(temp)/'test.speaker';speaker.write_text('<test></test>')
            library=Path(temp)/'libVocalTractLabApi.so'
            try:
                subprocess.run(['gcc','-std=c11','-O2','-shared','-fPIC',str(source),'-o',str(library),'-lm'],check=True,capture_output=True)
            except (FileNotFoundError,subprocess.CalledProcessError):
                self.skipTest('gcc unavailable to build ABI mock')
            vtl=VocalTractLab(str(library),str(speaker))
            try:
                info=vtl.info()
                self.assertEqual(len(info['names']),8)
                self.assertTrue({'a','i','u','p','t','k','p:a','t:i','k:u'} <= set(info['shapes']))
                self.assertEqual(info['shapeSources']['p:a'],'ll-labial-closure(a)')
                frames=[{'t':i*.005,'x':[i/39]*8} for i in range(40)]
                result=vtl.synthesize(frames,reference_targets=[{'phone':'p','context':'a',
                    'source':info['shapeSources']['p:a'],'x':info['shapes']['p:a']}])
                self.assertEqual(result['sampleRate'],44100)
                self.assertEqual(result['references'][0]['phone'],'p')
                self.assertEqual(len(result['geometry']),6)
                self.assertEqual(len(result['svgs']),6)
                self.assertEqual(result['geometryFps'],24)
                self.assertAlmostEqual(result['svgs'][-1]['t'],frames[-1]['t'])
                with wave.open(io.BytesIO(base64.b64decode(result['audioBase64'])),'rb') as wav:
                    self.assertEqual(wav.getnframes(),39*220)
                    self.assertEqual(wav.getframerate(),44100)
                self.assertGreater(result['geometry'][0]['areas_cm2'][0],0)
            finally:vtl.close()

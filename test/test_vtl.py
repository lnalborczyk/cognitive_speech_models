import base64
import io
import struct
import unittest
import wave
from server.vtl import encode_wav, VTLError, VocalTractLab

class TestNativeContract(unittest.TestCase):
    def test_wav_is_pcm_and_correct_length(self):
        data=base64.b64decode(encode_wav([0,-.5,.5,1,-1],22050))
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual(wav.getframerate(),22050)
            self.assertEqual(wav.getnframes(),5)
            self.assertEqual(struct.unpack('<5h',wav.readframes(5)),(0,-16384,16384,32767,-32767))

    def test_no_native_library_is_not_silent_fallback(self):
        with self.assertRaisesRegex(VTLError,'not found'):
            VocalTractLab('/does/not/exist.so','/does/not/exist.speaker')

    def test_normalization_mapping(self):
        engine=VocalTractLab.__new__(VocalTractLab)
        engine.ntract=2
        engine.tract={'min':[-2,20],'max':[2,40]}
        self.assertEqual(engine._denormalize([0,.5]),[-2,30])
        self.assertEqual(engine._denormalize([-1,2]),[-2,40])
        self.assertEqual(engine._normalize(30,1),.5)
        with self.assertRaises(VTLError):engine._denormalize([.2])

if __name__=='__main__':unittest.main()

"""Tests for the build script only; no upstream VTL or em++ dependency."""
import importlib.util
import pathlib
import json
import re
import tempfile
import unittest

MODULE=pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'build_vtl_wasm.py'
spec=importlib.util.spec_from_file_location('build_vtl_wasm',MODULE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class BuildTests(unittest.TestCase):
    def test_source_parsing_and_export_contract(self):
        with tempfile.TemporaryDirectory() as d:
            source=pathlib.Path(d)
            files=[f'src/VocalTractLabBackend/part{i}.cpp' for i in range(21)]
            files.append('src/VocalTractLabApi/VocalTractLabApi.cpp')
            for f in files:
                fp=source/f;fp.parent.mkdir(parents=True,exist_ok=True);fp.write_text('')
            (source/'CMakeLists.txt').write_text('set(BackendSources\n'+'\n'.join(files[:-1])+'\n)')
            paths=mod.source_paths(source)
            self.assertEqual(len(paths),22)
            cmd=mod.build_command(source,source/'speaker.speaker',source/'out')
            self.assertIn('--no-entry',cmd)
            self.assertIn('-sSTACK_SIZE=16777216',cmd)
            self.assertIn('-sINITIAL_MEMORY=268435456',cmd)
            self.assertIn('-sSTACK_OVERFLOW_CHECK=2',cmd)
            self.assertIn('-sASSERTIONS=1',cmd)
            diagnostic=mod.build_command(source,source/'speaker.speaker',source/'out',diagnostic=True)
            self.assertIn('-sSAFE_HEAP=1',diagnostic)
            self.assertIn('-sASSERTIONS=2',diagnostic)
            self.assertNotIn('-sNO_ENTRY=1',cmd)
            self.assertIn('-sMODULARIZE=1',cmd)
            runtime_arg=next(arg for arg in cmd if arg.startswith('-sEXPORTED_RUNTIME_METHODS='))
            runtime_exports=set(json.loads(runtime_arg.split('=',1)[1]))
            self.assertTrue({'cwrap','FS','HEAPU8','HEAP32','HEAPF64'} <= runtime_exports)
            # Automatically catch missing heap exports when the runtime starts
            # reading additional Emscripten memory views in future releases.
            js=(MODULE.parents[1]/'src/engine/wasm-runtime.js').read_text()
            referenced=set(re.findall(r'\bthis\.m\.(HEAP[A-Z0-9]+)\b',js))
            self.assertTrue(referenced <= runtime_exports,
                f'Unexported VTL runtime heap views: {referenced-runtime_exports}')
            self.assertIn('_vtlSynthBlock',str(cmd))
            self.assertIn('_vtlExportTractSvg',str(cmd))
            self.assertIn('--embed-file',cmd)

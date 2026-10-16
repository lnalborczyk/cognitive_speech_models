"""Tests for the free GitHub Pages release and the optional local native API."""
import unittest
from pathlib import Path
import os
from unittest.mock import patch
from server import app

ROOT=Path(__file__).resolve().parents[1]

class TestDeployment(unittest.TestCase):
    def test_pages_workflow_runs_real_vtl_and_guards_publish(self):
        workflow=(ROOT/'.github/workflows/pages.yml').read_text()
        self.assertIn('branches: [main]',workflow)
        self.assertIn('workflow_dispatch:',workflow)
        self.assertIn('emscripten-core/setup-emsdk',workflow)
        self.assertIn('scripts/build_vtl_wasm.py',workflow)
        self.assertIn('scripts/check_browser_vtl.py',workflow)
        self.assertIn('scripts/verify_pages_release.py',workflow)
        self.assertIn('needs: build-and-test',workflow)
        self.assertIn('actions/deploy-pages',workflow)
        self.assertIn('vtl-wasm-diagnostics',workflow)

    def test_no_paid_hosting_required(self):
        self.assertFalse((ROOT/'render.yaml').exists())
        self.assertFalse((ROOT/'Dockerfile').exists())

    def test_missing_vtl_fails_fast_in_optional_native_server(self):
        with patch.dict(os.environ,{'REQUIRE_VTL':'1'},clear=True):
            with self.assertRaisesRegex(RuntimeError,'VTL_REQUIRED'):
                app.main()

    def test_disallowed_native_static_paths_not_served(self):
        handler=object.__new__(app.Handler)
        for p in ('/.git/config','/scripts/vtl-env.sh','/server/__pycache__/app.pyc','/.env'):
            handler.path=p
            self.assertFalse(handler.allowed_static_path(),p)

if __name__=='__main__':unittest.main()

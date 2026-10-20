#!/usr/bin/env bash
# Run at the root of cognitive_speech_models after applying the v1.5 patch.
# Removes only known obsolete tracked source/tests/docs; leaves git config, user files untouched.
set -euo pipefail
if [[ ! -f package.json || ! -f src/engine/wasm-runtime.js ]]; then
  echo 'Run this script from the cognitive_speech_models repository root.' >&2
  exit 1
fi
rm -rf server/
rm -f scripts/launch.py scripts/setup_vtl.py scripts/build_browser.sh scripts/build_native_linux.py scripts/smoke.mjs scripts/vtl-env.sh
rm -f src/sim/feedback-benchmark.js test/feedback-benchmark.test.js test/build-shell.test.js
rm -f test/test_live_http.py test/test_http_cache.py test/test_public_concurrency.py test/test_stub_integration.py test/test_vtl.py test/test_deployment.py
rm -f docs/vtl-setup.md docs/embedded-vtl.md docs/wasm-fix-0.8.2.md docs/synthesis-benchmark.md
rm -f README-APPLY.txt PATCH_NOTES.txt
printf 'Legacy native/server and retired UI components cleaned. Run npm test, then git add -A.\n'

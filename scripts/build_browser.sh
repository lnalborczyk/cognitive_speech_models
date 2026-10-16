#!/usr/bin/env bash
# Compile the *real* upstream VTL C++ backend to WASM and start a static app.
# Usage: bash scripts/build_browser.sh [/absolute/path/to/JD3.speaker] [--diagnostic]
# No administrator privileges are used. Emscripten lives in .toolchains/emsdk.
set -euo pipefail
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT"
if [[ -f scripts/vtl-env.sh ]]; then
  # setup_vtl.py creates this shell file with local VTL_LIBRARY/VTL_SPEAKER.
  source scripts/vtl-env.sh
fi
SPEAKER="${1:-${VTL_SPEAKER:-}}"
if [[ "$SPEAKER" == "--diagnostic" ]]; then SPEAKER="${VTL_SPEAKER:-}"; fi
DIAGNOSTIC=0
if [[ "${2:-}" == "--diagnostic" || "${1:-}" == "--diagnostic" ]]; then DIAGNOSTIC=1; fi
if [[ -z "$SPEAKER" || ! -f "$SPEAKER" ]]; then
  echo 'Speaker not found. Run: bash scripts/build_browser.sh /absolute/path/to/JD3.speaker' >&2
  echo 'Alternatively first run python3 scripts/setup_vtl.py to configure VTL_SPEAKER.' >&2
  exit 2
fi
if ! command -v em++ >/dev/null 2>&1; then
  if [[ ! -f .toolchains/emsdk/emsdk_env.sh ]]; then
    echo 'Installing Emscripten SDK locally under .toolchains/emsdk…'
    mkdir -p .toolchains
    git clone https://github.com/emscripten-core/emsdk.git .toolchains/emsdk
  fi
  # Reuse an existing SDK rather than downloading it at every invocation.
  if [[ ! -x .toolchains/emsdk/upstream/emscripten/em++ ]]; then
    (cd .toolchains/emsdk && ./emsdk install latest && ./emsdk activate latest)
  fi
  source .toolchains/emsdk/emsdk_env.sh
fi
if ! command -v em++ >/dev/null 2>&1; then
  echo 'Cannot find em++ after activating Emscripten.' >&2
  exit 1
fi
echo "Using $(em++ --version | head -1)"
# Avoid expanding an empty Bash array under macOS's default Bash 3.2 + set -u.
if (( DIAGNOSTIC )); then
  python3 scripts/build_vtl_wasm.py --speaker "$SPEAKER" --diagnostic
else
  python3 scripts/build_vtl_wasm.py --speaker "$SPEAKER"
fi
echo 'Build finished. To run the static browser application:'
echo '  python3 -m http.server 5173'
echo '  open http://localhost:5173'

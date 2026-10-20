# VocalTractLab WebAssembly integration

The public application uses **VTL WebAssembly exclusively**. Upstream VocalTractLab C++ code is compiled using Emscripten and runs in a browser Web Worker; there is no Python synthesis server, alternate simulated tract, or paid hosting requirement.

## Build and deployment

GitHub Actions compiles the [VocalTractLab backend](https://github.com/TUD-STKS/VocalTractLabBackend-dev) and embeds the JD3 speaker, then tests audio synthesis and anatomical rendering in Chromium before publishing static assets to GitHub Pages. See [deployment](deployment.md).

For a manual Emscripten build, use `python3 scripts/build_vtl_wasm.py --help`. Once the files `web/vtl/vtl.js`, `web/vtl/vtl.wasm`, and `web/vtl/build.json` exist, run `python3 -m http.server 5173` at the repository root and open `http://127.0.0.1:5173/`.

## Browser model

The worker loads Emscripten, initializes the JD3 speaker, exposes the VTL C API, runs the selected reduced-order motor controller, and generates the waveform, tract geometry and sensory diagnostics. Audio and anatomy are synchronized by the browser audio playhead. Worker errors are surfaced to the interface rather than replaced by synthetic placeholder anatomy.

## Scientific caveat

VTL geometry and acoustics are the real upstream model. DIVA and Task Dynamics control equations are simplified research/teaching implementations. Numeric transfer-function peak measurements, acoustic derivatives and sensory feedback are exploratory and must not be treated as validated measures of human speech motor control.

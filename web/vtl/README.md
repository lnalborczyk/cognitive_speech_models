# WebAssembly build artifacts

This directory intentionally **does not** contain a VocalTractLab binary.
To build the real VTL backend (`vtl.js`, `vtl.wasm`, `vtl.data (if generated)`) with Emscripten:

```sh
source /path/to/emsdk/emsdk_env.sh
python3 scripts/build_vtl_wasm.py --speaker /path/to/JD3.speaker
```

The compiler incorporates the VTL C++ sources and the specified `.speaker`
model. An actual Emscripten build is required; the JavaScript modules alone
are not an acoustic synthesizer. See `docs/webassembly.md`.

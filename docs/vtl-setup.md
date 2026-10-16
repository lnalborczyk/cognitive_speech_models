# Installing VocalTractLab as the native geometry + acoustics backend

**Native integration is implemented but not tested against a real VTL binary in the environment where this package was created.** Testing the Python bridge against the exact installed VTL API version is required before scientific use.

## Automatic native API setup (recommended for macOS / Linux)

```bash
python3 scripts/launch.py                 # reuse existing native VTL installation
python3 scripts/launch.py --install-vtl   # only if no suitable VTL is installed
```

The script searches common installation locations and environment variables for a shared
VTL API and `JD3.speaker`/`JD2.speaker`, checks that the native API symbols load, and
runs a speaker-initialization smoke test. If absent it builds the official development
backend source under `~/.local/share/cognitive-speech/vtl` (no `sudo`), and obtains a
speaker model from the official development GUI repository if necessary. Running a build
requires `git`, `cmake`, and a C++17 compiler, plus network access. This is not an
installation of the graphical VocalTractLab app. If automatic detection misses an
existing installation, explicitly set `VTL_LIBRARY` and `VTL_SPEAKER` to its files.

## Obtain the separate native dependency

The recommended system is [VocalTractLab](https://vocaltractlab.de/) (VTL 2.4 stable or compatible VTLBackend development API). VTL source, API examples and model resources are maintained by [TUD-STKS](https://github.com/TUD-STKS/VocalTractLabBackend-dev). It is free/open source under GPL-3.0, but it **is not bundled** in this repository. Obtain the speaker file matching your library version (`JD2.speaker`, `JD3.speaker` or another calibrated model).

The GitHub development branch has the relevant C API in `include/VocalTractLabApi/VocalTractLabApi.h` and may break compatibility. Typical build steps (from the VTLBackend repo, NOT this repo):

```bash
git clone https://github.com/TUD-STKS/VocalTractLabBackend-dev.git
cd VocalTractLabBackend-dev
cmake -S . -B out -DCMAKE_BUILD_TYPE=Release
cmake --build out --config Release --target VocalTractLabApi
# Find the shared library in the build's lib/ directory.
```

Windows users may instead obtain the stable release API DLL and matching `.speaker` from the official website. On macOS a source build may be needed; path and dynamic library extension depend on the platform.

## Start the native web application

```bash
cd cognitive_speech_models
export VTL_LIBRARY=/absolute/path/to/libVocalTractLabApi.so
export VTL_SPEAKER=/absolute/path/to/JD3.speaker
python3 -m server.app
```

For macOS, a `.dylib` may be used; on Windows set these environment variables to the paths of the API DLL and its speaker file. Navigate to `http://127.0.0.1:8000`; native VTL is selected automatically when available. The server binds only to localhost. No packages beyond Python's standard library are required by our bridge. A browser with support for ES modules is required.

`/api/status` reports library availability; `/api/speaker` reports parameter names, physical min/max bounds, neutral values, and available speaker shapes; `/api/synthesize` accepts an array of normalized time-sampled tract trajectories and responds with WAV and native geometry. The integration follows the VTL `vtlSynthBlock` API, which expects flattened tract/glottis parameter arrays of length `n_frames × n_parameters` and emits `(n_frames-1) × frame_step_samples` output samples.

## VTL-only browser mode (experimental)

The illustrative browser approximation was removed. To run the static browser app, compile the VTL WebAssembly engine using `bash scripts/build_browser.sh /absolute/path/JD3.speaker`. Without a working WASM engine or native API server the application displays an explicit unavailable state and disables simulations.

## Important limitations

- The native Python backend synthesizes VTL acoustic output after an open-loop motor simulation and has no online formant correction. The browser WebAssembly worker now computes VTL transfer-function resonances and tube constriction area during trajectory generation, with local numerical sensory derivatives. The auditory F1 shift is imposed on perceived feedback (not output audio); this is an exploratory controller, not a trained DIVA model.
- The hand-authored closed-loop actuator is the same across all controllers. It is not a force-driven finite-element model or an anatomically calibrated muscular plant.
- Named speaker targets (e.g. `a`, `i`) are retrieved from VTL using `vtlGetTractParams`; unsupported named targets are disabled, not invented.
- VTL SVG geometry and area functions are sampled at a selectable nominal 12, 20 or 30 FPS (maximum 120 snapshots per run); audio is synthesized for the full trajectory.
- Native API is not thread-safe by assumption; the supplied server intentionally uses single-threaded `HTTPServer`.
- For public hosting, include a successfully initialized VTL WASM binary. Static hosts such as GitHub Pages cannot run VTL native synthesis unless you separately host an appropriate backend; same-origin/CORS must then be handled responsibly.
- VTL itself is GPL-licensed. Consider implications before linking and distributing combined derivatives. This project declares GPL-3.0-compatible terms.

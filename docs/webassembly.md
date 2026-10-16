# WebAssembly port of VocalTractLab (experimental)

## Status (v0.8)

- **Implemented:** Emscripten build script for the upstream C++ backend; Web Worker adapter that invokes VTL's C API; metadata and speaker-shape extraction; real `vtlSynthBlock` audio; real `vtlTractToTube` area functions; real `vtlExportTractSvg` articulatory outlines; synchronized timeline in the existing UI.
- **Tested:** JavaScript WebAssembly memory marshalling and response schema against a mock C API, source-file discovery and build-flag tests, previous native API tests.
- **Not yet tested:** A real VTL WASM compile, loading a real VTL speaker in WASM, or the quality and speed of real browser synthesis. No `vtl.wasm` or `vtl.js` binary is included in this repository; the GitHub Actions workflow now compiles and browser-tests them before publishing. The app falls back to the local Python/VTL backend, then disables simulations if neither backend initializes.

A C++ shared library installed on macOS cannot be copied into a GitHub Pages site. A genuine WebAssembly build **must** recompile the VTL source using Emscripten. This implementation attempts that without substituting a simplistic source-filter synthesizer. See [the free GitHub Pages deployment guide](deployment.md) for the automated build and test pipeline.

## One-time prerequisites

1. Install/activate the Emscripten SDK from https://emscripten.org/docs/getting_started/downloads.html and check `em++ --version`.
2. Obtain a compatible VocalTractLab `.speaker` file, e.g. `JD3.speaker`, from your installed VTL package. The build embeds this model into Emscripten's virtual file system.
3. Ensure that Python 3 and Git are available. Emscripten handles the C++ standard library.

The convenience installer can set up Emscripten in a project-local directory
and compile the upstream backend in a single command:

```bash
cd cognitive_speech_models
bash scripts/build_browser.sh /absolute/path/to/JD3.speaker
```

Alternatively, use an existing Emscripten SDK:

```bash
source /path/to/emsdk/emsdk_env.sh
em++ --version
python3 scripts/build_vtl_wasm.py --speaker /absolute/path/to/JD3.speaker
```

To use a specific upstream checkout or pinned revision:

```bash
python3 scripts/build_vtl_wasm.py \
  --source /path/to/VocalTractLabBackend-dev \
  --speaker /absolute/path/to/JD3.speaker
```

The build uses the source manifest from upstream `CMakeLists.txt`, but directly links the necessary `.cpp` files through `em++` to avoid fetching the optional GoogleTest dependency. It emits `web/vtl/vtl.js`, `web/vtl/vtl.wasm`, and (if Emscripten creates one) `web/vtl/vtl.data`. Outputs are ignored by Git until deliberately staged for deployment.

Upstream source: https://github.com/TUD-STKS/VocalTractLabBackend-dev (GPL-3.0-or-later). Emscripten documentation: https://emscripten.org/docs/compiling/Building-Projects.html.

## Run as a browser-only application

```bash
python3 -m http.server 5173
```

Visit http://localhost:5173. A successful initialization should enable and select **VocalTractLab WebAssembly (in-browser)**. The browser needs no Python *synthesis* server. A simple static HTTP server remains necessary to deliver the assets. A successful build could be hosted on GitHub Pages after its artifacts are made available and licensing requirements are met.

If the WASM initialization fails, check the browser developer console and VTL connection status. Use the existing native implementation as a known-working fallback:

```bash
python3 scripts/launch.py
```

## Architecture

```text
src/cognitive/{diva,godiva,geppeto-ofc,task-dynamics}.js
                  |
src/sim/runner.js (same normalized trajectories)
                  |
   +--------------+------------------+
   |                                 |
src/engine/wasm-client.js        server/app.py
   |                                 |
Web Worker                           server/vtl.py
   |                                 |
src/engine/wasm-runtime.js       native .dylib/.so
   |                                 |
VTL C API from wasm                VTL C API from native binary
   +--------------+------------------+
                  |
VTL SVG anatomy + tube area + WAV audio
                  |
 src/view/native-animation.js (audio-synchronized)
```

The Emscripten build embeds `.speaker` resources, and `vtlExportTractSvg` writes frames into its in-memory virtual filesystem. It is **not** instantaneous vocal-tract physics during audio playback: it calculates a sequence of VTL states and displays precomputed anatomical frames synchronized to sound. Controller timing and synthetic gesture targets have not been calibrated against human speech.

## Comparison and validation needed before scientific use

1. Compile against a known VTL revision (save its commit SHA in the generated manifest).
2. Test speaker initialization in a real browser and inspect SVG output.
3. Match equivalent native and WASM parameter trajectories: compare PCM samples within tolerances; tube lengths and areas should agree numerically.
4. Measure browser memory, load time and synthesis latency for /aia/, /apa/, and /pataka/ on Safari/Chrome/Firefox.
5. Investigate numerical portability (floating point, VTL statefulness, speaker/glottis presets) before treating output as validated.
6. Check VTL GPL obligations when distributing compiled artifacts and source; speaker-model redistribution permissions may be separate.

## Troubleshooting / known risks

- The upstream backend documents native builds; the Emscripten port is experimental and C++ source changes or filesystem assumptions can break it.
- `vtl.js` alone is insufficient; serve its `.wasm` and `.data` siblings.
- Some speech segments require a speaker with the associated named targets. The UI disables unavailable phrases rather than fabricating them.
- Long runs and 30-fps anatomical SVG frames may consume substantial browser memory. Computation runs in a Web Worker so the interface does not freeze, but the request is still precomputed and not low-latency streaming speech synthesis.
- A browser may reject audio playback unless initiated by a user click.

### Emscripten 6 compatibility note

The build uses `--no-entry` to compile VTL as a browser module without a `main()` function. Older experimental versions of this repository used the invalid `-sNO_ENTRY=1`, which raises `Attempt to set a non-existent setting: ENTRY` on Emscripten 6.0.12. Rerunning `bash scripts/build_browser.sh /absolute/path/to/JD3.speaker` after updating the script is sufficient; reinstalling the SDK is unnecessary.

## v0.6: diagnosing `__wasm_call_ctors` out-of-bounds memory access

The reported macOS Emscripten 6.0.12 failure occurs **during WebAssembly initialization**, before `vtlInitialize` or any requested synthesis. It is not caused by missing phonetic targets or WAV rendering. One plausible cause is exhaustion of the C/C++ stack inside a static constructor: the compiler default is small, and enabling dynamic WebAssembly memory growth does not enlarge the stack. It is *not yet established* that this is the root cause in VTL.

The compiler now sets `-sSTACK_SIZE=16777216`, `-sINITIAL_MEMORY=268435456`, `-sMAXIMUM_MEMORY=1073741824`, and `-sSTACK_OVERFLOW_CHECK=2`. It also enables assertions. The old assets are deleted before recompiling to avoid attempting to load the previously broken binary after a build failure.

If initialization still fails, use:

```bash
SPEAKER="$HOME/.local/share/cognitive-speech/vtl/VocalTractLabBackend-dev/resources/JD3.speaker"
bash scripts/build_browser.sh "$SPEAKER" --diagnostic 2>&1 | tee wasm-build.log
python3 -m http.server 5173
```

Capture the browser DevTools console exception. The `--diagnostic` switch builds with `-O0 -g3 -sASSERTIONS=2 -sSTACK_OVERFLOW_CHECK=2 -sSAFE_HEAP=1`. If the trap persists despite larger stack, investigate the C++ static constructor causing it and verify its memory accesses; simply increasing heap limits further is not a sufficient fix.

**The native VTL launcher continues to work independently:** `python3 scripts/launch.py`. The browser no longer substitutes a toy articulatory tract when the WASM engine fails.

## macOS Bash 3.2 fix (v0.6.1)

The old `build_browser.sh` expanded an empty `EXTRA[@]` array with `set -u`, which raised `unbound variable` on Apple macOS Bash. The script now branches explicitly for normal and `--diagnostic` builds, reuses a previously installed Emscripten SDK, and does not require its reinstallation on each run. The real Emscripten compilation is still experimental and must be validated separately.


For browser-based multisensory feedback, the Emscripten export list also includes `vtlGetTransferFunction`. Its spectral magnitude output is read by `src/engine/vtl-sensing.js`. After modifying C API exports, always rebuild the WASM binary (updating JavaScript alone is insufficient).

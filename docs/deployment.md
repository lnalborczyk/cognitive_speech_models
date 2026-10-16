# Free GitHub Pages deployment (v0.8.0)

This project can be hosted without a paid server **if and only if** the experimental VTL WebAssembly port compiles and initializes. GitHub Pages serves *static* artifacts; it cannot run a native Python/C++ API. The VTL Web Worker synthesizes sound and renders anatomical SVGs on the visitor's machine.

## One-time setup

1. Make a **public** repository called `cognitive_speech_models` on GitHub. Unzip the release locally and push **its contents** to the repository's `main` branch.
2. Go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Go to **Actions → Build VTL WebAssembly and deploy GitHub Pages → Run workflow**. The workflow also runs on future pushes to `main`.
4. If the Actions run is green, the site URL is usually `https://USERNAME.github.io/cognitive_speech_models/` (also shown in the Actions deployment job and Pages settings).

The repository includes `.github/workflows/pages.yml`. It builds directly on a Linux GitHub-hosted runner; you do not need your Mac to remain online or to commit large WASM files.

## What the workflow actually checks

- JavaScript and Python tests must pass.
- VTL's C++ backend and upstream JD3 speaker are checked out and compiled by **Emscripten 6.0.12**.
- The produced `.wasm` must be a valid WASM binary; bundle metadata records the exact upstream commit.
- A real headless Chromium instance must load the static page, initialize the **VTL WebAssembly** worker, synthesize WAV audio, and display at least one real VTL SVG anatomical frame.
- Only after every check passes is the site uploaded and deployed through GitHub Pages.

**No fallback to schematic articulation exists.** If WASM fails, publishing is stopped rather than advertising a non-working interactive site.

## If the build fails

In the failed Actions run, open **Artifacts → `vtl-wasm-diagnostics`** (available even on compilation failure). Important files:

- `emscripten-build.log`: errors from compiling VTL C++.
- `vtl-browser-result.json`: browser status, network requests and console errors.
- `vtl-browser.png`: screenshot of the failed/successful attempt.
- `upstream-revision.txt`: upstream Git commit.

If you previously saw `Out of bounds memory access` near `__wasm_call_ctors`, the engine was crashing **before** VTL initialization. Stack/memory flags are present in the build, but the cause is still unconfirmed. Don't assume increasing memory will necessarily solve it. You can also select **Run workflow → diagnostic=true** to compile with slower, more detailed memory checks.

A failed Actions run means **no new site is deployed**. It doesn't uninstall or modify your locally functioning VTL.

## Local WebAssembly testing

```bash
SPEAKER="$HOME/.local/share/cognitive-speech/vtl/VocalTractLabBackend-dev/resources/JD3.speaker"
bash scripts/build_browser.sh "$SPEAKER"
python3 -m http.server 5173
```

Open `http://localhost:5173/`, not a `file://` URL. VTL WASM should be selected, audio and anatomy enabled. The native server remains separately available via `python3 scripts/launch.py`.

## Costs, limitations and licensing

- **GitHub Pages is free for public repositories** on GitHub Free; GitHub Actions usage and site size/bandwidth remain subject to GitHub policies and quotas.
- Compiling and browser testing might take several minutes on the GitHub-hosted runner.
- Browsers execute VTL locally, so large `.wasm` downloads or slow synthesis may affect visitors, particularly on mobile.
- The code uses the upstream GPL-licensed VTL backend and a bundled speaker file. Verify and comply with redistribution/license requirements before making the site public.
- WebAssembly compatibility, browser runtime stability and scientific model fidelity are not established by the current unit tests. The real-browser smoke test is the release gate.

GitHub documentation: [Pages via custom GitHub Actions workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

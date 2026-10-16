# Cognitive Speech Models

**Version 0.8.1 — free GitHub Pages / WebAssembly experiment**

Interactive speech-production research demonstrator using four **theory-inspired** controller modules (DIVA, GODIVA, GEPPETO, Task Dynamics) and a shared VocalTractLab (VTL) articulatory/acoustic engine. All articulator SVG frames and synthesized audio require **real VTL**; there is no schematic browser fallback.

## Diagnosing a failed GitHub Pages browser build (v0.8.1)

The v0.8.0 browser test waited three minutes for `#engine-status.ready`, even when VTL initialization had failed. This release adds progress messages for WebAssembly import, C++ static constructors, `vtlInitialize`, metadata loading and the initial synthesis, with a worker startup watchdog. The smoke test fails immediately on a reported initialization/synthesis error and saves `artifacts/vtl-browser-result.json` and a screenshot. The underlying VTL WebAssembly initialization problem is **not yet established or fixed**.

After pushing to GitHub, open the failed Actions run → **Artifacts** → `vtl-wasm-diagnostics`. Inspect `vtl-browser-result.json`, especially `lastScreen.engineStatus`, `events` and `network`. Send that JSON to diagnose the actual cause. No local VTL installation is needed for GitHub Actions.

## Free online hosting: GitHub Pages

This release makes **GitHub Pages** the primary deployment target, with **no paid server**. GitHub Pages serves HTML/JS/WASM. Visitors run the compiled VTL backend locally in their browser, on a Web Worker.

**Important:** The Emscripten port is experimental. Neither an actual VTL WebAssembly build nor deployment to a public GitHub Pages URL could be completed in this environment. The GitHub Actions pipeline will **refuse to publish** unless it can compile VTL *and* use it for audio + SVG anatomical animation in a real Chromium browser. A failed Action is expected if upstream VTL has unresolved WebAssembly compatibility problems; it does **not** imply a missing VTL installation on your Mac.

### Publish it (GitHub Free with a public repository)

1. Create a **public** GitHub repository named `cognitive_speech_models` and upload/push **the contents of this folder**. Do not upload the ZIP as a single tracked file.
2. In the repository, open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open **Actions → Build VTL WebAssembly and deploy GitHub Pages → Run workflow**, or push to `main` to trigger it automatically.
4. Wait for **Compile VTL to WebAssembly** and **Verify synthesis and anatomical playback in Chromium**. Publication follows only if **both succeed**.
5. Once deployment succeeds, visit `https://YOUR-GITHUB-USERNAME.github.io/cognitive_speech_models/`.

If it fails, download the Actions artifact **`vtl-wasm-diagnostics`**, which contains compiler logs, browser screenshot and console errors, then share its error output for debugging. Pages may need to be enabled before the workflow can deploy. GitHub Free provides Pages for public repositories, subject to GitHub's usage policies and Actions limits.

Detailed instructions: **[docs/deployment.md](docs/deployment.md)**.

### Test locally without paying

Your working native installation remains the most reliable way to experiment:

```bash
python3 scripts/launch.py
# open http://127.0.0.1:8000/
```

To attempt the **same browser-only VTL build** on macOS:

```bash
SPEAKER="$HOME/.local/share/cognitive-speech/vtl/VocalTractLabBackend-dev/resources/JD3.speaker"
bash scripts/build_browser.sh "$SPEAKER"
python3 -m http.server 5173
# open http://localhost:5173/
```

Do not copy a `.dylib` into the static site; Pages can only use the output of an Emscripten WebAssembly compilation.

## Code structure

| Component | Source files |
|---|---|
| DIVA, GODIVA, GEPPETO, Task Dynamics controllers | `src/cognitive/` |
| Planning/gestural scores | `src/motor/gestures.js` |
| Common simplified actuator dynamics | `src/motor/plant.js` |
| Browser WebAssembly worker and C API adapter | `src/engine/` |
| Anatomical playback and plots | `src/view/` |
| Optional **local** native VTL server | `server/` and `scripts/launch.py` |
| Upstream VTL WASM build | `scripts/build_vtl_wasm.py` |
| Automated Pages deployment and browser test | `.github/workflows/pages.yml`, `scripts/check_browser_vtl.py` |

The JavaScript and Python sources are readable within the application. Compilation pulls the official [VocalTractLab backend development repository](https://github.com/TUD-STKS/VocalTractLabBackend-dev), embeds its supplied `JD3.speaker`, and records the upstream commit in `web/vtl/build.json`.

## Scientific and licensing limitations

The **VTL tract model, area functions, and acoustic synthesis** come from the upstream synthesizer if the browser build succeeds. The four cognitive controllers are **reduced-order educational implementations**, not published model replications. Native-versus-WebAssembly audio equivalence and Safari compatibility have **not** been established.

VTL's backend source is GPL-licensed; distributing derived compiled modules requires meeting the applicable GPL obligations and attributing the upstream authors. The speaker model should also be checked for any separate redistribution restrictions. The workflow fetches the resources supplied by the upstream project; this does not establish additional rights.

Documentation: [model approximations](docs/models.md) · [WebAssembly details](docs/webassembly.md) · [scientific validation](docs/validation.md).

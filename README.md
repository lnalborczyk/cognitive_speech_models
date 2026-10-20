# Cognitive Speech Models

[**Open the interactive application**](https://lnalborczyk.github.io/cognitive_speech_models/) · [Repository](https://github.com/lnalborczyk/cognitive_speech_models) · [Issues](https://github.com/lnalborczyk/cognitive_speech_models/issues)

**Cognitive Speech Models** is a free browser-based research and teaching sandbox for speech motor control. It provides two **reduced-order**, inspectable controllers (DIVA-inspired and Task Dynamics-inspired) connected to a common [VocalTractLab](https://vocaltractlab.de/) (VTL) geometric/acoustic engine compiled to **WebAssembly**. No backend server, account or local software installation is needed to use the public site.

The modular, interactive approach was inspired by [**CognitiveHands — CrumpLabSandbox**](https://github.com/CrumpLabSandbox/CognitiveHands) ([live application](https://crumplabsandbox.github.io/CognitiveHands/)). Cognitive Speech Models is an independent adaptation for speech production; it is not an official CognitiveHands component.

## Using the application

Choose a controller and phonetic utterance, then click **Run**. Play the speech and synchronized VTL anatomical animation, scrub the timeline, inspect articulatory and acoustic trajectories, and download the WAV or trajectory CSV. Auditory feedback is off by default because its gains are not calibrated to human data.

For more parameters, open **Advanced motor and feedback controls**. To reproduce exploratory experiments, expand **Research and validation tools**. The main page intentionally omits legacy multi-controller comparisons, server settings, and a permanently open panel of research tests.

### Implemented controllers

- **DIVA-inspired:** feedforward articulatory target tracking with delayed somatosensory feedback and optional VTL transfer-function-based auditory feedback. Adjustable feedforward strength supports testing the balance between restoring drive and auditory correction. There are **no learned DIVA neural maps**.
- **Task Dynamics-inspired:** overlapping articulatory gestures with numerical constriction information from the VTL plant. This is not a complete original Task Dynamics implementation.

Both use the same normalized actuator and VTL speaker. The underlying vocal-tract geometry and acoustic synthesis come from VTL; the motor controller and target scheduling models remain simplified and are **not validated reproductions** of published speech-control systems.

### Validation tools

- **Reference vowel calibration:** measures repeatability of F1–F3 at /a/, /i/ and /u/ speaker shapes. Missing formants remain unresolved and never count as zero error.
- **Local F1 sensitivity:** estimates finite-difference F1 changes to small perturbations of individual VTL parameters at canonical vowel targets; this is a diagnostic, **not** a learned or validated auditory inverse map.
- **Feedforward/feedback balance:** compares paired VTL-predicted F1 responses across feedback gains and feedforward strengths, while reporting target tracking and missing measurements.
- **Feedback sweep:** compares unperturbed tracking over auditory gains and delays. The zero-gain condition must be invariant to auditory delay.
- **Paired perturbation:** compares produced F1 with and without an auditory feedback shift using matched targets and RNG seed, and exports time courses for inspecting response direction and latency.

These experiments do not establish speech intelligibility, biological fidelity, or perceptual compensation.

The [automated VTL feedback-balance validation](docs/feedback-balance-validation.md) executes local F1-sensitivity and matched ±150-Hz sustained-vowel simulations in a browser and saves downloadable results in GitHub Actions artifacts.

## Source structure

| Path | Responsibility |
|---|---|
| `src/cognitive/diva.js` | Reduced-order DIVA-inspired motor controller |
| `src/cognitive/task-dynamics.js` | Task Dynamics-inspired controller |
| `src/motor/gestures.js` | Phonetic targets and gestural overlap |
| `src/motor/plant.js` | Shared normalized actuator |
| `src/engine/vtl-sensing.js` | VTL-derived tube area, formants, and local F1 sensitivity |
| `src/engine/wasm-runtime.js` | VocalTractLab C API adapter |
| `src/engine/wasm-worker.js` | Browser worker for simulation and speech synthesis |
| `src/app.js` | Interface, plotting, downloads, and experiments |
| `.github/workflows/` | WebAssembly build, browser smoke test, and automated validation |

Every component is a separate readable source file, linked from the [GitHub repository](https://github.com/lnalborczyk/cognitive_speech_models/tree/main/src).

## Development and deployment

Run source tests with `npm test`. To preview locally after compiling VTL WebAssembly assets, serve the repository using `python3 -m http.server 5173`, then open `http://localhost:5173/`. Rebuild with the Emscripten process in `scripts/build_vtl_wasm.py` or the GitHub Pages Actions workflow. GitHub Pages serves static HTML/JS/WASM; synthesis runs on the **visitor's machine**. The workflow tests the real VTL worker in Chromium before deploying.

See [deployment instructions](docs/deployment.md) and [validation limits](docs/validation.md). The VTL C++ backend and its speaker resources have their own upstream licenses; ensure compliance when redistributing compiled assets. See [`LICENSE`](LICENSE) for the repository license.

## References

- [CrumpLabSandbox: CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands)
- [VocalTractLab / articulatory synthesis](https://vocaltractlab.de/) and its [C API backend](https://github.com/TUD-STKS/VocalTractLabBackend-dev)
- [Tourville & Guenther: DIVA](https://pmc.ncbi.nlm.nih.gov/articles/PMC3650855/)
- [Saltzman & Munhall: Task Dynamics](https://doi.org/10.1207/s15326969eco0104_2)

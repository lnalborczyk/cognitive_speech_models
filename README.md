# Cognitive Speech Models

[**Open the interactive application**](https://lnalborczyk.github.io/cognitive_speech_models/) · [Repository](https://github.com/lnalborczyk/cognitive_speech_models) · [Issues](https://github.com/lnalborczyk/cognitive_speech_models/issues)

**Cognitive Speech Models** is a free browser-based research and teaching sandbox for speech motor control. It provides two **reduced-order**, inspectable controllers (DIVA-inspired and Task Dynamics-inspired) connected to a common [VocalTractLab](https://vocaltractlab.de/) (VTL) geometric/acoustic engine compiled to **WebAssembly**. No backend server, account or local software installation is needed to use the public site.

The modular, interactive approach was inspired by [**CognitiveHands — CrumpLabSandbox**](https://github.com/CrumpLabSandbox/CognitiveHands) ([live application](https://crumplabsandbox.github.io/CognitiveHands/)). Cognitive Speech Models is an independent adaptation for speech production; it is not an official CognitiveHands component.

## Using the application

Choose a controller and phonetic utterance, then click **Run**. Play the speech and synchronized VTL anatomical animation, scrub the timeline, inspect articulatory and acoustic trajectories, and download the WAV or trajectory CSV. Auditory feedback is off by default because its gains are not calibrated to human data.

For more parameters, open **Advanced motor and feedback controls**. To reproduce exploratory experiments, expand **Research and validation tools**. The main page intentionally omits legacy multi-controller comparisons, server settings, and a permanently open panel of research tests.

### Implemented controllers

- **DIVA-inspired:** speech-sound-specific auditory goal regions, delayed sensory error corrections, and a local inverse map **learned from exploratory VTL articulatory movements** (an explicit *babbling approximation*). The research tools also illustrate updating feedforward motor-command templates across repeated trials. The learned map is local ridge regression; **it is not the neural architecture of the published DIVA model**. A numerical-Jacobian mapping remains available as a control comparison.
- **Task Dynamics-inspired:** independent, overlapping consonant and vowel gestures, a reduced coupled-timing graph, and critically damped task-space attractors. Targets and task Jacobians are computed from VTL tube geometry, with regularized inverse kinematics. **The constriction variables are effective tube apertures and constriction centroids, not the original TADA palate-to-articulator distances or coupled-oscillator network**.

Both use the same normalized actuator and VTL speaker. The underlying vocal-tract geometry and acoustic synthesis come from VTL; the controllers are **research-inspired adaptations, not validated reproductions** of published DIVA or TADA. Training is run locally when the DIVA controller first executes. The VTL transfer function may not resolve every formant (particularly /i/ F1); missing data remain explicitly missing. Training and gestural movement are deterministic for a fixed seed and model configuration.

### Validation tools

- **Reference vowel calibration:** measures repeatability of F1–F3 at /a/, /i/ and /u/ speaker shapes. Missing formants remain unresolved and never count as zero error.
- **Local F1 sensitivity:** estimates finite-difference F1 changes to small perturbations of individual VTL parameters at canonical vowel targets; this provides a numerical comparison to, but not validation of, the learned inverse mapping.
- **DIVA learning demonstration:** retrains the exploratory babbling map and practices an utterance across five attempts, displaying tracking and effort; the update rule is illustrative, not the published DIVA synaptic learning rule.
- **Feedforward/feedback balance:** compares paired VTL-predicted F1 responses across feedback gains and feedforward strengths, while reporting target tracking and missing measurements.
- **Feedback sweep:** compares unperturbed tracking over auditory gains and delays. The zero-gain condition must be invariant to auditory delay.
- **Paired perturbation:** compares produced F1 with and without an auditory feedback shift using matched targets and RNG seed, and exports time courses for inspecting response direction and latency.

These experiments do not establish speech intelligibility, biological fidelity, or perceptual compensation.

The [automated VTL feedback-balance validation](docs/feedback-balance-validation.md) executes local F1-sensitivity and matched ±150-Hz sustained-vowel simulations in a browser and saves downloadable results in GitHub Actions artifacts.

## Source structure

| Path | Responsibility |
|---|---|
| `src/cognitive/diva.js` | Sensory-region controller and learned inverse-map integration |
| `src/cognitive/diva-learning.js` | Exploratory VTL babbling, ridge inverse map, practice updates |
| `src/cognitive/task-dynamics.js` | Task Dynamics controller |
| `src/motor/tract-variables.js` | VTL tube constriction variables, independent gestural targets and Jacobians |
| `src/motor/task-dynamics-control.js` | Second-order task attractors and damped inverse kinematics |
| `src/motor/gestural-oscillators.js` | Reduced gestural coupling / timing optimizer |
| `src/motor/gestures.js` | Speaker-specific phonetic shapes and gestural overlap |
| `src/motor/plant.js` | Shared normalized actuator |
| `src/engine/vtl-sensing.js` | VTL-derived tube area, formants, and local F1 sensitivity |
| `src/engine/wasm-runtime.js` | VocalTractLab C API adapter |
| `src/engine/wasm-worker.js` | Browser worker for simulation and speech synthesis |
| `src/app.js` | Interface, plotting, downloads, and experiments |
| `.github/workflows/` | WebAssembly build, browser smoke test, and automated validation |

Every component is a separate readable source file, linked from the [GitHub repository](https://github.com/lnalborczyk/cognitive_speech_models/tree/main/src).

## Development and deployment

Run source tests with `npm test`. To preview locally after compiling VTL WebAssembly assets, serve the repository using `python3 -m http.server 5173`, then open `http://localhost:5173/`. Rebuild with the Emscripten process in `scripts/build_vtl_wasm.py` or the GitHub Pages Actions workflow. GitHub Pages serves static HTML/JS/WASM; synthesis runs on the **visitor's machine**. The workflow tests the real VTL worker in Chromium before deploying.

For scientific benchmarking, externally obtained VTL gestural-score or EMA time courses can be compared using `src/sim/reference-comparison.js`; the project does **not** bundle Haskins TADA files or claim equivalence to its output. See [controller fidelity notes](docs/model-fidelity-v16.md), [deployment instructions](docs/deployment.md) and [validation limits](docs/validation.md). The VTL C++ backend and its speaker resources have their own upstream licenses; ensure compliance when redistributing compiled assets. See [`LICENSE`](LICENSE) for the repository license.

## References

- [CrumpLabSandbox: CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands)
- [VocalTractLab / articulatory synthesis](https://vocaltractlab.de/) and its [C API backend](https://github.com/TUD-STKS/VocalTractLabBackend-dev)
- [Tourville & Guenther: DIVA](https://pmc.ncbi.nlm.nih.gov/articles/PMC3650855/)
- [Saltzman & Munhall: Task Dynamics](https://doi.org/10.1207/s15326969eco0104_2)

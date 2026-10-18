# Cognitive Speech Models

[**Launch the browser application**](https://lnalborczyk.github.io/cognitive_speech_models/) · [Source](https://github.com/lnalborczyk/cognitive_speech_models) · [Issues](https://github.com/lnalborczyk/cognitive_speech_models/issues)

An interactive research and teaching sandbox for exploring two simplified approaches to speech motor control with a **shared VocalTractLab (VTL)** vocal-tract geometry and acoustic synthesizer.

The application runs on GitHub Pages with VTL compiled to WebAssembly. Visitors can visualize articulators, listen to synthesized speech, investigate target tracking and sensory perturbations, and export CSV/WAV results. No account or server installation is required.

## Models

- **DIVA-inspired controller:** feedforward articulatory tracking, delayed somatosensory correction, and optional feedback from VTL-estimated auditory resonances.
- **Task Dynamics-inspired controller:** overlapping articulatory gestures; VTL-measured constrictions and numerical task-space derivatives where available.

Both models use the same speaker, normalized actuator and task sequences. Their controller equations are **transparent, reduced-order demonstrations**, not faithful implementations of the original published neural or biomechanical architectures. VTL's research-based geometry and acoustic synthesis **do not validate** the higher-level controller predictions.

## Getting started

Open the [online application](https://lnalborczyk.github.io/cognitive_speech_models/), choose a controller and phonetic sequence, and select **Run simulation**. Play the synchronized animation and waveform, or use the timeline to inspect articulatory changes. Auditory feedback is **off by default** until its behavior is calibrated. The feedback gain, sensory delay, and perturbation controls are available for explicit experiments.

**Experiments:**

1. **VTL vowel reference check** measures F1–F3 from the current speaker's /a/, /i/, /u/ shapes and tests repeatability, not human phonetic accuracy.
2. **Gain/delay sweep** compares unperturbed tracking at gains 0–0.4 with two delays, holding other parameters and the seed fixed.
3. **Auditory F1 shift** compares paired trajectories under the same random seed and reports the direction and size of the simulated compensatory response.
4. **Feedback ablation** exports three actual VTL waveforms and CSV diagnostics for auditory-off, legacy, and stabilized feedback.
5. **Controller comparison** evaluates DIVA and Task Dynamics using identical settings and physical VTL synthesis.

The auditory-shift manipulation affects **perceived feedback within the controller**, not the exported audio directly. Acoustic-formant estimates may be unresolved during closures. Tracking error, energy and waveform similarity do not establish perceptual accuracy or intelligibility.

## Source architecture

| Path | Component |
|---|---|
| `src/cognitive/{diva,task-dynamics}.js` | Two controller equations |
| `src/motor/gestures.js` | Phonetic sequences and overlapping targets |
| `src/motor/plant.js` | Shared simplified normalized articulatory actuator |
| `src/engine/vtl-sensing.js` | VTL transfer-function/area observations and speaker calibration |
| `src/engine/wasm-runtime.js` | Native VTL functions running in WebAssembly |
| `src/sim/gain-sweep.js` | Reproducible within-controller comparisons |
| `src/app.js` | Application, experiments and exports |
| `test/` | Unit and integration checks |

## Contributing and development

The project uses ES modules, Python scripts and GitHub Actions. For source-level tests:

```bash
npm test
```

To run the static interface locally, use `python3 -m http.server 5173` from the repository directory. Interactive synthesis requires compiled VTL WebAssembly assets, built using `scripts/build_browser.sh` or the Pages workflow; a static server without those assets cannot synthesize speech. Native VTL users may instead run `python3 scripts/launch.py`. See [deployment instructions](docs/deployment.md) and [scientific validation notes](docs/validation.md).

Pull requests should include numerical tests and clearly distinguish changes to physical VTL synthesis from changes to the simplified motor controllers. A public GitHub Pages deployment is produced only after the WebAssembly/browser integration test passes.

## References

- [VocalTractLab and Birkholz's articulatory synthesizer](https://vocaltractlab.de/)
- [VocalTractLab backend and C API](https://github.com/TUD-STKS/VocalTractLabBackend-dev)
- [Tourville & Guenther: DIVA](https://pmc.ncbi.nlm.nih.gov/articles/PMC3650855/)
- [Saltzman & Munhall: Task Dynamics](https://doi.org/10.1207/s15326969eco0104_2)

This software is an experimental visualization and comparison tool, not a validated numerical reproduction of DIVA or Task Dynamics. See the repository's `LICENSE` for licensing terms.

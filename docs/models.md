# Controller and shared-plant API

This repository follows the **swappable-module strategy** of [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands): separate cognitive models, motor/gesture layer, articulatory body, simulation loop, instrument (here, VTL acoustics), views, scripts and tests.

```text
phonetic input → gesture score → cognitive/[controller].step(state)
    → normalised articulator command → shared mass–spring actuator
    → speaker-specific vocal tract using the native or WebAssembly VTL API
    → VTL tube area + acoustic waveform (native or browser WASM)
    → visualisations, CSV, WAV
```

**Native mode is architecturally separated.** Controllers run in plain JavaScript, producing time-sampled normalized vocal-tract positions. `server/vtl.py` converts those coordinates to the physical min/max units of the current speaker model, calls the published native `vtlSynthBlock` for sound, `vtlTractToTube` for cross-sectional area, and `vtlExportTractSvg` for speaker geometry. Native geometry and acoustic output are therefore derived from *the same time-varying tract-parameter trajectory*. Controller feedback in this version is still generated from a simple parameter-space proxy, **not** the synthesizer's returned audio. This is currently an *open-loop native synthesis* workflow, not a validated closed-loop VTL speech controller.

## Controller contract

- Implement a class with constructor `(config)` and method `step({x,v,target,dt,t,weights,selected,score,speaker})` returning `{u,planning,selected,details}`.
- `x`, `v`, `target` and output `u` are **arrays of dimension `speaker.names.length`**, and values of `x` and `target` are normalized to [0,1]. `u` are conceptual motor commands, not muscle activations or VTL internal forces.
- Register the class in `src/cognitive/registry.js` to make it available in batch runs and the browser.
- The plant in `src/motor/plant.js` integrates commands using identical dynamics for *all* controllers. A normalized trajectory is handed to the native backend when VTL is selected.
- The DIVA/GODIVA/GEPPETO-inspired controllers operate in normalized VTL tract parameter space. Task Dynamics additionally uses a small, non-identity coupled task-coordinate map built from lip, tongue and jaw parameters. This map is **not** a calibrated VTL constriction geometry Jacobian.

## Status by controller

| Module | Present mechanism | Missing for a faithful scientific implementation |
|---|---|---|
| `diva.js` | Feedforward target and delayed feedback error | Trained speech-sound map, learned inverse auditory/somatosensory transformations, real formant-target feedback |
| `godiva.js` | Competitive queue and serial selection followed by DIVA-style motor execution | Published neural circuits, syllable initiation thresholds, learned chunk dynamics |
| `geppeto.js` | Regularized local shape-space objective | Finite-element tongue, muscle activation/force constraints, target-based optimizations over trajectories |
| `task-dynamics.js` | Overlapping gestures and a damped Jacobian-transpose controller in low-dimensional lip/tongue parameter combinations | True VTL constriction degrees and locations, numerical VTL task Jacobian, weighted pseudoinverse and biomechanical coupling |

**Important:** VTL is a geometrical and acoustic tract simulator, not a finite-element muscle-force GEPPETO plant. Plugging simplified controllers into VTL does not validate the controllers. Neither our normalized mass–spring actuator nor the task-to-articulator mapping has been benchmarked against human articulatory recordings.

## Targets, gestures and speech sounds

`src/motor/shape-map.js` resolves vowel shapes by name and maps /p/, /t/, /k/
onto the matching JD3-style context-dependent speaker shapes:
`ll-labial-closure(a/i/u)`, `tt-alveolar-closure(a/i/u)`,
`tb-velar-closure(a/i/u)`. The target for each consonant is chosen according
to the following vowel, when one is present. Missing targets are not
fabricated; phoneme choices are disabled when unavailable.

`src/motor/gestures.js` creates the gestural schedule and overlap/hold
weights. `src/sim/diagnostics.js` calculates acoustic/STFT plots and candidate
constriction closures from **VTL outputs**, including comparisons with static
VTL reference target geometries. This is not yet a full VTL `.ges`
reference trajectory or a gestural-score-to-tract-sequence benchmark.

## Sensory feedback caveat

The DIVA-inspired 'auditory perturbation' is still a normalized-parameter
proxy; the VTL sound is synthesized *after* the movement simulation. In
particular, neither the STFT nor the tube-area diagnostics provide online
acoustic error correction. Building a closed feedback loop requires an online
VTL acoustic forward model (or validated surrogate) and an explicit learned
inverse mapping. This remains future work.

## Cross-model reproducibility

`node scripts/smoke.mjs aia` simulates all controllers using a **test-only fixture**, not a simulated acoustic tract. `npm test` runs deterministic controller and standard-library Python bridge unit tests. `npm run serve` launches the native integration if library/speaker variables are supplied. Exports include physical VTL WAV only when the native backend is actually available.

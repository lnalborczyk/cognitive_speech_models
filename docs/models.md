# Controller and shared-plant API

This repository follows the **swappable-module strategy** of [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands): separate cognitive models, motor/gesture layer, articulatory body, simulation loop, instrument (here, VTL acoustics), views, scripts and tests.

```text
phonetic input → gesture score → cognitive/[controller].step(state)
    → normalised articulator command → shared mass–spring actuator
    → speaker-specific vocal tract using the native or WebAssembly VTL API
    → VTL tube area + acoustic waveform (native only)
    → visualisations, CSV, WAV
```

**Native mode is architecturally separated.** Controllers run in plain JavaScript, producing time-sampled normalized vocal-tract positions. `server/vtl.py` converts those coordinates to the physical min/max units of the current speaker model, calls the published native `vtlSynthBlock` for sound, `vtlTractToTube` for cross-sectional area, and `vtlExportTractSvg` for speaker geometry. Native geometry and acoustic output are therefore derived from *the same time-varying tract-parameter trajectory*. Controller feedback in this version is still generated from a simple parameter-space proxy, **not** the synthesizer's returned audio. This is currently an *open-loop native synthesis* workflow, not a validated closed-loop VTL speech controller.

## Controller contract

- Implement a class with constructor `(config)` and method `step({x,v,target,dt,t,weights,selected,score})` returning `{u,planning,selected,details}`.
- `x`, `v`, `target` and output `u` are **arrays of dimension `speaker.names.length`**, and values of `x` and `target` are normalized to [0,1]. `u` are conceptual motor commands, not muscle activations or VTL internal forces.
- Register the class in `src/cognitive/registry.js` to make it available in batch runs and the browser.
- The plant in `src/motor/plant.js` integrates commands using identical dynamics for *all* controllers. A normalized trajectory is handed to the native backend when VTL is selected.
- The current controllers operate directly in the space of VTL tract parameters. They do not optimize constriction degree/location through a measured task Jacobian.

## Status by controller

| Module | Present mechanism | Missing for a faithful scientific implementation |
|---|---|---|
| `diva.js` | Feedforward target and delayed feedback error | Trained speech-sound map, learned inverse auditory/somatosensory transformations, real formant-target feedback |
| `godiva.js` | Competitive queue and serial selection followed by DIVA-style motor execution | Published neural circuits, syllable initiation thresholds, learned chunk dynamics |
| `geppeto.js` | Regularized local shape-space objective | Finite-element tongue, muscle activation/force constraints, target-based optimizations over trajectories |
| `task-dynamics.js` | Gestural overlap and second-order critically damped attractors | Constriction task variables, explicit kinematic Jacobian, dynamically weighted inverse and articulator coupling |

**Important:** VTL is a geometrical and acoustic tract simulator, not a finite-element muscle-force GEPPETO plant. Plugging simplified controllers into VTL does not validate the controllers. Neither our normalized mass–spring actuator nor the task-to-articulator mapping has been benchmarked against human articulatory recordings.

## Targets and phonemes

`src/motor/gestures.js` uses the available **named shapes from the active VTL speaker file**; `a` and `i` are required for the default experiment. Vowel `u` and consonant `p`, `t`, `k`, `m` are optional and disabled in native mode if the speaker does not define those exact shapes. No phoneme targets are fabricated by the application. There is no browser fallback speaker: simulation requires real VTL shapes.

## Cross-model reproducibility

`node scripts/smoke.mjs aia` simulates all controllers using a **test-only fixture**, not a simulated acoustic tract. `npm test` runs deterministic controller and standard-library Python bridge unit tests. `npm run serve` launches the native integration if library/speaker variables are supplied. Exports include physical VTL WAV only when the native backend is actually available.

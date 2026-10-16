# Cognitive Speech Models

An interactive, browser-based sandbox for exploring speech motor control, articulatory movement, and acoustic synthesis.

**[Launch the application](https://lnalborczyk.github.io/cognitive_speech_models/)** · [Source code](https://github.com/lnalborczyk/cognitive_speech_models) · [Report an issue](https://github.com/lnalborczyk/cognitive_speech_models/issues)

## Overview

Cognitive Speech Models combines four **theory-inspired speech-production controllers** with a common [VocalTractLab (VTL)](https://www.vocaltractlab.de/) articulatory and acoustic synthesizer. Users can explore how controller settings influence articulatory trajectories, inspect VTL-generated sagittal vocal-tract animations, area functions, constriction timing and spectrograms, and listen to synthetic speech.

The online version runs VTL in the browser using WebAssembly, with no software installation or remote synthesis server required. Computation happens locally in the user's browser.

**Scientific status:** The VTL geometry and acoustic synthesis are provided by the upstream research software. The four cognitive controllers are deliberately simplified teaching and exploratory implementations, **not validated reproductions** of DIVA, GODIVA, GEPPETO, or Task Dynamics. In particular, the current controller dynamics are not fitted to human articulatory data, and the simulated auditory error does not yet use acoustic feedback from VTL.

## Try the simulator

1. Open the **[live application](https://lnalborczyk.github.io/cognitive_speech_models/)** and wait for **VocalTractLab WebAssembly** to initialize.
2. Select a controller and an available phonetic sequence.
3. Adjust speech rate, gestural overlap, feedback settings, motor noise, or articulatory stiffness.
4. Select **Run simulation**, followed by **Play speech + animation** to hear the VTL waveform while viewing synchronized articulatory motion.
5. Inspect the vocal-tract area function, articulatory trajectories, acoustic spectrogram, candidate closures, and gestural activations. Use the timeline scrubber to examine individual frames; export CSV or WAV files for further analysis.

WebAssembly initialization and synthesis can take some time on slower devices. If the engine does not start, try a current desktop version of Chromium-based browsers or Firefox and report the browser version and error message in an [issue](https://github.com/lnalborczyk/cognitive_speech_models/issues). Browser compatibility has not been comprehensively validated.

### Speech sequences and stop consonants

The available sequences include `/a i a/`, `/a u a/`, `/i a i/`, `/a p a/`,
`/a t a/`, `/a k a/`, `/i p i/`, `/i t i/`, `/i k i/`, `/u p u/`,
`/u t u/`, `/u k u/`, and `/p a t a k a/`.

Consonantal targets are resolved from the current speaker's explicitly named
**context-dependent VTL constriction shapes**, not invented from the symbols
`p`, `t`, or `k`:

- `/p/`: `ll-labial-closure(a/i/u)`
- `/t/`: `tt-alveolar-closure(a/i/u)`
- `/k/`: `tb-velar-closure(a/i/u)`

If a speaker lacks a required target, the sequence is disabled. Stop gestures
use a finite target-hold plateau and overlapping transitions. These are
**simplified kinematic targets**, not a complete stop production model:
VTL's consonant timing, laryngeal coordination, intraoral pressure and release
transients have not been validated for this implementation.

### Acoustic and constriction diagnostics

The simulator displays a low-resolution **spectrogram computed from the VTL
waveform**, a VTL-derived minimum oral area time course, and candidate stop
closures. A configurable research threshold is currently fixed at **0.08 cm²**
(with the first 25% of the tube excluded to reduce posterior confounds); it
is a *heuristic* and is not an independently validated closure classifier.

For stop sequences, the application also compares the minimum simulated oral
area with the **static VTL tube geometry of the named speaker target**. The
static target is a useful reference, but it is not a full VTL gestural-score
trajectory.

**Compare all four through VTL** runs the four controllers with the same
targets and random seed and reports acoustic RMS, minimum oral area, and the
number of detected candidate closures. CSV export is available. These
measurements support exploratory comparisons, not claims of model validity.

## Controllers

| Controller | Implemented principle | Current simplification |
| --- | --- | --- |
| **DIVA-inspired** | Feedforward target tracking plus delayed auditory and somatosensory corrections | Sensory errors are computed in articulatory parameter space, not from measured/predicted acoustics |
| **GODIVA-inspired** | Competitive activation and serial selection of planned units | Does not implement the published neural sequencing and initiation circuitry |
| **GEPPETO-inspired** | Regularized local tracking and motor-effort costs | No finite-element tongue, muscle-force dynamics, or trajectory-wide optimization |
| **Task Dynamics-inspired** | Overlapping gestures, coupled lip/tongue task-coordinate surrogates and a damped Jacobian-transpose controller | The task coordinates are constructed from tract parameters, **not** VTL-calibrated constriction degree/location; no dynamical pseudoinverse |

All controllers share the same simplified actuator dynamics and VTL synthesizer. This enables controlled demonstrations, but it should not be interpreted as a validated comparison of the complete theories.

## How it works

```text
Phonetic sequence
       ↓
Gestural targets and timing
       ↓
DIVA / GODIVA / GEPPETO / Task Dynamics
       ↓
Shared normalized articulatory actuator
       ↓
VocalTractLab (WebAssembly, or optional local native library)
       ├── vocal-tract contours / SVG animation
       ├── cross-sectional area function
       └── synthesized audio
```

The controller produces a time series of normalized articulatory parameter values. VTL converts these states into anatomical geometry and sound. **The acoustic output is currently computed after the controller trajectory, rather than being fed back into the controller during simulation.** The feedback and perturbation controls should therefore be interpreted as conceptual demonstrations.

### Repository structure

| Location | Responsibility |
| --- | --- |
| `src/cognitive/` | Independent speech-production controller modules |
| `src/motor/` | Gestural targets, timing, and shared actuator dynamics |
| `src/sim/` | Simulation loop, physical/acoustic diagnostics and exports |
| `src/engine/` | VTL WebAssembly worker and C API interface |
| `src/view/` | Anatomical playback, charts, and layout |
| `server/` | Optional local native VTL integration |
| `scripts/` | Setup, Emscripten build, smoke tests, and launch helpers |
| `test/` | JavaScript, Python, and integration tests |
| `.github/workflows/pages.yml` | Automated WebAssembly build, browser test, and GitHub Pages deployment |
| `docs/` | Implementation, validation, and deployment notes |

The browser interface also includes a source-code viewer to inspect the main model modules.

## Development

**Requirements:** Git, a current Node.js release, and Python 3. On the public site, visitors do not need any of these tools.

```bash
git clone https://github.com/lnalborczyk/cognitive_speech_models.git
cd cognitive_speech_models
npm test
```

To serve an existing **compiled** WebAssembly build locally:

```bash
python3 -m http.server 5173
# Open http://localhost:5173/
```

A fresh source checkout may not contain the compiled `web/vtl/vtl.js` and `web/vtl/vtl.wasm` files. To build them, use Emscripten and the upstream VTL speaker model according to [the WebAssembly build guide](docs/webassembly.md). For an existing native VTL installation, the optional local API can instead be launched with:

```bash
python3 scripts/launch.py
# Open the address printed by the launcher
```

The GitHub Pages workflow compiles VTL, runs source tests and a Chromium synthesis/geometry check, and deploys the static application when those checks succeed. See [deployment documentation](docs/deployment.md).

## Scientific roadmap

Development priorities are **context-dependent consonant gestures**, **feedback based on acoustic and somatosensory predictions**, and **task-space motor control**, followed by benchmarking against measured articulation and speech acoustics. See the [research roadmap](docs/research-roadmap.md) for proposed experiments and acceptance criteria.

## Reproducibility and limitations

- Numerical settings, speaker choice, controller version, and random seed should be reported when sharing results.
- The VTL speaker and upstream VTL revision influence physical geometry and acoustics; the build records the upstream revision in `web/vtl/build.json`.
- The shared actuator is not a biomechanical simulation of muscle forces. GEPPETO-related predictions should not be interpreted as validated muscle-level predictions.
- Parameter-space auditory perturbations do **not** yet implement actual shifted auditory feedback, and the resulting metrics are not calibrated to human speech data.
- Consonantal closure, phonation, release, and coarticulation need dedicated implementation and validation before consonant sequences can be interpreted phonetically.

Additional details: [model architecture](docs/models.md) · [validation](docs/validation.md) · [WebAssembly](docs/webassembly.md).

## References and attribution

- **VocalTractLab:** [Official website](https://www.vocaltractlab.de/) · [backend source code](https://github.com/TUD-STKS/VocalTractLabBackend-dev)
- **DIVA:** [Tourville & Guenther (2011)](https://doi.org/10.1080/01690960903498424)
- **GODIVA:** [Bohland, Bullock & Guenther (2010)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2937837/)
- **Task Dynamics:** [Saltzman & Munhall (1989)](https://doi.org/10.1207/s15326969eco0104_2)
- **GEPPETO:** [Patri et al. (2019), overview and model framework](https://pmc.ncbi.nlm.nih.gov/articles/PMC6824204/)
- **Project inspiration:** [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands)

The Cognitive Speech Models repository is distributed under the terms in [LICENSE](LICENSE). VocalTractLab is separately developed and distributed under the GNU General Public License; redistribution of compiled VTL artifacts and speaker resources must follow their applicable terms. The model names indicate theoretical inspiration, not endorsement by the original model authors.

## Contributing

Bug reports, reproducible examples, tests, and contributions to the controller modules or VTL integration are welcome via [GitHub Issues](https://github.com/lnalborczyk/cognitive_speech_models/issues) and [pull requests](https://github.com/lnalborczyk/cognitive_speech_models/pulls). Please document scientific assumptions and include tests for changes that affect simulated behavior.

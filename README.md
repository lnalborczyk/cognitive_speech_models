# Cognitive Speech Models

**[Try the interactive application](https://lnalborczyk.github.io/cognitive_speech_models/)** · [Source code](https://github.com/lnalborczyk/cognitive_speech_models) · [Report an issue](https://github.com/lnalborczyk/cognitive_speech_models/issues)

A browser-based research and teaching sandbox for exploring speech motor control with a shared [VocalTractLab (VTL)](https://www.vocaltractlab.de/) vocal-tract geometry and acoustic synthesizer.

The public application runs entirely in the browser using WebAssembly. Visitors can inspect sagittal articulatory movements, hear synthesized speech, compare controller trajectories, manipulate gesture timing and altered auditory feedback, and export measurements.

> **Scientific scope:** VocalTractLab supplies the vocal-tract and acoustic calculations. The cognitive controllers are transparent **reduced-order, theory-inspired implementations**, not reproductions or fitted parameter sets of the published DIVA, GODIVA, Task Dynamics or GEPPETO-OFC models. Outputs must not be presented as predictions of those models without further validation.

## Using the application

1. Open the [online simulator](https://lnalborczyk.github.io/cognitive_speech_models/) and allow VocalTractLab WebAssembly to initialize.
2. Choose a model and phonetic sequence; vowel sequences and context-dependent `/p/`, `/t/` and `/k/` sequences are available with the bundled JD3 speaker.
3. Change speech rate, gestural overlap, feedback gain/delay, an auditory F1 feedback shift, motor noise or articulator stiffness.
4. Run the simulation, then select **Play speech + animation**. The anatomical SVG frames and acoustic waveform are produced by the same VTL trajectory.
5. Examine articulatory trajectories, VTL tube area, online transfer-function resonance estimates (F1–F3), the waveform spectrogram, and reference-place-specific consonant closures. Use the time scrubber or export WAV/CSV data.

**Browser vs local native mode:** In the public WebAssembly version, the controller receives measured VTL acoustic and constriction variables **during trajectory generation**. The optional Python/native VTL route currently uses open-loop synthesis after a proprioceptive-only motor simulation. Auditory feedback/perturbation controls are disabled in that mode.

### Models and mechanisms

| Controller | Implemented principle | Important exclusions |
| --- | --- | --- |
| **DIVA-inspired** | Feedforward articulatory targets; delayed somatosensory feedback; local feedback correction based on VTL transfer-function resonances | No trained speech-sound map, neuroanatomical circuit, learned inverse maps or feedback adaptation across trials |
| **GODIVA-inspired** | Competitive, serial gestural selection followed by DIVA-inspired motor control | No learned phonological sequence chunks or full published basal ganglia–cortical dynamics |
| **Task Dynamics-inspired** | Overlapping gestures; stop constriction degree measured by VTL; finite-difference Jacobian with respect to articulatory parameters; vowel resonance targets | Does not implement complete gestural score, gestural planning dynamics or physically measured articulatory stiffness |
| **GEPPETO-OFC-inspired** | Local, regularized multisensory control objective balancing target accuracy, effort and change in commands | **Not** the published GEPPETO finite-element tongue, muscle activation model, state estimator or full stochastic/trajectory-wide OFC solution |

GEPPETO-OFC replaces the older GEPPETO-inspired demonstration because the [2025 model](https://doi.org/10.1121/10.0039197) explicitly examines optimal feedback and multisensory goals. The implementation is **conceptually inspired** by that model; no equivalence with its biomechanical results is implied.

## How sensory feedback works (browser mode)

```text
Phoneme / gestural sequence
          ↓
Cognitive controller + simplified shared actuator  ←─ delayed multisensory feedback
          ↓                                                   ↑
VTL tract parameters ─→ vtlTractToTube ─→ constriction area/location + Jacobian
          │
          └─────────────→ vtlGetTransferFunction ─→ estimated resonances + Jacobian
          ↓
vtlSynthBlock (synthesized waveform), vtlExportTractSvg (anatomical animation)
```

- At regular time intervals during the simulated movement, VTL calculates the acoustic tract transfer function and tube cross-sections for the current and target articulatory positions.
- F1–F3 candidates are extracted from the transfer-function peaks, and a **local numerical sensory Jacobian** is estimated using small articulatory perturbations. This is a local estimate, *not* a learned forward or inverse sensory map.
- For stops, the active constriction section is selected using the context-specific VTL closure target and an anatomically constrained search interval along the tube. Current aperture and local area sensitivity are measured from VTL. Region bounds and articulatory subsets are modeling assumptions that require validation.
- A requested **F1 auditory perturbation** is applied to the *perceived* acoustic feedback (in Hz), **not** to VTL's sound generator. Its effects on produced movements can be inspected through the simulated closed loop.
- The feedback implementation is offline-in-wall-clock-time but **online within simulated time**: subsequent motor commands depend on earlier sampled VTL sensory predictions. Audio synthesis follows the completed movement for listening and analysis.

Measurements may fail at highly constricted vocal-tract configurations; missing resonance measurements are handled as missing data rather than replaced with guessed values. A nominal peak is not the same as a validated formant estimate, especially during voiceless stops.

### Phonetic targets

The included sequences cover `/a i a/`, `/a u a/`, `/i a i/`, `/a p a/`, `/a t a/`, `/a k a/`, `/i p i/`, `/i t i/`, `/i k i/`, `/u p u/`, `/u t u/`, `/u k u/`, and `/p a t a k a/`.

Context-dependent closures are requested from the VTL speaker as `ll-labial-closure(a/i/u)`, `tt-alveolar-closure(a/i/u)`, and `tb-velar-closure(a/i/u)`. Unsupported shapes are never fabricated. These static closure targets and the simplified release schedule **do not constitute a validated model of stop voicing, burst, aspiration, or aerodynamic coordination**.

## Reproducibility and source code

| Path | Role |
| --- | --- |
| `src/cognitive/` | Model-specific controllers; one small, inspectable file per controller |
| `src/motor/` | Phonetic score, shared actuator, and sensor-to-motor correction terms |
| `src/engine/vtl-sensing.js` | Online VTL constriction and transfer-function measurements; numerical Jacobians |
| `src/engine/wasm-runtime.js`, `wasm-worker.js` | VTL C API, WebAssembly initialization, simulation and synthesis |
| `src/sim/` | Deterministic simulation runner, CSV export and acoustic diagnostics |
| `src/view/` | Synchronised VTL sagittal SVG, responsive visualizations |
| `server/` | Optional native VTL server (open-loop controller mode) |
| `scripts/` | Build, launch, validation and browser test utilities |
| `.github/workflows/pages.yml` | Build-and-test gate followed by free GitHub Pages publication |
| `test/` | JavaScript, Python and API mock tests |

Every comparison uses the same speaker and actuator, with the same user-provided seed. CSV records the trajectory and available sensory values; the build metadata records the upstream VTL revision. Controller parameter choices have **not** been fitted against human articulatory or neural datasets.

### Development

```bash
git clone https://github.com/lnalborczyk/cognitive_speech_models.git
cd cognitive_speech_models
npm test
```

A fresh checkout generally does **not** include VTL binaries. For a local browser build, follow [the WebAssembly guide](docs/webassembly.md), then serve the repository over HTTP:

```bash
python3 -m http.server 5173
```

To use an already installed native VTL shared library and speaker, run `python3 scripts/launch.py` and open the URL it prints. The GitHub Actions workflow compiles the browser VTL backend, checks the acoustic/geometry path in Chromium, and publishes the static application only after those checks pass. See [deployment](docs/deployment.md) and [validation](docs/validation.md).

## Scientific limitations and priorities

This project is an **exploratory platform**, not a validated generative model of human speech. Key next steps include comparison with VTL's own gestural-score trajectories, validation of closure sites and predicted resonances, syllable-level laryngeal and aerodynamic timing, realistic sensory delays and estimator noise, calibration using EMA/acoustic datasets, learned DIVA maps, a more complete GODIVA sequencing model, and validation against the original GEPPETO-OFC biomechanics. See the [research roadmap](docs/research-roadmap.md).

## References

- [VocalTractLab](https://www.vocaltractlab.de/) — [C++ backend](https://github.com/TUD-STKS/VocalTractLabBackend-dev)
- [Tourville & Guenther (2011): DIVA](https://doi.org/10.1080/01690960903498424)
- [Bohland, Bullock & Guenther (2010): GODIVA](https://pmc.ncbi.nlm.nih.gov/articles/PMC2937837/)
- [Saltzman & Munhall (1989): Task Dynamics](https://doi.org/10.1207/s15326969eco0104_2)
- [Rakotomalala, Baraduc & Perrier (2025): GEPPETO-OFC](https://doi.org/10.1121/10.0039197)
- [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands), which inspired the modular sandbox organization.

## Licensing and contributions

The repository is licensed as stated in [LICENSE](LICENSE). The VocalTractLab backend is separately licensed under the GPL; compiled distributions must comply with the upstream terms and those applicable to the speaker resources.

Contributions and reproducible bug reports are welcome through [GitHub Issues](https://github.com/lnalborczyk/cognitive_speech_models/issues) and pull requests. Please document scientific assumptions and add tests when changing model behavior.

## Place-specific closure analysis (v1.1)

Stop-consonant diagnostics use the VTL speaker's context-dependent reference
geometry to find the intended constriction place. The synthesis engine samples
tube areas at approximately 100 Hz independently of the (typically 30 fps)
SVG anatomy. A geometrical closure is reported only when the appropriate site
remains at or below 0.08 cm² for at least 25 ms. Release is estimated from
the subsequent reopening. These thresholds are exploratory and are **not**
validated phoneme classification or perceptual speech accuracy.

The online Task Dynamics, DIVA, GODIVA and GEPPETO-OFC modules remain
reduced-order, theory-inspired controllers. The VTL synthesis and geometry
are the established research software components, not evidence that the
controllers replicate their published implementations.

## Controlled auditory-feedback perturbation demonstration

The sidebar's **Compare baseline vs F1 shift** control runs the chosen model
twice with identical parameters and random seed. The only change is a step
shift applied to the simulated *perceived* F1 from the selected onset time.
The display reports normalized articulatory trajectory divergence and the
change in the tract-predicted F1. A zero or small difference is possible,
including when the controller does not use acoustic feedback. The experiment
is available only in browser WebAssembly mode and is a **model sensitivity
check**, not an experimentally calibrated estimate of human adaptation.

## Stop closure diagnostics

The VTL speaker's context-dependent closure reference supplies an anatomical
site for each /p/, /t/ or /k/. Additional VTL tube snapshots are calculated
at approximately 100 Hz (independent of 30-fps SVG animation). A successful
geometrical closure requires an oral area no larger than 0.08 cm² at that
reference place for at least 25 ms. The application also reports the first
subsequent reopening. A closure somewhere else in the tract is **not** counted
as a successful stop at the intended place. Thresholds are exploratory, and
closure/release is not equivalent to validated stop production, voicing,
burst timing, or phoneme perception.

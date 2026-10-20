# Model fidelity, experimental hypotheses and limitations

The goal of this release is to bring two independently implemented computational
controllers closer to the *organization* of published models, while preserving
one common VocalTractLab (VTL) physical/acoustic synthesizer.

## DIVA-inspired adaptation

- **Early exploratory learning:** perturb selected VTL articulator parameters
  around speaker vowel configurations; collect the VTL transfer-function F1–F3
  consequences. Fit a regularized local inverse map from scaled auditory errors
  to normalized articulatory displacements. This is local ridge regression, **not**
  the neural babbling circuitry in Guenther et al.
- **Auditory target regions:** a small error within an acceptable acoustic range
  does not elicit learned feedback corrections. Unresolved formants do not elicit
  a correction on that band.
- **Motor-program practice:** explicit repetitions accumulate a bounded template
  of auditory corrections, used as feedforward commands in subsequent trials
  when `useLearnedProgram` is enabled. It is a demonstration of learning across
  trials, **not** the original DIVA learning law.
- **Other retained approximations:** the default velocity/position plant is a
  normalized second-order actuator, not DIVA's original Maeda synthesizer;
  motor target attraction and proprioceptive corrections remain simplified.

**Checks:** zero auditory gain must remain insensitive to perceived F1 shifts;
unresolved F1 must not be imputed; fixed-seed babbling and practice must be
reproducible; learned and numerical mappings can be compared with matched
settings. In experimental outputs, refer to *DIVA-inspired VTL adaptation*.

## Task Dynamics-inspired adaptation

- **Independent gestures:** consonant targets activate constriction tasks while
  a simultaneous vowel can keep tongue-body (and lip) goals active; global
  phoneme-vector interpolation is *not* the sole task representation.
- **Tract variables:** VTL tube sections provide effective constriction
  diameters (cm) and soft-minimum location centroids (cm from the glottis) in
  approximate lip, tongue-tip and tongue-body regions. These are **proxies**, not
  exact palate-to-articulator distances and locations from TADA.
- **Task dynamics:** a task-space point attractor uses
  `z_ddot = omega^2 (z_target-z) - 2 omega z_dot` with critical damping.
- **Articulatory inversion:** finite-difference task Jacobians of the VTL
  tract-to-tube API and damped inverse kinematics provide motor accelerations.
- **Coordination:** a reduced phase-coupling graph shifts gesture activations
  toward CV/VC coordination while retaining intrinsic timing. This is not the
  full TADA coupled-oscillator planning network.

**Checks:** closure-site specificity for /p t k/; VTL-derived Jacobian signs;
no nonfinite motor states; monotonic gestural timing; rate and coupling sweeps;
independent lip closure with concurrent tongue-body movement.

## Remaining requirements for a reference-level implementation

1. Validate tract-variable mapping using VTL sagittal surface geometry,
   including genuine constriction **distance** and **location**, rather than
   tube cross-sectional proxy values.
2. Calibrate measured task Jacobians, command scaling, and dynamics to
   articulatory trajectories and VTL reference gestural scores.
3. Benchmark the learned DIVA inverse against independent articulatory
   displacements, and evaluate online compensation separately from multitrial
   adaptation.
4. Compare predictions against the official published models and human EMA/
   acoustic recordings. An imported reference trajectory must be treated as an
   **external** target; reusing the simulator's own target is not validation.

The repository does **not** redistribute Haskins TADA binaries/data; consult
upstream licensing before any code or data reuse.

## Sources

- Guenther et al., *The DIVA model: a neural theory of speech acquisition and
  production*: https://pmc.ncbi.nlm.nih.gov/articles/PMC3650855/
- Haskins Laboratories, *TADA: Task Dynamic model of inter-articulator speech
  coordination*: https://www.haskinslaboratories.org/tada
- Project inspiration: CrumpLabSandbox/CognitiveHands:
  https://github.com/CrumpLabSandbox/CognitiveHands

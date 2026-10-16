# Research roadmap

This document outlines **proposed scientific and software developments**, not functionality already implemented or validated.

## Phase 1 — Consonants with explicit articulatory gestures

**Goal:** produce interpretable `/apa/`, `/ata/`, `/aka/` and eventually `/pataka/` demonstrations.

1. Expose available VTL speaker shapes by their actual names. Add a speaker-dependent gesture registry: `/p/` → lip closure, `/t/` → tongue-tip alveolar closure, `/k/` → tongue-body velar closure. Choose context-matched shapes (e.g., `ll-labial-closure(a)`), rather than looking up literal phoneme names.
2. Represent closure, hold and release as events with separately adjustable durations and overlap, while retaining surrounding vowel gestures.
3. Make the glottis trajectory explicit. Model voicing, aspiration and release appropriately rather than applying one voiced excitation pattern across the utterance.
4. Assess constriction using VTL tube-area outputs and articulator labels: inspect the correct location and duration of near-zero oral area, complete release, and formant transitions.
5. Add regression tests of target availability, proper closure location, temporal events and synthetic acoustics. Compare against VTL's own gestural-score examples.

**Acceptance criterion:** robust articulatory closure/release patterns, appropriate acoustic landmarks, and reproducible differences among bilabial, alveolar and velar stops; merely enabling the dropdown is insufficient.

## Phase 2 — Online sensorimotor control

**Goal:** replace the current parameter-space proxy with sensory feedback based on the plant.

1. Define auditory measurements such as F1–F3, spectral envelopes, and voicing from VTL. Use a differentiable or learned surrogate for faster online predictions if full synthesis is too expensive at every time step.
2. Specify auditory and somatosensory target regions and error signals, including model-specific sensory delays.
3. Implement perturbations to perceived feedback, rather than altering the controller's first tract parameter.
4. Derive corrective commands using an estimated sensory-to-motor Jacobian or learned inverse model. Keep learning separate from online production.
5. Test predictable responses to sustained and unexpected perturbations, including compensatory direction, magnitude and latency.

**Acceptance criterion:** demonstrable causal effect of auditory perturbations on motor trajectories through a measured/predicted acoustic error pathway.

## Phase 3 — Task-space gestures and planning

**Goal:** distinguish the computational mechanisms rather than only their output trajectories.

- **Task Dynamics:** define constriction degree and location tasks, estimate a tract-parameter-to-task Jacobian using VTL, and solve a regularized inverse-kinematics problem with gestural overlap and coordination.
- **GODIVA:** add explicit syllable/phoneme competitive selection, initiation thresholds, buffer transitions and independent planning/execution activity.
- **DIVA:** separate learned feedforward motor programs, auditory targets, somatosensory targets and feedback corrections.
- **GEPPETO:** distinguish task-level cost optimization from articulator-level dynamics; a muscle or finite-element plant would require substantially different additional software.

**Acceptance criterion:** ablations and manipulations produce distinct, testable predictions for each controller, with independent parameter settings and the same physical plant when scientifically appropriate.

## Phase 4 — Quantitative validation

Recommended benchmarks:

| Domain | Example observable | Main test |
| --- | --- | --- |
| Vowels | F1/F2/F3 time courses, segment durations | Acoustic plausibility and consistency |
| Stops | Closure duration, constriction location, release transient, VOT | Correct oral and laryngeal coordination |
| Coarticulation | Context-dependent tongue/lip trajectories | Anticipatory vs carryover effects |
| Perturbations | Compensation magnitude, direction, delay | Feedforward/feedback dissociation |
| Timing/sequencing | Intergestural intervals, ordering errors | Controller-specific planning predictions |
| Articulation | EMA or other measured tongue/lip/jaw trajectories | Parameter estimation and out-of-sample generalization |

Use independent recordings and held-out tasks wherever possible. Preserve upstream VTL commit, speaker model, model revision, seeds, sampling rates, model settings and simulation scripts for reproducibility.

## Phase 5 — Interactive experiments

Useful interface upgrades after validation:

- phoneme and gestural-score editor with explicit onset, target, duration and stiffness;
- synchronized spectrogram, acoustic waveform, F1–F3 and oral constriction plots;
- interactive perturbation timelines and model-ablation toggles;
- batch-run/parameter-sweep mode with CSV output and repeatable configurations;
- overlaid model predictions with human benchmark trajectories, including uncertainty bands.

## Scientific caveat

A realistic VTL vocal tract does not by itself validate a controller. The key criterion is whether each model's assumptions are explicitly implemented and whether they explain measurable outcomes beyond reproducing plausible speech audio.

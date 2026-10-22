# Release v1.8.0 — Reference-site closure control and acoustic-error adaptation

## Scientific changes

- **Task Dynamics:** a real VTL consonant closure shape determines the target oral tube section and its physical area. During a stop gesture, Task Dynamics uses a dedicated site-aperture task (`SCD`) and a finite-difference Jacobian from the same tract-to-tube API. A calibrated, switchable articulatory reference-attraction command helps avoid ill-conditioning without directly overwriting articulation. The site task is removed as soon as the stop gesture deactivates. A separate regularized static IK diagnostic tests whether the VTL reference closure can be reached without time pressure and reports failure explicitly.
- **DIVA:** the auditory learning update compares trial F1 with a *matched, unperturbed and memory-free VTL baseline* plus the heard perturbation. During washout, learning is driven by measurable residual F1 error; passive forgetting is off by default. If F1 is unresolved, the update is skipped and flagged rather than invented.
- The public DIVA practice action now uses the same acoustic-error update mechanism as the automated adaptation/washout test.
- New diagnostic reports distinguish reference closure feasibility, stop-site sensitivity, dynamic closure/release, acoustic error and stored-program magnitude.

## Public interface and attribution

- DIVA and Task Dynamics remain the only public controllers.
- No new always-visible panels, synthesizers, or installation steps.
- The README still credits [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands).
- All previous model-fidelity workflows remain manually runnable; only the v1.8 workflow auto-runs after a successful deployment.

## Verification and scientific limitations

The source-level unit tests cover reference-site location and release, zero-effect feedback controls, missing-F1 handling, and the sign of exposure/washout updates. Real VTL WebAssembly synthesis, consonant closure success, and the actual magnitude/rate of DIVA washout must still be measured by the GitHub Actions v1.8 workflow. No desirable outcome is hardcoded as a passing scientific test.

**This is a VTL-adapted reduced-order demonstration**, not an exact published TADA or DIVA implementation. The stop-site area is not TADA's palate-to-articulator constriction distance; the feedforward update is not DIVA's neural learning rule.

---

# Release v1.7.0 — Closure/release and learning generalization

The user interface remains limited to DIVA and Task Dynamics and uses the
same VocalTractLab WebAssembly engine.

## Task Dynamics

- Independent stop-constriction tasks receive greater priority over a
  simultaneous vowel goal on the **same** tract variable. Independent vowel
  tasks remain active.
- Stop gestures have a separate (configurable) task-attractor speed and
  acceleration limit. Vowel gestures are unchanged.
- The real-VTL browser benchmark evaluates /apa/, /ata/, and /aka/ with both
  low versus high closure-target priority and the faster closure setting, measuring closure AND release.
- These changes are hypotheses about improved closure control. Successful
  closure/release is not claimed before real VTL testing.

## DIVA

- Learned F1 inverse maps are tested on newly sampled articulatory states
  generated with a seed distinct from training. Missing F1 is reported, not
  imputed. The test evaluates actual VTL F1 before/after corrections.
- A separate perturbation-exposure and unperturbed-washout sequence records
  motor-program magnitude, aftereffects, target tracking and effort per trial.
- Default washout uses retention 1.0: no arbitrary passive forgetting is
  introduced. The optional retention parameter can test explicit forgetting.
- Model learning remains a local ridge-regression and motor-template
  approximation, not the original DIVA neural learning rules.

## Deployment and documentation

- New workflow: **Validate v1.7 model fidelity**. It runs against the
  published app in Chromium after the Pages workflow succeeds.
- Raw CSVs, error logs and scientific outcomes are saved as GitHub Actions
  artifacts, whether or not closure/generalization improves.
- The README retains prominent attribution to
  [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands).

## Verification boundaries

Local JS and Python unit tests assess code paths and API contracts. They do
not validate acoustic, biomechanical or behavioral fidelity. The actual
WebAssembly integration and predicted improvement require the post-deploy
browser workflow, and scientific benchmarking against independent reference
trajectories remains outstanding.

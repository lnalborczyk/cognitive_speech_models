# Cognitive Speech Models v1.2.0 — Controlled sensory-feedback ablation

- Correct a one-sided finite-difference boundary error in the live VTL sensory observer.
- Track resonance peaks across small finite differences and suppress implausible peak-identity jumps.
- Bound auditory-only motor corrections; allow a controlled legacy mode for comparisons.
- Make Task Dynamics respect the configured auditory gain.
- Add a three-condition, same-seed, real-VTL WAV benchmark with playback and CSV.
- Add an opt-in GitHub Actions Chromium experiment (`feedback_ablation`) and public-facing protocol.

**Scientific status:** This release has numerical/source and layout tests. It has NOT been tested against a real VTL WebAssembly binary in this environment. Feedback gains and safety thresholds are heuristic and must be evaluated on actual audio and articulatory data. See `docs/synthesis-benchmark.md`.

---

# Cognitive Speech Models v1.1.0

This update improves the interpretability of comparisons without claiming that
any of the four theory-inspired controllers is an empirically validated
replication of its published model.

## Simulation improvements

- Context-specific stop reference shapes determine **where** /p/, /t/ and /k/
  are expected to constrict. The stop benchmark no longer uses the global
  minimum oral area, which could count a closure at the wrong place.
- Dense VTL tube snapshots (~100 Hz) support a sustained closure criterion:
  aperture <= 0.08 cm² for >= 25 ms at the target constriction site, plus
  closure onset and reopening estimates. The VTL anatomy remains rendered
  at 12–30 frames/s to avoid oversized SVG payloads.
- The closure benchmark now reports per-stop site, minimum area, closure
  hold duration, and reopening. Multiple controllers are compared against
  the same VTL speaker and the same fixed random seed.
- Auditory resonance feedback is suppressed at fully occluded stops,
  where vowel-like transfer-function peaks are not reliable formants.
- A paired WebAssembly auditory perturbation experiment uses identical
  control parameters and random seeds, with a selectable onset and F1 shift.
  It reports articulatory divergence and VTL-predicted acoustic differences.

## Scientific interpretation

The closure thresholds are exploratory, and the location search uses
anatomical constraints. The simulation does not yet include a validated
laryngeal control schedule for voiceless stops, aerodynamics/bursts, a published
GEPPETO-OFC finite-element plant, or learned DIVA/GODIVA sensory-motor maps.
The A/B perturbation experiment shifts **perceived** F1, not the synthesizer's
output directly, and should not be interpreted as quantitative human
adaptation. A formal comparison against VTL gestural scores and empirical
EMA/acoustic data remains future work.

## Deployment and testing

The static site is still hosted for free on GitHub Pages. The GitHub Actions
browser gate now synthesizes a vowel sequence and /apa/, verifies VTL anatomical
frames, and requires a place-specific consonant tube measurement. This release
was checked with JavaScript and Python tests including mocked VTL C API
integration, but **not** compiled or executed with the full upstream VTL
WebAssembly binary in the development environment.

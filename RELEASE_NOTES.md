# Cognitive Speech Models v1.4.0 — Auditory feedback instrumentation

- Added sustained `/aː/`, `/iː/`, and `/uː/` targets; the held `/aː/` is the recommended feedback benchmark.
- Recorded delayed F1 measurement, F1 target, measurement age, perturbation onset, validity, local sensitivity, and the actual auditory motor correction used by DIVA.
- Added paired auditory-command divergence, instead of mistaking any nonzero feedback activity for a perturbation-evoked response.
- Separated during-vowel compensation from subsequent-vowel carryover and preserved unresolved F1 as missing.
- Added optional held-/a/ WebAssembly validation in the GitHub Actions browser workflow.
- Added noncommittal low-frequency spectral peak diagnostics to the vowel-reference report; no guessed F1 substitutions.
- Preserved both models and the GitHub Pages / WebAssembly architecture. Retained the corrected calibration deployment gate.

**Scientific status:** This is an instrumentation and experimental-design release. No genuine improvement in intelligibility or acoustic accuracy is claimed. The true VTL WebAssembly and audio response must be checked in GitHub Actions after deployment. 

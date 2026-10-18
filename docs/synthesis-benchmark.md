# Sensory-feedback benchmarks

## VTL vowel calibration

The browser calculates F1–F3 from each canonical vowel target using VTL's own transfer function, then remeasures the same tract state. A numerical consistency pass is not evidence of a correct formant estimator or human-like acoustic target.

## Unperturbed gain and delay

For either controller, run gains 0, 0.1, 0.2 and 0.4 at feedback delays 40/100 ms. The same phonetic sequence, speaker and random seed are used. Outputs include normalized tracking RMS and motor effort; these are not speech-intelligibility scores. A single seed should not be treated as evidence for robustness.

## Paired perceived-F1 perturbation

Compare a zero-shift baseline and a +150-Hz shift of **perceived** F1 with identical initial state/seed. Negative changes in produced VTL-predicted F1 are compensation for upward heard-F1 shifts. Report valid observation counts and late mean F1 differences. A shift of the feedback observer does not alter the waveform's acoustics directly, and the current gain/delay values have not been fitted to human data.

## WAV ablation

The three-condition test produces a separate WAV file for auditory off, legacy unguarded feedback and bounded feedback. Prefer acoustic analyses and blind listening to inferring quality from RMS or spectral peak jumps. Somatosensory correction may remain active when auditory gain is zero.

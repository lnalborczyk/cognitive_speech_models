# Auditory feedback and synthesis benchmark

## Scope

The three-condition experiment uses the real VocalTractLab WebAssembly plant to synthesize the same utterance under three controller settings. It is not a psychophysical study and does not use original GEPPETO, DIVA, or official VTL gestural-score reference waveforms.

1. **Auditory feedback off:** configured auditory gain zero. Feedforward, somatosensory, and (for stop consonants) task-space corrections remain active.
2. **Legacy unguarded:** the earlier unconstrained VTL spectral peak choice, finite-difference Jacobian, and unbounded auditory corrections.
3. **Stabilized feedback:** track the corresponding resonance peak across small finite-difference perturbations, ignore isolated jumps greater than 150 Hz per perturbation, and clamp auditory motor corrections per articulator to ±18 normalized-command units. The finite-difference boundary correction is active in both feedback modes.

All conditions share the same phonetic goals, random seed, rate, overlap, noise, somatosensory gain, and motor plant. The intended F1 shift is forced to zero in all conditions to isolate feedback stability. Each produces its own actual VTL PCM WAV.

## How to run

In the browser, select **DIVA**, `/a i a/`, motor noise `0`, feedback gain `0.8`, and select **Run three-condition VTL test**. Listen to all three WAV players, and download the CSV. Repeat with `/a p a/` and the other three controllers to distinguish vowel-feedback instability from consonant timing. With DIVA, speech production in the auditory-off condition still uses somatosensory/proprioceptive feedback.

For GitHub Actions, open the repository workflow and use **Run workflow** with the `feedback_ablation` input enabled. It compiles VTL, passes the initial vowel and stop tests, runs the three-condition test in Chromium, and records its table in the `vtl-wasm-diagnostics` artifact (`vtl-browser-result.json`). Compilation and completion do not establish that any condition is perceptually better.

## Interpreting results

* `trackingRms`: normalized distance to the active blended articulatory target, not a human-recorded EMA reference
* `audioRms`: synthesized WAV signal amplitude; neither speech clarity nor perceptual accuracy
* `clippingPercent`: fraction of synthesized PCM samples near full scale; clipping can degrade sound but low clipping does not guarantee good speech
* `formantJumps`: estimated acoustic resonance changes greater than 300 Hz between observer updates; high counts can indicate tracking instability but also arise during genuine rapid transitions
* `commandPeak` and `stepRms`: command magnitude and frame-to-frame articulatory movement

A real scientific validation requires a reference VTL gestural score and recorded speech/EMA measurements with timing alignment and perceptual evaluation. No present statistic can certify a model's acoustic accuracy.

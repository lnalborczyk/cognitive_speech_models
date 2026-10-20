# DIVA and Task Dynamics v1.6: real-VTL validation protocol

This protocol runs **inside the deployed browser application** through its **existing WebAssembly VocalTractLab worker**. The source code must be at least v1.6.0; v1.5 lacks the model-specific learning and constriction-task controls. The workflow rejects outdated deployments instead of silently running different code.

## Experiments

### Task Dynamics: place-specific stop consonants

Utterances: `/apa/`, `/ata/`, `/aka/`. Gesture overlap: `0.15`, `0.65`. Fixed rate 1, coupling 0.35, no motor noise, seed 17. For each condition, use `vtlTractToTube` geometry at high temporal resolution to estimate lip, tongue-tip, or tongue-body closure at the **appropriate VTL reference location**. Export minimum area (cm²), closure duration (s), release time (s), target region, tracking RMS and task coordinates. **Incomplete closure is an experimental outcome, not a CI failure.** Tube-area proxies are not TADA anatomical constriction distances; neither closure achievement nor gesture timing demonstrates speech intelligibility.

### DIVA: learned auditory inverse map versus numerical Jacobian

Train a local inverse map from 64 exploratory VTL tract samples per vowel (`/a/`, `/i/`, `/u/`). Compare with the numerical-Jacobian mode on held `/aː/` at auditory gain 0 and 0.2, under +150 and −150 Hz **perceived** F1 shifts. Fixed rate 0.6, perturbation onset 450 ms, auditory delay 40 ms, zero motor noise, seed 17. Save paired VTL-predicted F1 and motor trajectories. Report mean signed compensation during 0.85–1.85 s, number of valid formant observations, feedback mapping, tracking error, and effort. When gain is zero, a shift must have no effect on articulator trajectories. Auditory compensation has no prescribed minimum: sign, latency, and magnitude are scientific results.

### DIVA: repetition and retention

Expose the learned-map controller to +150 Hz heard-F1 feedback for five practice trials; update its feedforward motor-command template between trials. Compare **unperturbed** productions immediately before and after practice, both with auditory gain zero. Retest after disabling the learned template: this must restore the pre-practice trajectory if the retained program is the only changed state. Report the aftereffect during 0.85–1.85 s, tracking RMS, motor effort, and practice-trial progression. This implementation is an illustrative error-driven adaptation rule, not the published neural learning mechanism of DIVA.

## Run

From GitHub Actions, select **Validate v1.6 speech controllers → Run workflow**. Results appear in the `vtl-v16-controller-experiments` artifact. All fields may contain missing values if the VTL transfer-function F1 is unresolved. Such missing values are not silently converted to zero.

Locally, with the live app already deployed and Python Playwright installed:

```bash
python3 scripts/validate_v16_models.py \
  --url https://lnalborczyk.github.io/cognitive_speech_models/ \
  --artifacts artifacts/v16-models
```

The report contains the JSON summary, six Task Dynamics trajectories, all paired DIVA-F1 curves, and the DIVA practice time course. This workflow **does not edit model parameters** to force any desired result and **does not evaluate human-like or perceptual speech accuracy**.

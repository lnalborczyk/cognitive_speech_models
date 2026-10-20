# Cognitive Speech Models v1.5.0

## Streamlined public simulator

- Removed the native Python VTL server, local native build/install path, retired benchmark controls, legacy three-WAV ablation and source-code viewer. All synthesis uses upstream VocalTractLab **WebAssembly** in the browser.
- Kept only DIVA-inspired and Task Dynamics-inspired controllers. The simulation interface shows articulatory anatomy, tube areas, speech audio, trajectories and spectrogram. Advanced scientific controls and diagnostics are collapsed by default.
- Moved repeatability calibration, gain/delay experiments and paired F1 perturbation time courses into one advanced validation section. Existing automated workflow selectors remain stable.
- Maintained explicit inspiration/attribution to [CognitiveHands](https://github.com/CrumpLabSandbox/CognitiveHands).

## New exploratory science tools

- **Local F1 sensitivity:** finite-difference derivatives from the real VTL transfer function at canonical /a/, /i/, /u/ shapes. Missing resonances remain unresolved; no human-formant labels or learned maps are imputed.
- **DIVA feedforward strength:** adjustable scaling of the existing restoring controller term (defaults to the previous value). This does not alter the default behavior.
- **Six-condition balance sweep:** pairs +150 Hz auditory perturbation with feedback gains 0/0.2 and feedforward scales 0.5/0.75/1.0; exports CSV for comparing small produced-F1 changes and target tracking.

Scientific caveat: these remain reduced-order controllers, and F1 estimates are exploratory. Neither increased compensation nor reduced motor effort alone establishes speech accuracy. The original Emscripten integration must be validated by GitHub Actions after deployment.

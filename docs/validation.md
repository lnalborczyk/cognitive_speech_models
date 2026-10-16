# Scientific validation and interpretation

VocalTractLab (VTL) is established research software for geometrical and acoustic vocal-tract synthesis. Its use here **does not validate** the higher-level DIVA, GODIVA, Task Dynamics or GEPPETO-OFC-inspired controllers.

## Verified by repository tests

- Deterministic, bounded normalized articulator trajectories for all four controllers using a shared simulated actuator.
- Correct speaker-defined vowel and context-dependent stop shape lookup (with explicit errors for absent targets).
- Correct JavaScript memory-marshalling of the VTL C API, and native ctypes integration using compiled test-only C libraries.
- VTL API mock integration for online sensory signals, including transfer-function resonance extraction, numerical sensory correction and signs of feedback perturbations.
- Browser interface layout at multiple viewport widths.

These tests are **not** validation against published model simulations or human speech behavior. On deployment, GitHub Actions should compile the real upstream VTL backend and verify waveform/geometry playback in Chromium; the separate VTL transfer-function observer still requires empirical accuracy and runtime benchmarking.

## Outstanding limitations

- **Speech biomechanics:** the normalized mass–spring actuator is not a muscle-level biomechanical plant. In particular, it is not the finite-element tongue used in GEPPETO-OFC.
- **Formant identification:** VTL `vtlGetTransferFunction` provides physically computed transfer spectra; the current peak detector is fixed-band and does not perform validated LPC or resonance tracking. Missing peaks are not imputed.
- **Task-space geometry:** stop contact sites are selected using VTL target cross-sections and approximate tract intervals. Numerical gradients represent local sensitivities at the present posture; they are not calibrated task-space coordinates across the entire vocal tract.
- **Feedback:** delayed measurements and gain-weighted Jacobian corrections are heuristics. There is no learned DIVA inverse map, Kalman state estimator, or full stochastic optimal-feedback controller.
- **Consonants:** context-dependent target poses alone do not guarantee stop closure, burst, pressure timing or appropriate laryngeal gestures.
- **Backend parity:** online sensory feedback is available in the WebAssembly worker; native server mode remains an open-loop baseline for motor trajectories.

## Suggested validation sequence

1. Compare VTL formants and stop target geometry with official upstream examples for JD3, including native-versus-WebAssembly equivalence.
2. Test finite-difference convergence (different perturbation sizes) and constriction-site stability across vowel contexts.
3. Quantify auditory feedback compensation for both positive and negative F1 shifts, including null effects when auditory gain is zero; repeat over a range of delays.
4. Evaluate VTL synthesized vowel formants against independent acoustic estimators, then compare predicted stop closure/release with articulatory data.
5. Compare each controller against its published original implementation before drawing theoretical conclusions. In particular, no result here should be labelled a validated GEPPETO-OFC simulation.

Further details: [controller API](models.md), [research roadmap](research-roadmap.md), and [upstream VocalTractLab API](https://github.com/TUD-STKS/VocalTractLabBackend-dev).

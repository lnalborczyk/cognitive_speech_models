# Local F1 sensitivity and feedforward–feedback balance

The [Validate VTL feedback/feedforward balance](https://github.com/lnalborczyk/cognitive_speech_models/actions/workflows/validate-v15-experiments.yml) GitHub Actions workflow runs these experiments against the public GitHub Pages site in Chromium using the actual embedded VTL WebAssembly engine.

## Design

1. Obtain the speaker's reference F1 values and local finite-difference F1 derivatives (JA, TCX, TCY, LD) for /a/, /i/, and /u/. Missing or inconsistent formants remain missing. The derivative measurements are sensitive to local resonance-peak identity.
2. Hold /aː/ at speaking rate 0.6, motor noise 0, seed 17, 40-ms auditory delay, and onset at 450 ms.
3. For +150 Hz and −150 Hz *perceived* F1 shifts, cross feedforward strengths 0.5, 0.75, 1.0 with auditory gains 0 and 0.2. Paired shifted and unshifted simulations share parameters and random seed.
4. Record VTL-predicted compensatory F1 change, number of usable observer samples, target-tracking RMS, and motor effort.

**Software controls:** Six conditions must be present per perturbation direction; zero-auditory-gain runs must not respond to the shift. The browser must initialize VTL and synthesize the initial utterance.

**Scientific outcomes:** No minimum compensatory response is required to pass. Compare how compensation magnitude and tracking RMS vary with feedforward strength. Differences between +150 and −150 Hz may reveal nonlinearity or unreliable resonance tracking. These predictions have not been validated against articulatory or human auditory perturbation data. Positive compensation is defined as a produced F1 shift *opposite* to the perceived perturbation.

## Run

Open [GitHub Actions](https://github.com/lnalborczyk/cognitive_speech_models/actions/workflows/validate-v15-experiments.yml), select **Run workflow**, and download the `vtl-feedback-balance-validation` artifact. The workflow also runs automatically after successful Pages deployment.

Alternatively, from a machine with network access and Chromium:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 scripts/validate_v15_online.py --artifacts artifacts/v15-balance
```

The artifact contains `vtl-local-f1-sensitivity.csv`, `vtl-feedforward-feedback-positive.csv`, `vtl-feedforward-feedback-negative.csv`, `experiment-report.md`, and `validation-result.json`. If the experiment fails, the artifact includes a screenshot and error details.

## Interpretations

- High local F1 sensitivity but little compensation: inspect the inverse mapping and restoring force.
- Weak or inconsistent F1 sensitivities: resolve the acoustic estimator before interpreting feedback gains.
- Compensation that increases as feedforward stiffness decreases, but tracking worsens: evidence of a model-level control tradeoff, not a justified setting for human speech.
- Equal-magnitude shifts with highly asymmetric compensation: investigate Jacobian accuracy and the auditory observer.

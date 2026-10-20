# Auditory feedback diagnostics and sustained-vowel validation

This project implements transparent *DIVA-inspired* and Task Dynamics-inspired controllers on a common VTL articulatory synthesizer. The simulations are neither trained DIVA neural maps nor quantitative predictions fitted to human speech.

## Why a sustained vowel?

In the prior `/a i a/` validation, onset of motor divergence for a shift beginning at 0.55 s occurred near 0.96 s (40-ms feedback delay) or later (100-ms delay), after the center /i/ interval. Moreover, VTL's current /i/ F1 estimator was unresolved. A held `/aː/` isolates sensory gating from fast articulatory transitions. This does **not** establish that the output is more natural or physiologically realistic.

## Browser protocol

1. Select **DIVA-inspired** and **/aː/ sustained (feedback test)**.
2. Set **speech rate 0.6**, **motor noise 0**, **random seed 17**, **auditory feedback gain 0.2**, **auditory feedback delay 40 ms**, **heard F1 shift +150 Hz**, and **onset 450 ms**. Keep somatosensory gain unchanged.
3. Click **Compare baseline vs F1 shift** and download the paired F1 CSV.
4. Repeat with auditory gain 0 (negative control), F1 shift -150 Hz (symmetry check) and auditory delay 100 ms (latency manipulation).
5. For independent replication change seeds only *if motor noise is nonzero*. With zero motor noise, different seed numbers have no expected effect.
6. Repeat `/iː/` only as an *estimator diagnostic* while /i/ F1 is unresolved; never infer failure of motor compensation from empty acoustic measurements alone.

The selected vowel is held with one continuous canonical VTL target. It is not simulated with duplicated stop/release events.

## Signals saved for each 5-ms motor frame

The existing paired F1 CSV columns remain intact. New columns log the feedback control actually used by DIVA, rather than a post-hoc estimate from the final waveform:

| Column | Meaning |
| --- | --- |
| `feedback_observation_time_s` | Time of the *delayed* VTL observation used to calculate the current command |
| `feedback_measured_F1_Hz` | Delayed heard F1 (before experimental shift) |
| `feedback_target_F1_Hz` | Delayed target F1 used by that controller step |
| `feedback_error_F1_Hz` | Heard F1 + applied shift - target F1; blank if F1 unresolved |
| `feedback_applied_shift_Hz` | Shift presented to the active auditory controller, zero at gain zero |
| `feedback_jacobian_norm_F1` | Norm of VTL finite-difference F1 sensitivity in physical observer coordinates |
| `feedback_command_RMS` | Magnitude of the auditory correction command, including other resolved formants |
| `feedback_valid_F1` / `feedback_status` | Whether F1 was available and why feedback may have been unavailable |
| `delta_auditory_command_RMS` | Difference between *perturbed and unperturbed auditory motor commands* at this instant |
| `observer_sample_time_s` / `observer_update` | Actual source observation timestamp and fresh-sample indicator; the 5-ms frames between ~40-ms measurements reuse the cached observation |

A nonzero `feedback_applied_shift_Hz` together with `feedback_status=f1_unresolved` means that the shift was presented but did not yield an **F1-specific** error; other formants may still contribute to the total auditory command.

## What counts as compensation?

Let `ΔF1(t) = F1_perturbed(t) − F1_baseline(t)`. For a **positive** heard-F1 shift, a **negative** produced ΔF1 is compensatory; reverse for a negative shift. Report it only when baseline and perturbed VTL F1 are both valid. A `0 Hz` result means valid observations showed no difference, whereas an empty value means *not measurable*.

Compute responses separately (1) at least 200 ms after onset **during the perturbed vowel** and (2) during the following vowel, if one exists. The previous `/a i a/` test mixed these windows in one summary. Frame rows are not independent observations; use `observer_update=1` for acoustic summaries and replicate across independently sampled motor noise conditions when relevant.

The first *nonzero* auditory motor command is not the onset of a perturbation effect: the controller may already be issuing unperturbed corrections. Prefer the first nonzero `delta_auditory_command_RMS` for intervention-specific timing.

## Automation

Go to **GitHub Actions → Validate live VTL feedback → Run workflow**. Enable **include_sustained** to run held-/a/ conditions in the published WebAssembly engine. The workflow exports paired CSVs and JSON. Incomplete /i/ F1 calibration remains a warning, not a deployment failure.

Local analysis:

```bash
python3 scripts/analyze_perturbation.py results/paired_f1_*.csv \
  --output results/summary.csv --plot results/f1-plot.png
python3 scripts/plot_feedback_diagnostics.py results/paired_f1_ahold_g0.2_d40_s+150_seed17.csv \
  -o results/held-a-feedback.png
```

Matplotlib is optional and used only for plots. The browser VTL synth and its tests do not depend on the plotting library.

## Low-band spectrum check

**Check reference vowels** now reports candidate local maxima between 100 and 1200 Hz, calculated from a higher-resolution VTL transfer spectrum. These are *candidate spectral peaks*, not automatically accepted formants. The original calibrated F1–F3 estimates are unchanged; unresolved F1 remains missing. Comparing the candidates to an independent LPC analysis of a synthesized steady vowel is still necessary before recalibrating the controller's auditory goals.

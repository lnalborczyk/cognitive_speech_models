# Auditory-feedback validation protocol

These are **simulation diagnostics**, not tests of whether the published DIVA model is correct. The DIVA and Task Dynamics implementations in this repository are reduced-order controllers. VocalTractLab supplies the geometry and acoustic forward calculations.

## 1. Prerequisites

Deploy the v1.4.0 source and wait for the GitHub Pages build-and-browser test to pass. Verify the version label reads `1.4.0` and the engine says `VocalTractLab WebAssembly`.

## 2. Reference vowels

In **VTL vowel-target calibration**, select **Check reference vowels**. Record the resolved F1/F2/F3 values of /a/, /i/, /u/ and the within-estimator differences. Missing estimates are failures to resolve a resonance, not automatically failures of the speaker shape. A reported difference near zero is a *repeatability check*: it cannot establish a correct acoustic target because the estimator is used on both sides.

## 3. No-shift gain/delay sweep

Set controller `DIVA`, phrase `/a i a/`, rate 0.6, overlap 0.30, somatosensory gain 0.50, plant stiffness 1.0, noise 0, seed 17, and F1 shift 0 Hz. Click **Run 8-condition sweep** and **Download sweep CSV**. It varies auditory gains 0, 0.1, 0.2, 0.4 at delays 40/100 ms and reports *articulatory tracking RMS* and *mean squared motor commands*. Both delays at gain 0 must be numerically identical: auditory delay is now independent of the fixed 40-ms somatosensory delay. Differences indicate a regression. This is a negative control. Lower RMS is not proof of better acoustics or perceptual intelligibility.

Repeat at seeds 23 and 41, or more seeds, and optionally `/a u a/`, `/i a i/`. Rename the CSVs (`sweep_seed17_aia.csv`) before downloading another. Avoid treating time samples within one simulation as independent observations.

## 4. Positive and negative auditory F1 perturbations

Keep rate 0.6 and select `/a i a/`. This gives roughly 0.48 s per vowel, and the central /i/ occupies approximately 0.48–0.97 s. The default speed 1.0 is too fast to give a useful steady-vowel post-perturbation interval with an onset at 300 ms. Use the following settings:

- Auditory gain: initially **0** (negative control); then **0.1**, **0.2**, **0.4**.
- Feedback delay: **40 ms**, then **100 ms**.
- Heard F1 shift: **+150 Hz**, onset **550 ms**; then repeat for **−150 Hz**.
- Somatosensory gain **0.50**, motor noise **0**, random seed **17**; repeat with at least seeds 23 and 41.

Click **Compare baseline vs F1 shift**. The button **Download paired F1 time course (CSV)** becomes available. Rename each download, e.g. `diva_aia_seed17_gain02_delay40_plus150.csv`, to preserve its condition identity.

The CSV contains the baseline and perturbed **VTL tract-predicted** F1, the current blended-target F1, change in produced F1, baseline target error, and motor divergence over time. It is **not** a spectrogram-based measurement of the two emitted WAV files, and the simulated shift is in *heard* F1 only.

Expected **directional** response (not a calibrated magnitude):

- At gain **0**, shifted and baseline articulatory trajectories should agree, despite the nominal perturbation.
- At gain >0, a **positive** heard F1 shift may lead to a **negative** change in *produced* F1 after feedback delay, and vice versa for a negative shift.
- Before the shift onset, the two trajectories should be identical with the same seed. A pre-onset difference is a potential bug.
- The response should not systematically precede the onset of the perturbation. The approximate 40-ms VTL observer interval limits temporal resolution.
- The measured response may be absent, poorly resolved, or opposite in sign; do not relabel such outcomes as success.

Current VTL feedback is a simplified local inverse control law. It is not fitted to human compensation latencies or magnitudes.

## 5. Summarize and plot exported time courses

From the project root, with Python 3 installed:

```bash
python3 scripts/analyze_perturbation.py results/*.csv \
    --output results/perturbation-summary.csv \
    --plot results/perturbation-timecourses.png
```

For plotting, `python3 -m pip install matplotlib` if necessary. The script uses nominal **fresh observer samples (~40 ms)** rather than treating each repeated 5-ms record as independent. For `/a i a/`, its late response is restricted to the central /i/ and times at least 200 ms after perturbation onset. It warns when fewer than 3 valid observer samples remain; a late average in that case is not a trustworthy latency or compensation estimate.

For a more rigorous assessment, aggregate compensation metrics **across random seeds or independently fitted controller/speaker parameters**, plot variability, and inspect the target error and WAVs. The three vowel sequences, multiple delays, and bidirectional shifts are more informative than tuning a single gain to one waveform.

## Calibration interpretation

A vowel with any missing F1–F3 estimate is labeled **Incomplete**, not **Repeatable**. A completely resolved row with near-zero remeasurement error is only a repeatability check. Do not interpret a repeatable but acoustically unusual /u/ F2 (or any other peak) as evidence of phonetic accuracy. The simplified peak finder needs validation against VTL's resonances or a higher-resolution spectral estimator before targets are accepted.

## Auditory-delay negative control

The auditory-delay slider changes only the auditory pathway in the DIVA-inspired controller. Proprioception is held at a fixed 40 ms in the public simulation and can be changed programmatically with `somatosensoryDelayMs`. This isolates the auditory manipulation but does not imply 40 ms is a calibrated biological latency. The gain/delay CSV contains only unperturbed target-tracking and effort measures. Compensation metrics require separate paired-shift runs.

# Live WebAssembly validation

This project runs a **real-browser test** of the published GitHub Pages
application, independent of the local/unit tests. The workflow is
`.github/workflows/validate-live-feedback.yml`.

It starts automatically after a successful **Build VTL WebAssembly and deploy
GitHub Pages** workflow and can also be started from **Actions → Validate live
VTL feedback → Run workflow**. Its default seed is `17`; for a small
replication, enter `17,23,41` in the Seeds field. The workflow is read-only:
it will not alter the deployed website.

## Tests

- Initialize the real in-browser VocalTractLab engine and generate a WAV.
- Measure the loaded speaker's /a/, /i/, /u/ reference peaks. Unresolved
  values are reported rather than treated as zeros.
- Run the eight-condition unperturbed DIVA gain/delay sweep with the same
  random seed. At auditory gain zero, changing *auditory* delay must leave
  motor tracking and effort unchanged (software negative control).
- Run paired DIVA trials for perceived F1 shifts of **+150 and −150 Hz**, with
  gains **0 and 0.2** and delays **40 and 100 ms**, using a 550-ms onset, the
  `/a i a/` sequence, speaking rate 0.6, and zero motor noise.
- At auditory gain zero, paired articulatory trajectories must not diverge;
  at any gain, the shifted run must not diverge **before** the shift onset.
- Report late changes in *produced* VTL-estimated F1, valid observer samples,
  compensatory direction, and motor response latency.

The software gate only requires the negative-control invariants to hold. It
**does not assume** that the DIVA-inspired controller produces a correctly
directed compensation. That prediction must be assessed empirically. Missing
F1 estimates or insufficient late samples are scientific limitations, not
positive results.

## Outputs

Download the **vtl-live-feedback-validation** artifact from the workflow run:

- `vtl-gain-delay-sweep.csv`: unperturbed sweep.
- `paired_f1_*.csv`: each 5-ms articulatory time course and nominal ~40-ms
  sensory-observer measurements.
- `live-feedback-summary.csv`: one row per paired trial.
- `live-feedback-result.json`: calibration, software checks and interpretation.
- `failure.png`: browser screenshot if the run fails.

These are exploratory simulations. Formants are estimated from the VTL
transfer function, not independently verified from a recorded human speaker;
observer samples within a trial are autocorrelated. Do not treat software
negative controls as scientific validation of the DIVA neural model.

## Local invocation

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 scripts/validate_live_feedback.py \
  --url https://lnalborczyk.github.io/cognitive_speech_models/ \
  --seeds 17,23,41 \
  --artifacts artifacts/live-validation
```

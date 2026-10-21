# v1.7 model-fidelity experiments

This protocol tests the live **VocalTractLab WebAssembly** implementation and
reports results rather than assuming the revised models succeed. It uses the
same JD3 speaker across controllers and all conditions.

## Running the experiments

On GitHub, open **Actions → Validate v1.7 model fidelity → Run workflow**.
The workflow also runs after a successful GitHub Pages deployment.
Download the `vtl-v17-model-fidelity` artifact when finished.

By default, the workflow uses five perturbation-exposure trials and six
unperturbed washout trials. The script can also be executed against a local
site with the compiled VTL assets:

```bash
python3 scripts/validate_v17_models.py \
  --url http://127.0.0.1:5173/ \
  --artifacts artifacts/v17-models
```

## Task Dynamics: closure and release

Utterances: `/apa/`, `/ata/`, and `/aka/`.
Use overlap 0.65 with the same rate, motor noise (zero) and seed.
Compare three conditions: low stop priority and slower attractor `(1, 5.5)`,
high stop priority alone `(8, 5.5)`, and high priority plus faster closure
`(8, 18)`. This disentangles target competition from control speed.

Report the minimum VTL oral area at the **intended closure location**, closure
onset and duration, and release time; a stop closure is not counted merely
because the minimum tube area anywhere is small. Other tasks and vowel
transitions can remain active concurrently. Faster closure may produce worse
tracking or more overshoot; report those effects too.

## DIVA: held-out inverse-map evaluation

Train on exploratory VTL movements with seed 17, and evaluate the learned maps
using newly generated movements with seed 8911. At each vowel target, measure
F1 error before and after the corrective articulatory displacement. Report the
number of valid observations, mean absolute F1 errors and proportion improved.
Do not substitute synthetic or average F1 values when VTL cannot resolve a
formant. This tests *within-vowel local generalization*, not generalization to
an unseen vowel or speaker and not human babbling behavior.

## DIVA: adaptation and washout

A fresh motor-program memory is initialized. Run an unperturbed probe, five
+150-Hz perceived-F1 exposure trials, then six trials without the perturbation.
Each trial updates the motor program from the feedback command. After each
update, measure F1 under a fixed, zero-auditory-gain probe, plus motor-program
RMS, articulatory tracking and motor effort. The default retention factor is
1.0, with **no forced passive decay**; this isolates feedback-mediated washout.
Washout may fail if the unperturbed residual lies within DIVA's auditory target
region. The artifact reports this outcome rather than asserting an adaptation
mechanism has been validated. To explore explicit passive decay, specify a
retention below 1.0 separately and label it accordingly.

## Artifacts and acceptance

- `task-dynamics-closure-release.csv` and `td_*.csv`
- `diva-heldout-mapping.csv`
- `diva-adaptation-washout.csv`
- `v17-result.json`, `browser-console.log`, `experiment-report.md`

The workflow fails if VTL fails to initialize, required reference geometry is
missing, the deployed version is older than 1.7, or exported measurements are
malformed. It does **not** fail because a stop remains open or DIVA produces no
adaptation—those are scientifically informative results.

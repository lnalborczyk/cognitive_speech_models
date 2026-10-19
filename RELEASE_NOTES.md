# Cognitive Speech Models v1.3.2 — validation correction

The unperturbed gain/delay sweep now isolates **auditory feedback latency**: DIVA's proprioceptive pathway uses a fixed 40-ms delay (or configurable `somatosensoryDelayMs` in code) rather than the public auditory delay slider. Consequently the gain-0 rows at 40 and 100 ms auditory delay must be identical under otherwise matched conditions. The 40-ms setting is an exploratory constant, not an empirically fitted proprioceptive latency.

The vowel calibration now labels a vowel **Incomplete** when any F1–F3 estimate is unresolved. **Repeatable** means the estimator gives nearly the same readings twice, not that the frequencies match empirical vowels. In particular, the high F2 estimates returned for /u/ by the existing peak picker require independent spectral validation.

The unperturbed gain/delay CSV now contains only the measurements actually made: tracking RMS and motor effort. Compensation and valid-sample columns belong to the separate paired F1 perturbation experiment.

This is a validation/experimental-design correction; it does **not** establish improved speech acoustics or make the model a validated DIVA implementation.

# Controller architecture and scientific scope

Each cognitive controller implements a `step()` method over the same normalized vocal-tract parameter state. Its output is an articulatory command applied by `src/motor/plant.js`, **not** a muscle activation. VTL converts the resulting physical tract configuration into cross-sectional tube geometry and the transfer function.

## Online multisensory observer (WebAssembly)

The browser worker runs `simulate(...)` inside the same thread as the actual VTL C API. Its optional `sensoryProvider` calls `VTLSensoryObserver.at()` on the current and target postures at scheduled 40 ms intervals (nominal value).

The observer uses `vtlTractToTube` to return an oral constriction area (cm²), a contact position (cm from the glottis), and a local finite-difference Jacobian (area per normalized tract parameter). Each consonant contact site is determined from that consonant's target geometry, with a restricted search region (labial, alveolar or velar), **not** from an abstract tongue-position surrogate.

The observer uses `vtlGetTransferFunction` with VTL's default transfer function options and an FFT-length-equivalent of 1024 spectral samples. It selects peak-based F1, F2, F3 candidates; formant identities and bandwidths are *not* tracked or validated. Finite differences estimate partial derivatives in Hz per normalized parameter. The observer is evaluated on selected jaw, lip, tongue-tip or tongue-body parameters to control browser load.

Auditory perturbation shifts **perceived F1** in the feedback loop; it does not artificially shift the output WAV. Delayed measurements are used in the DIVA-derived controllers. The sensory correction computes a damped Jacobian-transpose-like term with explicit heuristic gains and regularization. This is **not a learned inverse model** or a complete neural/biomechanical theory.

## Controller implementations

- `diva.js`: feedforward and delayed proprioceptive correction; additionally uses VTL resonance errors/Jacobians when available. No learned DIVA sound maps.
- `godiva.js`: simplified competitive sequence queue with the DIVA-inspired controller downstream. No neuroanatomical network fidelity.
- `task-dynamics.js`: active constriction task for stops, acoustic resonance goal for vowels, and a stabilizing articulatory command. VTL-derived local task Jacobians replace the old parameter-combination map in browser mode. No calibrated Task Dynamics mass/stiffness matrices.
- `geppeto-ofc.js`: one-step local multisensory quadratic-style controller with a change-in-command penalty. Inspired by the sensory goals and online feedback of [GEPPETO-OFC](https://doi.org/10.1121/10.0039197), but **without** its muscle-force, finite-element or stochastic estimator architecture. It should not be used to make GEPPETO-specific quantitative predictions.

The optional native Python server still runs the controllers without online VTL acoustics; it synthesizes the completed trajectory. In native mode auditory correction and F1 perturbation are disabled by the interface.

## Research benchmarking

All controllers are intentionally comparable on the same speaker and reduced-order actuator. This does **not** imply the complete published models are structurally equivalent or implement an identical physical plant. Useful experimental tests include:

1. Compare VTL-measured labial, alveolar and velar closure area trajectories for `/apa/`, `/ata/`, `/aka/` and different vowel contexts.
2. Study the sign and magnitude of feedback responses to a perceived F1 shift in vowel sequences. Verify zero response at feedback gain zero, and report the chosen sensory delays.
3. Compare VTL `vtlGetTransferFunction` resonance estimates against independent vowel formant measurements and against the final waveform spectrum.
4. Compare coarticulation to VTL `.ges` trajectories and, eventually, human articulatory (EMA) and acoustic data.

Missing resonance estimates or failure to reach the selected contact area must be reported, not counted as successful speech production.

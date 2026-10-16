# Scientific development roadmap

## Current experimental capabilities (v1.0)

- One common VocalTractLab speaker, articulatory actuator, geometry and acoustics for four small cognitive-controller demonstrations.
- Speaker-defined contextual /p/, /t/, /k/ closure shapes with explicit target-hold intervals.
- WebAssembly worker can sample `vtlTractToTube` and `vtlGetTransferFunction` *during* simulated movement. Constriction-site detection is restricted by approximate tract regions; Jacobians use local finite differences over selected articulatory dimensions.
- DIVA-like delayed auditory/somatosensory correction, Task Dynamics-like constriction control, and a reduced-order GEPPETO-OFC-inspired feedback controller.
- Area functions, synthesized audio, spectrograms, resonance estimates, CSV, candidate closure events, and a physical-output comparison table.

## High-priority validation experiments

1. **VTL equivalence and performance:** compile in GitHub Actions, measure online sensory computation times and compare fixed parameter trajectories between WASM/native APIs. Verify a sensible F1–F3 pattern for all three vowels; flag missing/unstable peaks.
2. **Task geometry:** calibrate labial, alveolar and velar constriction sites against the complete VTL geometry and contrast numerical gradients against finite perturbation benchmarks. The current region bounds are heuristic.
3. **Feedback interventions:** compare F1 shifts (+/- 100 and 200 Hz), sensory delays and zero-gain baselines. Establish correct direction of compensatory commands and auditory outcomes before interpreting model differences.
4. **Consonant acoustics:** add explicit laryngeal voicing, pressure and release/burst timing; validate closures and acoustic transitions instead of treating static target achievement as successful stops.
5. **Reference trajectories:** incorporate official VTL gestural score parsing/compilation and benchmark articulatory, acoustic and closure trajectories for the same sequences.

## Long-term research goals

- Learn DIVA forward/inverse maps rather than using local Jacobian correction.
- Implement explicit GODIVA planning and initiation representations.
- Test a more complete multi-step OFC controller against the *actual* GEPPETO-OFC biomechanical/multisensory simulation, without equating VTL geometry to muscle-level GEPPETO dynamics.
- Estimate motor/feedback parameters and uncertainty from EMA, ultrasound, MRI and acoustic datasets.
- Report model recovery and out-of-sample prediction rather than visual similarity alone.

Nothing in the present implementation implies empirical validation of the named cognitive theories.

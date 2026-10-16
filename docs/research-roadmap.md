# Research development roadmap

## Implemented in v0.9.0 (exploratory, not externally validated)

- Contextual VTL stop target resolution for /p/, /t/ and /k/ using JD3-style speaker names in /a/, /i/ and /u/ contexts.
- Raised-cosine gestural transitions with stop target-hold plateaus.
- A non-identity low-dimensional coupled parameter-task map for Task Dynamics, plus a damped Jacobian-transpose drive and stabilizing parameter control.
- VTL static constriction target geometry as a descriptive reference, minimum oral-area trajectories, candidate closure reports, and VTL waveform spectrograms.
- Four-controller comparisons using the common VTL backend and downloadable CSV summaries.

## Prioritized future work

1. **Validate consonants against VTL gestural scores**: call the actual VTL `vtlGesturalScoreToTractSequence` API, provide controlled phonation, pressure and release gestures, calibrate stop closure detection, compare voice onset time and burst timing.
2. **True task-space dynamics**: define constriction degree and location from VTL tube/anatomy, estimate a finite-difference Jacobian, use a stable damped pseudoinverse and test compensatory coordination.
3. **Genuine closed-loop DIVA**: extract acoustic features in a streaming forward path, learn a differentiable/estimated sensory-to-motor transformation, and distinguish delayed auditory and somatosensory errors experimentally.
4. **Controller fidelity**: implement learned feedforward trajectories in DIVA, gated motor initiation in GODIVA and trajectory optimization/biomechanical constraints in GEPPETO. Never label a surrogate a published validated model.
5. **External validation**: compare formants, closure timing, intensity, EMA movement trajectories and coarticulation across rates, speakers and phonetic contexts, using pre-registered benchmark definitions.

See `docs/models.md` and `docs/validation.md` for present limitations.

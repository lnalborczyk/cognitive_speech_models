# Release v1.6.0 — Model-oriented control mechanisms

DIVA and Task Dynamics remain the only two public controllers. They now have
more distinct mechanisms connected to a shared VocalTractLab WebAssembly engine.

- DIVA: automatically fitted VTL babbling-based local auditory inverse maps,
  auditory goal regions, and optional explicit practice updating feedforward
  motor programs. Retains the numerical Jacobian as a comparison mode.
- Task Dynamics: independent tract gestures and numerical VTL tube-task
  Jacobians; critically damped task-space targets with damped pseudoinverse;
  reduced coupling graph controls relative gesture timing.
- External reference timeseries comparison helper, without claiming any
  embedded TADA/DIVA reference trajectories.
- Model-specific sliders; research/learning controls remain collapsed.
- Public README maintains CognitiveHands attribution and describes limitations.

**Scientific qualification:** Neither controller is an exact reproduction of
published DIVA or Task Dynamics/TADA, nor are the tube-based constriction
variables identical to TADA's geometric constriction distances. Actual VTL
WebAssembly synthesis, audio quality and motor stability require GitHub Actions
integration after deployment; source-level tests alone are insufficient.

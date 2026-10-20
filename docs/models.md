# Controller models and scientific scope

The public application contains two controllers, **DIVA-inspired** (`src/cognitive/diva.js`) and **Task Dynamics-inspired** (`src/cognitive/task-dynamics.js`), using the same normalized actuator, speaker geometry and acoustic synthesis. These are reduced-order models; neither reproduces its published full neural/biomechanical architecture.

DIVA includes feedforward and fixed-latency proprioceptive error control (40 ms by default), with a separately adjustable auditory delay and optional online VTL transfer-function auditory error. The auditory target is derived from the current VTL articulatory target; peak identities are tracked across observer updates, where possible. A local ridge-regression inverse map is fitted from VTL articulatory exploration; this is not the published DIVA neural mapping or learning law.

Task Dynamics uses independent overlapping gestures and approximate coupled timing, with VTL tube-derived effective constriction diameters/locations and their numerical Jacobians. Second-order point attractors are inverted to articulator accelerations with a damped pseudoinverse. These are not the original TADA palate-distance coordinates, oscillator network, or physical muscle dynamics.

The shared actuator is an exploratory normalized mass–spring-like integrator, not a direct VTL muscle/finite-element model. No published-model equivalence or fit to human experimental measurements is claimed.


See [v1.6 model fidelity and remaining limitations](model-fidelity-v16.md) for details about the VTL-derived task geometry and DIVA local learning architecture.

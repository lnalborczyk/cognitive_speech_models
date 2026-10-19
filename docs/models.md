# Controller models and scientific scope

The public application contains two controllers, **DIVA-inspired** (`src/cognitive/diva.js`) and **Task Dynamics-inspired** (`src/cognitive/task-dynamics.js`), using the same normalized actuator, speaker geometry and acoustic synthesis. These are reduced-order models; neither reproduces its published full neural/biomechanical architecture.

DIVA includes feedforward and fixed-latency proprioceptive error control (40 ms by default), with a separately adjustable auditory delay and optional online VTL transfer-function auditory error. The auditory target is derived from the current VTL articulatory target; peak identities are tracked across observer updates, where possible. There is no trained neural forward/inverse map.

Task Dynamics acts on overlapping task targets and, when available, VTL constriction area with finite-difference Jacobians. A faithful gestural task-dynamics model would additionally require quantitative task constriction coordinates and a consistent task-to-articulator transformation calibrated to anatomy.

The shared actuator is an exploratory normalized mass–spring-like integrator, not a direct VTL muscle/finite-element model. No published-model equivalence or fit to human experimental measurements is claimed.

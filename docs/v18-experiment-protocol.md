# VTL model-fidelity protocol v1.8

## Purpose

Evaluate two specific hypotheses motivated by the v1.7 artifact:

1. Broad task-space constriction measurements and poorly conditioned inverse kinematics were insufficient for bilabial and alveolar stops.
2. The previous DIVA update accumulated ordinary auditory feedback commands during unperturbed washout, rather than adapting in response to a measurable acoustic aftereffect.

These are hypotheses, not assumed results. All measurements use the actual VocalTractLab WebAssembly speaker through the public app's research worker.

## Experiment A — Reference-site closures

For /p/, /t/, and /k/ in /a/ context, measure the reference stop and vowel areas at the VTL closure section, and the local gradient of area with respect to relevant VTL parameters. Confirm whether the stored reference shape itself reaches the candidate closure threshold (0.08 cm²). Then run a regularized static inverse solve starting from /a/ toward that reference; report convergence and the final measured area without time pressure. Distinguish a feasible reference from failure of the inverse transformation. A failure is a scientifically relevant diagnostic, **not** a reason to force the site to zero.

Simulate /apa/, /ata/, and /aka/ with the same random seed, overlap, closure speed, stiffness, and stop priority. Vary *only* the secondary reference attraction: 0, 35, and 65. Quantify anatomical-site minimum area, closure onset and duration, release time, normalized target tracking, and effort. Inspect the site-aperture time course, remembering that diameter (cm) is different from area (cm²).

The closure controller uses VTL-derived geometry; the extra reference guide is an explicit reduced-order controller choice, not an implementation of TADA muscle dynamics. The solver never overrides the plant state directly.

## Experiment B — DIVA acoustic-error adaptation and washout

Use sustained /aː/, five +150 Hz perceived-F1 exposure trials, then twelve unperturbed washout trials (40-ms auditory delay, 0.2 gain, zero motor noise). No passive forgetting is applied (`retention=1`). The matched reference is an unperturbed simulation with zero stored memory.

At each learning step, compare valid measured F1 with the matched baseline and add the shift only during exposure. Use the vowel's learned sensory-to-motor inverse map to update the time-aligned feedforward command. An unresolved F1 causes *no* learned correction; the trial is flagged. Export the signed acoustic learning error, update magnitude, stored motor-program magnitude, and post-trial unperturbed probe F1.

A scientifically useful washout shows a reduction in the *F1 aftereffect* toward the untrained baseline, caused by error-driven learning, not by artificial memory decay. A declining memory magnitude alone does not establish washout. If washout does not occur, inspect the error sign, inverse-map direction, and whether memory lies in an acoustically ineffective articulatory subspace.

## Execute online

Push v1.8 to the repository. GitHub Pages will rebuild real VTL. After deployment, the **Validate v1.8 model fidelity** workflow executes automatically. It can also be started from Actions → Run workflow, with configurable exposure/washout counts.

The `vtl-v18-model-fidelity` artifact contains `static-vtl-stop-reference.csv`, `task-dynamics-closure-release.csv`, nine Task Dynamics time courses, `diva-error-driven-adaptation-washout.csv`, JSON and browser-console diagnostics.

**Pass criteria:** VTL initializes, measurements are structurally valid, and all software invariants hold. Closure success, improvement, washout, and biological validity are **results to interpret**, never automatic software pass requirements.

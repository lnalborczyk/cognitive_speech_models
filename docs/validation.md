# Validation and scientific status

## What is validated externally vs locally

VocalTractLab is an established **research model of vocal-tract geometry and acoustic speech synthesis**, supported by MRI-based speaker geometry and a physical acoustic solver. Its native API offers acoustics, vocal-tract area functions, and SVG tract geometries for a specified speaker. These properties are not transferred to the browser fallback or the model-inspired control laws. It would be inaccurate to call this combined simulator a validated DIVA, GODIVA, GEPPETO or Task Dynamics implementation.

## What has been tested in this repository

- JavaScript numerical stability and deterministic trajectories for all controller modules;
- cross-model common state dimensions (including a mocked 19-parameter VTL speaker);
- absent named shape error handling;
- standard-library PCM WAV encoding and physical-to-normalized parameter conversion;
- native C ABI integration contract tested against a compiled **test-only stub**, including metadata, geometry, and WAV round-trip;
- parsing/syntax checks;
- visual frame timestamp selection, VTL SVG frame sequence, audio and HTTP gzip payload using the compiled test-only C ABI stub.

**Not tested**: a real VTL installation with actual `vtlInitialize`, `vtlSynthBlock`, `vtlTractToTube` and `vtlExportTractSvg` calls against a native library and speaker model, browser rendering/audio (browser automation was blocked by the execution environment), empirical formant accuracy, physiological articulator kinematics, or a complete feedback-control loop.

## Recommended empirical benchmarks (research phase)

1. Install and pin a VTL stable version and matching speaker model; synthesize transitions `/a i a/` and `/a u a/`. Check audio playback and tract SVG outputs.
2. Compare the area function to VTL's own GUI and official API examples; verify parameter ordering and units.
3. Estimate F1–F3 from *actual generated waveforms* (e.g. LPC with independently validated settings) and compare with known VTL reference vowels.
4. Acquire and analyze human EMA/ultrasound/MRI movement trajectories and acoustic timing data (including coarticulation and perturbation adaptation).
5. Fit dynamic actuator parameters to EMA or biomechanical data rather than tuning by eye; examine speaker generalization.
6. Replace proxy DIVA acoustic mapping with a forward-model interface updated during simulation (requiring online synthesis or surrogate model).
7. Build gestural constriction coordinates and a Jacobian from calibrated VTL geometries, then assess Task Dynamics and GEPPETO predictions separately.
8. Benchmark GODIVA competitive planning against behavioral errors and real neural planning signals.

## References

- Birkholz, P. VocalTractLab: https://vocaltractlab.de/
- Native API header: https://github.com/TUD-STKS/VocalTractLabBackend-dev/blob/main/include/VocalTractLabApi/VocalTractLabApi.h
- Tourville & Guenther, DIVA: https://pmc.ncbi.nlm.nih.gov/articles/PMC3650855/
- Bohland, Bullock & Guenther, GODIVA: https://pmc.ncbi.nlm.nih.gov/articles/PMC2937837/
- Saltzman & Munhall, Task Dynamics: https://doi.org/10.1207/s15326969eco0104_2
- Patri et al. GEPPETO / control: https://pubmed.ncbi.nlm.nih.gov/26497359/

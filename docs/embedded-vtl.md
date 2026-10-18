# VocalTractLab engines (native and WebAssembly architecture, v0.8)

For current public deployment, use [deployment.md](deployment.md).

## What "embedded" means in this release

In native mode, Cognitive Speech runs the actual VocalTractLab C API **in the
same local Python process that serves the user interface**. You do not start
the separate VocalTractLab GUI, configure an external API endpoint or switch
applications. The native library and the speaker file are still required.

```bash
python3 scripts/launch.py                  # detect installed library and start
python3 scripts/launch.py --install-vtl    # install/build first if missing
```

If setup completed previously, the launcher reads `scripts/vtl-env.sh`
automatically. The UI chooses native mode when it connects successfully.
This can later be distributed as a signed, standalone desktop application,
provided its binaries, resources and GPL obligations are handled correctly.

## What "live" means

The model controller produces a 200 Hz parameter trajectory. VTL generates:

1. An audio waveform from the entire articulatory trajectory (`vtlSynthBlock`).
2. A series of **actual VTL articulator geometry SVG frames** at the selected
   rendering rate (12, 20 or 30 samples per second; at most 120 frames).
3. A cross-sectional area function at each exported geometry frame
   (`vtlTractToTube`).

The viewer preloads the SVG images and advances them according to the audio
player's `currentTime`. Silent movement uses `performance.now()` instead. The
scrubber displays the anatomy at any selected time. This is *time-aligned
playback of precomputed model geometries*, not streaming native simulation
and not measured real-time movements from a human speaker.

## Browser-only operation: experimental VTL WASM build

A macOS `.dylib`, Linux `.so`, or Windows `.dll` cannot run directly
in a browser. A real C++→WebAssembly compilation with Emscripten is needed.
This repository implements the C API memory bridge, dedicated Web Worker,
and a Python Emscripten build script that compiles upstream source files. It
also embeds a compatible `.speaker` file into Emscripten's virtual filesystem.

**The actual WASM port is not verified**: there is no compiled VTL binary in
the provided repository, and no real audio/geometry parity test against an
installed VTL. See [the experimental build guide](webassembly.md) to compile
on your machine. The existing native mode remains a supported fallback.

Once a real WASM binary is successfully built and checked, the artifacts can
be deployed with the static HTML/JS code (e.g. via GitHub Pages). This is still
precomputed VTL synthesis and animation, not continuous solver execution at
visual refresh rate.

## Model validity

Real VTL provides anatomical geometry, area functions and synthesized audio.
The parameter-space actuator, phone targets, DIVA-inspired/Task Dynamics-inspired
controllers, and their auditory feedback remain simplified and unvalidated.
True closed-loop acoustic feedback has not been implemented. "VTL-native"
does not mean the **complete speech production model** is validated.

## License and distribution

VTL is GPL-licensed. If distributing bundled derivatives/binaries, inspect
its upstream license and satisfy applicable source, attribution and
redistribution requirements. This ZIP does not bundle VTL binaries or claim to contain a validated VTL WASM build.


The browser worker also uses `vtlGetTransferFunction` and `vtlTractToTube` during movement simulation for local sensory feedback. This is not equivalent to online native Python feedback. See [models](models.md).

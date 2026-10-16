# v0.8.2: missing Emscripten heap exports

The failing GitHub Actions run generated a browser diagnostic:

```text
Aborted('HEAP32' was not exported. add it to EXPORTED_RUNTIME_METHODS)
```

`vtl.js` and `vtl.wasm` returned HTTP 200, so this is an export-contract problem, **not** a missing WASM asset. `HEAP32`, `HEAPF64`, and `HEAPU8` are all used by `src/engine/wasm-runtime.js`. We now export all three.

## Apply without replacing your existing checkout

Replace `scripts/build_vtl_wasm.py` and `test/test_wasm_build.py` with the copies from the patch ZIP. On your checkout:

```sh
python3 -m unittest test.test_wasm_build -v
git add scripts/build_vtl_wasm.py test/test_wasm_build.py
git commit -m "Export VTL WebAssembly heap views"
git push origin main
```

GitHub Actions must recompile the **real** upstream VTL backend. On success the same workflow should run browser tests and deploy to Pages. If the browser test fails again, use the `vtl-wasm-diagnostics` artifact from the new run rather than increasing the timeout.

# Transmission fitting performance — November 7, 2026

The default scalar core now reuses FFT plans and buffers, prepares line geometry once per model evaluation, skips display-only curves in residual calculations, and reuses the evaluated curve when calculating its objective. The grid, quadrature, interpolation, source normalization, nuclear constants, optimizer, finite-difference steps, bounds, and covariance calculation are unchanged.

All 12 synthetic/control cases and both measured-spectrum fits retain **bit-for-bit identical complete results**, including parameters, std, intensity fractions, objectives, diagnostics, iteration counts, and termination. The initial evaluations also match exactly. This is enforced by frozen regression fixtures.

## Method

- Hardware: Apple M4 Pro; macOS arm64.
- Runtime: Node v22.18.0; browser engines are recorded in `browsers.json`.
- Compiler and build-tool versions, source hashes, and fixture hashes are in `provenance.json`.
- Baseline: clean core at commit `281a032`, rebuilt with the original release settings.
- Each case uses one excluded warm-up fit and five timed fits. Tables report median milliseconds; all samples are retained in JSON.
- Observations, weighting, starting parameters, bounds, and iteration limits are frozen. Synthetic observations were generated once with the baseline core plus deterministic noise; optimized stages load the same arrays.
- Measured cases retain the observed counts and provenance from the modern-constants public-data projects. Starting values are perturbed equally in every build.
- Timings include the JSON API and complete fit/uncertainty calculation. They exclude UI rendering and progress callbacks. Results describe this machine and these cases, rather than a universal speedup.

## Stages in Node

Stages are cumulative. The archived `plans.patch` and `curves.patch` apply to the baseline core for reproducing the intermediate builds in an isolated checkout. The final build additionally avoids reading the unused ordinary linewidth for xVBF sites.

| Case | Baseline | FFT plans | Curve work + buffers | Final default | Overall speedup |
|---|---:|---:|---:|---:|---:|
| singlet-lorentzian-source | 68.02 | 45.74 | 20.18 | 20.20 | 3.37× |
| three-sites-lorentzian-source | 711.08 | 628.94 | 155.63 | 157.49 | 4.52× |
| singlet-squared-source | 67.68 | 44.95 | 19.55 | 19.36 | 3.50× |
| three-sites-squared-source | 703.57 | 615.70 | 154.43 | 156.89 | 4.48× |
| mixed-absorber-profiles-counts | 611.83 | 521.04 | 168.33 | 167.51 | 3.65× |
| asymmetric-gaussian-source | 96.49 | 69.18 | 25.79 | 25.55 | 3.78× |
| xvbf-transmission | 87.34 | 56.20 | 48.48 | 48.34 | 1.81× |
| linked-parameters | 207.62 | 169.77 | 45.39 | 45.54 | 4.56× |
| active-width-bound | 189.57 | 128.14 | 55.52 | 55.59 | 3.41× |
| thin-control | 37.43 | 36.19 | 27.40 | 27.37 | 1.37× |
| source-calibration-lorentzian | 108.24 | 66.15 | 34.83 | 34.74 | 3.12× |
| source-calibration-squared | 109.57 | 67.37 | 34.86 | 34.91 | 3.14× |

Plan reuse alone preserves every complete fit result exactly. Its gain is largest for small models and source calibration. Preparing the ordinary line geometry removes repeated parameter-map lookups and line-position/amplitude calculations from all 6,001 integration samples. xVBF retains its original specialized evaluator and therefore gains less. Buffer reuse is per thread, with immutable FFT plans shared across calls; tests exercise alternating models and evaluation from progress callbacks.

## Measured spectra

| Measured case | Baseline | Final default | Speedup | Numerical result |
|---|---:|---:|---:|---|
| MS_Fe2O3_transmission | 177.24 | 47.27 | 3.75× | Bit-for-bit identical |
| MS_MexicanMagnetite_transmission | 2677.15 | 739.67 | 3.62× | Bit-for-bit identical |

Both measured fits use Lorentzian sources. The frozen synthetic suite separately covers squared sources, LorSquared/Gaussian/PseudoVoigt absorber profiles, count weighting, asymmetric Gaussian sources, xVBF, linked parameters, an active bound, both source-calibration shapes, and a thin-absorber control.

## Browser checks

Headless Playwright runs use the same WebAssembly binaries and frozen cases in WebKit and Chromium. WebKit exercises the JavaScriptCore engine family used by the macOS desktop webview; it is not a timing measurement of the installed desktop app. All scalar-stage results are bit-for-bit identical to the Node baseline.

| Engine | Squared-source three-site baseline | Optimized scalar | Speedup |
|---|---:|---:|---:|
| webkit 27.2 | 501.00 | 135.00 | 3.71× |
| chromium 156.0.8078.4 | 565.00 | 146.60 | 3.85× |

## SIMD experiment

SIMD is implemented as an **opt-in experiment**, and is not enabled by the normal build. Three configurations were tested:

1. RustFFT `wasm_simd` feature alone (`simd.json`): slower than optimized scalar in the Node suite and squared-source spot checks in WebKit and Chromium.
2. RustFFT SIMD plus compiler `-C target-feature=+simd128` (`simd128.json`): faster. Enabling the compiler target is essential for the measured performance on this machine.
3. Compiler SIMD alone with the scalar FFT algorithm (`simd-auto.json`): bit-for-bit identical, but no measured benefit over the default build.

| Case | Optimized scalar stage | SIMD with compiler target | Additional speedup |
|---|---:|---:|---:|
| singlet-squared-source | 19.55 | 16.11 | 1.21× |
| three-sites-squared-source | 154.43 | 142.46 | 1.08× |
| source-calibration-squared | 34.86 | 28.24 | 1.23× |

The accelerated FFT changes floating-point summation order. Across these 12 cases, the largest fitted-parameter shift is 4.42e-06 of baseline std; the largest relative std change is 2.27e-08; and the largest fitted-curve shift is 1.69e-06 counts (on a 20,000-count baseline). Convergence, rank, warnings, and iteration counts stay the same. These differences are very small, but two three-site curves exceed the predeclared **1e-7-count** equivalence gate. That gate was retained after testing. The default keeps the exact scalar results, while the optional build allows further qualification.

The equivalence helper also checks parameter shifts against 0.001 of baseline std (with an absolute floor), std changes against 1e-4 relative (with an absolute floor), availability of uncertainties, fractions, objective, and solver status. Default-build regression tests additionally require exact equality of every output field. `--diagnostic` records failed gates without approving a build.

## Reproduce

The frozen fixtures already contain the original observations, starts, and expected fits. Do not regenerate them with an optimized build.

```sh
npm run wasm
node scripts/benchmark-transmission.mjs --output validation-data/performance/optimized.json
node scripts/benchmark-transmission.mjs --fixture tests/fixtures/transmission-measured-performance.json --output validation-data/performance/measured-curves.json
npm run wasm:simd
node scripts/benchmark-transmission.mjs --wasm-dir validation-data/performance/runtime/simd128 --output validation-data/performance/simd128.json --diagnostic
```

Browser benchmarking requires an installed Playwright package and its browser engines; pass `--playwright-module /absolute/path/to/playwright/index.mjs` if the package is outside this repository. Its default stage directories are baseline, plans, curves, and simd128. The local build copies are under ignored `runtime/`; hashes and timing summaries are retained.

## Validation

- Rust core: 17 tests passed, including all profile/kind combinations under both coefficient conventions, thread-local buffer reuse, and callback reentrancy.
- JavaScript/WASM: 49 tests passed, including the 14 frozen numerical regression cases.
- TypeScript/React: 181 tests passed on the final rerun. The first run overlapped concurrent UI edits and found two UI expectation mismatches; those UI files and tests were updated separately, and both targeted rechecks and the full TypeScript rerun passed. This optimization does not modify the UI.
- Web production build and Rust formatting checks passed.
- Browser scalar comparisons: all 12 cases passed in each of WebKit and Chromium.

The subsequent [parallel derivative report](PARALLEL.md) documents the multicore follow-up. Analytical derivatives remain future work.

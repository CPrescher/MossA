# Parallel parameter derivatives — November 7, 2026

Parameter derivative columns now run across a persistent pool of up to four helper workers by default, with one CPU reserved when hardware concurrency is known. Each helper runs the same scalar WASM core. It computes both finite-difference evaluations for its assigned columns using the original steps, parameter scales, links, and bounds. Results are assembled into their original column positions, without a parallel floating-point reduction.

**All 14 frozen synthetic/control and measured cases retain identical complete fit values and uncertainties** in WebKit and Chromium, including solver iterations, termination, rank, warnings, intensity-fraction std, and objectives. The benchmark asserts deep equality against the original frozen result and checks every repeat for determinism. Object-key ordering in JSON is ignored; all numerical values and arrays must match exactly. Additional tests cover fitted Gaussian sources, dependent xVBF weight std, iteration limits, all-fixed models, invalid outputs, and adaptive multistart.

## Important platform distinction

| Environment | Behavior |
|---|---|
| Bundled app served by `npm run serve` or `npm run preview` on localhost | Shared-memory derivative handoff; uninterrupted optimizer; fastest measured path. |
| Desktop platforms that expose cross-origin isolation | Same shared-memory path; response headers are configured in Tauri. |
| Current native macOS Tauri webview (`tauri://localhost`) | Shared memory is unavailable in the tested webview despite the headers. Uses message-based workers for suitable fits; keeps larger ordinary fits serial. |
| GitHub Pages or another host without isolation headers | Same message-based fallback and conservative automatic selection. |
| Vite development mode | Message-based fallback by default; WebKit rejected some Vite-transformed worker imports under COEP. `MOSSA_SHARED_DERIVATIVES=1` enables the headers for development testing. |

No localhost hosting migration, browser security bypass, saved-project migration, SIMD change, or new numerical backend is introduced. Bootstrap model-comparison workers retain their existing parallelism across fits, avoiding nested derivative pools.

## Paired benchmark: shared-memory path

Hardware: Apple M4 Pro. Browser versions, CPU concurrency, raw samples, isolation state, actual worker use, and WASM hash are retained in `parallel-paired-shared.json`. Each case has five paired serial/Auto samples, alternating run order to reduce drift from load and temperature. The same persistent Engine is used; the helper pool is created lazily and retained across models. Times include the actual production-bundled Engine/Worker/MessagePort path and fit diagnostics. They exclude UI rendering.

The serial baseline is the optimized single-core implementation from the preceding stage, not the earlier slower unoptimized core.

| Case | WebKit serial → Auto (ms) | Speedup | Chromium serial → Auto (ms) | Speedup |
|---|---:|---:|---:|---:|
| three-sites-lorentzian-source | 137.14 → 88.20 | 1.55× | 154.91 → 94.87 | 1.63× |
| three-sites-squared-source | 136.50 → 85.82 | 1.59× | 153.54 → 91.94 | 1.67× |
| mixed-absorber-profiles-counts | 149.84 → 95.82 | 1.56× | 163.05 → 100.45 | 1.62× |
| xvbf-transmission | 43.70 → 24.64 | 1.77× | 43.06 → 22.85 | 1.88× |
| linked-parameters | 42.50 → 24.24 | 1.75× | 46.15 → 25.43 | 1.82× |
| source-calibration-squared | 35.86 → 19.08 | 1.88× | 36.19 → 18.52 | 1.95× |
| MS_Fe2O3_transmission | 42.64 → 24.78 | 1.72× | 46.83 → 24.98 | 1.87× |
| MS_MexicanMagnetite_transmission | 639.38 → 439.76 | 1.45× | 704.69 → 464.73 | 1.52× |

The complete 1/2/4/8/Auto sweep is in `parallel-shared.json`. Four helpers give most of the available gain; eight do not consistently improve it and can compete with the coordinator. Solver linear algebra and other serial work limit total speedup. The parallel path also reuses its final raw Jacobian for the unchanged covariance calculation, avoiding a redundant final derivative batch.

Small isolated fits stay serial to avoid worker-startup cost. Once the pool exists, eligible fits reuse it. Source calibration and multistart are allowed to create a pool because their workflows run multiple local fits. The first source-calibration fit can therefore be slower than a warm fit; cold timings are retained. The dedicated calibration dialog has its own Engine and starts its own pool.

## Message-only fallback and rejected slowdown

Without shared memory, the synchronous optimizer is resumed from exact solver/state/counter checkpoints. If it requests an uncached Jacobian, the unfinished step is rolled back, columns are computed asynchronously, and that step is retried with the supplied matrix. Solver convergence history, trust radius, iteration limits, and counters are preserved. Only the unfinished step is repeated, not the entire fit.

This works without special browser headers, but repeating solver algebra costs time. The initial forced-four-worker survey (`parallel-survey.json`) showed regressions for ordinary models with more free parameters. Auto therefore keeps ordinary models with more than eight free parameters serial in this environment; xVBF retains the message path because its curve evaluations are more costly. Thin-absorber fits and small one-off fits also stay serial.

| Case | WebKit serial → Auto (ms) | Auto transport | Chromium serial → Auto (ms) | Auto transport |
|---|---:|---|---:|---|
| three-sites-squared-source | 138.00 → 138.00 | serial | 152.60 → 153.80 | serial |
| xvbf-transmission | 45.00 → 36.00 | messages | 43.50 → 34.50 | messages |
| linked-parameters | 43.00 → 40.00 | messages | 45.90 → 39.60 | messages |
| source-calibration-squared | 36.00 → 29.00 | messages | 36.10 → 26.70 | messages |
| MS_Fe2O3_transmission | 44.00 → 39.00 | messages | 46.50 → 37.30 | messages |
| MS_MexicanMagnetite_transmission | 637.00 → 638.00 | serial | 706.70 → 707.20 | serial |

These complete outputs also match the frozen results exactly. The conservative serial selections differ only by ordinary timing noise. Static hosts are not silently reported as using the shared-memory path.

## Actual macOS webview check

A temporary hidden Tauri application loaded the production-bundled Engine, the same CSP/headers, and the same `tauri://localhost` protocol. It confirmed `isSecureContext=true`, `crossOriginIsolated=false`, and no `SharedArrayBuffer`. A large ordinary fit correctly selected the serial path (`parallel-native-capabilities.json`). This is a runtime check, rather than an assumption that adding headers enables the feature.

An additional native xVBF probe used four message-based helpers, retained identical fit values/std, and measured five warm paired samples: median 44 ms serial versus 37 ms parallel (**1.19×**). The first parallel fit took 83 ms, including 34 ms preparing its new helper pool, compared with 58 ms for its first serial fit. Native outputs and raw samples are in `parallel-native-xvbf.json`. The installed application was not replaced or published.

## Reliability and cancellation

- The main Engine owns every helper worker. Cancel, an Engine error, and replacement terminate the complete pool; pending requests are rejected.
- Requests are serialized at the coordinator; pool setup/errors remain responsive while derivatives are awaited.
- The pool validates column count, ordering, typed-array shape, and finiteness. Worker failures and watchdog timeouts reject pending work and trigger a serial retry from the original model. Failed infrastructure is recorded separately from scientific fit results.
- Shared output uses disjoint column ranges and atomic completion signals. Waiting occurs only in the fitting worker, never in the UI thread.
- Async multistart uses the same generator as serial multistart, preserving candidate order, adaptive dependence, failures, diagnostics, and search outcomes.
- Fit execution metadata stays outside the scientific FitResult and saved project.

## Validation

- Rust core tests passed (17).
- Full JavaScript/WASM suite passed; the additional Gaussian-source/dependent-weight parity test also passed in the final targeted run (69 unique tests across the suite and follow-up).
- TypeScript/React suite passed on Node 26.12.1 (194 tests), including cancellation, pool errors/timeouts, and out-of-order column delivery.
- Web and desktop/manual production builds passed; desktop asset verification checked bundled worker/WASM assets, manual links, fonts, examples, and licenses.
- The latest UI dialog hook received a minimal `Array.from(NodeList)` typing fix so the existing TypeScript configuration could compile it. Other concurrent UI changes were preserved.
- Both real browser transports passed exact-result comparisons against all 14 fixtures. The native xVBF transport was also checked for exact fit values.

## Reproduce

Use a supported Node version (the completed builds/tests used Node 26.12.1). The benchmark controller also accepts an installed Playwright module path and requires the WebKit/Chromium binaries.

```sh
npm run wasm
node scripts/benchmark-parallel-derivatives.mjs --playwright-module /absolute/path/to/playwright/index.mjs --workers 1,2,4,8,auto --shared --output validation-data/performance/parallel-shared.json
node scripts/benchmark-parallel-derivatives.mjs --playwright-module /absolute/path/to/playwright/index.mjs --workers auto --paired --shared --output validation-data/performance/parallel-paired-shared.json
node scripts/benchmark-parallel-derivatives.mjs --playwright-module /absolute/path/to/playwright/index.mjs --workers auto --paired --output validation-data/performance/parallel-paired-portable.json
npm test
npm run build:desktop:web
```

The benchmark builds the actual production Engine and worker modules into ignored `runtime/parallel-client/`. It records helper startup separately from repeated timings and asserts that no infrastructure fallback occurred. `parallel-provenance.json` records the relevant source and binary hashes.

A faster multicore backend for larger fits inside the restricted native macOS webview remains a separate implementation choice. The current change deliberately retains the exact WASM results rather than substituting an unqualified native model.

# Native parallel parameter derivatives

November 8, 2026. The desktop Rust backend now uses a persistent private thread pool for independent numerical derivative columns. The browser/WASM derivative implementation is unchanged.

## Implementation and selection

- Each column uses the existing two residual evaluations, finite-difference step, parameter scales, bounds, and link expansion. Each task owns a disjoint range of output columns. There is no parallel floating-point reduction or change to the integration grid, FFT algorithm, interpolation, solver, convergence criteria, covariance calculation, or search policy.
- The native model is immutable and `Send + Sync`. Browser-only callback/exchange state is compiled only for WASM. Native helpers borrow the prepared model, including its precomputed source transform, and reuse thread-local FFT buffers.
- Auto uses up to eight helpers for transmission/source-calibration fits with at least four free parameters, and up to four for thin fits with at least 16 free parameters and 256 observations. Smaller fits stay serial. The count is capped by free parameters and available CPU concurrency minus one, with an absolute maximum of eight. One process-wide pool bounds the total number of derivative helpers across simultaneous native jobs.
- The existing `Engine.request(..., { derivativeWorkers: n })` option now works for the native backend too; 1 forces serial, and 2–8 request that many workers subject to CPU/parameter caps. Options are passed separately from the scientific project. Execution metadata reports the maximum parallel column partitions used by an operation/search and any pool-startup fallback; it is not part of the fit result or saved project.
- Complete Jacobians for the optimizer and final covariance/std calculation both use this path. This change does not add final-Jacobian caching or defer uncertainty calculations for discarded starts.
- Model comparisons explicitly request one derivative worker per fit, retaining their existing parallelism across fits without nested derivative pools.
- Every helper inherits its job's cancellation token for the task and restores the previous thread-local token afterward. A batch finishes before its native job exits; cancellation cannot leave detached derivative work or publish a partial result. The pool remains available for subsequent jobs. Thread-pool startup failure falls back to serial derivatives and is recorded separately from scientific diagnostics.

The feature is automatic in the native engine; no new UI setting is required. Direct low-level Rust `fit()` calls remain serial unless invoked inside a native execution scope.

## Reference and benchmark method

Before editing, the complete release native fixture was archived under `validation-data/performance/runtime/native-derivatives/baseline/native_fixture`. Its binary hash, Rust version, and pre-change source hashes are recorded in [native-derivatives-baseline-provenance.json](native-derivatives-baseline-provenance.json). This frozen native reference is used instead of assuming native and WASM arithmetic are bit-identical.

The qualification suite contains 24 cases: all 14 frozen synthetic/control/measured cases, fitted Gaussian source calibration, dependent xVBF distribution-weight std, an iteration limit, all-fixed parameters, rank-deficient intensities, bounded-LM recovery, and four archived coarse-start thin models. The suite covers both source shapes, absorber profiles, count weighting, linked parameters, and active bounds. Extra observations are generated once with the archived native evaluator; the receipt hashes the complete inputs.

For each case, both the new serial build and every parallel result must match the **complete archived-native fit result exactly**, including all fitted/fixed values, curves, residuals, std and their availability, intensity-fraction std, warnings, rank, stationarity, iteration count, and termination. The sweep uses 2/4/8/Auto, with three paired samples per configuration ([pilot receipt](native-derivatives-pilot.json)); it informed the Auto policy. Some sweep timings overlapped development checks, so final performance claims use the isolated Auto run.

The final run compares forced serial and Auto in the same release binary, with one excluded first parallel fit per case and five paired samples in alternating order. A separately verified first serial fit warms the serial path. Every timed result is checked against the frozen reference. The first parallel sample records thread-pool startup, with the main-thread FFT already initialized; this is not a cold app-launch measurement. Subsequent operations reuse the pool. Native JSON transport, per-fit model setup, and complete final diagnostics are included; UI rendering and progress publishing are excluded.

The twelve-start full and selective workflows additionally compare their **complete search output** with the frozen [prior multistart receipt](selective-final.json), whose core/search hashes must match the archived reference. Three paired serial/Auto samples time each complete workflow, including candidate validation and all uncertainty calculations. Source/binary/input hashes, hardware, compiler, execution counts, and all raw samples are retained. These headless timings are not measurements of the installed desktop app.

## Results

**All 24 single-fit cases and both complete twelve-start workflows match the archived native reference exactly**, including every reported std, availability of uncertainties, curve, objective, convergence/termination, rank, stationarity, iteration count, warning, and search diagnostic. Every repeated run also matches exactly. No infrastructure fallback occurred.

The final single-fit receipt is [native-derivatives-final.json](native-derivatives-final.json); the complete-search receipt is [native-derivatives-multistart.json](native-derivatives-multistart.json). Across the selected 24 single-fit cases, summing medians gives **2700.10 → 1830.45 ms (1.48×, 32.2% less time)**. This case mix includes large thin models that gain little from parallel derivatives; it is not a universal workload estimate.

### Complete twelve-start measured-magnetite searches

| Search strategy | Serial (s) | Auto (s) | Speedup | Helpers | Paired samples | Complete result/std |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Full exploration | 12.255 | 4.472 | 2.74× | 8 | 3 | Exactly unchanged |
| Selective continuation | 8.496 | 3.069 | 2.77× | 8 | 3 | Exactly unchanged |

These improvements apply on top of the existing native fitter and, for the selective row, on top of selective continuation. The candidate order, pruning choices, all per-start objectives, best-start index, and total iterations remain identical to their serial reference.

### Single-fit measurements

| Case | Serial (ms) | Auto (ms) | Speedup | Helpers | Paired samples | Result/std |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| singlet-lorentzian-source | 13.46 | 5.94 | 2.26× | 4 | 5 | Exact |
| three-sites-lorentzian-source | 104.30 | 35.58 | 2.93× | 8 | 5 | Exact |
| singlet-squared-source | 13.64 | 6.46 | 2.11× | 4 | 5 | Exact |
| three-sites-squared-source | 103.70 | 34.64 | 2.99× | 8 | 5 | Exact |
| mixed-absorber-profiles-counts | 95.52 | 38.29 | 2.49× | 8 | 5 | Exact |
| asymmetric-gaussian-source | 17.09 | 6.71 | 2.55× | 5 | 5 | Exact |
| xvbf-transmission | 33.51 | 12.69 | 2.64× | 6 | 5 | Exact |
| linked-parameters | 29.83 | 10.27 | 2.90× | 7 | 5 | Exact |
| active-width-bound | 38.06 | 16.35 | 2.33× | 4 | 5 | Exact |
| thin-control | 7.71 | 7.71 | 1.00× | 1 | 5 | Exact |
| source-calibration-lorentzian | 23.71 | 7.93 | 2.99× | 6 | 5 | Exact |
| source-calibration-squared | 23.96 | 8.11 | 2.95× | 6 | 5 | Exact |
| MS_Fe2O3_transmission | 33.47 | 11.15 | 3.00× | 6 | 5 | Exact |
| MS_MexicanMagnetite_transmission | 423.82 | 158.26 | 2.68× | 8 | 5 | Exact |
| fitted-gaussian-source | 38.67 | 14.77 | 2.62× | 8 | 5 | Exact |
| dependent-xvbf-weight-std | 82.98 | 30.11 | 2.76× | 8 | 5 | Exact |
| iteration-limit | 37.84 | 11.77 | 3.22× | 8 | 5 | Exact |
| all-fixed | 0.84 | 0.83 | 1.01× | 1 | 5 | Exact |
| rank-deficient-intensities | 0.92 | 0.89 | 1.03× | 1 | 5 | Exact |
| bounded-lm-recovery | 109.20 | 23.40 | 4.67× | 8 | 5 | Exact |
| MS_Fe2O3-Fe3O4_30-70_coarse | 169.40 | 159.42 | 1.06× | 4 | 5 | Exact |
| MS-Fe2O3-Fe3O4_70-30_coarse | 901.13 | 852.10 | 1.06× | 4 | 5 | Exact |
| MS_Fe2O3-Fe3O4_50-50_coarse | 171.07 | 161.73 | 1.06× | 4 | 5 | Exact |
| MS_MexicanMagnetite_coarse | 226.25 | 215.32 | 1.05× | 4 | 5 | Exact |

The first parallel fit took **6.02 ms**, including initial pool creation and helper-buffer initialization, with the main-thread FFT already warmed. It used 4 parallel partitions for the four-parameter singlet. The first-fit values for every case/configuration are retained separately from timed samples.

Transmission fits and source calibration typically benefit substantially; large ordinary thin fits improve only modestly because more of their time remains in the serial optimizer. Small thin fits stay serial. These measurements describe this machine and suite. The frozen-result guarantee is empirical for the tested cases; the implementation preserves column arithmetic and avoids parallel reductions by construction.


## Validation

- Rust core: 25 tests passed, including exact serial/parallel parity on all 14 frozen cases, native `Send + Sync`, canceled-batch cleanup, helper-token restoration, nested progress evaluation, and option validation.
- JavaScript/WASM: 74 tests passed; all frozen scalar results and existing browser derivative paths remain unchanged.
- TypeScript/React: 270 tests passed.
- Real native adapter/core: 8 integration tests passed, including all worker overrides, exact result/std equality, multistart, source calibration, cancellation/reuse, queued work rejection, and one derivative worker per model-comparison fit.
- Desktop native `cargo check`, TypeScript compilation, Rust formatting, and desktop web/manual production build passed. The payload verifier checked 284 files and 365 asset references; 1,374 local manual links passed. Native dependency/license notices include the new Rayon dependencies.
- Exact numerical sweep: 96 case/configuration combinations (24 × 2/4/8/Auto), three paired samples each. Final isolated Auto validation: 24 cases with five paired samples each, plus two full twelve-start workflows with three pairs each.


## Reproduce

Use the archived pre-change binary and a supported Node version (these measurements use Node 26 on Apple M4 Pro):

```sh
node --import tsx scripts/benchmark-native-derivatives.mjs --workers auto --repeats 5 --output validation-data/performance/native-derivatives-final.json
node --import tsx scripts/benchmark-native-derivatives.mjs --multistart --starts 12 --case MS_MexicanMagnetite_transmission_ --workers auto --repeats 3 --output validation-data/performance/native-derivatives-multistart.json
npm test
node scripts/test-native.mjs
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run build:desktop:web
```

The benchmark builds the current native fixture, checks the archived binary hash, and fails immediately on any numerical difference, changed uncertainty, or infrastructure fallback. The archive and local binaries are ignored build artifacts; receipts and reports are retained. No release or installation was made.

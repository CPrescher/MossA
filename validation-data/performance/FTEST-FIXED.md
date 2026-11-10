# Fixed-seed F-test fixes and rebenchmark

November 9, 2026. **All 12 native and five WASM comparisons pass the original objective gates, rank checks, observed parameter/std checks, and exact bootstrap tail, p-value and interval checks.** This resolves the disappearing-component and floating-point differences documented in [the original benchmark](FTEST.md).

## Changes

- Before fitting, thin comparison models with a free component shape and an intensity that can reach zero select the analytical joint solver. This keeps a positive-area route through shape space instead of eliminating an area to zero and making its shape directions flat. No intensity floor or new physical constraint is imposed. Fixed-shape comparisons can retain variable projection. Explicit numerical derivatives remain respected.
- A relative-cost stop with projected stationarity above 1e-4 gets one bounded TRF precision restart, with 400–2,000 iterations. The restart refreshes parameter scales and the trust region. It is retained only when it passes the normal acceptance checks and improves the accepted incumbent. The original completed multistart search and both attempts remain recorded. The requested project settings are preserved.
- Improvements indistinguishable from zero are canonicalized to zero, and tail comparisons include arithmetic ties. The tolerance is 64 × Number.EPSILON × the largest absolute relevant objective. It has no absolute floor, so normalized spectra and differently scaled residual energies receive consistent p-values. The scientific objective-equivalence tolerance remains unchanged.

The comparison state machine is shared by native asynchronous fitting and synchronous WASM browser-worker fitting. Every requested full starting model is still explored; no simulated dataset is regenerated, replaced or discarded.

## Native results

Apple M4 Pro, Node v26.12.1. Frozen numerical-default native core from `runtime/analytical/baseline` versus the current optimized core; the same corrected comparison policy is applied to both. One excluded full warmup, then three alternating paired complete comparisons. Timings include observed fits, seeded simulation generation, all searches and precision/recovery attempts, uncertainty finalization and JSON-lines native transport. Builds and tests did not overlap timing.

Observed-data seed: 42. Bootstrap seed: 12345. Thin cases use 199 simulations and transmission uses 99. Nonlinear models use four full starting models for each fit. The table shows median complete-comparison times with four simulation workers; inner derivative/search work stays serial.

| Case | Frozen numerical | Optimized | Speedup | p-value, both cores |
| --- | ---: | ---: | ---: | ---: |
| gaussian-absent | 0.0484 s | 0.0418 s | 1.16× | 1 |
| gaussian-weak | 0.0607 s | 0.0418 s | 1.45× | 0.08 |
| gaussian-clear | 0.0636 s | 0.0412 s | 1.54× | 0.005 |
| gaussian-nonlinear-multistart | 1.4565 s | 0.6557 s | 2.22× | 0.295 |
| poisson-nonlinear-multistart | 1.8712 s | 0.9513 s | 1.97× | 0.125 |
| transmission-nonlinear-multistart | 9.0660 s | 2.0614 s | 4.40× | 0.01 |

Serial transmission improved from 33.1858 s to 7.2248 s (4.59×). The complete scientific outputs are bit-for-bit identical between one and four simulation workers after removing worker-count metadata. Repeated results are also bit-for-bit deterministic within each core.

## Scientific verification

- The original minimum gate is unchanged: absolute objective difference <= max(1e-7, 1e-8 × reference objective), with matching rank and independent parameter count for every simulated fit.
- Observed minima, curves, identifiable parameters, parameter std and intensity-fraction std pass the existing `analytical-validation.mjs` checks. In particular, std tolerances remain 1e-10 absolute + 1e-4 relative.
- Every individual simulated tail classification, exceedance count, p-value and Monte Carlo interval matches between the saved numerical and optimized cores.
- The formerly failing Poisson simulation 138 now passes the original objective gate. The Gaussian and Poisson nonlinear p-values are restored to 0.295 and 0.125.
- The absent fixed-shape case now gives p = 1 for both cores. Its original numerical p = 0.575 depended on an observed improvement of about 1.02e-12. Correcting that zero-improvement tie intentionally changes the old raw p-value; it does not reproduce its rounding artifact.
- An independent check against the original frozen-reference results finds no worse historical minima. Applying the corrected arithmetic tie rule to those original recorded objectives reproduces every new p-value and every tail decision. The original failed benchmark records and archive are retained.
- Five additional end-to-end WASM replays, each with 199 simulations, pass the same scientific checks. These use Node WASM execution through the synchronous fitting/finalization path used by browser workers; browser performance was not measured.

The benchmark covers the six synthetic nested singlet cases from the original investigation. It does not establish global convergence or performance for all measured spectra.

## Regression checks and evidence

All 459 JavaScript/UI tests and 20 native integration tests pass, and the web build succeeds. New regressions replay the frozen disappearing-component and near-bound failures, test rejected precision-restart retention, verify zero-improvement p-values, and check objective-unit invariance down to 1e-24 scaling.

`ftest-fixed-verification.json` contains the compact numerical/timing receipt, original-reference comparisons, restart counts, checks and hashes. `ftest-fixed-provenance.json` identifies the independently verified local raw-evidence archive and every member hash. The archive contains complete projects, per-simulation diagnostics and attempts, timing samples, binaries, source snapshots and execution logs. It is kept outside Git. The earlier fitting and F-test archives are unchanged; restore archives into a fresh checkout to avoid overwriting newer records or source.

```sh
node --import tsx --test tests/*.test.mjs tests/*.test.tsx > /tmp/mossa-ftest-fix-all-tests.log 2>&1
node scripts/test-native.mjs > /tmp/mossa-ftest-fix-native-tests.log 2>&1
npm run build:web > /tmp/mossa-ftest-fix-web.log 2>&1
node --import tsx scripts/verify-ftest-wasm.mjs
node --import tsx scripts/benchmark-ftest.mjs --repeats 3 --simulations 199 --workers 1,4 --exclude transmission --output validation-data/performance/ftest-fixed-native.json
node --import tsx scripts/benchmark-ftest.mjs --repeats 3 --simulations 99 --workers 1,4 --case transmission --output validation-data/performance/ftest-fixed-transmission-native.json
node --import tsx scripts/verify-ftest-fixed.mjs
```

Run the timing commands sequentially after builds/tests finish. The historical native/WASM artifacts must first be restored from the evidence archive. The verifier independently recomputes the corrected statistics and retains the original objective thresholds.

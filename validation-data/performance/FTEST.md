# Fixed-seed F-test / bootstrap benchmark

> Follow-up: the [fixes and repeated benchmark](FTEST-FIXED.md) pass the original gates. This page preserves the original failing investigation.

November 9, 2026. **The optimized defaults are faster, but full numerical and p-value equivalence fails for weak nonlinear thin components.** This is a benchmark and diagnosis; no production solver defaults or statistical rules were changed.

The application uses a parametric-bootstrap model comparison: the reported F statistic is descriptive, and the p-value comes from the simulated objective-improvement tail. The failures below are retained rather than removed from the benchmark.

## Method

- Apple M4 Pro, Node v26.12.1. Native Rust production `startComparison` orchestration, with the real native job registry and JSON-lines transport replacing Tauri IPC. Browser timing was not measured.
- Frozen `runtime/analytical/baseline/native_fixture` (numerical-default core before the analytical-derivative series) versus the current fitting checkpoint. These are cumulative gains since that baseline, which already includes earlier fitting work. Both binary hashes match the historical receipts.
- Six synthetic nested singlet cases: absent, weak and clear fixed-shape Gaussian controls; bounded nonlinear Gaussian and Poisson cases; and a bounded nonlinear transmission case. These do not establish performance on measured magnetite or other spectra.
- Observations use seed 42; bootstrap seed is 12345. Thin cases use 199 simulations; transmission uses 99. Nonlinear cases use four full deterministic starting models for every fit. Both cores use the same constraints, budgets, recovery and acceptance policy. No simulation is discarded.
- One excluded complete warmup per core, then three alternating paired complete runs; the tables show median wall time. One- and four-worker simulation pools were tested. Inner derivative/search work remains serial to avoid nested worker pools. Builds and tests did not overlap timing.
- Every repeat is bit-for-bit deterministic within its core. The complete scientific results are bit-for-bit identical between one and four workers after removing worker-count metadata.
- Existing minimum gate: absolute objective difference <= max(1e-7, 1e-8 times reference objective). Observed curves, parameters, ranks and std use the existing `analytical-validation.mjs` gates. P-values, intervals, exceedance counts and every individual tail decision must match exactly. No gates were relaxed.

## Optimized default, four simulation workers

| Case | Simulations | Frozen | Current | Speedup | p-value, frozen → current | Full equivalence |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| gaussian-absent | 199 | 0.0482 s | 0.0417 s | 1.16× | 0.575 → 1 | Fail |
| gaussian-weak | 199 | 0.0568 s | 0.0420 s | 1.35× | 0.08 → 0.08 | Pass |
| gaussian-clear | 199 | 0.0651 s | 0.0416 s | 1.56× | 0.005 → 0.005 | Pass |
| gaussian-nonlinear-multistart | 199 | 1.4522 s | 0.6212 s | 2.34× | 0.295 → 0.26 | Fail |
| poisson-nonlinear-multistart | 199 | 1.8796 s | 0.9380 s | 2.00× | 0.125 → 0.115 | Fail |
| transmission-nonlinear-multistart | 99 | 8.8919 s | 1.9779 s | 4.50× | 0.01 → 0.01 | Pass |

The serial transmission comparison improved from 31.8521 s to 6.9465 s (4.59×); its simulated minima, p = 0.01, tail classifications and interval also match. The fixed-shape weak and clear Gaussian controls pass with either pool size.

All 14 paired comparisons, including the joint controls below, pass the observed-data minimum and std checks. That does **not** imply equivalent bootstrap refits.

## Failures and identical-data diagnosis

In each nonlinear thin case, 47 of the 398 simulated model fits have a worse objective beyond the fixed gate with the optimized default. The maximum absolute objective difference is 16.1032 for Gaussian noise and 8.11332 for Poisson noise. Some other minima improve; neither direction is hidden. The resulting p-values change from 0.295 to 0.260 and from 0.125 to 0.115.

Replaying the frozen reference's complete set of simulated observations and starting models reproduces those 47 worse minima in each case. Every solver variant receives an identical hashed simulation stream, so this is not caused by different random samples, scheduling or tiny differences in fitted null means.

The diagnostic identifies variable projection as the main cause. A disappearing component can be assigned zero area during coefficient elimination; its shape derivatives then vanish. The local fit can satisfy convergence at that boundary, and the configured full multistart search does not always recover the better weak-component solution found by the joint solver.

There is a separate floating-point tie issue in the absent fixed-shape case. Its observed objective improvement is about 1.02e-12 in the frozen calculation and exactly zero in the current calculation. All minima match within the objective gate, but the raw `delta >= observed` comparison gives p = 0.575 versus 1.0. This needs consistent roundoff-aware handling of zero improvement, rather than forcing the new result to reproduce a roundoff-dependent old p-value.

## Analytical joint control, four workers

The current core was also run with the existing explicit `thin_solver: "joint"` option. Statistical rules, starting models and budgets remain unchanged.

| Case | Frozen | Current joint | Speedup | p-value, frozen → current | Objective gate |
| --- | ---: | ---: | ---: | --- | --- |
| gaussian-nonlinear-multistart | 1.3685 s | 0.5077 s | 2.70× | 0.295 → 0.295 | Pass |
| poisson-nonlinear-multistart | 1.6944 s | 0.6045 s | 2.80× | 0.125 → 0.125 | One miss |

The Gaussian joint control passes all gates. The Poisson joint control preserves every tail classification, the p-value and interval, but one larger-model refit (simulation index 137, the 138th spectrum) differs by 5.43621e-6 at objective 154.468916. This exceeds the unchanged 1.54469e-6 gate. The same discrepancy remains with identical observations and starting models. It is small, but the full equivalence check is correctly marked failed.

The explicit numerical joint replay matches all simulated minima and both p-values within the fixed objective gates. The next implementation work is to handle disappearing components reliably for comparison refits, qualify analytical joint convergence at the existing objective precision, and make zero-improvement ties stable. The current variable-projection default is not yet qualified as an equivalent replacement for these bootstrap workloads.

## Evidence and reproduction

`ftest-verification.json` is the compact receipt. It records `benchmark_integrity_passed: true` separately from `equivalence_passed: false`. It includes all timing summaries, objective-failure counts, p-values, identical-data controls and source/artifact hashes. The 21 existing comparison and comparison-pool regression tests also pass. The raw JSON files retain projects, full results, recovery attempts, per-simulation diagnostics and every timing sample.

The additional raw records, script/source snapshots, native artifacts and execution logs are preserved in a separate local compressed archive. `ftest-provenance.json` gives its location, archive SHA-256 and every member's SHA-256. The archive is not committed to Git; the original fitting archive remains unchanged. Restore an evidence archive into a fresh checkout to avoid overwriting newer records, source files or binaries.

```sh
node --import tsx scripts/benchmark-ftest.mjs --repeats 3 --simulations 199 --workers 1,4 --exclude transmission
node --import tsx scripts/benchmark-ftest.mjs --repeats 3 --simulations 99 --workers 1,4 --case transmission --output validation-data/performance/ftest-transmission-native.json
node --import tsx scripts/benchmark-ftest.mjs --repeats 3 --simulations 199 --workers 4 --case nonlinear --exclude transmission --optimized-mode joint --output validation-data/performance/ftest-joint-native.json
node --import tsx scripts/diagnose-ftest.mjs --input validation-data/performance/ftest-native.json
node --import tsx --test tests/comparison.test.tsx tests/comparison-pool.test.tsx > /tmp/mossa-ftest-regression.log 2>&1
node --import tsx scripts/verify-ftest.mjs
```

The first and third benchmark commands intentionally return exit code 1 because equivalence failed, after saving their complete results. The verifier checks evidence integrity without relabeling those failures as passes. Historical native artifacts must be restored from the fitting archive; the current native fixture is built with `cargo build --release --manifest-path rust-core/Cargo.toml --example native_fixture`.

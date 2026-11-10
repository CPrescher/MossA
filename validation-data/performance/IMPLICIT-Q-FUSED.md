# Implicit-Q solving and fused variable-projection Jacobians

Implemented and benchmarked on November 9, 2026. The baseline already includes buffer reuse and QR-compressed SVD from `SOLVER-LINEAR-ALGEBRA.md`.

Implicit-Q provides a further approximately 8% reduction in the aggregate single-fit time, and roughly 11–18% on the isolated thin multistart benchmarks. Fusion provides a smaller gain: approximately 2–4% in the nine-pair repeat of the 12-start thin searches. Its aggregate single-fit improvement was not repeatable: 0.7% in the main run and effectively zero in the repeat. Both optimizations are enabled on their eligible paths.

All comparisons found the same minima and uncertainties. Fusion produced bit-for-bit identical complete fit results to the implicit-Q stage, including parameters, objectives, std, fractions, ranks and termination information. Implicit-Q changes floating-point summation order; its largest relative parameter-std difference was 1.13e-9. Full covariance evaluation is unchanged and was exactly identical between stage binaries when evaluated at the same coordinates.

## Implementation

### 1. Implicit-Q solving

The existing Householder QR reduction of the augmented trust-region Jacobian is retained. Instead of expanding the small left singular vectors back into a tall matrix, the solver keeps the Householder reflectors and the small left singular factor. It computes `U_R^T Q^T rhs` once per factorization and reuses that projection across rejected trust-region trials. This removes tall left-factor reconstruction and repeated tall matrix-vector products.

The original tall row count still controls Jacobi convergence and trust-step rank tolerances. Matrix scaling, direct-SVD safeguards near rank loss, small-matrix fallbacks, numerical derivatives and bounded-LM recovery retain their previous behavior. No normal equations are introduced. Bounds, trust-region rules, iteration limits, starts and continuation decisions are unchanged.

The vendored change is recorded in `rust-core/vendor/basin/implicit-q-fused.patch`, applied after `solver-linear-algebra.patch`. Production retains only the small left singular factor; tall-factor reconstruction is test-only. Tests cover reconstruction, trust steps and projected RHS reuse across radii, changed RHS vectors and extreme scales.

### 2. Fused variable-projection Jacobian

For eligible thin analytical fits, one row/site pass computes the nonlinear Jacobian columns and the residual-dependent `(dA/dtheta)^T r` correction needed by the exact variable-projection derivative. Actual-area and unit-area profile derivatives share geometry and expensive profile factors. Ordinary profiles and the xVBF four-pole Voigt kernel are covered. Both terms of the existing Golub–Pereyra derivative remain present.

The paired kernels preserve each original area-dependent expression and its multiplication order rather than scaling already-rounded unit-area derivatives. Tests compare the raw Jacobian and correction bit-for-bit against the separate implementation, including profiles, weighting, links and distributions. Weak active-set coefficients, nonsmooth derivatives, numerical fallback and existing forward/Jacobian snapshots retain their established paths. Final covariance continues to use the original full Jacobian and nalgebra SVD.

## Measurement procedure

Rebuilt and archived native and portable WASM artifacts for the baseline, implicit-Q and fused stages. The implicit-Q stage was benchmarked and frozen before fusion was wired into the analytical evaluator. Stage provenance records include source and binary SHA-256 hashes; archived artifacts remain under `runtime/implicit-q-fused/`.

Native measurements exclude warmup and alternate stage order. The isolated implicit-Q and main three-stage measurements use five samples per stage; the subsequent fusion repeats use nine. Browser measurements use three samples after warmup in WebKit 27.2 and Chromium, serial portable WASM with one derivative worker and verified artifact hashes. Native benchmarks, browser benchmarks and builds ran sequentially. Times below are medians in milliseconds; the aggregate single-fit number is the sum of 60 per-case medians, not one fit.

The 60 single-fit inputs cover ordinary thin models, coarse measured oxide starts, linked and bounded cases, rank loss, source calibration, xVBF, transmission and explicit joint-solver controls. The search inputs cover full and selective searches, thin magnetite and 70/30 mixture, plus transmission controls. The final native run has 72 inputs and 216 pairwise stage comparisons; browsers add 22 inputs and 66 comparisons. There are also 72 isolated implicit-Q comparisons and 66 additional native fusion-repeat comparisons.

## Stage 1: isolated implicit-Q benchmark

| Workload | Baseline | Implicit-Q | Time reduction |
|---|---:|---:|---:|
| 60 single fits, sum of medians | 267.70 | 247.35 | 7.6% |
| Magnetite, 4 starts, full | 86.36 | 71.14 | 17.6% |
| 70/30 mixture, 4 starts, full | 101.60 | 85.22 | 16.1% |
| Magnetite, 12 starts, full | 199.04 | 177.73 | 10.7% |
| 70/30 mixture, 12 starts, full | 571.60 | 476.24 | 16.7% |
| Magnetite, 12 starts, selective | 167.02 | 147.65 | 11.6% |
| 70/30 mixture, 12 starts, selective | 191.76 | 161.12 | 16.0% |

All 72 comparisons passed before enabling fusion.

## Stage 2: main three-stage benchmark

| Workload | Baseline | Implicit-Q | Fused |
|---|---:|---:|---:|
| 60 single fits, sum of medians | 268.40 | 248.09 | 246.46 |
| Magnetite, 4 starts, full | 90.19 | 73.19 | 71.17 |
| 70/30 mixture, 4 starts, full | 102.61 | 84.93 | 82.41 |
| Magnetite, 4 starts, selective | 58.83 | 48.53 | 48.43 |
| 70/30 mixture, 4 starts, selective | 68.37 | 57.53 | 55.63 |
| Magnetite, 12 starts, full | 296.06 | 245.31 | 252.39 |
| 70/30 mixture, 12 starts, full | 658.80 | 489.88 | 477.45 |
| Magnetite, 12 starts, selective | 170.55 | 190.77 | 148.25 |
| 70/30 mixture, 12 starts, selective | 278.86 | 240.19 | 231.14 |

The main aggregate reduction is 7.6% for implicit-Q, another 0.7% for fusion and 8.2% combined. Some longer timings show substantial runtime variation, including an apparent regression for the implicit magnetite selective search and an apparent large fusion benefit for an unaffected transmission control. These values are retained in the raw records and are not attributed to algorithmic improvements.

### Nine-pair fusion repeat

| Workload | Implicit-Q | Fused | Time reduction |
|---|---:|---:|---:|
| 60 single fits, sum of medians | 247.21 | 247.23 | approximately 0% |
| Magnetite, 12 starts, full | 164.24 | 160.61 | 2.2% |
| 70/30 mixture, 12 starts, full | 467.10 | 450.34 | 3.6% |
| Magnetite, 12 starts, selective | 138.11 | 135.07 | 2.2% |
| 70/30 mixture, 12 starts, selective | 158.16 | 155.31 | 1.8% |
| Transmission magnetite control, 4 starts, full | 494.29 | 493.87 | 0.1% |
| Transmission magnetite control, 4 starts, selective | 216.45 | 216.35 | <0.1% |

Fusion does not run for transmission. The repeated control is essentially unchanged, supporting the interpretation that the earlier transmission timing jump was noise. Fusion's reproducible end-to-end benefit is modest and workload-dependent; the single-fit aggregate does not establish an additional speedup.

## Browser results

| Browser / full 4-start workload | Baseline | Implicit-Q | Fused |
|---|---:|---:|---:|
| WebKit / magnetite | 209.0 | 192.0 | 194.0 |
| WebKit / 70/30 mixture | 225.0 | 210.0 | 216.0 |
| Chromium / magnetite | 241.3 | 227.8 | 226.6 |
| Chromium / 70/30 mixture | 245.3 | 230.1 | 229.1 |

Implicit-Q improves these browser searches. Fusion is approximately neutral in Chromium and slightly slower in this WebKit run; no universal browser fusion speedup is established. The complete 11-case results for each browser, including single fits, source calibration and transmission controls, are retained in `implicit-q-fused-browser.json`. All 66 comparisons pass and all implicit-to-fused results are bit-for-bit identical.

## Scientific and regression checks

The existing scientific gates were fixed before measurement: objective differences within `max(1e-7, 1e-8 * objective)`; curves within `max(1e-7, 0.001 * residual RMS)`; parameter std and fraction std within `1e-10 + 1e-4 * std`; and same-basin parameter, rank, degrees-of-freedom, schema and uncertainty-availability checks. Every comparison passes and every minimum remains within the same-minimum gate.

Across the final and repeat comparisons, maximum relative parameter-std change is 1.1223e-9 and maximum relative fraction-std change is 3.6135e-10. Implicit-to-fused complete outputs are exact. Covariance recalculated at identical fitted coordinates is exact across stage binaries. Independent numerical-Jacobian covariance controls also pass (maximum parameter-std relative difference 1.75e-6 in the main native suite). Baseline and final forward-model evaluations are bit-for-bit identical for all 60 single-fit projects.

Final validation: 90 Rust tests, 5 profiling-feature tests, 171 JavaScript tests, 17 native integration tests and 274 TypeScript/React tests pass. TypeScript and web/manual builds pass, 1,374 local links and the 284-file desktop payload are verified, and desktop `cargo check` passes. The implicit-only stage separately passed 84 Rust and 171 JavaScript tests.

`scripts/verify-implicit-q-fused.mjs` independently recomputes scientific comparisons from stored complete results, requires exact fusion outputs, checks archived/current source and artifact hashes, reruns the 60 forward-model comparisons and verifies regression/build logs. Its machine-readable receipt is `implicit-q-fused-verification.json`.

## Records and reproduction

- Initial step: `implicit-q-fused-implicit-{native,search,search12}.json`.
- Final staged run: `implicit-q-fused-fused-{native,search,search12}.json`.
- Fusion repeats: `implicit-q-fused-repeat-{native,search12,control}.json`.
- Browsers: `implicit-q-fused-browser.json`.
- Frozen stage provenance: `implicit-q-fused-{baseline,implicit}-provenance.json`.
- Runtime artifacts and source snapshots: `runtime/implicit-q-fused/`.

From the repository root, with Node supporting `--import tsx`:

```sh
node --import tsx scripts/benchmark-implicit-q-fused.mjs --stages baseline,implicit,fused --repeats 5
node --import tsx scripts/benchmark-implicit-q-fused.mjs --stages baseline,implicit,fused --search --repeats 5
node --import tsx scripts/benchmark-implicit-q-fused.mjs --stages baseline,implicit,fused --search --starts 12 --case coarse --repeats 5
node --import tsx scripts/benchmark-implicit-q-fused-browser.mjs
node --import tsx scripts/verify-implicit-q-fused.mjs
```

The frozen artifacts are required to reproduce historical stage timings. Fresh timing runs must retain unchanged scientific gates and report runtime variation alongside small apparent gains.

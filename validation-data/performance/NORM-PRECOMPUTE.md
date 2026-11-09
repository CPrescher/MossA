# Stable norm acceleration and precomputed analytical evaluation

Implemented and qualified on November 9, 2026. The baseline already includes implicit-Q compressed SVD and the fused variable-projection Jacobian described in `IMPLICIT-Q-FUSED.md`.

Stable norms provide the main improvement: approximately 20–25% less time for the measured native thin multistart searches, and approximately 2.3–2.7× faster full four-start thin searches in portable browser WASM. Precomputed analytical evaluation adds approximately 1–3% on native thin searches; its aggregate single-fit timing is neutral. All 364 stage comparisons pass the existing minimum and uncertainty checks. Precomputation produces bit-for-bit identical complete fit results to the norm-only stage.

## Implementation

### Stage 1: stable norms

Eligible QR-compressed analytical factors use a two-pass scaled sum of squares for Householder column lengths and the Jacobi SVD's cached column norms. The maximum absolute entry provides the scale; the algorithm squares entries only after division by that scale. This avoids overflow/underflow from squaring physical entries and removes repeated per-entry `hypot` calls. Nonfinite inputs retain the ordered-hypot behavior. Norms are still recomputed after a column changes.

Direct-SVD paths, numerical fits, bounded-LM recovery, small-matrix/direct fallbacks, near-rank-loss safeguards, rotation formulas, original tall-row tolerances, rank cutoffs, trust-region criteria and iteration budgets retain their previous behavior. No normal equations or approximate derivatives are introduced. Final covariance retains its existing full-Jacobian/nalgebra SVD calculation.

The acceleration is limited to compressed factors with at least eight columns. Smaller reduced models retain ordered norms. Full integration testing caught a near-roundoff iron-calibration fit that reached the same minimum but lost strict convergence with accelerated norms on its five-column reduced model. The small-matrix guard preserves its original convergence. The independent six-line reference spectrum was added as `tests/fixtures/stable-norm-calibration.json`, a Rust convergence/std regression, an additional native benchmark case and an additional browser case. All reported timings below use the corrected guard; the unguarded development measurements are excluded.

The vendored change is recorded in `rust-core/vendor/basin/stable-norm.patch`, applied after `implicit-q-fused.patch`. Applying that patch to the frozen baseline reproduces the current two modified Basin files exactly. SVD tests cover f32/f64, zero vectors, subnormal/tiny/huge entries, nonfinite behavior, long vectors, matrix reconstruction, singular spectra and trust steps across extreme scales. Frozen direct-SVD factors and steps remain exact.

### Stage 2: precomputed analytical evaluation

An immutable evaluation plan, shared through `Arc` by solver clones, caches count weights, exact `powi` background powers, invariant root/scale mappings and entry layouts. Background powers retain the original expression rather than introducing a recurrence; division by the original weight is retained rather than replacing it with reciprocal multiplication.

Variable projection additionally caches the linear-site/background layout, inverse nonlinear-column map, and ordinary actual/unit derivative scatter maps in their original accumulation order. Coordinate-dependent simplex maps retain their original dynamic calculation. Distribution kernels, nonsmooth and weak-bound fallbacks, model values, source/transmission kernels and covariance definitions retain their existing mathematics. The plan is rebuilt with each newly prepared project, so changes in observations, weighting, links or model layout cannot reuse an earlier project's plan.

## Measurement procedure

Archived native and portable WASM artifacts for `baseline`, `norm` and `precomputed` under `runtime/norm-precompute/`, with source and artifact SHA-256 provenance. The corrected norm-only implementation was built from its frozen source snapshot and benchmarked separately before the final three-stage comparison. The precomputed stage uses the current production build.

Native measurements exclude one warmup per stage and alternate stage order. The isolated norm measurements and final single/four-start runs use five samples per stage; the final 12-start runs use nine. Browser measurements use five samples after warmup in WebKit 27.2 and Chromium. They execute production Engine/Worker bundles, verify the archived WASM hashes, use portable hosting with one derivative worker and assert no infrastructure fallback. Builds, tests, native timing and browser timing ran sequentially.

The single-fit suite has the previous 60 models plus the new velocity-calibration regression. It covers ordinary profiles, counts/unweighted data, measured coarse starts, links, bounds, rank deficiency, source calibration, xVBF, transmission and explicit joint controls. Four-start full/selective searches add eight inputs; 12-start full/selective searches add four thin inputs. This gives 73 isolated norm comparisons, 219 final native pairwise comparisons over 73 inputs, and 72 browser comparisons over 24 browser/input combinations. Times below are medians in milliseconds. The single-fit aggregate sums 61 case medians; it is not the runtime of one fit.

## Isolated norm benchmark

| Workload | Baseline | Stable norms | Time reduction |
|---|---:|---:|---:|
| 61 single fits, sum of medians | 234.66 | 218.56 | 6.9% |
| Magnetite, 12 starts, full | 149.09 | 118.63 | 20.4% |
| 70/30 mixture, 12 starts, full | 432.65 | 339.66 | 21.5% |
| Magnetite, 12 starts, selective | 125.33 | 103.00 | 17.8% |
| 70/30 mixture, 12 starts, selective | 140.15 | 110.23 | 21.4% |

All 73 comparisons pass, including strict convergence of the velocity-calibration regression.

## Final native three-stage benchmark

| Workload | Baseline | Stable norms | + Precomputation |
|---|---:|---:|---:|
| 61 single fits, sum of medians | 250.83 | 233.22 | 234.11 |
| Magnetite, 4 starts, full | 69.83 | 52.21 | 51.18 |
| 70/30 mixture, 4 starts, full | 84.55 | 66.90 | 65.09 |
| Magnetite, 4 starts, selective | 46.04 | 36.48 | 35.44 |
| 70/30 mixture, 4 starts, selective | 54.22 | 42.93 | 41.69 |
| Magnetite, 12 starts, full | 161.55 | 125.86 | 124.93 |
| 70/30 mixture, 12 starts, full | 461.21 | 347.88 | 343.57 |
| Magnetite, 12 starts, selective | 135.96 | 109.11 | 108.13 |
| 70/30 mixture, 12 starts, selective | 153.44 | 115.48 | 114.03 |

Stable norms reduce the final single-fit aggregate by 7.0%. The precomputation increment is a 0.4% aggregate increase, consistent with neutral timing rather than an established aggregate gain. Its native thin-search increments are 0.7–2.9% faster. Combined full-search reductions are approximately 23–27% for four starts and 23–26% for 12 starts.

The complete records also retain transmission controls: ordinary magnetite full four-start search is 497.42 → 462.74 → 461.19 ms, and xVBF transmission full search is 35.09 → 33.27 → 33.43 ms. Gains depend on how much of each workload uses the accelerated factorization; they are not universal.

## Portable browser benchmark

| Browser / full four-start workload | Baseline | Stable norms | + Precomputation |
|---|---:|---:|---:|
| WebKit / magnetite | 202.0 | 76.0 | 75.0 |
| WebKit / 70/30 mixture | 216.0 | 94.0 | 92.0 |
| Chromium / magnetite | 202.3 | 74.5 | 74.8 |
| Chromium / 70/30 mixture | 219.9 | 95.4 | 95.8 |

Stable norms make these browser searches approximately 2.3–2.7× faster. Precomputation is slightly faster in WebKit and approximately neutral in Chromium. Small models that retain ordered norms show no comparable improvement. The new velocity-calibration case preserves convergence and exact norm-stage fit output in both browsers. The full 12-case-per-browser record, including single fits, source calibration, xVBF, bounded intensity and transmission controls, is in `norm-precompute-browser.json`.

## Scientific checks and regression results

The existing gates remain unchanged: objective differences within `max(1e-7, 1e-8 * objective)`; curves within `max(1e-7, 0.001 * residual RMS)`; parameter and fraction std within `1e-10 + 1e-4 * std`; same-basin parameter checks; and unchanged rank, degrees of freedom, uncertainty availability and acceptable-fit status. The calibration regression additionally requires strict convergence.

Every comparison remains within the same-minimum gate. Maximum relative parameter-std change is 1.3107e-9 and maximum relative fraction-std change is 3.5267e-10. Precomputation's complete fit outputs are bit-for-bit identical to the norm-only stage across every measured native and browser case. Covariance recalculated at identical fitted coordinates is exact across stage binaries, including intensity fractions and rank. Numerical-Jacobian same-coordinate covariance controls also pass (maximum relative parameter-std difference 1.75e-6). Baseline and final forward evaluations are bit-for-bit identical for all 61 single-fit projects.

Final checks pass: 93 Rust tests, 17 Basin SVD tests, five profiling-feature continuation tests, 171 JavaScript tests, 17 native integration tests and 274 TypeScript/React tests. TypeScript compilation, the Vite web build and desktop `cargo check` pass. No convergence tolerance, iteration limit, search policy or scientific acceptance gate was relaxed.

`scripts/verify-norm-precompute.mjs` independently recomputes scientific comparisons from raw complete results, requires exact precomputed-stage outputs, verifies source and artifact provenance, reruns all 61 forward-model comparisons and checks the regression/build logs. Its receipt is `norm-precompute-verification.json`.

## Records and reproduction

- Isolated corrected norm stage: `norm-precompute-norm-{native,search,search12}.json`.
- Final native stages: `norm-precompute-precomputed-{native,search,search12}.json`.
- Browsers: `norm-precompute-browser.json`.
- Stage source and artifact provenance: `norm-precompute-{baseline,norm,precomputed}-provenance.json`.
- Frozen implementations: `runtime/norm-precompute/`.

From the repository root, with the archived artifacts and a supported Node version:

```sh
node --import tsx scripts/benchmark-norm-precompute.mjs --stages baseline,norm,precomputed --repeats 5
node --import tsx scripts/benchmark-norm-precompute.mjs --stages baseline,norm,precomputed --search --repeats 5
node --import tsx scripts/benchmark-norm-precompute.mjs --stages baseline,norm,precomputed --search --starts 12 --case coarse --repeats 9
node --import tsx scripts/benchmark-norm-precompute-browser.mjs --repeats 5
node --import tsx scripts/verify-norm-precompute.mjs
```

Historical artifact hashes are necessary to reproduce the separate implementation stages. Small differences in timings should be interpreted alongside sample variability; the scientific gates and complete fit outputs are retained in the records.

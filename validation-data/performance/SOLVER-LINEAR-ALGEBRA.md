# Buffer reuse and QR-compressed SVD

November 8, 2026. Two separately archived and measured stages follow the current default analytical/variable-projection fitter. The forward model, search policy, weighting, bounds, original parameter scales, stopping tolerances and full-Jacobian uncertainty calculation are unchanged.

## Implementation

**Stage 1 — reusable evaluation buffers.** Enable Basin's typed evaluation workspace for uninterrupted and checkpointed TRF fits. Prepared and projected problems overwrite caller-owned residual and row-major Jacobian buffers, including fused evaluation callbacks. Shapes can change safely when switching from projected to joint coordinates. Preserve the original arithmetic and summation order, including separate weighting and calibration-scale divisions. Reuse optimizer gradient storage. The vendored matrix refill API is exposed and the convergence builders accept typed workspaces, retaining the same tolerances. Intermediate model calculations still allocate some storage; this is not a claim of allocation-free fitting.

**Stage 2 — QR-compressed SVD.** Factor the tall augmented trust-region matrix with scaled Householder QR, factor its small triangular matrix with the existing Jacobi SVD, then reconstruct the full left singular vectors. The trust-step implementation receives the original number of rows, and Jacobi convergence tolerance is explicitly evaluated with that original row count. Rank cutoffs, reflection, damping/radius rules, iteration budgets and convergence tests are retained. No normal equations are formed.

Compression requires at least three columns and at least four times as many rows as columns. Small matrices, nonfinite intermediate results, and matrices with smallest singular value at most sqrt(machine epsilon) times the largest retain the direct SVD. The generic Basin option defaults to off; MossA enables it for qualified analytical fits. Numerical-reference fits and bounded-LM recovery retain their existing path.

The initial unrestricted QR pilot reproduced all minima/std but lost accepted convergence in one mixed ordinary/distribution model, with stationarity just above the unchanged 1e-6 gate. Direct-SVD refinement at the final point did not recover that status, so it was not shipped. **Models containing both ordinary and distribution sites retain direct SVD from the start.** Pure distribution models remain eligible. This is a general model-composition guard, not a case-name check. The rejected pilots are retained, and the mixed-model input/result is a frozen regression fixture. No scientific acceptance threshold was loosened.

Reported covariance, parameter std, fraction std, active-bound availability and numerical rank still use the original full Jacobian and original degrees of freedom. The optimizer's compressed factorization is never substituted for that final calculation.

## Measurement method

Before changes, the current native fixture, portable WASM and owning source files were frozen in `runtime/solver-linear-algebra/baseline`. Buffer-only artifacts and sources were then archived under `buffers` and measured before QR was wired in. Final artifacts are under `qr`. The two provenance receipts identify the baseline and buffer stages; the independent verification receipt checks source/binary hashes.

The initial buffer-only run uses three alternating pairs for 60 single fits, eight four-start searches and four twelve-start searches, following excluded warmups. It requires bit-for-bit equality of complete outputs, including all diagnostics and std.

The final native run uses **five alternating paired samples per case**, with per-stage excluded warmups and all three frozen binaries in one run. It records baseline→buffers, buffers→QR and baseline→QR comparisons separately: **216 comparisons over 72 case inputs**. Timings include native transport, complete production searches and winning uncertainty finalization. Case coverage includes default thin fits, explicit joint fits, transmission, source calibration, fitted Gaussian sources, distributions, links, active bounds, linear-only/fixed models, rank deficiency and coincident starts.

Browser runs use production Engine/Worker bundles, verified stage WASM, ordinary portable hosting, WebKit and Chromium, excluded warmups and three alternating pairs. Eleven inputs per browser give **66 stage comparisons**. No numerical helper workers or infrastructure fallback are used. Builds/tests and browser timing do not overlap native timing runs. Times are measured medians for this machine and inputs, not universal speed guarantees.

## Results

Summing per-case medians across the 60 single-fit inputs:

| Comparison | Reference sum | Optimized sum | Speedup |
| --- | ---: | ---: | ---: |
| baseline → buffers | 787.39 ms | 788.84 ms | 1.00× |
| buffers → qr | 788.84 ms | 268.93 ms | 2.93× |
| baseline → qr | 787.39 ms | 268.93 ms | 2.93× |

Buffer reuse alone has **no clear wall-time benefit** in the final paired suite. Its initial isolated run showed approximately 1% lower summed single-fit time, with mixed search timing changes. Complete results are exact. QR provides the substantial gain: approximately **2.93× overall** for this single-fit case mix, in addition to the earlier optimizations already present in the baseline.

| Native single fit | Baseline | Buffers only | + QR | Combined speedup |
| --- | ---: | ---: | ---: | ---: |
| MS_MexicanMagnetite_coarse | 82.51 ms | 83.51 ms | 13.44 ms | 6.14× |
| MS-Fe2O3-Fe3O4_70-30_coarse | 55.09 ms | 55.21 ms | 8.73 ms | 6.31× |
| ordinary-MS_MexicanMagnetite_transmission | 92.82 ms | 91.90 ms | 34.66 ms | 2.68× |
| source-calibration-gaussian-3 | 15.56 ms | 15.45 ms | 7.00 ms | 2.22× |
| xvbf-transmission-mixture | 14.89 ms | 14.94 ms | 8.46 ms | 1.76× |
| MS_MexicanMagnetite_coarse-joint | 126.45 ms | 126.90 ms | 16.48 ms | 7.67× |

| Native full search | Baseline | Buffers only | + QR | Combined speedup |
| --- | ---: | ---: | ---: | ---: |
| 70/30 thin, 4 starts | 600.14 ms | 604.90 ms | 102.27 ms | 5.87× |
| Magnetite thin, 4 starts | 554.21 ms | 551.23 ms | 86.36 ms | 6.42× |
| xvbf-transmission-mixture, 4 starts | 58.73 ms | 58.39 ms | 34.21 ms | 1.72× |
| Magnetite transmission, 4 starts | 1349.76 ms | 1354.64 ms | 526.61 ms | 2.56× |
| 70/30 thin, 12 starts | 3106.79 ms | 3087.52 ms | 552.35 ms | 5.62× |
| Magnetite thin, 12 starts | 974.56 ms | 970.00 ms | 185.54 ms | 5.25× |

| Browser, full four-start search | Baseline | Buffers only | + QR | Combined speedup |
| --- | ---: | ---: | ---: | ---: |
| webkit, 70/30 mixture | 2198.0 ms | 2192.0 ms | 223.0 ms | 9.86× |
| webkit, magnetite | 2113.0 ms | 2110.0 ms | 203.0 ms | 10.41× |
| chromium, 70/30 mixture | 2242.6 ms | 2302.6 ms | 232.0 ms | 9.67× |
| chromium, magnetite | 2141.2 ms | 2235.1 ms | 211.8 ms | 10.11× |

## Minimum and uncertainty checks

All isolated-buffer comparisons and all **216 final native / 66 browser stage comparisons pass**. Buffer-only complete outputs remain bit-for-bit identical. QR changes floating-point arithmetic, so iteration counts and search metadata can differ; raw results and stop codes remain in the receipts. All winning minima, curves, parameters, rank, free-parameter counts, degrees of freedom, uncertainty availability and std pass the original fixed checks. No site relabeling was needed.

The maximum before/after parameter std difference is **1.879e-09 relative**, and maximum fraction std difference is **4.227e-10 relative**. Analytical covariance and fractions at identical original optimizer coordinates are bit-for-bit identical. Numerical-Jacobian same-coordinate controls also pass. All 60 unchanged forward evaluations are independently compared.

The original acceptance gates remain: objective within max(1e-7, 1e-8 × reference objective); curves within 0.001 residual RMS (1e-7 absolute floor); parameter/fraction std within 1e-4 relative + 1e-10; original parameter-distance, rank and convergence checks. The independent audit additionally checks complete error/fraction schemas, finite std and fraction values. Search generation, tie handling, screening and iteration budgets are unchanged.

Regression checks passed: **83 Rust tests**, five profiling-feature continuation checks, **171 JavaScript/WASM tests**, **17 native integration tests**, and **274 TypeScript/React tests**. New coverage includes buffer resizing/contamination across models, projected/joint output dimensions, QR reconstruction/singular spectra/trust steps at scales 1e-150 to 1e150, exact direct-factorization fallback, and the mixed distribution convergence regression. The cached/direct reference factors and trust steps retain their bit-for-bit checks; only test-only compression metadata is omitted from that comparison. Checkpoint/callback and deferred/finalized fits agree. Desktop Cargo check, TypeScript compilation, desktop/manual payload verification and all 1,374 manual links passed.

## Receipts and reproduction

- `solver-linear-algebra-baseline-provenance.json`, `solver-linear-algebra-buffers-provenance.json`: frozen pre-change and isolated-buffer artifact/source hashes.
- `solver-linear-algebra-buffers-{native,search,search12}.json`: the initial isolated buffer measurements, 72 comparisons.
- `solver-linear-algebra-qr-{native,search,search12}.json`: the final three-stage measurements, 216 comparisons.
- `solver-linear-algebra-browser.json`: verified three-stage portable browser measurements, 66 comparisons.
- `solver-linear-algebra-verification.json`: independent raw-result, schema, covariance, source/binary, forward-model and final regression/build audit.
- The initial and refinement pilots retain the rejected unrestricted mixed-model result. `solver-linear-algebra-qr-qualified-pilot.json` records the 180 passing single-fit comparisons after the general eligibility safeguard.
- `rust-core/vendor/basin/solver-linear-algebra.patch` records the local solver changes against the frozen baseline; original dependency licenses remain intact.

Preserve the ignored `runtime/solver-linear-algebra/{baseline,buffers,qr}` artifacts for reproduction. Production builds do not enable diagnostic profiling.

```sh
cargo test --locked --manifest-path rust-core/Cargo.toml
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --test tests/*.test.mjs
node scripts/test-native.mjs
node --import tsx --test tests/*.test.tsx
node --import tsx scripts/benchmark-solver-linear-algebra.mjs --stages baseline,buffers,qr --repeats 5
node --import tsx scripts/benchmark-solver-linear-algebra.mjs --stages baseline,buffers,qr --search --repeats 5
node --import tsx scripts/benchmark-solver-linear-algebra.mjs --stages baseline,buffers,qr --search --starts 12 --case coarse --repeats 5 --output validation-data/performance/solver-linear-algebra-qr-search12.json
node scripts/benchmark-solver-linear-algebra-browser.mjs
node --import tsx scripts/verify-solver-linear-algebra.mjs
```

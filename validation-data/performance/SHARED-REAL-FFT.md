# Shared forward/Jacobian evaluation and real FFTs

November 8, 2026. Two separately benchmarked stages extend the default analytical fitter. The reference is the analytical implementation after source-calibration/xVBF support, not the earlier numerical fitter.

## Implementation

**Stage 1: shared evaluation.** A fused absorber-grid evaluator computes each xVBF profile value and its optimizer-coordinate tangents together. It shares the four-pole terms, line geometry, effective widths and mixture weights, and stores an immutable exact-coordinate snapshot for the Jacobian. Thin xVBF models use the same mechanism at observed velocities; transmission models use the existing 6,001-point grid. Fixed/linked parameters and bounded stick-breaking derivatives retain their existing definitions. Model clones share snapshots, while coordinate checks prevent stale reuse.

The first pilot eagerly prepared tangents for every analytical forward call. It slowed several ordinary fits because rejected trust-region trials do not need Jacobians. The final policy prepares shared tangents only for models containing xVBF sites. Ordinary profiles retain their lazy derivative implementation and existing shared transmission-grid snapshot; numerical safety columns evaluate values without preparing tangents. No candidate policy, solver tolerance, covariance/rank policy or forward physics was changed. The new cancellation guard retains residual dimensions if a token arrives during a partially computed shared grid.

**Stage 2: real FFTs.** Default analytical transmission, calibration, and derivative convolutions now use RealFFT 3.5.1, backed by RustFFT. The same 16,384-point zero padding, ±30 mm/s window, 0.01 mm/s grid, convolution offset, 1/N/100 normalization, Gaussian deficit/continuum convention, PCHIP/local interpolation and calibration sampled-maximum normalization remain in place. Real spectra retain 8,193 coefficients. Fitted-source derivatives apply `dZ*K + Z*dK` in that representation. Native FFT columns still use the existing bounded pool; no nested or additional fit parallelism was introduced.

Plans are immutable and reused; workspaces remain local to a thread. The legacy full-complex workspace is allocated only on demand. The explicit numerical derivative override retains the full complex FFT, preserving frozen numerical outputs. Real FFT factorization changes floating-point rounding; equivalence is checked, not presumed bitwise. [RealFFT documentation](https://docs.rs/realfft/3.5.1/realfft/) describes the transform and normalization conventions.

## Native timing

Single fits use five alternating paired samples for each incremental stage and three for the independently timed combined comparison. Searches use three pairs. Each case has an excluded warmup. Timings include native JSON transport and complete uncertainty finalization; multistart finalizes the selected trial once. Builds, tests and browser timings did not overlap native timing runs. Stage ratios come from their own paired measurements, and the combined column is measured directly rather than multiplying ratios from separate runs.

| Native fit | Shared evaluation | Real FFTs, incremental | Baseline → final, paired | Combined |
| --- | ---: | ---: | ---: | ---: |
| Lorentzian source calibration | 1.02× | 1.36× | 5.35 → 3.78 ms | 1.42× |
| Three-Gaussian source calibration | 1.00× | 1.17× | 17.01 → 14.60 ms | 1.17× |
| Thin xVBF mixture | 1.03× | 1.01× | 5.99 → 5.99 ms | 1.00× |
| Transmission xVBF mixture | 1.16× | 1.17× | 18.61 → 14.19 ms | 1.31× |
| xVBF with fixed component weight | 1.17× | 1.17× | 15.20 → 11.37 ms | 1.34× |
| Perfect-correlation boundary | 1.07× | 1.30× | 34.81 → 25.04 ms | 1.39× |
| Ordinary singlet, Lorentzian source | 1.01× | 1.57× | 4.87 → 3.15 ms | 1.55× |
| Three sites, squared source | 1.01× | 1.23× | 23.40 → 18.75 ms | 1.25× |
| Asymmetric Gaussian source | 0.97× | 1.90× | 8.08 → 4.01 ms | 2.02× |
| Measured magnetite, transmission | 1.00× | 1.09× | 94.20 → 85.88 ms | 1.10× |

Shared evaluation mainly benefits transmission xVBF fits, approximately 7–17% in the measured set, with little systematic benefit in thin fits. Real FFTs provide the larger additional gain for ordinary transmission and source calibration. The measured magnetite fit remains dominated by other work, so its gain is smaller. Short-fit fluctuations should not be interpreted as universal improvements; raw samples are retained.

| Four-start search | Baseline | Final | Combined |
| --- | ---: | ---: | ---: |
| xVBF thin mixture full | 26.02 ms | 25.82 ms | 1.01× |
| xVBF thin mixture selective | 25.89 ms | 25.51 ms | 1.01× |
| xVBF transmission mixture full | 73.54 ms | 60.90 ms | 1.21× |
| xVBF transmission mixture selective | 74.08 ms | 60.93 ms | 1.22× |
| three sites squared source full | 117.27 ms | 101.40 ms | 1.16× |
| three sites squared source selective | 117.63 ms | 103.66 ms | 1.13× |
| MS_MexicanMagnetite_transmission full | 1437.12 ms | 1323.28 ms | 1.09× |
| MS_MexicanMagnetite_transmission selective | 633.29 ms | 569.81 ms | 1.11× |

The 12-start xVBF transmission searches also pass. For the FFT step alone, full search changes **189.30→169.39 ms**, and selective search **201.27→179.21 ms**. These are additional to the shared-evaluation gain; each step has its own paired reference.

## Browser timing

Three actual production Engine/Worker bundles load the verified WASM for the baseline, shared-evaluation stage and real-FFT stage. WebKit and Chromium run nine input/search combinations, both on portable hosting and with shared-memory isolation. Each run uses an excluded warmup and three alternating/reversed-order samples across all three engines. All analytical fits use one browser fitting worker without infrastructure fallback or numerical helpers.

There are **108 pairwise comparisons**: 36 for shared evaluation, 36 for the incremental FFT step, and 36 directly comparing baseline to final. Shared evaluation is a small browser improvement, and real FFTs provide most of the gain. Representative combined full-fit times:

| Browser / hosting | Lorentzian calibration | Three-Gaussian calibration | xVBF transmission | Four-start xVBF | Four-start measured magnetite |
| --- | ---: | ---: | ---: | ---: | ---: |
| WebKit / portable | 13.0→10.0 ms | 56.0→48.0 ms | 54.0→45.0 ms | 215.0→183.0 ms | 5171.0→4573.0 ms |
| WebKit / isolated | 13.6→9.9 ms | 55.9→46.6 ms | 52.4→43.4 ms | 214.8→183.0 ms | 5222.3→4575.6 ms |
| Chromium / portable | 13.1→9.7 ms | 57.6→48.1 ms | 53.9→44.7 ms | 215.2→179.1 ms | 5366.3→4792.2 ms |
| Chromium / isolated | 13.8→9.9 ms | 58.4→49.3 ms | 53.6→43.2 ms | 221.2→185.7 ms | 5418.8→4775.2 ms |

The slow measured multistart case is included rather than extrapolating short synthetic-fit speedups to it. Thin models do not use FFTs and show no systematic FFT gain.

## Minima and uncertainties

All **136 native timed comparisons** and **108 browser comparisons** passed the unchanged scientific gates, including equivalent objectives, curves, identifiable parameters, rank, and parameter/fraction-std availability. The shared-evaluation stage retains **bit-for-bit identical complete fit outputs** in every native and browser comparison. The FFT step reaches equivalent minima with tiny numerical differences.

Maximum relative parameter-std differences:

- Between native fitted minima: **1.88e-09**.
- Between browser fitted minima: **1.31e-09**.
- Finalizing native winners at the identical optimizer coordinates with reference/current analytical Jacobians: **2.4e-11**.
- Current analytical versus explicit numerical Jacobians at identical coordinates: **1.45e-06**.

The fixed gates remain: objective difference ≤max(1e-7, 1e-8 × reference objective), curve RMS difference ≤max(1e-7, .001 × reference residual RMS), identifiable-parameter difference ≤1e-7 × max(1, |value|) + .001 × reference std, and parameter/fraction-std difference ≤1e-10 + 1e-4 × reference std. Every benchmark also requires an equivalent minimum rather than accepting a different, better basin. Full error-map keys, degrees of freedom, free-parameter count, rank, finite/nonnegative available std, and fixed/dependent-weight uncertainty availability are independently checked in the verification receipt. Mixed xVBF/ordinary sites check nonzero fraction std.

Stopping codes can differ near the numerical floor. Raw `converged` flags and warnings remain unchanged by reporting; stationary `SolverFailed`/`NumericalNoProgress` stops are accepted only under the preexisting projected-stationarity rule (≤1e-6), with objective and std equivalence checked independently. The raw receipts retain every stop code and stationarity value. No tolerance was loosened to make the speed benchmarks pass.

Forward-curve tests explicitly distinguish algorithmic roundoff from model changes: the numerical override remains exact against the frozen original fixtures, while default real-FFT curves must lie within 64 machine epsilons of the spectrum's count scale, and the original forward-fixture SSE/objective within 128 epsilons of their scale. For the broader verification set, which includes nearly exact synthetic spectra, SSE/objective changes must stay within the sum-of-squares bound propagated from that independently checked curve-roundoff limit (including summation roundoff); relative SSE precision is not a meaningful requirement at zero residual. Background, individual unconvolved site curves and physical parameter maps remain exact. Independent direct-convolution, five-point derivative, FFT round-trip/DC/Nyquist and snapshot-invalidation tests cover both transform paths.

## Verification and artifacts

Checks: **65-test full Rust suite plus the focused shared-grid cancellation check**, **129 JS/WASM tests**, **14 native integration tests**, desktop Rust check, TypeScript compilation, Rust formatting and desktop/manual production build. The build verifies 284 payload files, 365 local asset references and 1,374 local manual links; RealFFT's MIT license is included in generated notices.

- `shared-real-fft-baseline-provenance.json`: frozen initial analytical native/WASM/search hashes.
- `shared-evaluation-stage-provenance.json`: archived intermediate-stage artifacts and sources.
- `shared-evaluation-{native,search,search12}.json`: incremental shared evaluation.
- `realfft-evaluation-{native,search,search12}.json`: incremental real FFTs.
- `combined-evaluation-{native,search}.json`: directly paired baseline/final results.
- `shared-real-fft-browser.json`: three-stage production Engine/Worker comparisons.
- `shared-real-fft-verification.json`: final hashes, forward roundoff checks, result-schema/std audit and check receipts. Recreate with `node --import tsx scripts/verify-shared-real-fft.mjs` while the local archives/check logs remain available.

The benchmark set includes frozen synthetic spectra, measured hematite/magnetite, ordinary and mixed profiles, Lorentzian/squared/Gaussian sources and calibration, thin and transmission xVBF, free/fixed/dependent weights, perfect correlation, linked parameters, active bounds, interpolation edges, background-only models and rank deficiency. These are performance/equivalence checks, not a new external scientific-validation claim.

Archives under `validation-data/performance/runtime/shared-real-fft/` are ignored local artifacts and are needed to reproduce paired benchmarks.

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-shared-real-fft.mjs --stage shared --current validation-data/performance/runtime/shared-real-fft/shared/native_fixture
node --import tsx scripts/benchmark-shared-real-fft.mjs --stage realfft --reference validation-data/performance/runtime/shared-real-fft/shared/native_fixture
node --import tsx scripts/benchmark-shared-real-fft.mjs --stage realfft --reference validation-data/performance/runtime/shared-real-fft/shared/native_fixture --search --repeats 3
node --import tsx scripts/benchmark-shared-real-fft.mjs --stage realfft --reference validation-data/performance/runtime/shared-real-fft/shared/native_fixture --search --starts 12 --case xvbf-transmission --repeats 3 --output validation-data/performance/realfft-evaluation-search12.json
node --import tsx scripts/benchmark-shared-real-fft.mjs --stage combined --repeats 3
node scripts/benchmark-shared-real-fft-browser.mjs --stages baseline,shared,realfft --repeats 3
```

Changes remain local; no commit, release, installation or publication was performed.

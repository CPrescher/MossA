# Analytical source-calibration and xVBF derivatives

November 8, 2026. Source calibration and xVBF now use analytical Jacobians by default. Together with the existing ordinary thin/transmission implementation, this covers all currently supported fit types. The explicit numerical override remains available. The forward spectral model, solver settings, bounds, links, rank threshold and uncertainty conventions are unchanged.

## What changed

Source calibration differentiates both the absorber and the fitted source through their FFT convolution. Lorentzian and Lorentzian-squared source-width derivatives are supported. Gaussian mixtures include every fitted component width, center and relative weight, the weight-dependent mean used to recenter the source, and the discrete source-area normalization. The original fixed first-center/first-weight anchors are retained. The sampled transmission maximum used by source calibration is differentiated before applying the background. Shared source/absorber/background roots include all product-rule contributions.

xVBF derivatives follow the **literal four-pole approximation** already used by the forward model, including its Lorentzian zero-width limit. This does not replace it with a different Voigt function or change its width convention. Derivatives include intensity, correlation, CS/QS component centers, widths and weights, in thin and transmission models, including Gaussian-source transmission.

The weight chain rule differentiates the existing bounded stick-breaking coordinates. Fixed mass, conditional bounds and the final dependent weight are included, so the solver does not acquire an extra independent weight or lose exact normalization. Existing numerical propagation for derived summaries/fractions uses the resulting covariance as before.

Numerical columns are retained where the finite-difference neighborhood crosses a nonsmooth branch: source-normalization maxima, PCHIP limiters, conditional weight bounds and near-zero effective variances/perfect correlation. These are deliberate safety fallbacks, not changes to the forward function. Native convolutions use the existing bounded derivative pool with cancellation propagation; browser analytical fits bypass numerical helper requests. Exact-coordinate forward snapshots now also retain the changing source and absorber FFT for calibration, shared immutably between solver clones.

Ordinary-model behavior and thin-model coincidence handling remain intact; xVBF components are not automatically redefined or separated by the ordinary-site initializer.

## Native timing results

Five alternating paired measurements per single fit and three per search, with excluded warmups. Times include native JSON transport and uncertainty finalization. Both versions use Auto derivative concurrency and finalize only the selected search trial. Builds/tests did not overlap timing measurements. These are synthetic/frozen numerical-reference cases, not new measured-data source or distribution validation.

| Native case | Numerical | Analytical | Ratio |
| --- | ---: | ---: | ---: |
| Lorentzian source calibration | 7.24 ms | 5.19 ms | 1.39× |
| Squared source calibration | 7.03 ms | 5.61 ms | 1.25× |
| One-Gaussian source calibration | 5.98 ms | 4.68 ms | 1.28× |
| Two-Gaussian source calibration | 12.26 ms | 9.17 ms | 1.34× |
| Three-Gaussian source calibration | 19.91 ms | 16.38 ms | 1.22× |
| Thin xVBF mixture | 8.50 ms | 5.92 ms | 1.44× |
| Transmission xVBF mixture | 31.40 ms | 17.85 ms | 1.76× |
| xVBF with a fixed component weight | 26.84 ms | 14.82 ms | 1.81× |
| Mixed xVBF/sextet sites | 14.50 ms | 10.83 ms | 1.34× |
| Perfect-correlation boundary | 26.97 ms | 31.55 ms | **0.85× — slower** |

Source calibration took approximately **18–28% less time**. Regular xVBF fits improved by about **1.27–1.81×** in this set. The perfect-correlation boundary was about **17% slower** because affected geometry columns retain numerical differences after analytical preparation. This is not a universal speedup.

| xVBF mixture search | Numerical | Analytical | Ratio |
| --- | ---: | ---: | ---: |
| Thin, four full starts | 37.99 ms | 27.03 ms | 1.41× |
| Thin, four selective starts | 39.71 ms | 27.95 ms | 1.42× |
| Transmission, four full starts | 139.98 ms | 77.50 ms | 1.81× |
| Transmission, four selective starts | 129.17 ms | 74.63 ms | 1.73× |
| Transmission, 12 full starts | 367.09 ms | 219.81 ms | 1.67× |
| Transmission, 12 selective starts | 372.33 ms | 221.78 ms | 1.68× |

The search wrapper/candidate policy was not changed; these compare the same production workflow with different derivatives. Source calibration remains a single-fit action.

## Browser results

All **32** production Engine/Worker comparisons passed in WebKit and Chromium, with/without shared-memory isolation. They cover Lorentzian, squared, two-/three-Gaussian calibration and thin/transmission xVBF mixtures with one/four starts. Auto numerical execution is compared with analytical fitting in one browser fitting worker. No infrastructure fallback occurred.

With ordinary portable hosting, ratios ranged **1.10–2.40×**, median **1.79×**. Source calibration improved **1.6–2.4×**; transmission xVBF mixtures about **1.8×**; thin xVBF fits/searches about **1.1×**.

Representative Chromium portable results:

- Two-Gaussian calibration: **62.6→26.1 ms**.
- Three-Gaussian calibration: **115.9→56.4 ms**.
- Transmission xVBF mixture: **91.8→51.4 ms**.
- Four-start transmission xVBF search: **382.9→211.8 ms**.

With isolation, existing numerical helper workers reduce the advantage: ratios were **0.97–1.31×**, median **1.15×**. WebKit three-Gaussian calibration was slightly slower, **53.9→55.6 ms**. Raw paired samples are retained rather than presenting these small differences as fixed guarantees.

## Minima and uncertainties

All **20 native comparisons** passed: 14 single fits, four four-start searches and two 12-start searches. All **32 browser comparisons** passed. Every objective was equivalent to its numerical reference under the existing objective tolerance; no better/worse-basin exception was needed.

The existing scientific gates require matching rank and std availability, objective degradation no larger than max(1e-7, 1e-8 × reference objective), curve RMS difference no larger than max(1e-7, .001 × reference residual RMS), and identifiable parameter differences no larger than 1e-7 × max(1, |value|) + .001 × reference std. Parameter/fraction std must agree within 1e-10 + 1e-4 × reference std.

Each native winning fit is also finalized using numerical and analytical Jacobians at the **identical optimizer coordinates and original scales**. All these independent covariance comparisons passed. The largest relative parameter-std differences were **2.47e-8** between fitted minima and **2.12e-8** at identical coordinates. Browser maximum was **2.03e-8**. These are below **0.000003%**, substantially smaller than the 0.01% relative gate.

The mixed xVBF/sextet case checks nonzero site-fraction uncertainty: both fractions have approximately **0.0004837 percentage-point std**, with relative error **4.90e-11** versus the numerical fit. Maximum same-coordinate fraction-std difference was **1.98e-10 relative**. Component-weight uncertainties, including fixed and dependent weights, are checked through the full error map. Active-bound and rank-deficient std policies remain unchanged.

Stopping codes can differ at the numerical floor. In the native 12-start transmission searches, the selected analytical solution reports `SolverFailed` with independent projected stationarity **4.84e-10**, while the numerical reference reports `RelativeCostTolerance`. This passes the app's preexisting stationary-fit acceptance rule (≤1e-6); equivalent objectives, parameters and std are checked independently. The raw `converged=false` flag and warning are retained. The code does not relabel that stop as convergence to make the benchmark pass.

Explicit numerical overrides retain the frozen pre-change native/WASM outputs after removing the explicit method marker. Forward calculations remain unchanged.

## Verification and reproduction

Independent five-point checks cover source widths/centers/weights and both normalizations, signed xVBF correlation, fitted weights on both axes, constrained/fixed/dependent weights, both thin/transmission modes and shared source/absorber/background roots. More local five-point stencils avoid crossing an unrelated interpolation branch; deliberate fallback columns are checked against the original bounded numerical column. Additional tests cover perfect correlation, zero-width limits, maximum ties, weight-bound switches, callbacks, checkpoints, cancellation, worker-count determinism and eager/deferred finalization.

Checks passed: **63 Rust tests/checks** (62-test full suite plus the additional joint-root test), **129 JS/WASM tests**, **273 TypeScript/React tests**, **14 native integration tests**, TypeScript compilation, desktop Rust check, formatting and the desktop/manual production build. The build verified 284 payload files and 1,374 manual links.

Receipts:

- `source-xvbf-analytical-baseline-provenance.json`: frozen pre-change native/WASM/search hashes.
- `source-xvbf-analytical-native.json`: 14 single fits, input projects, full results, samples and covariance comparisons.
- `source-xvbf-analytical-search.json`: four four-start searches.
- `source-xvbf-analytical-search12.json`: two 12-start searches.
- `source-xvbf-analytical-browser.json`: 32 actual browser comparisons and final WASM hash.
- `source-xvbf-analytical-verification.json`: final source/artifact hashes and verification counts.

Runtime archives are ignored under `validation-data/performance/runtime/source-xvbf-analytical/`. Reproduction requires the frozen baseline archive.

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-source-xvbf-analytical.mjs --repeats 5
node --import tsx scripts/benchmark-source-xvbf-analytical.mjs --repeats 3 --search
node --import tsx scripts/benchmark-source-xvbf-analytical.mjs --repeats 3 --search --starts 12 --case xvbf-transmission --output validation-data/performance/source-xvbf-analytical-search12.json
node scripts/benchmark-source-xvbf-analytical-browser.mjs --repeats 3 --playwright-module /path/to/playwright-core/index.mjs
```

Changes remain local; no release, installation or publication was performed.

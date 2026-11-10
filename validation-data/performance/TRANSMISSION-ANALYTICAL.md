# Analytical transmission derivatives

> Source calibration and xVBF are now also supported. See [the source/xVBF benchmark](SOURCE-XVBF-ANALYTICAL.md) for the current extension and qualification.

November 8, 2026. Ordinary transmission models now use analytical derivatives by default, alongside the existing analytical thin-model path. An explicit `derivative_method: "numerical"` retains the numerical implementation. Source calibration and any model containing an xVBF distribution remain numerical.

## Implemented model

The absorber derivatives cover singlets, doublets and sextets with Lorentzian, Gaussian, pseudo-Voigt and Lorentzian-squared profiles, both nuclear-constant conventions, backgrounds, count weighting and proportional parameter links. Lorentzian, Lorentzian-squared and Gaussian-mixture **fixed source profiles** are supported.

For optical depth τ, transmission before convolution is exp(−τ), with derivative −exp(−τ)·dτ. The derivative is convolved with the same fixed source FFT as the forward model. Gaussian-source deficit padding and the unabsorbed continuum are retained. The final background chain rule is

`dY = B0·dT + T·dB0 + Σ(k≥1) v^k·dBk`.

The chain rule includes physical-to-optimizer scales and all linked contributions, including roots shared by background and absorber parameters. Ordinary transmission is not normalized after interpolation; the separately normalized source-calibration model is deliberately excluded.

Legacy PCHIP interpolation is differentiated through its harmonic-mean slopes and endpoint limiters. It is not replaced with PCHIP interpolation of a derivative curve. Gaussian-source six-point interpolation uses its exact linear weights. At a PCHIP limiter switch straddled by the existing bounded finite-difference step, the affected column retains that numerical step. Other columns remain analytical. This handles the interpolant's nondifferentiable points without changing the spectrum calculation.

The Jacobian reuses optical depth, convolved grid and sampled transmission from the preceding forward evaluation at the **identical optimizer coordinates**. This cache is private to one prepared model and its solver clones; it is keyed by the full coordinate vector and is never serialized. Independent models/sources have independent caches. Locks are released before model evaluation, FFT work and callbacks. Local interpolation derivative stencils are computed once per Jacobian.

Native derivative convolutions reuse the existing bounded Rayon pool, with job cancellation tokens propagated into worker tasks. There are no parallel reductions, and worker counts retain bit-identical analytical fit output in the integration checks. Browser analytical fits run in their main fitting worker and bypass numerical helper-column requests.

The forward arithmetic, observation grid, source kernel, solver settings, starting coordinates, bounds, rank threshold and uncertainty scaling are unchanged. Existing thin-model coincidence handling remains restricted to thin models. Final parameter and intensity-fraction std use the same selected Jacobian, including deferred multistart finalization.

## Whole-fit native timings

Five alternating paired samples per single fit, three per multistart comparison; one excluded warmup per method. Times include native JSON transport and std finalization. Both search versions finalize the winning candidate once. Numerical and analytical native fits use Auto derivative concurrency. No builds or tests overlapped the timed runs.

| Native fit | Numerical | Analytical | Ratio |
| --- | ---: | ---: | ---: |
| Singlet, Lorentzian source | 5.62 ms | 4.92 ms | 1.14× |
| Three sites, Lorentzian source | 24.48 ms | 18.71 ms | 1.31× |
| Three sites, squared source | 24.13 ms | 19.92 ms | 1.21× |
| Mixed absorber profiles, count weighting | 31.31 ms | 22.61 ms | 1.38× |
| Measured Fe₂O₃ | 8.41 ms | 7.04 ms | 1.19× |
| Measured Mexican magnetite | 99.85 ms | 82.96 ms | 1.20× |
| Strong absorption | 7.79 ms | 5.57 ms | 1.40× |
| Asymmetric Gaussian source | 5.70 ms | 6.74 ms | **0.84× — slower** |

The ordinary single-fit median ratio, excluding the background-only control, was **1.20×**. Most tested native transmission fits took roughly **12–29% less time**. The background-only control improved 2.42×. These results do not establish a universal speedup.

All six four-start full/selective searches matched their numerical best minima:

| Four-start search | Numerical | Analytical | Ratio |
| --- | ---: | ---: | ---: |
| Three sites, squared source, full | 134.35 ms | 106.65 ms | 1.26× |
| Three sites, squared source, selective | 133.58 ms | 106.81 ms | 1.25× |
| Gaussian source, full | 30.20 ms | 27.02 ms | 1.12× |
| Gaussian source, selective | 30.28 ms | 26.95 ms | 1.12× |
| Mexican magnetite, full | 1607.44 ms | 1311.94 ms | 1.23× |
| Mexican magnetite, selective | 678.77 ms | 566.12 ms | 1.20× |

The Mexican magnetite **12-start** full/selective searches also matched: **3070.97→2929.06 ms** and **2151.27→1845.27 ms**, respectively. Raw paired samples are retained; three-sample search ratios have ordinary timing variability.

## Production browser timings

All **32** actual Engine/Worker comparisons passed in Chromium and WebKit. Four representative models cover Lorentzian, squared and Gaussian sources plus measured magnetite, with one/four starts, portable hosting and cross-origin isolation. Each uses the normal Auto numerical path versus the default analytical path.

Without shared-memory isolation, speed ratios were **1.42–2.05×**, median **1.68×**. Representative single fits were:

| Browser, portable hosting | Numerical | Analytical |
| --- | ---: | ---: |
| WebKit, three sites/squared source | 109 ms | 69 ms |
| Chromium, three sites/squared source | 137 ms | 70 ms |
| WebKit, Mexican magnetite | 491 ms | 339 ms |
| Chromium, Mexican magnetite | 597 ms | 346 ms |

The corresponding four-start magnetite searches improved from approximately **7.5–9.0 s to 5.3 s**.

With isolation, the established numerical implementation can already use shared-memory helper workers. Ratios ranged **0.93–2.03×**, median **1.25×**. Two WebKit cases were slightly slower: the three-site single fit **67.0→72.2 ms** and magnetite single fit **330.6→354.1 ms**. Chromium's corresponding cases were close to parity. All browser analytical requests reported one fitting worker and no infrastructure fallback.

## Minima, std and stopping diagnostics

All **22 native comparisons** passed: 14 single fits, six four-start searches and two 12-start searches. All **32 browser comparisons** passed. Every tested final objective was equivalent to the numerical reference under the existing tolerance; no better/worse-basin exception was needed.

The unchanged scientific gates require:

- Objective difference ≤ max(1e-7, 1e-8 × reference objective), with matching rank.
- Curve RMS difference ≤ max(1e-7, .001 × reference residual RMS).
- Matching availability of parameter/fraction std and std differences ≤ 1e-10 + 1e-4 × reference std.
- Identifiable parameter differences ≤ 1e-7 × max(1, |value|) + .001 × reference std.

All native cases additionally finalize analytical and numerical Jacobians at the **same winning optimizer coordinates and original scales**. The largest relative parameter-std difference was **1.46e-6** (0.000146%); the largest relative fraction-std difference there was **6.16e-8**. Across equivalent-minimum browser outputs, maximum relative parameter-std difference was **9.89e-8**. These are substantially smaller than the 0.01% relative gate. Fixed/active-bound and rank-deficient std policies are unchanged.

Stopping flags are not promised to be identical at floating-point precision. Two native single-fit controls reached equivalent minima/std while changing their stopping code:

| Case | Numerical stop | Analytical stop | Analytical stationarity |
| --- | --- | --- | ---: |
| Asymmetric Gaussian source | RelativeCostTolerance | NumericalNoProgress | 2.94e-7 |
| Background-only control | RelativeCostTolerance | SolverFailed | 3.89e-16 |

Both pass the app's preexisting independent projected-gradient acceptance rule (`acceptableFit`, stationarity ≤1e-6 for these stops). Their original `converged=false` flags and warnings remain visible; they were not rewritten to manufacture convergence. The Gaussian single-fit timing regression is also retained above. Browser fits in the tested set converged normally. Minima/std agreement is not a claim that every stopping diagnostic is bit-identical.

Explicit numerical overrides reproduce the frozen numerical native/WASM fit results exactly after removing the newly explicit method marker. Forward curves remain exact, including the existing synthetic/measured fixtures.

## Verification and evidence

Independent five-point derivative checks cover all twelve site/profile combinations with three source families, plus existing off-grid spectra, links, background cross-links, zero area, saturation, nuclear constants and both ±30 mm/s interpolation edges. Additional tests verify smooth-branch PCHIP derivatives, limiter-switch fallback, short interpolation stencils, exact-coordinate cache invalidation, model/source isolation, progress reentrancy, cancellation, worker counts and eager/deferred finalization.

Final checks passed: **58 Rust tests**, **113 JS/WASM tests**, **273 TypeScript/React tests**, **13 native integration tests**, TypeScript compilation, desktop Rust check, formatting, and desktop/manual production build. The desktop payload and 1,374 manual links were verified. The historical numerical-kernel benchmark was also checked with its explicit numerical override.

Receipts:

- `transmission-analytical-baseline-provenance.json`: frozen pre-change native binary, WASM module/binary and source/search hashes.
- `transmission-analytical-native.json`: 14 paired single fits, including input projects and full results.
- `transmission-analytical-search.json`: six paired four-start searches.
- `transmission-analytical-search12.json`: two paired 12-start searches.
- `transmission-analytical-browser.json`: 32 production browser comparisons, actual worker settings and final WASM hash.
- `transmission-analytical-verification.json`: final artifact hashes and check counts.

Runtime archives live under the ignored `validation-data/performance/runtime/transmission-analytical/`. Reproduction requires the frozen baseline archive.

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-transmission-analytical.mjs --repeats 5
node --import tsx scripts/benchmark-transmission-analytical.mjs --repeats 3 --search
node --import tsx scripts/benchmark-transmission-analytical.mjs --repeats 3 --search --starts 12 --case MS_MexicanMagnetite --output validation-data/performance/transmission-analytical-search12.json
node scripts/benchmark-transmission-analytical-browser.mjs --repeats 3 --playwright-module /path/to/playwright-core/index.mjs
```

Changes remain local. No release, installation or publication was performed.

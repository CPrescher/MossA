# Default analytical thin fits and coincident starting components

> Transmission derivatives are now also supported. See [the transmission analytical benchmark](TRANSMISSION-ANALYTICAL.md) for the current transmission behavior and qualification.

November 8, 2026. Analytical derivatives are now the default for supported thin models. This supersedes the opt-in decision in [ANALYTICAL.md](ANALYTICAL.md).

An absent `derivative_method` selects analytical derivatives for ordinary thin singlets, doublets and sextets, with all four profiles, polynomial backgrounds, links, count weighting and either nuclear-constant convention. Explicit `analytical` has the same behavior. Explicit `numerical` retains the former numerical derivatives and starting behavior. Transmission, source calibration and models containing xVBF distributions continue using numerical derivatives. Saved explicit numerical overrides remain respected.

## Coincidence handling

The Rust core detects coincident starting sites of the same kind/profile whose active shape parameters agree to a relative/absolute tolerance of 1e-10, excluding intensity. It separates their optimizer starting coordinates deterministically, using the first available independent free shape parameter. Sextets preferentially separate BHF so their outer lines span one FWHM; other position spreads use the line width. The intensity-weighted mean is preserved where bounds permit. Common bounds translate or shorten the spread instead of clipping all components onto the same endpoint.

Fixed parameters and shared or cross-parameter linked roots are not perturbed. The original project, parameter scales, links, bounds, forward evaluator and uncertainty finalization coordinates remain intact. Completed fit warnings identify adjusted parameter IDs. The solver iteration limit and requested search count stay unchanged; this adds no hidden fits or numerical perturbations to the Jacobian.

Two safeguards retain the supplied model's quality:

- A model already reproducing the spectrum to floating-point roundoff is left at its supplied start.
- If a separated fit ends with a worse objective than the supplied model, the supplied coordinates are retained, with a `StartingModelRetained` termination and `converged=false`. A selective-search trial that was pruned remains pruned.

If constraints leave the decomposition unidentifiable, the rank check still withholds its std. Splitting a start does not impose a new physical constraint or manufacture identifiable uncertainties.

## Native results

Five alternating paired measurements per single fit, three per search, with one excluded warmup for each method. Times include native JSON transport and uncertainty finalization. Searches finalize only their winning trial in both versions. Baseline numerical derivatives retain their existing Auto parallelism. Builds/tests were finished before timing runs.

| Coarse measured start | Numerical default | New default | Speed ratio | Minimum |
| --- | ---: | ---: | ---: | --- |
| 30:70 Fe₂O₃/Fe₃O₄ | 106.47 ms | 53.63 ms | 1.99× | Equivalent |
| 70:30 Fe₂O₃/Fe₃O₄ | 626.64 ms | 77.85 ms | 8.05× | Better |
| 50:50 Fe₂O₃/Fe₃O₄ | 108.01 ms | 58.02 ms | 1.86× | Better |
| Mexican magnetite | 136.76 ms | 132.29 ms | 1.03× | Equivalent |

The large gains in the first three cases primarily come from improved initialization and fewer iterations, in addition to cheaper derivatives: 33→18, 191→25 and 34→18 iterations. The formerly worse analytical 30:70 and 50:50 single-start minima are resolved in this benchmark.

The 70:30 objective improved from **7.323296299e9 to 3.911720305e9**, and the 50:50 objective from **6.838025322e9 to 3.543014756e9**. The 30:70 objective matched at **2.282655632e8** within the predeclared tolerance.

Four informed measured starts retained equivalent minima and improved by **1.01–1.11×**. These starts do not need coincidence handling; their more modest gains better isolate derivative savings from the improvement in starting geometry.

All ten four-start searches (four measured coarse models plus linked mixed sites, each full/selective) retained equivalent best minima and passed the std checks. Their measured ratios ranged **1.01–2.01×**. The 30:70 full/selective searches were **562.06→309.07 ms** and **372.70→267.31 ms**. Three-sample timing variation is visible in the retained raw samples; these ratios are measurements, not fixed performance guarantees.

The additional 30:70 **12-start** full/selective searches also passed: **2575.68→2186.42 ms** and **1045.34→976.52 ms**, with equivalent minima and std. The previous ~3.6× analytical slowdown of the four-start 30:70 search was not reproduced after explicit initialization.

## Browser results

All **48 production Engine/Worker comparisons** passed in WebKit and Chromium, portable and cross-origin-isolated contexts. They cover the thin control, linked mixed sites, and coarse 30:70/50:50 models, each with one/four starting models. Ordinary models exercise requested workers 1/4; coarse models exercise the normal Auto path. Analytical requests report one worker, with no fallback. Explicit numerical requests reproduce the frozen numerical WASM/search results exactly, excluding the newly explicit method marker.

For the usual serial browser path, the ordinary noncoincident fits/searches improved **1.03–1.08×**. The coarse 30:70 single fits improved from roughly **650–710 ms to 200–215 ms**, and four-start searches from **2.5–2.7 s to about 1 s**. Coarse 50:50 single fits improved by about **1.83×** and four-start searches by **1.13–1.15×**. Improvements against forced message-only numerical worker pools include avoided communication overhead; Auto already keeps these browser thin fits serial.

## Minima and uncertainties

All **36 native comparisons** passed: 20 single fits, four informed measured fits, ten four-start searches and two 12-start searches. All 48 browser comparisons passed. No tested minimum was worse beyond the original quality tolerance.

The original quality gates in `scripts/analytical-validation.mjs` remain in use, with additional checks for intensity-fraction std:

- Objective degradation ≤ max(1e-7, 1e-8 × reference objective), with matching rank.
- At equivalent minima, curve RMS difference ≤ max(1e-7, .001 × reference residual RMS).
- Matching availability of std; std difference ≤ 1e-10 + 1e-4 × reference std, including intensity fractions.
- Identifiable parameter difference ≤ 1e-7 × max(1, |value|) + .001 × reference std.

When a better minimum is found, different parameter values and uncertainties are expected. To check derivative accuracy independently of that change, **every native comparison also finalizes analytical and numerical Jacobians at the identical winning optimizer coordinates**, using the same original parameter scales. All these checks passed: the maximum relative parameter-std difference was **1.75e-6**, and maximum relative intensity-fraction-std difference was **1.90e-7**. The largest relative parameter-std difference among equivalent-minimum browser results was **1.10e-5** (0.0011%), comfortably within the 0.01% relative gate.

Rank-deficient area allocations are not individually compared when they have no identifiable std; objectives, curves, rank and unavailable std remain checked. Native explicit numerical overrides reproduce the frozen numerical results exactly, apart from their explicit method marker.

## Evidence and reproduction

- `analytical-default-baseline-provenance.json`: snapshot immediately before this default/initialization change, including the optional-analytical binary/WASM.
- `analytical-baseline-provenance.json`: the frozen numerical baseline used by these benchmarks, archived before the original analytical implementation.
- `analytical-default-native.json`, `analytical-default-informed.json`, `analytical-default-search.json`, `analytical-default-search12.json`: input projects, full fitted outputs, paired timing samples, source/binary hashes and separate same-coordinate uncertainty checks.
- `analytical-default-browser.json`: production-worker outputs, paired samples, actual execution settings and final WASM hash.
- `analytical-default-verification.json`: final source/artifact hashes and verification counts.

Runtime archives are ignored under `validation-data/performance/runtime/analytical/` and `runtime/analytical-default/`. Reproduction requires the frozen numerical baseline archive.

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-analytical-default.mjs --repeats 5
node --import tsx scripts/benchmark-analytical-default.mjs --repeats 5 --informed
node --import tsx scripts/benchmark-analytical-default.mjs --repeats 3 --search
node --import tsx scripts/benchmark-analytical-default.mjs --repeats 3 --search --starts 12 --case 30-70 --output validation-data/performance/analytical-default-search12.json
node scripts/benchmark-analytical-default-browser.mjs --repeats 3 --playwright-module /path/to/playwright-core/index.mjs
```

Verification passed: **49 Rust**, **100 JS/WASM**, **273 TypeScript/React**, and **12 native integration tests**; TypeScript compilation, desktop Rust check, formatting, and desktop/manual production build. The desktop payload and 1,374 manual links were checked. Focused tests cover deterministic separation, common bounds, fixed/shared geometry, original project/scales, exact-fit protection, short-fit objective retention, rank-deficient std, direct/checkpointed/callback paths and eager/deferred finalization.

Changes remain local; no release, installation or publication was performed.

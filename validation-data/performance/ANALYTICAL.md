# Analytical derivatives for thin models

> Historical opt-in benchmark. Analytical derivatives are now the default for supported thin models, with explicit coincidence handling. See [the current default benchmark](ANALYTICAL-DEFAULT.md).

Implemented November 8, 2026. Select **Fit options → Derivatives → Analytical · thin models**. This is opt-in; numerical derivatives remain the default.

Exact residual Jacobians cover ordinary thin singlets, doublets and sextets, all four profiles (Lorentzian, Gaussian, pseudo-Voigt, Lorentzian squared), polynomial backgrounds, unweighted/count-weighted residuals, both nuclear-constant conventions, and proportional parameter links. The chain rule includes root-parameter scales and all linked contributions. The forward spectrum calculation is unchanged. Covariance, parameter std and intensity-fraction std use the selected Jacobian at finalization, including deferred multistart finalization.

Transmission, source calibration, and any model containing an xVBF distribution retain numerical derivatives. An analytical matrix with nonfinite entries also falls back to numerical derivatives. Supported analytical fits bypass derivative worker pools. Cancellation, progress, bounds, fixed parameters, project saving and continuation retain their existing paths.

## Whole-fit timings

Paired, alternating wall times include native JSON transport or the production browser Engine/Worker path. Each method has an excluded warmup. Native single fits use five pairs; native four-start searches and browser fits use three. No builds or other tests overlapped timing measurements. Native numerical fits use their existing Auto parallelism. Browser comparisons distinguish the usual single-worker path from forced four-worker finite differences. Native and browser timings were collected separately.

| Native case | Numerical | Analytical | Outcome |
| --- | ---: | ---: | --- |
| Thin control | 4.70 ms | 4.31 ms | Equivalent minimum/std |
| 30:70 measured mixture, informed start | 42.53 ms | 40.70 ms | Equivalent minimum/std |
| 70:30 measured mixture, informed start | 237.73 ms | 223.93 ms | Equivalent minimum/std |
| 50:50 measured mixture, informed start | 88.47 ms | 81.11 ms | Equivalent minimum/std |
| Mexican magnetite, informed start | 127.25 ms | 109.92 ms | Equivalent minimum/std |
| 30:70 coarse start, four full starts | 331.83 ms | 1196.62 ms | Equivalent best minimum/std, slower search |
| Mexican magnetite, four full starts | 702.31 ms | 684.08 ms | Equivalent best minimum/std |
| Linked mixed sites, four full starts | 60.72 ms | 55.96 ms | Equivalent best minimum/std |

Across matching native single-fit cases, the median speed ratio was approximately **1.10×**, with **1.05–1.16×** on the four informed measured starts. Usual single-worker browser fits/searches improved **1.03–1.09×** across the two tested models, both browsers and portable/shared contexts. The ~2× browser gains against forced message-only four-worker differences reflect avoiding that path's overhead; Auto already keeps these thin fits serial.

These are modest overall gains because linear algebra, forward evaluations and finalization still cost time. They are not a universal speedup.

## Minima and uncertainty checks

Twenty single-fit cases include the twelve site/profile combinations, four coarse measured starts, a thin control, linked mixed sites, an active bound and a rank-deficient area split. Eighteen passed the same-or-better minimum checks. Four additional informed measured starts all passed. All six four-start searches (three models × full/selective) passed. All 32 browser comparisons passed.

Two **single coarse starts reached worse minima**:

- 30:70 mixture: numerical objective 228,265,563; analytical 856,723,627.
- 50:50 mixture: numerical objective 6,838,025,322; analytical 10,718,301,907.

The 70:30 coarse start improved from 7,323,296,299 to 3,911,720,305. These basin changes are not included in same-minimum parameter/std comparisons. The coarse mixtures start with coincident sextet components and an initially singular Jacobian. Independent five-point checks pass for that starting geometry. Exact versus finite-difference derivatives can lead the solver along different paths through this degeneracy; the observed basin changes preclude making analytical derivatives the default. In the tested 30:70 four-start search, the best minimum was recovered but the analytical search took ~3.6× as long.

Quality gates, defined in `scripts/analytical-validation.mjs`, require objective degradation no larger than max(1e-7, 1e-8 × reference objective), matching rank, and, for equivalent minima:

- Curve RMS difference ≤ max(1e-7, .001 × reference residual RMS).
- Matching availability of std, with std difference ≤ 1e-10 + 1e-4 × reference std.
- Identifiable parameter difference ≤ 1e-7 × max(1, |value|) + .001 × reference std.

Unidentifiable parameter allocations in rank-deficient fits are not individually compared; their curves, objectives, rank and unavailable std are checked. The largest recorded relative std difference among same-minimum comparisons was **2.86e-6** (0.000286%). Existing numerical-mode outputs remained exactly equal to the frozen pre-change native/WASM reference in the benchmark comparisons.

## Evidence and reproduction

- `analytical-baseline-provenance.json`: hashes of the archived pre-change native binary, WASM module/binary and search wrapper.
- `analytical-native.json`: twenty native single fits, five paired timings.
- `analytical-informed.json`: four informed measured fits, five paired timings. Starts are the numerical coarse-fit solutions perturbed by +.01 mm/s CS, ×1.03 FWHM, ×.98 intensity and +.1 T BHF.
- `analytical-search.json`: six native four-start searches, three paired timings.
- `analytical-browser.json`: 32 actual production worker comparisons in Chromium/WebKit, with/without shared memory, requested workers 1/4 and starts 1/4.

Runtime artifacts are ignored under `validation-data/performance/runtime/analytical/`. Keep the baseline archive to reproduce these comparisons; the receipts retain full fitted results and timing samples. Rebuild the current native fixture and WASM before rerunning:

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-analytical-derivatives.mjs --repeats 5
node --import tsx scripts/benchmark-analytical-derivatives.mjs --repeats 5 --informed
node --import tsx scripts/benchmark-analytical-derivatives.mjs --repeats 3 --search
node scripts/benchmark-analytical-browser.mjs --repeats 3 --playwright-module /path/to/playwright-core/index.mjs
```

The broad coarse-start benchmark intentionally exits nonzero when its quality gates fail; the receipt records these limitations. Do not treat it as an all-cases approval for the analytical option.

Independent derivative tests cover profile/width/mixing extremes, zero intensity, linked roots, mixed sites, count weighting, backgrounds, nuclear constants and coincident sextets. Covariance and fraction std are also checked at identical physical points to separate derivative accuracy from changes in optimizer trajectory. WASM tests cover direct/checkpointed/callback fits, eager/deferred full/selective searches, fixed/iteration-limited/recovery fits, invalid methods and exact unsupported-model fallbacks. Native integration checks browser agreement and actual worker bypass. UI/session/project tests cover selection, saving and stop/keep behavior.

Final verification passed: full `npm test` (44 Rust tests, the complete JS/WASM suite, and 273 TypeScript/React tests), 11 native integration tests, TypeScript compilation, desktop Rust check, and desktop/manual production build with 1,374 local manual links checked. The benchmark binary remained byte-identical after the final rebuild. No app release, installation or publication was performed.

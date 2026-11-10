# Profile dispatch, SVD norm caching, and deferred search uncertainties

November 8, 2026. These changes build on the native parallel-derivative implementation. The baseline already uses automatic native parallel derivatives; the improvements below are additional gains.

## Changes

1. **Cached profile dispatch.** Resolve Gaussian/PseudoVoigt/LorSquared/Lorentzian once when preparing each ordinary site curve, then use a small enum inside the integration loop. The existing public string-based profile helper remains compatible. Formulae, literal constants, line order, and floating-point summation order are unchanged.
2. **Exact SVD column-norm caching.** Basin's portable Jacobi SVD reuses a norm only while its column is unchanged. Every rotation invalidates both affected columns. A cache miss uses the original ordered `hypot` fold; there are no approximate norm updates, tolerance changes, or alternative decompositions. The same final normalization can reuse an unchanged column norm. Basin 3.2.0 is vendored under `rust-core/vendor/basin`; the shared Cargo registry and other projects are untouched. Upstream licenses, origin hashes, the local solver patch, and a frozen reference implementation are retained. License generators include the vendored dependency.
3. **One final uncertainty calculation per search.** Multistart trials return their fitted project, evaluation, convergence/termination/iteration metadata, and an internal finalization payload, without calculating rank, stationarity, covariance or derived std. Search generation, candidate scoring, pruning, failures, tie handling, and iteration budgets use the same quantities as before. After selection, the winning result receives complete diagnostics and std exactly once. Single-start and dedicated source-calibration fits retain their normal complete output.

The finalization payload retains the **original prepared model and optimizer coordinates**. Rebuilding from fitted parameters would change parameter scales and finite-difference steps, so that shortcut is deliberately avoided. Native finalization reuses the native derivative pool; browser finalization prepares its helpers with the original winning model and supplies the ordered derivative columns. The selected result retains its original solver termination and iterations; the optimizer is not restarted.

Trial results have a distinct internal shape with no fabricated std or rank. They cannot be returned as completed search results or saved. The search wrapper verifies that finalization returns a complete result without changing the selected objective, termination, convergence or iteration count. Invalid finalization state, finalization failure, and cancellation reject the operation. Stop & keep continues to retain progress without pairing it with stale std. RPC controls and finalization payloads are absent from completed results, autosave and portable files. Legacy local-fit callbacks that return complete results remain supported.

The native engine, native model-comparison driver, browser worker, and browser comparison worker use this path. Statistical comparisons retain full search exploration and their existing single derivative worker per concurrent native fit; only unneeded per-start uncertainty work is deferred.

## Reference and method

The release native fixture, scalar WASM binary/module, and ordered search wrapper were frozen before these changes in `validation-data/performance/runtime/remaining-work/baseline`. [remaining-work-baseline-provenance.json](remaining-work-baseline-provenance.json) records the original hashes. Intermediate release native binaries isolate profile dispatch and then SVD caching. The final receipts record all measured binary/source/input hashes.

The single-fit benchmark uses the same 24 native cases as the preceding derivative study: frozen synthetic/control/measured spectra, both source shapes, mixed absorber profiles, fixed and fitted Gaussian sources, linked parameters, an active bound, xVBF/dependent-weight std, all-fixed parameters, iteration limits, rank deficiency, bounded LM, and four coarse-start thin models. Each of three optimized stages is compared with the pre-change **Auto-native** fitter using three paired samples in alternating order and an excluded warmup. Every complete output must equal the frozen native reference exactly.

The search benchmark uses full and selective twelve-start searches for measured magnetite, a three-site squared-source model, and a singlet. It compares the new core with eager diagnostics against the same core with deferred diagnostics, each paired with the frozen pre-change fitter. Each row uses five pairs and an excluded warmup. Times include native JSON transport, candidate validation, search logic, and complete selected-fit uncertainties; they exclude rendering and progress publishing. The stages have separate paired baseline measurements, so small timing differences between stages should not be treated as independent speedups.

## Results

**All 72 single-fit case/stage comparisons and all 12 complete search comparisons retain exactly the same selected results, std and std availability, curves, objectives, rank, stationarity, warnings, solver iterations/termination, and search diagnostics.** Each deferred twelve-start search performs 12 lightweight local fits and exactly one finalization. No infrastructure fallback occurred.

For the final single-fit stage, summing per-case medians gives **1643.02 → 1162.82 ms**, a **1.41× speedup / 29.2% reduction** for this case mix. These are measurements of this machine and suite, not a universal workload estimate.

### Single fits by stage

| Case | Profile only | + SVD cache | Final core | Final before → after (ms) |
| --- | ---: | ---: | ---: | ---: |
| singlet-lorentzian-source | 1.01× | 1.09× | 1.10× | 5.77 → 5.27 |
| three-sites-lorentzian-source | 1.15× | 1.37× | 1.37× | 31.78 → 23.27 |
| singlet-squared-source | 0.99× | 1.07× | 1.08× | 5.64 → 5.24 |
| three-sites-squared-source | 1.17× | 1.38× | 1.39× | 32.24 → 23.26 |
| mixed-absorber-profiles-counts | 1.03× | 1.22× | 1.17× | 35.19 → 30.11 |
| asymmetric-gaussian-source | 1.04× | 1.15× | 1.15× | 6.38 → 5.55 |
| xvbf-transmission | 0.97× | 1.10× | 1.07× | 12.59 → 11.74 |
| linked-parameters | 1.02× | 1.12× | 1.14× | 9.38 → 8.25 |
| active-width-bound | 1.03× | 1.08× | 1.08× | 15.52 → 14.36 |
| thin-control | 1.08× | 1.65× | 1.64× | 6.72 → 4.09 |
| source-calibration-lorentzian | 0.99× | 1.09× | 1.10× | 7.64 → 6.94 |
| source-calibration-squared | 1.00× | 1.08× | 1.08× | 7.64 → 7.10 |
| MS_Fe2O3_transmission | 1.14× | 1.32× | 1.30× | 10.67 → 8.23 |
| MS_MexicanMagnetite_transmission | 1.13× | 1.46× | 1.49× | 141.74 → 95.32 |
| fitted-gaussian-source | 1.01× | 1.11× | 1.12× | 14.00 → 12.51 |
| dependent-xvbf-weight-std | 1.00× | 1.10× | 1.09× | 28.29 → 25.97 |
| iteration-limit | 1.21× | 1.32× | 1.30× | 9.50 → 7.29 |
| all-fixed | 1.14× | 1.17× | 1.02× | 0.73 → 0.72 |
| rank-deficient-intensities | 1.12× | 1.17× | 1.28× | 0.81 → 0.64 |
| bounded-lm-recovery | 1.33× | 1.32× | 1.34× | 22.84 → 17.03 |
| MS_Fe2O3-Fe3O4_30-70_coarse | 1.00× | 1.49× | 1.49× | 143.12 → 96.00 |
| MS-Fe2O3-Fe3O4_70-30_coarse | 1.02× | 1.43× | 1.42× | 760.02 → 534.35 |
| MS_Fe2O3-Fe3O4_50-50_coarse | 1.02× | 1.50× | 1.49× | 143.94 → 96.33 |
| MS_MexicanMagnetite_coarse | 1.01× | 1.55× | 1.55× | 190.85 → 123.24 |

The profile change mainly benefits transmission evaluations. Norm caching provides the larger gain for the coarse thin models that previously benefited only slightly from parallel derivatives. A single fit does not defer uncertainties, so its final-core timing should be close to the preceding stage; small differences include ordinary timing variation and the refactored RPC path.

### Complete twelve-start searches

| Case | Diagnostics | Paired baseline (ms) | Optimized (ms) | Speedup | Deferred fits / finalizations |
| --- | --- | ---: | ---: | ---: | ---: |
| MS_MexicanMagnetite_transmission_full_12 | eager | 4192.45 | 2853.99 | 1.47× | 0 / 0 |
| MS_MexicanMagnetite_transmission_full_12 | deferred | 4270.55 | 2929.01 | 1.46× | 12 / 1 |
| MS_MexicanMagnetite_transmission_selective_12 | eager | 3033.31 | 2092.91 | 1.45× | 0 / 0 |
| MS_MexicanMagnetite_transmission_selective_12 | deferred | 3080.56 | 2124.30 | 1.45× | 12 / 1 |
| three-sites-squared-source_full_12 | eager | 591.84 | 426.20 | 1.39× | 0 / 0 |
| three-sites-squared-source_full_12 | deferred | 592.57 | 410.95 | 1.44× | 12 / 1 |
| three-sites-squared-source_selective_12 | eager | 604.05 | 437.23 | 1.38× | 0 / 0 |
| three-sites-squared-source_selective_12 | deferred | 593.84 | 413.00 | 1.44× | 12 / 1 |
| singlet-lorentzian-source_full_12 | eager | 101.70 | 93.04 | 1.09× | 0 / 0 |
| singlet-lorentzian-source_full_12 | deferred | 96.69 | 83.44 | 1.16× | 12 / 1 |
| singlet-lorentzian-source_selective_12 | eager | 94.78 | 88.48 | 1.07× | 0 / 0 |
| singlet-lorentzian-source_selective_12 | deferred | 94.72 | 82.50 | 1.15× | 12 / 1 |

The complete magnetite searches take about 30% less time than the already-parallel baseline. Deferral itself has no clearly measurable additional benefit on that long case. It helps the shorter singlet/three-site searches more: their optimized medians fall by roughly 4–10% versus eager diagnostics, with some baseline drift between rows. The code and receipts retain that distinction rather than attributing the entire improvement to deferred uncertainties.

[Single-fit stage receipt](remaining-work-stages.json), [complete-search receipt](remaining-work-multistart.json).

## Browser and regression validation

Actual production Engine/Worker bundles pass **32 complete four-start search comparisons** against the frozen pre-change scalar WASM/search implementation: four models × serial/four workers × WebKit/Chromium × message/shared-memory transports. The models include an active bound, linked parameters, xVBF and a three-site squared source. Complete output/std equality is required, and infrastructure fallback is rejected. These runs check correctness, not performance; they overlapped other validation work. Receipts: [message transport](remaining-browser-portable.json), [shared transport](remaining-browser-shared.json).

- Rust core: **38 tests passed**, including 13 cached/frozen SVD tests. The new factor/step parity test covers 120 matrix/scale combinations, including orthogonal, rank-deficient and dense matrices at scales 1, 1e150 and 1e-150. It compares U, V, singular values and trust-region steps with the frozen implementation.
- JavaScript/WASM: **93 unique tests passed** across the full run and the subsequent fitted-Gaussian/dependent-weight round-trip check. All 14 frozen scalar fit results remain exact. Deferred tests cover both source shapes, original scaling, checkpoint/shared-column paths, full/selective searches, bounded LM, all-fixed and iteration-limited fits, invalid state, failed finalization, stale controls and single-start behavior.
- TypeScript/React: **271 tests passed**, including persistence of selected results/std with no internal finalization data.
- Native adapter/core integration: **10 tests passed**, including eager/deferred whole-result equality, exactly one finalization, cancellation during finalization, worker overrides/reuse, and full model comparisons without nested derivative parallelism.
- Native desktop `cargo check`, TypeScript compilation, Rust formatting and desktop/manual production build passed. The payload verifies 284 files / 365 local references, and all 1,374 local manual links pass. Vendored Basin remains included in dependency/license notices.

## Reproduce

The frozen binaries are local ignored build artifacts. With those references present:

```sh
node --import tsx scripts/benchmark-remaining-work.mjs --repeats 3 --output validation-data/performance/remaining-work-stages.json
node --import tsx scripts/benchmark-remaining-work.mjs --multistart --repeats 5 --stages eager,deferred --output validation-data/performance/remaining-work-multistart.json
npm test
node scripts/test-native.mjs
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run build:desktop:web
```

For browser checks, use `scripts/benchmark-parallel-derivatives.mjs --search-starts 4 --workers 1,4 --repetitions 1 --cases three-sites-squared-source,linked-parameters,xvbf-transmission,active-width-bound`, with a matching installed Playwright module and browser binaries. Repeat with `--shared`. The test derives complete reference searches from the archived scalar WASM and search wrapper. Portable and shared builds use separate client directories.

All changes remain local; no release, publication, or application installation was performed.

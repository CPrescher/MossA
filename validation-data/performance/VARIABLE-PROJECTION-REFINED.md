# Refining variable-projection continuation

November 8, 2026. Follow-up to the [first continuation criterion](VARIABLE-PROJECTION-MULTISTART.md). The refined rule preserves the magnetite benefit and avoids all twelve 70/30 mixture continuation switches in the measured full search. These measurements preceded the default-selection change. Variable projection is now the default for thin analytical fits, and joint fitting remains selectable. The [default verification receipt](variable-projection-default-verification.json) checks that default fits exactly reproduce the qualified opt-in implementation.

## Criterion and evidence

The previous rule used two 16-step objective averages. Similar averages can conceal uneven steps or steady directional progress. For the mixture, its switches at iterations 169, 71, 102 and 56 were not a reliable indication that the joint solver would be faster.

The refined rule retains the existing history, minimum-iteration, remaining-budget and selective-screening safeguards, and adds a geometric check in the **original normalized full parameter coordinates**, including the eliminated coefficients:

1. Over each of two consecutive 16-step windows, relative objective decrease must be at most 0.2%, with the recent rate between 0.8 and 1.25 times the previous rate.
2. Require at least **0.01%** decrease in the recent window, rather than 0.0001%. Small changes near the numerical convergence scale no longer trigger continuation.
3. Over the full 32-step history, require net parameter displacement to be no more than **half the total distance traveled**. This targets costly reversals in the full model rather than a slow but directional path.

At least 48 projected iterations and 16 remaining iterations are still required. Existing selective screening takes precedence. No full-search trial is pruned by the continuation mechanism. It still transfers all original coordinates, scales, bounds, links, weighting, solver tolerances and the remaining iteration budget, and retains the better incumbent if continuation fails to improve it. Full-coordinate covariance calculation is unchanged.

The full-coordinate geometry matters: eliminated intensities can oscillate while nonlinear parameters drift, so checking nonlinear displacement alone misses the coupling that joint continuation can resolve. The tracking history is bounded to 32 stored points after each check. Point reconstruction uses the existing projection cache; no extra Jacobian, speculative fit or derivative worker is required. A point-reconstruction failure leaves the original solver fallback handling in control.

Frozen trajectories explain the separation. The slow magnetite trial first satisfies the refined rule at total iteration **88**, compared with 75 under the previous rule. It then finishes in **154 iterations**, compared with 140 under the previous criterion and 472 without continuation. All four magnetite starts are retained in the individual-start audit. In the mixture, the short near-convergence plateaus fail the progress floor; the substantial slow trajectory has net displacement at least approximately 73% of its travel at candidate switches, so it fails the backtracking requirement. All twelve mixture starts follow their original paths exactly, including the two that use the full iteration budget.

These are general progress/geometry tests, with no spectrum names, site identities or start numbers in the production criterion. The thresholds are empirical safeguards, not a global-minimum or universal runtime guarantee.

## Measurement method

Native receipts use **five alternating paired samples per case**, following excluded warmups, for four modes in one run: original variable projection without continuation, the previous continuation rule, the refined rule, and the frozen joint solver. Timings include transport, all requested starts, screening, and full uncertainty finalization. Every sample must reproduce its mode's complete result exactly. The current explicit joint path must reproduce the frozen joint reference exactly. Builds/tests and browser measurements do not overlap native timings.

The native suite covers 31 single fits, eight four-start searches, and four twelve-start searches. The browser suite uses the production Engine/Worker path in WebKit and Chromium with ordinary portable hosting, verified frozen/improved WASM artifacts, three paired samples, and no derivative helper workers or fallback transport. Browser comparisons use original projection and the refined rule, with the frozen joint solver as a control. Native receipts additionally measure the prior continuation rule directly.

## Measured results

| Native full search | Original projection | Previous criterion | Refined criterion | Change vs original |
| --- | ---: | ---: | ---: | ---: |
| 70/30 mixture, 4 starts | 635.9 ms | 637.0 ms | 634.7 ms | -0.2% |
| Magnetite, 4 starts | 995.9 ms | 552.4 ms | 576.9 ms | -42.1% |
| Magnetite, 12 starts | 1611.0 ms | 1294.3 ms | 1248.9 ms | -22.5% |
| 70/30 mixture, 12 starts | 3358.8 ms | 4069.2 ms | 3470.5 ms | +3.3% |

The native magnetite improvement is **42% with four starts and 22% with twelve** relative to original projection. Compared directly with the previous criterion, the refined rule is 4% slower in the four-start case and 4% faster in the twelve-start batch; those measurements include appreciable runtime variation. The more selective guard preserves the large original-projection speed benefit.

The full four-start mixture is back at original speed. In the twelve-start batch, the separate timing medians differ by +3.3%, while the median of within-pair refined/original ratios differs by only +0.2%. Individual samples range from 3.32–3.62 s for original projection and 3.33–4.16 s for the refined rule. The prior criterion takes 4.07 s at its median, versus 3.47 s for the refined rule. All raw samples are retained; a dedicated repeat below measures this case with nine more pairs. Selective mixture timings remain essentially unchanged.

| Browser, full four-start search | Original projection | Refined criterion | Change |
| --- | ---: | ---: | ---: |
| webkit, 70/30 mixture | 2193.0 ms | 2225.0 ms | +1.5% |
| webkit, magnetite | 3678.0 ms | 2147.0 ms | -41.6% |
| chromium, 70/30 mixture | 2447.7 ms | 2295.6 ms | -6.2% |
| chromium, magnetite | 3900.8 ms | 2244.6 ms | -42.5% |

Both browsers retain a **42–43%** magnetite speedup. Short single-fit millisecond timings vary; the browser mixture results show no material regression in this run. No universal absence of tracking overhead is claimed.

## Focused longest-mixture repeat

Nine additional alternating pairs, following excluded warmups and with no concurrent browser/build/test run, measured the full twelve-start mixture at **3.454 s original versus 3.459 s refined**: +0.17% by separate wall-time medians. The median within-pair ratio is -0.37%. Summed native compute medians differ by +0.36%, with median paired ratio -0.38%. These differences are small relative to observed run variability. The earlier large mixture regression is absent; a claim of exactly zero runtime overhead is not warranted. Every sample reproduces the complete original winning fit, including all search diagnostics and uncertainties, exactly.

## Scientific validation

**All 43 native and 18 browser winning evaluations, parameter std and fraction std are bit-for-bit unchanged against both original projection and, for native runs, the previous criterion.** All sixteen individual-start minimum/std audits pass; every mixture local fit and finalized uncertainty is exact. The continued losing magnetite trial has maximum relative std difference 1.366e-6 (0.000137%) and fraction std difference 1.133e-6. Same-coordinate full analytical finalization is exact.

The original fixed gates remain: objective within max(1e-7, 1e-8 × reference objective), curves within 0.001 residual RMS (1e-7 absolute floor), std within 1e-4 relative + 1e-10, and the original parameter-distance and rank criteria. Free-parameter counts, degrees of freedom, error schemas and uncertainty availability must match. Raw termination codes and warnings are retained. Existing convergence acceptance is unchanged.

Before/after comparisons retain original site labels. The separate joint comparison in twelve-start magnetite still accounts for its pre-existing permutation of equivalent unlinked sextets, with the raw comparison and permutation recorded. No production relabeling is performed and no matching tolerance is relaxed.

Every native case also finalizes at identical original optimizer coordinates with the frozen and current analytical implementations and with numerical derivatives. A separate audit refits all four magnetite and twelve mixture input trials with both native binaries and finalizes each local minimum independently. It also verifies that the diagnostic mixture fits reproduce the uninstrumented original binary. Profiling clocks/traces come only from a separate diagnostic build and are excluded from speed claims.

Regression checks: **78 Rust tests, five profiling-feature continuation checks, 168 JavaScript/WASM tests, and 16 native transport/integration tests**. New tests reject straight slow motion and tiny-progress oscillations, and replay the frozen full magnetite/twelve-mixture trajectories. Existing checks cover original scales/bounds/budget, incumbent retention, native/WASM checkpoint and callback equivalence, deferred covariance and cancellation at the actual handoff. TypeScript compilation, desktop/manual payload verification, 1,374 local manual links, and desktop Cargo check are included in the build receipts.

## Reproduction and receipts

The ignored runtime archive `runtime/variable-projection-refined/` contains `baseline` (original projection), `previous` (first continuation rule) and `improved` (refined rule). The previous implementation was verified against the preceding task's final receipt before freezing. Preserve these archives to reproduce paired comparisons. The diagnostic source is a separate copy of that previous implementation, built with `projection-profile` and only the minimum continuation iteration changed to `u64::MAX` to collect uninterrupted projected trajectories. Diagnostic provenance and exact per-trial comparisons are retained.

```sh
cargo test --locked --manifest-path rust-core/Cargo.toml
cargo test --locked --manifest-path rust-core/Cargo.toml --features projection-profile --lib continuation
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --test tests/*.test.mjs
node scripts/test-native.mjs
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --stage variable-projection-refined --repeats 5
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --stage variable-projection-refined --search --repeats 5
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --stage variable-projection-refined --search --starts 12 --case Magnetite --repeats 5 --output validation-data/performance/variable-projection-refined-search12-magnetite.json
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --stage variable-projection-refined --search --starts 12 --case _70-30 --repeats 5 --output validation-data/performance/variable-projection-refined-search12-mixture.json
node --import tsx scripts/profile-variable-projection-search.mjs --changed --output validation-data/performance/variable-projection-refined-trials-final.json
node --import tsx scripts/profile-variable-projection-search.mjs --changed --case MS-Fe2O3-Fe3O4_70-30_coarse-full --starts 12 --output validation-data/performance/variable-projection-refined-mixture-trials-final.json
node --import tsx scripts/audit-variable-projection-refined-trials.mjs
node scripts/benchmark-variable-projection-multistart-browser.mjs --runtime validation-data/performance/runtime/variable-projection-refined --output validation-data/performance/variable-projection-refined-browser.json
node --import tsx scripts/benchmark-variable-projection-refined-repeat.mjs
node --import tsx scripts/verify-variable-projection-refined.mjs
```

`--stage variable-projection-refined` selects these original/previous native archives by default; `--runtime`, `--reference`, `--previous`, and `--current` can override them. JSON receipts with the `variable-projection-refined-` prefix retain all timings, raw results and source/binary hashes. The independent `variable-projection-refined-verification.json` rechecks these results, the 16 individual-start audits, unchanged forward evaluations, artifact hashes and final test/build logs.

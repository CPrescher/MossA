# Variable-projection multistart continuation

November 8, 2026. Follow-up to [bounded variable projection](VARIABLE-PROJECTION.md). This change improves the full magnetite search while retaining the opt-in variable-projection setting. Joint fitting remains the default. Results below compare the frozen previous variable-projection implementation, the frozen joint solver, and the improved implementation using identical projects and candidate policies.

> Follow-up: [refined continuation](VARIABLE-PROJECTION-REFINED.md) adds a scaled full-coordinate backtracking guard and a progress floor. It keeps the magnetite gain and avoids all twelve measured mixture switches. The historical measurements below remain unchanged.

## Cause and change

One losing start dominates the four-start magnetite search: it takes **472 iterations**, versus 43, 42 and 25 for the other starts. The winner is the fourth start. The diagnostic build records zero numerical derivative columns and zero weak reduced Jacobians for the slow start. Its coefficient QR solves account for approximately 2.1 ms, projected point evaluations 9.5 ms, and reduced Jacobians 37.7 ms of its approximately 703 ms diagnostic fit. These nested counters are diagnostic rather than additive performance measurements. The problem is the long optimizer trajectory, rather than an expensive coefficient solve or derivative fallback.

The reduced objective improves slowly at a roughly constant rate for hundreds of iterations. Eliminating linear parameters changes the nonlinear objective geometry and trust-region steps; a smaller parameter space need not converge in fewer iterations. Selective exploration already screens out this losing trial at iteration 64. Full exploration deliberately completes it.

A shared native/WASM policy now detects a sustained crawl and **continues the same trial with the full-coordinate joint solver**:

- Require at least 48 projected iterations and two successive 16-step objective windows.
- Require each window's relative decrease to be at most 0.2%, with the recent rate between 0.8 and 1.25 times the earlier rate and at least 1e-6. A rapidly decaying rate is ordinary convergence and does not trigger this rule.
- Require at least 16 iterations remaining in the original budget. Defer a switch immediately before an existing selective screening checkpoint; screening takes precedence.
- Reconstruct all original parameters and retain the original scales, bounds, links, weighting, solver tolerances and remaining total budget. Start a fresh trust region in those coordinates. Allow only one continuation and retain the handoff incumbent if continuation would worsen it.

No full-search trial is pruned by this change. The earlier eight-iteration joint warmup for crowded starts remains. The same policy is used by uninterrupted fitting, progress callbacks and checkpoint sessions; iteration counts and elapsed time span both phases. Cancellation remains effective at the handoff. Profiling clocks and traces require the nondefault `projection-profile` Cargo feature and are compiled out of ordinary native/WASM builds.

The magnetite handoff occurs at total iteration 75; the trial finishes at **140 rather than 472 iterations**. Its objective changes from 4288722689.531695 to 4288722689.023366, within the existing same-minimum tolerance. Maximum parameter std difference is 1.135e-5 relative (0.00114%); maximum fraction std difference is 6.697e-6 relative. All four individual starts pass the original minimum/std checks. Full covariance recomputed at identical original coordinates is bit-for-bit unchanged.

## Native measurements

Measured on the machine and Node version recorded in the receipts. Each single fit uses five alternating paired samples; each search uses three, following excluded warmups. All timings include native transport, all starts and uncertainty finalization. Builds/tests and browser timings did not overlap these timing runs. These are medians, not performance guarantees.

| Search | Previous projection | Joint | Improved projection | Before/after speedup |
| --- | ---: | ---: | ---: | ---: |
| 30/70 mixture, full, 4 starts | 198.5 ms | 271.1 ms | 197.9 ms | 1.00× |
| 30/70 mixture, selective, 4 starts | 195.0 ms | 264.4 ms | 193.1 ms | 1.01× |
| 70/30 mixture, full, 4 starts | 616.2 ms | 1645.1 ms | 682.8 ms | 0.90× |
| 70/30 mixture, selective, 4 starts | 397.5 ms | 616.2 ms | 394.4 ms | 1.01× |
| Magnetite, full, 4 starts | 1009.9 ms | 687.6 ms | 583.7 ms | 1.73× |
| Magnetite, selective, 4 starts | 338.4 ms | 679.0 ms | 342.6 ms | 0.99× |
| xVBF mixture, full, 4 starts | 12.9 ms | 29.8 ms | 13.4 ms | 0.96× |
| xVBF mixture, selective, 4 starts | 13.2 ms | 29.4 ms | 13.0 ms | 1.01× |
| Magnetite, full, 12 starts | 1555.6 ms | 2108.4 ms | 1105.4 ms | 1.41× |
| Magnetite, selective, 12 starts | 846.2 ms | 1801.6 ms | 884.0 ms | 0.96× |
| 70/30 mixture, full, 12 starts | 3607.8 ms | 6409.6 ms | 4240.6 ms | 0.85× |
| 70/30 mixture, selective, 12 starts | 1186.5 ms | 1850.6 ms | 1177.4 ms | 1.01× |

The four-start full magnetite search improves by **42%** (1.73×); the 12-start full search improves by **29%** (1.41×). The improved four-start search also beats the joint reference by 15%. Selective magnetite already avoids the long trajectory and receives no systematic benefit.

This is a workload-dependent tradeoff. In this batch the full 70/30 mixture is **11% slower with four starts and 18% slower with twelve**, despite identical winning fit results. Several losing mixture starts also meet the general crawl criterion, and joint continuation is less effective there. The more permissive initial policies produced much larger mixture regressions; the steady-rate test avoids those early switches but does not guarantee a speedup on every trial. The separate repeat receipt below measures the four-start tradeoff again. Joint fitting remains selectable and remains the default.

A separate five-pair repeat of the four-start 70/30 search measured 626.4 → 637.8 ms (1.8% slower) for full exploration, and 401.6 → 399.8 ms for selective exploration. The three-pair batch varies more, so neither a universal speedup nor an absence of regression is supported. Both receipts are retained. The 31 single-fit cases preserve their optimization results and have no continuation-triggered changes.

## Scientific checks

The primary comparison always uses the original site labels and the original fixed gates: objective within max(1e-7, 1e-8 × reference objective), curves within 0.001 residual RMS (1e-7 absolute floor), std within 1e-4 relative + 1e-10, and original parameter-distance, rank and uncertainty-availability checks. Total free parameters and degrees of freedom must match. No covariance tolerance or convergence criterion was loosened.

Reported uncertainties still come from the full original Jacobian, including eliminated coefficients and their correlations. Every native case also finalizes at identical full optimizer coordinates using the frozen and current analytical implementations and the current numerical Jacobian. Analytical same-coordinate std are exact. The numerical cross-check passes the existing gates.

The 12-start magnetite joint reference uses the opposite labels for two interchangeable sextets compared with **both** the old and improved projection fit. The before/after projection comparison is exact in the original labels. Only the additional joint-versus-projection benchmark comparison aligns equivalent, ordinary unlinked sites with identical constraints; raw comparisons and the permutation `[2, 1, 0]` remain in the receipts. The application never relabels results. Tests reject alignment for changed constraints, links, backgrounds, curves or uncertainty values.

Native regressions: 76 Rust tests, three opt-in profiling-feature continuation tests, 168 JavaScript/WASM tests and 16 native transport/integration tests passed. Coverage includes the frozen losing start, original bounds/scales/budget and incumbent retention, reduced/full checkpoint and callback equivalence, deferred covariance finalization, and cancellation at the actual handoff. The desktop web build (including TypeScript compilation), bundled manual (1,374 checked links), desktop payload verification and desktop Cargo check passed.

## Receipts and reproduction

- `variable-projection-multistart-native.json`: 31 single fits, five pairs.
- `variable-projection-multistart-search.json`: eight four-start full/selective searches, three pairs.
- `variable-projection-multistart-search12-{magnetite,mixture}.json`: four 12-start searches, three pairs.
- `variable-projection-multistart-repeat-mixture.json`: two four-start searches, five additional pairs.
- `variable-projection-multistart-profile.json`: original per-start diagnostic trace and counters.
- `variable-projection-multistart-trials-final.json`: improved per-start native results and four independently finalized local minimum/std audits.
- `variable-projection-multistart-baseline-provenance.json`: hashes of the frozen pre-change artifacts/source.
- `variable-projection-multistart-verification.json`: independent audit of raw fit/error schemas, minima/std, full covariance controls, artifact/source hashes and build/test logs.

The ignored runtime archives under `runtime/variable-projection-multistart/{baseline,improved}` hold the exact native/WASM artifacts; preserve them to reproduce the comparison. Production builds use no profiling feature. The old diagnostic trace is not used for the paired speed claims.

```sh
cargo test --locked --manifest-path rust-core/Cargo.toml
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --test tests/*.test.mjs
node scripts/test-native.mjs
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --repeats 5
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --search --repeats 3
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --search --starts 12 --case Magnetite --repeats 3 --output validation-data/performance/variable-projection-multistart-search12-magnetite.json
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --search --starts 12 --case _70-30 --repeats 3 --output validation-data/performance/variable-projection-multistart-search12-mixture.json
node --import tsx scripts/benchmark-variable-projection-multistart.mjs --search --case _70-30 --repeats 5 --output validation-data/performance/variable-projection-multistart-repeat-mixture.json
node --import tsx scripts/profile-variable-projection-search.mjs --changed --audit-trials --output validation-data/performance/variable-projection-multistart-trials-final.json
node scripts/benchmark-variable-projection-multistart-browser.mjs
node --import tsx scripts/verify-variable-projection-multistart.mjs
```

For diagnostic counters only, build `native_fixture` with `--features projection-profile` into a separate target directory and pass that binary using `--binary` to `profile-variable-projection-search.mjs`. This instrumentation must not be used for production timing.

## Browser measurements and final audit

Both browsers use the production Engine/Worker path on ordinary portable hosting, with the verified frozen and improved WASM archives, one excluded warmup and three alternating pairs per case. No derivative helper workers or infrastructure fallback are used.

| Browser, full four-start search | Previous projection | Joint | Improved projection | Before/after speedup |
| --- | ---: | ---: | ---: | ---: |
| webkit, 70/30 mixture | 2207.0 ms | 5625.0 ms | 2250.0 ms | 0.98× |
| webkit, magnetite | 3563.0 ms | 2481.0 ms | 2013.0 ms | 1.77× |
| chromium, 70/30 mixture | 2236.3 ms | 5669.2 ms | 2320.5 ms | 0.96× |
| chromium, magnetite | 3623.8 ms | 2520.0 ms | 2070.5 ms | 1.75× |

All **45 native comparisons and 18 browser comparisons** pass the fixed minimum/std gates, including exact joint controls. All before/after winning evaluations, full parameter std and fraction std are **bit-for-bit unchanged** in these cases. Four additional individual magnetite-start audits pass; only the continued losing start has small, tolerance-level differences. Rank, free-parameter counts, degrees of freedom and uncertainty availability remain the same. Raw termination codes and warnings remain visible in the receipts; existing stationarity-based acceptance was unchanged. The independent verification receipt records the final hashes and numerical-Jacobian covariance cross-check maxima.

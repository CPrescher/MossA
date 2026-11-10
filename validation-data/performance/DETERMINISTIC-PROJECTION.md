# Deterministic parallel multistart and fused projection products

Implemented and qualified on November 9, 2026. The baseline already includes stable norms and precomputed analytical evaluation from `NORM-PRECOMPUTE.md`.

Parallel search provides the main improvement. In the final native 12-start measurements it reduces time by approximately 9% for the full 70/30 mixture search and 21–24% for magnetite and selective searches. Warm browser searches improve by approximately 7–18%. Fused projection products provide a smaller increment: native timings are approximately neutral, while browser changes are roughly 0–2% faster. No broad single-fit speedup is established.

All 465 scientific comparisons pass: 97 isolated parallel-stage comparisons, 65 product-fusion pilot comparisons, 219 final native comparisons and 84 final browser comparisons. These are repeated pairwise stage comparisons, not 465 distinct models. Parallel search produces bit-for-bit identical complete fit results. Product fusion's largest relative parameter-std difference is 1.204e-13. Full-coordinate covariance at identical coordinates remains exact.

## Stage 1: deterministic parallel multistart

The existing search generates starts 4, 7, 10, ... from the supplied original model rather than the incumbent. One helper lane computes those starts ahead. The ordered generator alone consumes results, updates the incumbent, constructs incumbent-dependent candidates, screens selective trials and selects the winner. Candidate seeds, validation retries, failed-start/rejected-candidate counters, tie breaking, iteration limits, objective thresholds, search diagnostics and final uncertainty evaluation retain their original rules.

Ordered and speculative candidate preparation share one validation generator. Future helper progress is retained as one latest snapshot and becomes visible only when that start reaches its original position. No future fit can replace the displayed incumbent early. Helper failures retry the exact candidate on the main lane; they cannot silently discard a start that would succeed serially. Fatal failures close the speculative lane. Uncertainties are still finalized once, for the selected fit.

Native Engine uses a separate cancelable helper session, bounded to one auxiliary fit with one derivative worker. Eligible searches are analytical thin models with at least four starts on a multicore host. Transmission, source calibration and explicit numerical fits retain their existing execution paths, avoiding additional competition with their derivative pools. Comparison simulations retain their existing outer parallelism and serial inner search driver.

Browser Engine owns one additional whole-fit WASM worker and terminates it with the parent and derivative workers. The protocol works on portable hosting without SharedArrayBuffer. A first automatic four-start search stays serial and warms the helper after publishing its result; subsequent searches can reuse it. Automatic searches of eight or more starts can initialize the helper immediately. An explicit runtime `searchWorkers: 1` retains serial execution; `2` requests the helper for eligible searches. These execution choices are not saved in scientific projects. Native/browser cancellation, stale-worker messages, helper startup/send failures and serial retry are covered by tests.

## Stage 2: fused projection products

The reduced Jacobian previously computed two separate products with the explicit Q of the bounded coefficient solve:

```text
J = J0 - Q (Qᵀ J0) - Q Z,       Z = R⁻ᵀ C
```

It now combines those products on eligible paths:

```text
J = J0 - Q (Qᵀ J0 + Z)
```

Both exact Golub–Pereyra terms remain present, including the residual-dependent correction C with its existing scaling and pivot order. This saves a tall product and temporary result. Eligibility requires at least eight nonlinear coordinates, a smooth analytical Jacobian and no weak coefficient bound. Smaller, nonsmooth and weak-bound models retain the established subtraction order, including the near-roundoff calibration guard. The inner coefficient QR, outer trust-region SVD, bounds, convergence tolerances, continuation rules and final full-Jacobian covariance retain their existing definitions.

A new regression checks the fused reduced Jacobian against independent five-point residual derivatives on a three-doublet model with nine nonlinear coordinates and large structured residuals, for counts and unweighted fitting. It verifies a smooth, non-weak-bound coefficient solution so the new branch is exercised. The existing full residual-dependent-term, linked/bounded, rank-deficient and continuation tests also pass.

## Measurement procedure

Frozen native/WASM artifacts and source snapshots are under `runtime/deterministic-projection/{baseline,parallel,products}/`. The parallel stage uses the exact same native and WASM binaries as the baseline; only search orchestration changes. It was qualified and benchmarked before product fusion was implemented. Source and artifact SHA-256 provenance is recorded separately for each stage.

Native measurements use the archived production Native Engine adapters through the real native session transport. Initial parallel timings use five samples after warmup, or seven for 12 starts. Final three-stage native timings use seven samples per stage, or nine for 12 starts, alternating stage order. They include search orchestration, helper-session overhead and final uncertainty evaluation. No builds, tests or browser timings overlapped these measurements.

Browser timings use production Engine/Worker bundles built from each complete archived source snapshot, with verified WASM hashes. Five samples follow one excluded warmup per stage. One derivative worker per fit and the actual auxiliary search-worker count are checked, with no infrastructure fallback. The benchmark explicitly requests two search workers on eligible optimized stages so helper execution is measured consistently; the serial baseline requests one. Timings describe warm searches. Per-case warmup times are retained; only the first helper-using case includes initial helper startup, so they are not isolated cold-start measurements for every row.

The native suite includes the existing 61 single-fit inputs, eight full/selective four-start searches and four full/selective 12-start thin searches. Inputs cover ordinary profiles, real coarse oxide starts, links, bounds, rank loss, source calibration, xVBF, transmission, explicit joint controls and velocity calibration. Final browsers cover 14 inputs in each of WebKit 27.2 and Chromium, including one/four/12 starts for both oxide models. Times below are medians in milliseconds.

## Isolated parallel-stage results

| Native workload | Serial baseline | Parallel search |
|---|---:|---:|
| Magnetite, 12 starts, full | 122.40 | 97.51 |
| 70/30 mixture, 12 starts, full | 347.13 | 317.98 |
| Magnetite, 12 starts, selective | 104.77 | 80.59 |
| 70/30 mixture, 12 starts, selective | 113.53 | 88.98 |

All 73 isolated native and 24 isolated browser comparisons pass and their complete fit results are exact. The isolated browser suite covers one/four starts; 12-start browser cases were added to the final suite.

## Final native results

| Workload | Baseline | Parallel search | + Fused products |
|---|---:|---:|---:|
| 61 single fits, sum of medians | 243.61 | 245.15 | 243.78 |
| Magnetite, 4 starts, full | 51.14 | 46.23 | 45.84 |
| 70/30 mixture, 4 starts, full | 64.83 | 53.54 | 53.02 |
| Magnetite, 4 starts, selective | 33.63 | 28.95 | 28.85 |
| 70/30 mixture, 4 starts, selective | 42.63 | 31.29 | 30.80 |
| Magnetite, 12 starts, full | 125.13 | 98.52 | 98.50 |
| 70/30 mixture, 12 starts, full | 352.61 | 320.62 | 323.10 |
| Magnetite, 12 starts, selective | 108.47 | 82.97 | 83.27 |
| 70/30 mixture, 12 starts, selective | 116.47 | 90.05 | 91.21 |

The single-fit aggregate is a sum of 61 medians, not one fit. It is approximately unchanged, as expected for search parallelism. Fusion's native changes are small and mixed: roughly 0–2% faster on these four-start searches and approximately neutral to 1% slower on the 12-start searches. It does not establish a consistent native speedup. The raw records retain every sample and the slight regressions.

Unchanged-path transmission controls provide context for timing variation: full four-start ordinary magnetite transmission is 451.48 → 453.04 → 455.75 ms. Neither the helper eligibility rule nor projection-product fusion applies there. Small apparent shifts on those controls are not attributed to the new algorithms.

## Final warm browser results

| Browser / full search | Baseline | Parallel search | + Fused products |
|---|---:|---:|---:|
| WebKit / magnetite, 4 starts | 74.0 | 67.0 | 67.0 |
| WebKit / 70/30 mixture, 4 starts | 93.0 | 78.0 | 77.0 |
| WebKit / magnetite, 12 starts | 239.0 | 207.0 | 206.0 |
| WebKit / 70/30 mixture, 12 starts | 527.0 | 481.0 | 472.0 |
| Chromium / magnetite, 4 starts | 74.7 | 67.8 | 66.9 |
| Chromium / 70/30 mixture, 4 starts | 95.9 | 79.2 | 78.5 |
| Chromium / magnetite, 12 starts | 244.3 | 208.6 | 208.1 |
| Chromium / 70/30 mixture, 12 starts | 531.8 | 494.8 | 488.4 |

Parallel search provides the larger improvement. Product fusion adds approximately 0–2% in these browser timings; small increments should be interpreted alongside timer resolution and sample variation. Full results, controls, warmups and execution metadata are retained in `deterministic-projection-browser.json`.

## Scientific and regression checks

The existing gates are unchanged: objectives within `max(1e-7, 1e-8 * objective)`; curves within `max(1e-7, 0.001 * residual RMS)`; parameter and fraction std within `1e-10 + 1e-4 * std`; same-basin parameters; and unchanged rank, degrees of freedom, uncertainty availability and acceptable-fit status. Velocity calibration additionally retains strict convergence.

Every comparison remains within the same-minimum gate. Parallel search's complete results, including parameters, objective, std, intensity fractions, termination, warnings and search diagnostics, are bit-for-bit identical to serial execution. Across all stages, maximum relative parameter-std change is 1.2037e-13 and maximum relative fraction-std change is 4.0537e-14. Same-coordinate covariance, fraction statistics and ranks are exact across binaries. Numerical-Jacobian same-coordinate covariance controls also pass (maximum relative parameter-std difference 1.75e-6). All 61 baseline/final forward-model evaluations are exact.

Final validation passes: 94 Rust tests, five profiling-feature continuation tests, 177 JavaScript tests, 277 TypeScript/React tests, 20 native integration tests, TypeScript/web build, bundled desktop/manual build (284 files and 1,374 checked local links), and desktop `cargo check`. The native integration tests verify measured full/selective complete-output equivalence with bounded two-fit concurrency, exact fallback after injected helper transport failure and cancellation of both scopes. Browser tests cover helper ownership, failure routing and stale-worker isolation. The initial parallel stage separately passed its native and frontend suites.

`scripts/verify-deterministic-projection.mjs` independently recomputes scientific comparisons from stored complete results, requires exact parallel-stage outputs, checks actual helper counts and unchanged baseline/parallel core binaries, verifies source/artifact provenance, reruns the forward comparisons and checks regression/build logs. Its receipt is `deterministic-projection-verification.json`.

## Records and reproduction

- Isolated stage: `deterministic-projection-parallel-{native,search,search12,browser}.json`.
- Product pilot: `deterministic-projection-products-pilot-{native,search12}.json`.
- Final native stages: `deterministic-projection-products-{native,search,search12}.json`.
- Final browsers: `deterministic-projection-browser.json`.
- Stage provenance: `deterministic-projection-{baseline,parallel,products}-provenance.json`.
- Frozen source/artifacts: `runtime/deterministic-projection/`.

From the repository root with the archived stages and a supported Node version:

```sh
node --import tsx scripts/benchmark-deterministic-projection.mjs --stages baseline,parallel,products --repeats 7
node --import tsx scripts/benchmark-deterministic-projection.mjs --stages baseline,parallel,products --search --repeats 7
node --import tsx scripts/benchmark-deterministic-projection.mjs --stages baseline,parallel,products --search --starts 12 --case coarse --repeats 9
node --import tsx scripts/benchmark-deterministic-projection-browser.mjs --repeats 5
node --import tsx scripts/verify-deterministic-projection.mjs
```

Use the frozen stages to reproduce the historical implementation comparison. Execution choices can change runtime and worker startup costs; they do not change saved model settings or the qualified scientific gates.

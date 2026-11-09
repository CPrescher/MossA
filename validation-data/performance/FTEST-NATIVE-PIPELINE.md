# Compact native F-test execution and reusable preparation

November 9, 2026. Both stages are implemented. **All 36 paired stage comparisons pass with bit-for-bit identical complete public comparison results**, including observed fits/std, every simulated minimum, rank, stationarity diagnostic, search/recovery history, improvement, tail count, p-value and interval. One- and four-worker results are also bit exact after removing worker metadata.

These are additional gains over the stabilized F-test checkpoint `d9b9e18`, not a comparison against the original pre-analytical solver. The independent verifier also matches the frozen reference against the original fixed-policy benchmark results.

## Stages

1. **Compact/batched native execution.** A comparison scope retains model templates and active spectra. Requests send ordered parameter values and runtime controls instead of complete projects and repeated observations. Search trials return fitted values, objective and original optimizer state; the unchanged winning-coordinate finalizer still calculates full diagnostics and covariance. Candidate validation and its immediately following local fit share a native call. Validation failures and fit failures remain distinct, so the JS generator retains its original retry/failure semantics. Expensive fits remain independent jobs to avoid waiting for slow simulations; small operations can coalesce. Fixed-shape, single-start thin comparisons keep their inexpensive legacy path.
2. **Reusable preparation.** A model retains invariant parameter topology/bounds, background powers and fixed source FFTs. Each dataset has its own exact count/unit weights. Starting values, scales and scaled bounds are recalculated in the original order. Coordinate-dependent forward/Jacobian caches and all solver/trust-region state are fresh for each fit. xVBF simplex transforms are rebuilt when weights require them. Numerical/full-complex and analytical/real-FFT preparation use separate cache entries.

The existing JS generators still choose every starting model, recovery, precision restart and RNG draw. No simulation, search-validation call, requested start, optimizer iteration or uncertainty calculation is skipped. The frozen numerical comparison policy, joint treatment of disappearing free shapes, precision checks and arithmetic tie handling are unchanged. No new user-facing solver controls or scientific project fields were added.

## Timing results

Apple M4 Pro, Node v26.12.1. Six synthetic nested singlet cases from the fixed-seed investigation: 199 simulations for five thin cases and 99 for transmission, generation seed 42 and bootstrap seed 12345. Nonlinear cases use four full starting models per fit. Each stage has one excluded warmup, then three alternating complete-comparison measurements. Payload counters run only during the excluded warmup. Builds, tests and other timing runs do not overlap measurements.

The table shows median complete-comparison times with four simulation workers.

| Nonlinear case | Before | Compact | + Preparation | Total speedup | p-value, all stages |
| --- | ---: | ---: | ---: | ---: | ---: |
| gaussian-nonlinear-multistart | 0.6651 s | 0.4548 s | 0.4529 s | 1.47× | 0.295 |
| poisson-nonlinear-multistart | 0.9394 s | 0.5662 s | 0.5623 s | 1.67× | 0.125 |
| transmission-nonlinear-multistart | 2.2826 s | 2.0282 s | 1.9906 s | 1.15× | 0.01 |

In this final run, preparation adds approximately 0.4% for Gaussian, 0.7% for Poisson and 1.9% for transmission beyond compact execution. These are small median differences, close to ordinary timing variation; the benchmark does not establish a large additional preparation speedup. Most of the measured gain comes from compact execution. The three very cheap fixed-shape controls remain approximately neutral on their existing path.

Earlier whole-wave batching reduced traffic but made fast workers wait for slower fits and regressed four-worker timings. That scheduling scheme is not enabled. The final implementation keeps expensive requests independent and combines the dependent validation/fit pair rather than synchronizing a wave.

## Transport reduction

| Case, four workers | Logical compute operations | Calls, before → after | Payload, before → after |
| --- | ---: | ---: | ---: |
| gaussian-nonlinear-multistart | 3618 → 3618 | 3618 → 2216 | 94.94 → 9.09 MB |
| poisson-nonlinear-multistart | 3620 → 3620 | 3620 → 2211 | 80.66 → 8.63 MB |
| transmission-nonlinear-multistart | 1812 → 1812 | 1812 → 1121 | 41.56 → 4.69 MB |

Payload totals count JSON request/response bytes in the native fixture, including observed fits. They do not represent a GUI or Tauri IPC profile. The fixture uses the production Rust core and session/job registry with JSON-lines transport in place of Tauri IPC; desktop wall-time gains can differ. Models, spectra and cached preparation are scoped to a cancelable comparison session; active spectra are released between simulations, and registry entries are bounded.

## Verification

- Complete public results must match exactly between all three stages, rather than merely passing a looser objective tolerance. The 36 pairs cover reference→compact, compact→prepared and reference→prepared for each of six cases at one/four workers.
- Every timed repetition is exactly deterministic within its stage. The verifier separately checks one/four-worker equality and unchanged logical validation/fit/finalization counts.
- All p-values match the fixed-policy checkpoint, including the corrected absent-component p = 1. The nonlinear Gaussian/Poisson/transmission p-values remain 0.295, 0.125 and 0.01.
- Five additional 199-simulation WASM scientific replays pass the existing minimum, rank and observed-std gates after rebuilding the shared core. No browser speedup is claimed.
- All 97 Rust tests, 464 JavaScript/UI tests and 22 native integration tests pass. Web build, TypeScript and desktop Cargo checks pass.
- Targeted checks cover compact state/finalization equivalence, failed candidates, fit-error routing, changed spectra/grids, local overflow rejection, cancellation and scope cleanup. Reused versus fresh preparation is checked at the exact initial coordinates and Jacobian bits for changed data/scales, linked parameters, count weights, xVBF simplex weights, and both FFT conventions.

The synthetic cases do not establish performance or global convergence for every measured spectrum. Full-coordinate covariance and acceptance thresholds retain their original arithmetic.

## Evidence and reproduction

`ftest-native-pipeline-verification.json` records all stage timing/payload summaries, exactness checks, regression/build log hashes and source/artifact hashes. `ftest-native-pipeline-provenance.json` identifies a separate verified local archive containing the raw results, frozen source graphs/binaries, current source, WASM records and logs. Raw artifacts are kept outside Git. Earlier fitting and F-test archives remain unchanged.

After restoring the local evidence archive into a fresh checkout:

```sh
node --import tsx scripts/benchmark-ftest-native-pipeline.mjs --stages reference,compact-fused,prepared --repeats 3 --workers 1,4 --output validation-data/performance/ftest-native-pipeline.json
node --import tsx scripts/verify-ftest-wasm.mjs --output validation-data/performance/ftest-pipeline-wasm.json
node --import tsx scripts/verify-ftest-native-pipeline.mjs
```

Frozen native binaries are macOS ARM64 artifacts. To rebuild stage sources elsewhere, use each stage’s Cargo files and source graph with the repository’s unchanged pinned `rust-core/vendor` and fixture helper. Requalify results on that platform. Build the current package with `npm run wasm` and `node scripts/test-native.mjs`; run builds/tests separately from timing. Archived logs are retained under `validation-data/performance/logs/ftest-native-pipeline/`; the verifier uses their recorded `/tmp/mossa-pipeline-*.log` names.

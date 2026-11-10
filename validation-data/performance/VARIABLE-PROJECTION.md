# Bounded variable projection for thin models

November 8, 2026. Variable projection is available under **Fitting options → Fit options → Thin fitting → Variable projection**, with analytical derivatives selected. **Joint fitting remains the default and reference.** The choice persists in sessions and portable projects as `thin_solver: "variable_projection"` or `"joint"`; older files retain their existing behavior.

> Follow-up: [guarded joint continuation](VARIABLE-PROJECTION-MULTISTART.md) reduces the full magnetite multistart slowdown documented below. That report compares the previous implementation directly, including workloads that get slower. The historical measurements here remain unchanged.

## Implementation and scope

The optimizer eliminates eligible linear intensity and background roots, solves them at each trial geometry using bounded linear least squares, and refines only the remaining nonlinear roots. Only roots whose nonzero uses are exclusively site intensities and/or polynomial backgrounds are eligible. Proportional links combine their basis columns and retain the bounds already intersected by `Prepared`. A root linked into a line-shape parameter stays nonlinear. Fixed parameters and xVBF simplex coordinates retain their original meanings.

The inner solve uses column-scaled, pivoted QR with an active-set bounded least-squares algorithm; it never substitutes normal equations. A rank-deficient linear basis retains joint fitting so its coefficient/null-space convention is not redefined. An unrecoverable rank change or inner-solve failure restarts the original joint solver. Explicit numerical derivatives and bounded-LM recovery also retain joint fitting. Native execution receipts record the number of projected roots and any runtime fallback; the WASM checkpoint API exposes `projected_parameters` for verification.

The analytical reduced Jacobian includes **both** terms of the Golub–Pereyra derivative, including the residual-dependent term commonly omitted by the Kaufman approximation. For residual `r = A c + b - y`, full nonlinear block `B`, and the currently free coefficient columns `A_F`, it uses `J_reduced = (I - A_F A_F⁺) B - A_F⁺ᵀ (dA_F/dθ)ᵀ r`. Weighted basis columns and residuals use the original fixed observed-count weights. The mixed derivative contraction is computed directly from unit-intensity site tangents, without a rows × linear × nonlinear tensor. [O’Leary and Rust, Variable Projection for Nonlinear Least Squares Problems](https://www.cs.umd.edu/~oleary/software/varpro/varpro.pdf) describes this separable least-squares formulation.

Near active-set switches, including zero-multiplier coefficients that land on a bound without entering the active set, reduced residuals use bounded numerical differences. The same applies to nonsmooth xVBF width/weight limits. The inner KKT tolerance includes a forward-roundoff floor proportional to the background/data scale, preventing bound cycling on an exactly reproduced spectrum. These are coefficient-solve/derivative safeguards; the existing fit-quality and covariance gates were not loosened.

**All reported uncertainties use the original full Jacobian**, original optimizer scales, complete root vector, original rank threshold, and `N - total free parameters` degrees of freedom. Eliminated coefficients keep their fit flags and std; intensity–shape/background correlations are included. Checkpoints, progress callbacks, Stop/Cancel handling and deferred finalization reconstruct full-coordinate models. Search winners still finalize once.

## Crowded starting models

The initial direct-projection pilot was faster but found a worse basin for the measured coarse 70/30 mixture: objective approximately 4.1975e9 versus the joint reference 3.9117e9. Four joint warmup iterations did not fix it. The final general policy preserves **eight joint iterations** before projection when there are at least three sites and at least ten nonlinear roots. The original scales remain fixed, and warmup iterations count toward the original iteration budget and exploration checks. Fits with insufficient iteration budget retain the joint path. The final single-fit and multistart comparisons all recover equivalent reference minima.

This is an empirical basin-preservation policy, not a global-minimum guarantee. Joint fitting remains selectable and is the default. No case identifier or spectrum-specific threshold is used in the implementation.

## Native performance

Frozen pre-change native/WASM artifacts provide the reference: the latest analytical fitter with shared evaluation and real FFTs. Current explicit joint output must also match that frozen reference **bit for bit**, including std and diagnostics. Each single-fit timing uses an excluded warmup and five alternating paired measurements; searches use three pairs. Times include native JSON transport, all coefficient solves and warmup work, and full uncertainty finalization. Builds/tests and browser timing did not overlap native measurements.

| Native single fit | Joint | Variable projection | Speedup | Eliminated / total roots |
| --- | ---: | ---: | ---: | ---: |
| Singlet, Lorentzian | 2.90 ms | 1.63 ms | 1.78× | 3/5 |
| Doublet, pseudo-Voigt | 7.69 ms | 4.39 ms | 1.75× | 3/8 |
| Sextet, pseudo-Voigt | 9.66 ms | 5.71 ms | 1.69× | 3/10 |
| Linked mixed profiles | 8.66 ms | 4.36 ms | 1.99× | 3/10 |
| xVBF mixture | 8.56 ms | 6.12 ms | 1.40× | 2/11 |
| Bounded intensity | 2.27 ms | 0.86 ms | 2.63× | 3/5 |
| Measured 30/70 mixture, coarse start | 55.47 ms | 42.34 ms | 1.31× | 4/16 |
| Measured 70/30 mixture, coarse start | 80.47 ms | 57.31 ms | 1.40× | 4/16 |
| Measured magnetite, coarse start | 138.42 ms | 93.22 ms | 1.48× | 4/16 |
| Coincident starting components | 8.49 ms | 2.58 ms | 3.29× | 4/8 |

Ordinary single-site/profile fits generally improve by about 2×. Crowded measured fits improve less because they retain the joint warmup; xVBF benefits vary. Rank-deficient and all-fixed cases retain joint behavior and show little change.

| Native search | Starts | Joint | Variable projection | Speedup |
| --- | ---: | ---: | ---: | ---: |
| 30/70 mixture / full | 4 | 317.93 ms | 237.75 ms | 1.34× |
| 30/70 mixture / selective | 4 | 315.61 ms | 231.03 ms | 1.37× |
| 70/30 mixture / full | 4 | 1520.06 ms | 623.30 ms | 2.44× |
| 70/30 mixture / selective | 4 | 638.15 ms | 404.27 ms | 1.58× |
| Magnetite / full | 4 | 691.49 ms | 1010.26 ms | 0.68× |
| Magnetite / selective | 4 | 687.71 ms | 342.43 ms | 2.01× |
| xVBF mixture / full | 4 | 30.14 ms | 13.29 ms | 2.27× |
| xVBF mixture / selective | 4 | 30.38 ms | 13.40 ms | 2.27× |
| 70/30 mixture / full | 12 | 6034.95 ms | 3357.05 ms | 1.80× |
| 70/30 mixture / selective | 12 | 1726.83 ms | 1097.58 ms | 1.57× |

**Variable projection is not uniformly faster.** The full four-start magnetite search takes about 46% longer in this set; total solver iterations increase from 218 to 582 across alternative starts. Its selective search instead drops from 218 to 174 iterations and is approximately 2× faster. Both select equivalent minima/std. The slower result is included in the browser benchmark too; no search policy was changed to hide it.

## Production browser results

Two actual Engine/Worker bundles load the verified archived baseline/current WASM. WebKit and Chromium run nine single/four-start combinations, with one excluded warmup and three alternating paired samples. Both methods use one fitting worker, without numerical helper workers or infrastructure fallback. These **18 comparisons** use ordinary portable hosting; analytical fitting does not require shared-memory transport.

| Browser fit/search | WebKit joint → projected | Chromium joint → projected |
| --- | ---: | ---: |
| Sextet, pseudo-Voigt | 27.0→12.0 ms | 28.3→12.8 ms |
| 70/30 mixture / single | 289.0→200.0 ms | 295.6→205.3 ms |
| 70/30 mixture / four full starts | 5618.0→2204.0 ms | 5944.1→2287.3 ms |
| Magnetite / four full starts | 2473.0→3558.0 ms | 2595.6→3716.8 ms |
| xVBF mixture | 22.0→17.0 ms | 23.0→17.8 ms |
| Coincident starts | 24.0→6.0 ms | 25.1→5.9 ms |

Current browser joint results are exact against the archived baseline. Every projected browser fit/search passes the same scientific gates as the native results. Browser timing likewise confirms the slower full magnetite search, rather than extrapolating speedups from simple models.

## Minima, std and diagnostics

All **41 native comparisons** (31 single fits, eight four-start searches, two twelve-start searches) and **18 browser comparisons** pass. Each reaches an equivalent minimum under the existing objective gate; no different-basin or better-minimum exception was accepted. The suite covers all ordinary profiles/site types, measured coarse mixtures and magnetite, count/unweighted fits, xVBF distributions, fixed/bounded/linked coefficients, cross-links into shapes, coincident starts, linear-only/background-only/all-fixed models and rank deficiency.

- Maximum relative parameter-std difference: **2.238e-05**, or **0.00224%**.
- Maximum relative site-fraction-std difference: **1.933e-05**, or **0.00193%**.
- Reference/current analytical finalization at identical original optimizer coordinates: **0 relative std difference**; full error maps and fraction uncertainties match exactly.
- Current analytical/numerical Jacobians at those coordinates: maximum **1.742e-06 relative std difference**.

Rank, error-map keys, uncertainty availability, total free-parameter counts and degrees of freedom agree. The small differences between fitted std come from stopping at slightly different numerical coordinates, not from substituting conditional linear errors for full covariance.

Unchanged gates: objective difference ≤max(1e-7, 1e-8 × reference objective), curve RMS difference ≤max(1e-7, .001 × reference residual RMS), identifiable-parameter difference ≤1e-7 × max(1, |value|) + .001 × reference std, and parameter/fraction-std difference ≤1e-10 + 1e-4 × reference std. Every raw receipt retains complete inputs/results and paired samples.

Stopping codes can differ at the numerical floor. For example, the projected squared-Lorentzian doublet reports `SolverFailed` with projected stationarity 4.68e-8. This passes the preexisting stationary-stop acceptance rule (≤1e-6); its objective and std are checked independently. The raw `converged=false` flag and warning are retained. Rank-deficient std remains unavailable as before.

## Validation and reproduction

Checks passed: **72-test full Rust suite**, followed by **six focused projection checks** on the final active-bound guard; **163 JS/WASM tests**; **274 TypeScript/React tests**; **15 native integration tests**; desktop Rust check, TypeScript compilation, formatting, and desktop/manual production build. The build verifies 284 payload files, 365 local references and 1,374 manual links.

Independent tests cover pivoted rectangular QR/permutation, bounded KKT conditions, the exact reduced Jacobian against five-point differences with deliberately large residuals, count weighting, rank fallback, zero-multiplier bounds, exact-start objective retention, callback/checkpoint parity, full-coordinate deferred covariance, numerical/recovery overrides, selection persistence/validation and native/browser parity. The joint reference remains unchanged for transmission and source calibration.

Artifacts:

- `variable-projection-baseline-provenance.json`: frozen reference hashes.
- `variable-projection-native.json`: 31 single fits and fixed-coordinate uncertainty checks.
- `variable-projection-search.json`: eight four-start full/selective searches.
- `variable-projection-search12.json`: two twelve-start full/selective searches.
- `variable-projection-browser.json`: 18 production Engine/Worker comparisons and WASM hashes.
- `variable-projection-verification.json`: final source/artifact/check hashes and independent schema/std audit.

Runtime archives under `validation-data/performance/runtime/variable-projection/` are ignored local artifacts and are required for paired reproduction.

```sh
cargo build --locked --release --manifest-path rust-core/Cargo.toml --example native_fixture
npm run wasm
node --import tsx scripts/benchmark-variable-projection.mjs --repeats 5
node --import tsx scripts/benchmark-variable-projection.mjs --search --repeats 3
node --import tsx scripts/benchmark-variable-projection.mjs --search --starts 12 --case _70-30 --repeats 3 --output validation-data/performance/variable-projection-search12.json
node scripts/benchmark-variable-projection-browser.mjs --repeats 3
node --import tsx scripts/verify-variable-projection.mjs
```

Changes remain local; no commit, release, installation or publication was performed.

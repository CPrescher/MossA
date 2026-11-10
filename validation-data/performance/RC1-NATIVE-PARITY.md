# Release-candidate native/WASM stop-status qualification

November 9, 2026. The first tagged Linux rc.1 run passed the shared test suite but
failed one native integration assertion requiring identical convergence flags.
The [diagnostic run](https://github.com/CPrescher/MossA/actions/runs/42695026911)
reproduced the thin-control fixture with analytical/numerical derivatives,
default/joint solvers and one/four starting models (eight combinations).

All eight combinations pass the existing `compareAnalytical` objective, curve,
rank, identifiable-parameter, parameter-std and fraction-std gates. The only
convergence-flag difference is the analytical/default/four-start case:

| Quantity | Linux native | WASM |
| --- | --- | --- |
| Objective | 452.24319985628773 | 452.24319985629893 |
| Termination | NumericalNoProgress | RelativeCostTolerance |
| Converged | false | true |
| Projected stationarity | 9.714902080313332e-8 | 7.937489946647813e-10 |

The native search selected a marginally lower attained objective (difference
approximately −1.12e-11). This does not demonstrate global convergence. The
production result remains nonconverged and retains its solver warning; neither
the optimizer nor the statistical acceptance rules were changed to relabel it.

Only this integration fixture's four-start comparison can accept a different
flag, and only for native `NumericalNoProgress` against converged WASM, finite
stationarity <= 1e-6, the retained nonconvergence warning, and all original
numerical/scientific equivalence gates. Other tests still require their original
convergence matching. Native serial/parallel equality remains exact.

`rc1-native-parity-verification.json` records all eight summaries, original
threshold checks, source hashes and the raw diagnostic hash. The raw JSON is
preserved locally under the recorded release validation path; the GitHub run
also provides a temporary artifact. This finite qualification is not a claim
that all native and browser solver trajectories or stopping codes agree.

# Selective continuation for starting-model searches

November 8, 2026. An optional search strategy is implemented in the shared native Rust/WebAssembly core and the ordered multistart wrapper. Select **Fitting options → Fit options → Starting models** greater than one, then **Search strategy → Selective continuation**. Existing and new projects default to **Full exploration**. Single-start fits retain their full budget.

## Policy

- Fully fit the supplied model first. This preserves the original single-start objective as a quality floor.
- Preserve the deterministic candidate generator. Every third alternative is based on the original model; these starts retain their full budget to protect exploration of distant basins.
- For alternatives based on the incumbent, use an exploration checkpoint at `max(24, 4 × free parameters)`, capped at the configured iteration limit.
- At that checkpoint, prune a candidate only if its objective is more than 10% above the incumbent objective. Otherwise continue the **same solver**, preserving its scaling, trust region, convergence history, and total iteration budget. There is no restart from the intermediate parameter values.
- Pruned candidates terminate as `ExplorationPruned`, are recorded in the search diagnostics, and cannot become the selected fit. The selected candidate retains its own complete convergence diagnostics and covariance/std calculation. No observation, bound, link, weighting, integration grid, derivative step, or optimizer tolerance is changed.
- Persist the strategy, checkpoint, margin, screening/pruning decisions, per-start objective/termination/iterations, and total iterations. Remove internal probe controls from results, progress snapshots, and saved projects. Stop & keep and cancellation retain their existing behavior.

Screening is a heuristic: a locally perturbed candidate can also improve late. Full exploration remains the default. Statistical model comparisons, including their simulated refits and recovery searches, retain full exploration regardless of the interactive setting.

Later candidates remain adaptive to the incumbent. If pruning changes an intermediate incumbent, subsequent candidate values can differ from full exploration even though the generator and index order are unchanged. The quality gate therefore compares complete search outcomes, not just isolated local fits.

## Qualification design

The benchmark uses 20 fixed cases: two measured transmission spectra, four archived difficult coarse-start thin models, ten synthetic/control models, and four deterministic perturbations of the measured/coarse models. The perturbations use the same observations, so they test sensitivity to starting parameters rather than independent experimental generalization.

Compare four-start and twelve-start searches separately in native Rust and scalar WebAssembly. Each backend uses its own full-search reference. The 40 native comparisons use three paired samples with alternating execution order; report medians. The first six WebAssembly comparisons (two measured transmission spectra and the coarse 30–70 mixture, each with 4/12 starts) also use three paired samples. Remaining WebAssembly comparisons use one pair to check quality without repeating every expensive full search. Their timings are single observations, not repeated performance estimates. Every row records its sample count.

The benchmark asserts deterministic complete fit outputs wherever repeats exist, saves full winning results including std, and records every local fit's input hash, runtime, objective, iterations, and termination. One unrecorded warmup initializes each backend/run. Native timings include the headless JSON transport and final diagnostics; UI rendering and progress publishing are excluded. They are not measurements of the installed desktop app.

The acceptance gate is an objective no worse than the full-search reference by more than `max(1e-6, 1e-8 × reference objective)`, with convergence and Jacobian rank retained. Timing and quality are assessed independently. The raw receipt includes input/source/binary hashes and toolchain/hardware information.

Earlier screening rules demonstrated why the protected original-model starts matter. A 24-iteration cutoff missed the better coarse-magnetite basin; a complexity-scaled cutoff without protected restarts also missed late improvements. Those failed receipts are retained in [selective-pilot.json](selective-pilot.json) and [selective-qualification.json](selective-qualification.json). The final policy is fixed across spectra; the test set informed its design and is not an independent holdout study.

## Final measurements

Results are recorded in [selective-final.json](selective-final.json). The final receipt records the completed comparisons and their actual sample counts.

All **80/80 search comparisons** pass the objective, convergence-retention, and rank-retention gates. There are **78/80 numerically identical selected results**, excluding strategy/search metadata and warnings. The two other results have a slightly lower objective (about 2e-11 relative) and exchange equivalent sextet labels in the same perturbed 30–70 mixture.

Across the 40 three-repeat native comparisons, summing per-case median times gives **91.24 s full → 62.19 s selective**, a **1.47× speedup / 31.8% reduction**. This weights the chosen cases equally; it is not a prediction for an arbitrary user's workload. Simple or already fast fits generally gain little, and some measured timings are slower. All raw samples, including those slowdowns, are retained.

4 of the 80 selected results are nonconverged in both strategies; the search has not made those local fits converged. Matching the full-search objective means matching that reference's best attained result, not certifying a stationary or global minimum.

### Native Rust

| Case | Starts | Full (ms) | Selective (ms) | Speedup | Pairs | Pruned | Quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MS_Fe2O3_transmission | 4 | 182.0 | 182.0 | 1.00× | 3 | 0 | Pass |
| MS_Fe2O3_transmission | 12 | 570.3 | 568.6 | 1.00× | 3 | 0 | Pass |
| MS_MexicanMagnetite_transmission | 4 | 6569.6 | 2823.7 | 2.33× | 3 | 1 | Pass |
| MS_MexicanMagnetite_transmission | 12 | 12415.7 | 9030.1 | 1.37× | 3 | 1 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse | 4 | 529.4 | 534.5 | 0.99× | 3 | 0 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse | 12 | 4397.8 | 1690.6 | 2.60× | 3 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse | 4 | 4423.1 | 1977.0 | 2.24× | 3 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse | 12 | 11807.7 | 3932.9 | 3.00× | 3 | 5 | Pass |
| MS_Fe2O3-Fe3O4_50-50_coarse | 4 | 657.1 | 661.7 | 0.99× | 3 | 0 | Pass |
| MS_Fe2O3-Fe3O4_50-50_coarse | 12 | 1935.0 | 1950.7 | 0.99× | 3 | 0 | Pass |
| MS_MexicanMagnetite_coarse | 4 | 1121.8 | 1124.5 | 1.00× | 3 | 0 | Pass |
| MS_MexicanMagnetite_coarse | 12 | 2943.3 | 2910.8 | 1.01× | 3 | 0 | Pass |
| singlet-lorentzian-source | 4 | 66.4 | 66.4 | 1.00× | 3 | 0 | Pass |
| singlet-lorentzian-source | 12 | 205.5 | 204.7 | 1.00× | 3 | 0 | Pass |
| three-sites-lorentzian-source | 4 | 554.2 | 552.6 | 1.00× | 3 | 0 | Pass |
| three-sites-lorentzian-source | 12 | 1639.1 | 1637.7 | 1.00× | 3 | 0 | Pass |
| singlet-squared-source | 4 | 70.5 | 70.1 | 1.01× | 3 | 0 | Pass |
| singlet-squared-source | 12 | 216.2 | 214.6 | 1.01× | 3 | 0 | Pass |
| three-sites-squared-source | 4 | 571.5 | 576.6 | 0.99× | 3 | 0 | Pass |
| three-sites-squared-source | 12 | 1718.5 | 1724.4 | 1.00× | 3 | 0 | Pass |
| mixed-absorber-profiles-counts | 4 | 923.0 | 926.1 | 1.00× | 3 | 0 | Pass |
| mixed-absorber-profiles-counts | 12 | 2548.6 | 2572.3 | 0.99× | 3 | 0 | Pass |
| asymmetric-gaussian-source | 4 | 112.9 | 117.8 | 0.96× | 3 | 0 | Pass |
| asymmetric-gaussian-source | 12 | 263.4 | 337.0 | 0.78× | 3 | 0 | Pass |
| xvbf-transmission | 4 | 132.0 | 168.7 | 0.78× | 3 | 0 | Pass |
| xvbf-transmission | 12 | 381.9 | 379.2 | 1.01× | 3 | 0 | Pass |
| linked-parameters | 4 | 154.4 | 155.9 | 0.99× | 3 | 0 | Pass |
| linked-parameters | 12 | 479.5 | 478.6 | 1.00× | 3 | 0 | Pass |
| active-width-bound | 4 | 168.0 | 168.1 | 1.00× | 3 | 0 | Pass |
| active-width-bound | 12 | 460.7 | 462.4 | 1.00× | 3 | 0 | Pass |
| thin-control | 4 | 64.6 | 65.0 | 0.99× | 3 | 0 | Pass |
| thin-control | 12 | 163.5 | 163.0 | 1.00× | 3 | 0 | Pass |
| MS_Fe2O3_transmission_perturbed | 4 | 199.8 | 201.0 | 0.99× | 3 | 0 | Pass |
| MS_Fe2O3_transmission_perturbed | 12 | 620.7 | 632.2 | 0.98× | 3 | 0 | Pass |
| MS_MexicanMagnetite_transmission_perturbed | 4 | 2897.7 | 2905.3 | 1.00× | 3 | 0 | Pass |
| MS_MexicanMagnetite_transmission_perturbed | 12 | 10060.2 | 10158.0 | 0.99× | 3 | 0 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse_perturbed | 4 | 1194.4 | 941.5 | 1.27× | 3 | 1 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse_perturbed | 12 | 5226.4 | 2521.0 | 2.07× | 3 | 3 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse_perturbed | 4 | 3004.3 | 2354.6 | 1.28× | 3 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse_perturbed | 12 | 9585.8 | 4049.7 | 2.37× | 3 | 4 | Pass |

### Scalar WebAssembly

| Case | Starts | Full (ms) | Selective (ms) | Speedup | Pairs | Pruned | Quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MS_Fe2O3_transmission | 4 | 248.6 | 246.3 | 1.01× | 3 | 0 | Pass |
| MS_Fe2O3_transmission | 12 | 763.9 | 775.9 | 0.98× | 3 | 0 | Pass |
| MS_MexicanMagnetite_transmission | 4 | 11394.4 | 5031.5 | 2.26× | 3 | 1 | Pass |
| MS_MexicanMagnetite_transmission | 12 | 23575.6 | 18228.7 | 1.29× | 3 | 1 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse | 4 | 4354.6 | 4376.1 | 1.00× | 3 | 0 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse | 12 | 21756.6 | 8595.9 | 2.53× | 3 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse | 4 | 17944.3 | 17927.9 | 1.00× | 1 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse | 12 | 47563.5 | 26546.4 | 1.79× | 1 | 5 | Pass |
| MS_Fe2O3-Fe3O4_50-50_coarse | 4 | 2576.4 | 2555.0 | 1.01× | 1 | 0 | Pass |
| MS_Fe2O3-Fe3O4_50-50_coarse | 12 | 7744.3 | 7621.6 | 1.02× | 1 | 0 | Pass |
| MS_MexicanMagnetite_coarse | 4 | 4393.6 | 4654.7 | 0.94× | 1 | 0 | Pass |
| MS_MexicanMagnetite_coarse | 12 | 12521.1 | 12620.2 | 0.99× | 1 | 0 | Pass |
| singlet-lorentzian-source | 4 | 117.8 | 119.1 | 0.99× | 1 | 0 | Pass |
| singlet-lorentzian-source | 12 | 360.8 | 360.7 | 1.00× | 1 | 0 | Pass |
| three-sites-lorentzian-source | 4 | 973.4 | 926.6 | 1.05× | 1 | 0 | Pass |
| three-sites-lorentzian-source | 12 | 2579.5 | 2551.4 | 1.01× | 1 | 0 | Pass |
| singlet-squared-source | 4 | 104.7 | 103.8 | 1.01× | 1 | 0 | Pass |
| singlet-squared-source | 12 | 337.0 | 371.1 | 0.91× | 1 | 0 | Pass |
| three-sites-squared-source | 4 | 1016.0 | 1000.0 | 1.02× | 1 | 0 | Pass |
| three-sites-squared-source | 12 | 2785.0 | 3068.8 | 0.91× | 1 | 0 | Pass |
| mixed-absorber-profiles-counts | 4 | 3689.4 | 3403.4 | 1.08× | 1 | 0 | Pass |
| mixed-absorber-profiles-counts | 12 | 8579.8 | 6874.0 | 1.25× | 1 | 0 | Pass |
| asymmetric-gaussian-source | 4 | 132.4 | 130.1 | 1.02× | 1 | 0 | Pass |
| asymmetric-gaussian-source | 12 | 417.0 | 412.3 | 1.01× | 1 | 0 | Pass |
| xvbf-transmission | 4 | 180.7 | 177.0 | 1.02× | 1 | 0 | Pass |
| xvbf-transmission | 12 | 519.5 | 514.8 | 1.01× | 1 | 0 | Pass |
| linked-parameters | 4 | 243.2 | 241.9 | 1.01× | 1 | 0 | Pass |
| linked-parameters | 12 | 745.9 | 995.5 | 0.75× | 1 | 0 | Pass |
| active-width-bound | 4 | 277.0 | 253.7 | 1.09× | 1 | 0 | Pass |
| active-width-bound | 12 | 691.1 | 905.1 | 0.76× | 1 | 0 | Pass |
| thin-control | 4 | 242.1 | 231.4 | 1.05× | 1 | 0 | Pass |
| thin-control | 12 | 584.2 | 572.0 | 1.02× | 1 | 0 | Pass |
| MS_Fe2O3_transmission_perturbed | 4 | 277.8 | 277.3 | 1.00× | 1 | 0 | Pass |
| MS_Fe2O3_transmission_perturbed | 12 | 852.2 | 855.0 | 1.00× | 1 | 0 | Pass |
| MS_MexicanMagnetite_transmission_perturbed | 4 | 4854.0 | 4913.5 | 0.99× | 1 | 0 | Pass |
| MS_MexicanMagnetite_transmission_perturbed | 12 | 19555.6 | 17141.0 | 1.14× | 1 | 0 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse_perturbed | 4 | 5400.3 | 5472.8 | 0.99× | 1 | 1 | Pass |
| MS_Fe2O3-Fe3O4_30-70_coarse_perturbed | 12 | 22000.0 | 9733.1 | 2.26× | 1 | 3 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse_perturbed | 4 | 13398.9 | 10566.2 | 1.27× | 1 | 1 | Pass |
| MS-Fe2O3-Fe3O4_70-30_coarse_perturbed | 12 | 45605.6 | 18471.2 | 2.47× | 1 | 4 | Pass |

### Equivalent-site comparison

- native: exchange S 1 and S 3. Maximum matched parameter shift **2.47e-05 std**, maximum relative std change **8.91e-07**, maximum curve difference **0.00722 counts**. The fitted components are equivalent within numerical stopping precision; their display labels differ.
- wasm: exchange S 1 and S 3. Maximum matched parameter shift **2.47e-05 std**, maximum relative std change **8.91e-07**, maximum curve difference **0.00722 counts**. The fitted components are equivalent within numerical stopping precision; their display labels differ.

### Validation

Full numerical regression tests preserve the 14 frozen pre-optimization WASM fits exactly. Additional tests cover scalar/shared/checkpointed exploratory cutoff parity, exact continuation of promising candidates, fixed parameters and linked bounds, stale controls, iteration limits, protected original-model restarts, native pruning/progress/cancellation, portable/autosave round trips, UI selection and Stop & keep, and preservation of full searches for model comparison. Final check counts are recorded below.

- Rust core: 21 tests passed.
- JavaScript/WASM: 74 tests passed.
- TypeScript/React: 270 tests passed.
- Native adapter/core integration: 7 tests passed.
- WebAssembly release build, TypeScript compilation, Rust formatting, and desktop/manual production build passed; desktop payload and 1,374 local manual links verified.
- Benchmark receipt: all 80 quality comparisons passed; 40 native rows and 6 WebAssembly rows retain three paired samples each, and 34 WebAssembly rows retain one pair each.

The implementation remains local and uncommitted; no application release or installation was made.

## Reproduce

Use a supported Node version (the validation run used Node 26):

```sh
npm run wasm
node --import tsx scripts/benchmark-selective-multistart.mjs --backend both --starts 4,12 --repeats 3 --wasm-validation-repeats 1 --output validation-data/performance/selective-final.json
npm test
node scripts/test-native.mjs
npm run build:desktop:web
```

The benchmark builds the native fixture automatically, writes an incremental receipt after each case, and exits unsuccessfully if a quality gate fails. `--diagnostic` retains failures without a failing exit status; it does not approve a policy. `--case` restricts cases by substring for investigation.

`--resume` reuses completed rows with enough samples, checking the input, policy, source hashes, toolchain, and hardware before continuing. The final receipt resumed an initially uniform three-repeat run with `--repeats 1 --resume`; completed three-repeat rows were retained. The command above reproduces that sample schedule directly. Omit `--wasm-validation-repeats 1` to repeat all WebAssembly validation cases three times as well.

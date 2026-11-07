# MossA measured-data fitting audit

November 6, 2026. Actual Rust/WebAssembly fitting core, rebuilt from this workspace. No production fitting code was changed for this audit.

Follow-up work added an optional [multiple-start search](MULTISTART.md) to reduce dependence on initial parameters and [reconstructed CONFIT's effective field-conversion coefficients](../constants/REPORT.md). The original audit results below remain unchanged; MossA's hyperfine constants were not changed.

**Conclusion:** MossA found numerically stationary fits for all ten public spectra. The tests did not reveal a fitting-core numerical defect. The practical issues are local minima, physical-model adequacy, and cross-program parameter conventions. A lower residual obtained by freeing empirical widths or intensities does not establish a physically correct model.

## Physical interpretation comes first

The primary comparisons retain a common Lorentzian width within each site and fixed 3:2:1:1:2:3 magnetic line ratios, explicitly assuming random absorber orientation. The doublets use equal intensities. Full transmission retains these ratios inside the absorber model and accounts for saturation through the transmission integral. Its source FWHM is the MossA default 0.097 mm/s, an assumption rather than a measured source calibration for these datasets. No absorber thickness, source shape, field distribution, or texture was independently established by this audit. These fits therefore test available calculations; they do not establish a unique physical explanation of every spectrum.

Independent line widths are **not** proposed as a fix. A reference export is a comparison target, not a physically authoritative ground truth. A diagnostic reconstruction of the hematite reference curve inferred pair widths near 0.3860, 0.3466, and 0.3318 mm/s. This describes how the exported reference curve can be reproduced empirically; it is not an independently justified broadening mechanism. A physically defensible extension would need an appropriate model, such as a justified hyperfine-field distribution, texture, or transmission/source treatment. MossA already implements transmission; xVBF/distribution models remain outside the current port.

## Comparison with supplied curves

Each number below is unweighted residual sum of squares divided by that of the supplied reference curve on the same measured observations. One means the same residual level. The reference curves may use different constraints, profiles, weighting, or physical assumptions. Ratios are **not** model-selection statistics, likelihood ratios, or proof of scientific superiority. Extra parameters and different local minima matter.

| Spectrum | Thin, powder ratios | Transmission, powder ratios | Thin with reference links | Best exploratory empirical fit | Worst/best across 6 thin starts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mixture 70–30 | 4.907 | 4.147 | — | 0.943 | 1.87 |
| Mixture 30–70 | 2.397 | 2.195 | — | 0.796 | 3.89 |
| Mixture 50–50 | 2.651 | 2.611 | — | 0.717 | 1.93 |
| Hematite | 4.196 | 3.100 | — | 1.060 | 1.00 |
| Magnetite | 2.047 | 2.062 | — | 1.196 | 1.00 |
| Mexican ore | 2.862 | 2.663 | — | 0.661 | 1.58 |
| Reacted, 296 K | 0.876 | 0.748 | 0.9997 | 0.540 | 1.27 |
| Low temperature, 0 T | 0.889 | 0.903 | — | 0.534 | 1.10 |
| Starting, 296 K | 0.937 | 0.795 | 1.0002 | 0.680 | 1.21 |
| Low temperature, 6 T | 0.180 | 0.182 | — | 0.073 | 2.17 |

The exploratory column includes free A12/A13 ratios and pseudo-Voigt profiles. Those runs are diagnostic, not recommended physical solutions: in particular, freeing A13 can compensate for missing physics. Texture-only diagnostics varied A12 while retaining A13=3 and are preserved separately. No independent per-line widths were fitted in MossA. The low-temperature source analyses include distributions and, in a separate SpectrRelax model, Hamiltonian components; matching their reference residuals with simple sites does not reproduce their physics.

![Oxide comparisons](oxide-comparison.png)

![Assemblage comparisons](assemblage-comparison.png)

## Issues found and numerical checks

1. **Start dependence is real.** Four deterministic perturbations, a reference-assisted start, and a coarse start were run for every spectrum. Several multi-site spectra reached different stationary minima. The 30–70 mixture differed by 3.89× in residual sum of squares with the identical thin model. “Converged” indicates a numerical stopping criterion, not a globally best or physically adequate fit. Multiple starts and inspection of residual structure are necessary; an optional multi-start workflow would be useful.

2. **No stationary-solution defect detected.** An independent NumPy/SciPy implementation of the same thin Lorentzian models was restarted from 20 WASM solutions. Its largest relative residual-sum improvement was 9.4e-10. This tests local stationarity and model implementation, not global convergence. Six high-count spectra were also fitted with observed-count weighting. Four normalized spectra were repeated after a 10⁶ intensity rescaling; the difficult 6 T case can enter a different local minimum.

3. **Reference constraints can matter more than a lower residual.** The two room-temperature CONFIT models were repeated with the source magnetic intensity ratio S2=3×S1 and shared widths for S1/S2; the starting-assemblage doublet widths were also linked. These fits reproduce the reference residual levels to about 0.04%, and their site fractions closely agree. This is a stronger comparison than freeing extra intensity parameters simply to lower the residual.

4. **BHF conventions require reconciliation.** In those matched room-temperature fits, the sextet fields are about 0.09–0.10 T below the exported source-table fields (roughly 0.2%), while the curves and most other parameters agree closely. The current Rust core uses the original MATLAB coefficients 0.1613, 0.0934, and 0.0255 mm/s/T. The observed offset is consistent with a convention difference; the source program’s adopted constants have not been independently verified. Do not silently reinterpret this as a physical field change or “correct” the core constants from one dataset.

5. **Better empirical agreement is not validation of missing physics.** Thin fixed-ratio oxide fits generally have larger residuals than the reference curves. Free ratios and profiles reduce those residuals substantially, and the transmission tests are finite and convergent, but no source calibration or independently justified broadening model was supplied. The present data do not warrant adding arbitrary line widths or claiming a unique physical model.

Total actual WASM fit runs: **144**; converged: **144/144**; failed calls: **0**. Runs with diagnostics/warnings: **24**. Existing validation also passed: 12 Rust-core tests and 5 compiled-WASM tests, including independent direct transmission convolution. All 24 warning-bearing runs hit parameter bounds; the solver correctly omitted the affected symmetric uncertainty estimates. There were no rank-deficiency warnings. Uncertainty coverage was not established from these measured datasets.

Some complex exploratory fits took roughly 2.5 minutes in this run. Recorded times include concurrent CPU work and are indicative rather than controlled performance benchmarks.

## Source-parameter comparison

Room-temperature CONFIT source-table values are compared with reference-constrained MossA results in [reference-parameter-comparison.json](reference-parameter-comparison.json). All selected fitted values and approximate 1 std values are in [parameters.csv](parameters.csv). The Recoil archive supplies fitted curves, but no complete numerical parameter/constraint files; its component-derived initial estimates are explicitly reconstructions, not published parameter values. No source values were replaced by refit values.

## Files and reproduction

- [projects/](projects/): reopenable MossA projects for the best six-start thin fit, the random-powder transmission fit, and the two reference-constrained room-temperature fits. Exploratory empirical fits are explicitly labeled in their filenames.
- [summary.json](summary.json): comparison metrics and core-binary SHA-256.
- [cases.json](cases.json): observations, source reference curves, model inputs, provenance, and independently reconstructed initial estimates.
- `wasm-results.json`, `physical-results.json`, `variant-results.json`, `refinement-results.json`: complete actual fit results and starting models.
- [comparison.json](comparison.json): 20 independent same-model optimizer checks.
- [runtime-verification.json](runtime-verification.json): all 144 archived predictions were reevaluated against the captured runtime; the largest discrepancy was 1.4×10⁻¹⁵ relative to the observed intensity scale. Source-calibration development occurred concurrently in the workspace; the captured runtime and initial batch hash are recorded separately. The normal evaluation path agrees for every archived fit.
- `runtime/`: captured WASM runtime, JavaScript binding, and license for evaluating the saved results.

From the repository root, use the following sequence (Python requires NumPy, SciPy, and Matplotlib):

```sh
npm run wasm
python3 scripts/benchmark-public-data.py
node scripts/fit-public-validation.mjs
node scripts/fit-public-variants.mjs
node scripts/refine-public-validation.mjs
node scripts/fit-physical-validation.mjs
python3 scripts/compare-public-validation.py
node scripts/verify-public-validation.mjs
python3 scripts/report-public-validation.py
npx tsx scripts/export-public-validation.ts
```

## Sources

Praetz et al., v2 (2025), [Zenodo 14959531](https://zenodo.org/records/14959531), DOI 10.5281/zenodo.14959531. Geymond, v2 (2025), [Zenodo 15331051](https://zenodo.org/records/15331051), DOI 10.5281/zenodo.15331051. Both datasets are CC BY 4.0. The unmodified archives and metadata are preserved under `../public/`; extracted observations and analysis products are separate. The source archive checksums and selected-member hashes are recorded in `../manifest.json`.

This audit covers the ten downloaded public spectra. The private Freiburg tutorial files were not refitted here, and this was a numerical-core audit rather than a browser-interaction audit.

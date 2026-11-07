# Unrounded-coefficient refit and BHF comparison

November 6, 2026.

**Result:** all 44 paired WASM refits converged. Across 64 magnetic-site comparisons, BHF increases by 2.868–8.773 mT (0.0113–0.0317%). In the six model-matched room-temperature CONFIT comparisons the increase is only 6.37–7.29 mT. The remaining difference is approximately −0.081 to −0.093 T (−0.179% to −0.189%). Using unrounded modern coefficients does **not** remove the CONFIT convention offset.

## Controlled comparison

The ten public test spectra were refitted using their previously selected thin and transmission models, plus the two room-temperature reference-constrained thin models: 22 model pairs, each fitted with legacy and unrounded coefficients in the same captured WASM runtime. Both runs start from the same archived optimum. This isolates the coefficient change in the previously selected local basin; it does not repeat the broader initial-value search or establish global optimality.

The observed counts, supplied calibrated velocity columns, weighting, site identities, profiles, fixed/varying flags, bounds, proportional links, and source settings were preserved. All models retain one common Lorentzian width within each site and fixed magnetic selection-rule ratios. No independent line widths, free empirical ratios, or new distribution parameters were introduced. Transmission keeps the original assumed 0.097 mm/s source FWHM; no newly calibrated Gaussian source was substituted. Calibration was deliberately not rerun: this compares coefficient conventions on the same supplied velocity scale.

- Legacy coefficients: 0.1613, 0.0934, 0.0255 mm/s/T.
- Unrounded coefficients: 0.1612785758490726, 0.09338354131598467, 0.02548850678289673 mm/s/T.
- Positive pair half-displacements, outer/middle/inner, in `CS ± coefficient × BHF`; see [nuclear-constant derivation](../../constants/RECOMMENDATION.md).

## Most comparable CONFIT results

These two 296 K models retain the previously reconstructed source constraints: S2 intensity = 3 × S1, common widths for S1/S2, and linked doublet widths for the starting assemblage. MossA uses unweighted residuals. Source-table values are retained verbatim; the last digits are export precision, not an accuracy claim. Source CSV tables also contain reported parameter error columns; their full covariance and uncertainty definition are not established here. No independent-error significance test is applied.

| Spectrum | Site | Previous MossA (T) | Unrounded MossA (T) | CONFIT table (T) | New − old (mT) | New − CONFIT (T) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Reacted, 296 K (`dk23289v`) | S 1 | 45.08820 | 45.09522 | 45.17595 | 7.022 | -0.08073 |
| Reacted, 296 K (`dk23289v`) | S 2 | 46.04726 | 46.05370 | 46.14003 | 6.440 | -0.08633 |
| Reacted, 296 K (`dk23289v`) | S 3 | 49.02414 | 49.03115 | 49.12408 | 7.007 | -0.09293 |
| Starting, 296 K (`dk23287v`) | S 1 | 45.06579 | 45.07308 | 45.15436 | 7.290 | -0.08128 |
| Starting, 296 K (`dk23287v`) | S 2 | 46.05869 | 46.06506 | 46.15138 | 6.369 | -0.08632 |
| Starting, 296 K (`dk23287v`) | S 3 | 49.14765 | 49.15472 | 49.24750 | 7.063 | -0.09278 |

![BHF changes and residual CONFIT offset](confit-bhf-comparison.png)

The new coefficients are slightly smaller than the old rounded MossA coefficients, so the same magnetic spacings require slightly larger fitted fields. They remain appreciably larger than the coefficients previously reconstructed from the CONFIT component exports (approximately 0.1609749, 0.0932103, 0.0254443 mm/s/T). Therefore most of the earlier offset remains. This is consistent with the earlier [independent effective-coefficient investigation](../../constants/REPORT.md); it is not evidence that the unrounded convention or optimizer is defective. The exact internal nuclear constants of CONFIT remain unverified.

## All ten spectra: preserved physical models

Values are from actual optimization, not multiplication by a common field-scale correction. The three coefficient ratios are not identical, and parameter correlations change the shift between sites/models. S1/S2/etc. identify the archived component ordering; they are not a new phase assignment. Unconstrained components can exchange character or migrate relative to the source components, so their slot names alone do not establish a one-to-one CONFIT match. For example, the archived unconstrained reacted 296 K S1 has CS near −2.66 mm/s and BHF near 25.9 T; its lower SSE is not evidence for the physical source-site assignment. The reference-constrained models above provide the meaningful direct comparison.

| Spectrum | Site | Old thin (T) | New thin (T) | Δ thin (mT) | Old transmission (T) | New transmission (T) | Δ transmission (mT) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mixture 70–30 | S 1 | 50.03380 | 50.04063 | 6.831 | 50.03951 | 50.04663 | 7.125 |
| Mixture 70–30 | S 2 | 46.26769 | 46.27646 | 8.773 | 46.30566 | 46.31426 | 8.597 |
| Mixture 70–30 | S 3 | 52.30006 | 52.30714 | 7.071 | 52.28947 | 52.29659 | 7.116 |
| Mixture 30–70 | S 1 | 50.06421 | 50.07135 | 7.143 | 50.07315 | 50.08030 | 7.149 |
| Mixture 30–70 | S 2 | 46.23421 | 46.24121 | 6.997 | 46.26590 | 46.27291 | 7.007 |
| Mixture 30–70 | S 3 | 52.28502 | 52.29237 | 7.348 | 52.27666 | 52.28400 | 7.337 |
| Mixture 50–50 | S 1 | 49.98119 | 49.98848 | 7.286 | 49.98800 | 49.99530 | 7.303 |
| Mixture 50–50 | S 2 | 46.07574 | 46.08307 | 7.332 | 46.09051 | 46.09785 | 7.332 |
| Mixture 50–50 | S 3 | 52.25640 | 52.26370 | 7.293 | 52.25153 | 52.25882 | 7.291 |
| Hematite | S 1 | 51.60672 | 51.61400 | 7.284 | 51.60851 | 51.61582 | 7.310 |
| Magnetite | S 1 | 45.42532 | 45.43191 | 6.589 | 45.43347 | 45.44006 | 6.587 |
| Magnetite | S 2 | 49.39663 | 49.40359 | 6.962 | 49.38997 | 49.39693 | 6.964 |
| Mexican ore | S 1 | 50.23099 | 50.23803 | 7.038 | 50.20116 | 50.20791 | 6.755 |
| Mexican ore | S 2 | 46.50199 | 46.50931 | 7.323 | 46.53216 | 46.53963 | 7.467 |
| Mexican ore | S 3 | 52.23659 | 52.24380 | 7.216 | 52.21412 | 52.22124 | 7.119 |
| Reacted, 296 K | S 1 | 25.88571 | 25.89110 | 5.387 | 25.84903 | 25.85505 | 6.029 |
| Reacted, 296 K | S 2 | 45.88684 | 45.89327 | 6.430 | 45.89474 | 45.90125 | 6.512 |
| Reacted, 296 K | S 3 | 48.99144 | 48.99837 | 6.927 | 48.97485 | 48.98176 | 6.912 |
| Low temperature, 0 T | S 1 | 52.77289 | 52.77986 | 6.963 | 52.73539 | 52.74231 | 6.917 |
| Low temperature, 0 T | S 2 | 50.61573 | 50.62266 | 6.934 | 50.61599 | 50.62294 | 6.948 |
| Low temperature, 0 T | S 3 | 49.85897 | 49.86564 | 6.672 | 49.81801 | 49.82459 | 6.583 |
| Low temperature, 0 T | S 4 | 34.55255 | 34.55789 | 5.343 | 34.55610 | 34.56150 | 5.397 |
| Starting, 296 K | S 1 | 46.16860 | 46.17519 | 6.592 | 46.13783 | 46.14466 | 6.826 |
| Starting, 296 K | S 2 | 45.39184 | 45.39894 | 7.097 | 45.37295 | 45.38048 | 7.527 |
| Starting, 296 K | S 3 | 49.16309 | 49.17010 | 7.010 | 49.14486 | 49.15192 | 7.062 |
| Low temperature, 6 T | S 1 | 25.36000 | 25.36300 | 2.996 | 25.34193 | 25.34480 | 2.868 |
| Low temperature, 6 T | S 2 | 13.17566 | 13.17982 | 4.157 | 13.17673 | 13.18091 | 4.181 |
| Low temperature, 6 T | S 3 | 56.53271 | 56.54045 | 7.747 | 56.53205 | 56.53981 | 7.758 |
| Low temperature, 6 T | S 4 | 45.29338 | 45.29984 | 6.461 | 45.29065 | 45.29708 | 6.436 |

## Low-temperature CONFIT table: different model assumptions

The 0 T low-temperature spectrum has exported field values, but its source analysis includes distributions. These simple-site refits do not reproduce all source constraints/physics. Their differences must not be read as pure conversion errors. The 6 T dataset has Hamiltonian/relaxation-model information; no directly comparable source BHF table was recovered in the earlier audit.

The source table lists S1 = 51.05715 T, S2 = 52.05238 T, S3 = 50.09626 T, and S4 = 34.79562 T. The separate old/new MossA values are in the all-spectrum table above. No arbitrary slot-by-slot subtraction or phase matching is made for this different model.


The six oxide spectra come from a Recoil export, not CONFIT. Their supplied component curves lack a complete numerical field/constraint table. Curve-reconstructed estimates from the earlier audit remain separately labeled in the CSV; they are not substituted for published BHF values.

## Numerical diagnostics and limits

- Legacy archived predictions agree with the current runtime within 0 relative to the maximum observed intensity. This guards against unrelated evaluator changes.
- Reoptimizing the unchanged legacy model moves any BHF by at most 3.28e-05 T; in the six matched CONFIT rows the maximum is 6.89e-07 T. These controls are much smaller than the new-coefficient shifts.
- All 44 fits converged. 0 of 22 modern model fits carry warnings; see `summary.json` for the archived/new warnings, ranks, and stopping codes.
- Changes in residual SSE range from -0.0979% to +0.5981%. A more accurately calculated central coefficient need not lower an imperfect model's residual against a particular calibrated dataset.
- All 22 modern projects were exported and reopened through the actual project loader with matching fit results. Original projects, inputs, and benchmark outputs were not overwritten.
- Approximate new 1 std values are provided in the CSV/results, conditional on the selected physical model and fixed calibration/constants. They do not incorporate shared nuclear-constant or calibration uncertainty. These paired fits reuse the same observations and are correlated; independent-error significance tests on their difference would be inappropriate.

## Files and reproduction

- [bhf-comparison.csv](bhf-comparison.csv): all 64 site/model rows, old/new/control values, approximate new std, six matched direct source comparisons, and separately labeled unmatched source-table/initial curve-reconstruction values.
- [summary.json](summary.json): comparison ranges and per-model numerical diagnostics.
- [results.json](results.json): full archived, legacy-control, and modern fit results, runtime/input hashes, and exact convention descriptors.
- [projects/](projects/): 22 modern fitted, reopenable MossA projects. Supplied axes are unchanged; they are explicitly new analyses, separate from the legacy originals.
- `runtime/`: captured WASM binary and binding used for all 44 fits.

```sh
npm run wasm
node --import tsx scripts/refit-unrounded-coefficients.ts
python3 scripts/report-unrounded-refit.py
```

Source observations/reference exports: Praetz et al., v2 (2025), [Zenodo 14959531](https://doi.org/10.5281/zenodo.14959531) (Recoil); Geymond, v2 (2025), [Zenodo 15331051](https://doi.org/10.5281/zenodo.15331051) (CONFIT and advanced analyses). Both datasets are CC BY 4.0. Original data and metadata remain under `../../public/`; exact member names and checksums are retained in the original manifest/cases and each new project provenance. This analysis covers the ten public test spectra, not the separate private Freiburg tutorial files.

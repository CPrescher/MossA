# Search around TRF local minima

November 6, 2026. Tested using the actual browser WASM local fitter, with unchanged site models, fixed powder line ratios, bounds, and links. The original coarse start is included in every search. No source reference curves or reference parameters are supplied to the search.

| Spectrum | Single-start residual sum | 12-start residual sum | Improvement factor | Elapsed time (s) |
| --- | ---: | ---: | ---: | ---: |
| MS_Fe2O3-Fe3O4_30-70 | 8.87592e+08 | 2.28266e+08 | 3.888 | 29.0 |
| MS-Fe2O3-Fe3O4_70-30 | 7.3233e+09 | 3.91172e+09 | 1.872 | 75.1 |
| MS_Fe2O3-Fe3O4_50-50 | 6.83803e+09 | 3.54301e+09 | 1.930 | 11.5 |
| MS_MexicanMagnetite | 3.6007e+09 | 2.27375e+09 | 1.584 | 17.7 |

All four searches found the better basins previously observed from reference-assisted starts. This is a targeted development benchmark on four known difficult cases, not an independent generalization test. It demonstrates reduced start dependence without proving a global optimum. Timing includes concurrent work.

The wrapper alternates deterministic low-discrepancy perturbations around the original model and the best solution found. It only changes free, unlinked site parameters. User bounds and core physical bounds are respected, and every candidate is checked by the actual core before fitting. Infeasible linked-bound trials are rejected. The first local fit is always retained as a candidate; the selected result therefore cannot have a worse objective than that first fit.

Use **Opt → Starting models → 12 · Explore alternatives** to repeat the tested search size. Default is one start; 4, 8, 12, 24, and 32 starts are available. More starts increase runtime. Intermediate plots retain the best objective reached so far; the status reports the current start. Stop terminates the worker and cancels the whole operation. The best result retains its own convergence, uncertainties, and warnings. Its additional search summary records trial objectives, completed starts, best-start index, and total iterations. Local covariance/std values remain conditional on the selected minimum.

Search settings and summaries survive autosave and portable project save/open. Source/velocity calibration keep their separate dedicated workflows. See [multistart-results.json](multistart-results.json) for full numerical results and `scripts/benchmark-multistart.mjs` to reproduce.

The constants investigation is separate: [CONFIT and MossA field conversions](../constants/REPORT.md). MossA’s hyperfine constants were not modified.

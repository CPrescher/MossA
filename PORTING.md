# Numerical provenance and migration notes

Reference: `CPrescher/MossA`, commit `d201482b7990afbd0e2dcc23e306bfc8d60a5049` (retained unchanged under `reference/MossA`). The browser and native Rust code share one numerical implementation.

## Preserved conventions

| MATLAB source | Port behavior |
| --- | --- |
| `lorentz_curve.m` | Area-normalized Lorentzian, `hwhm = fwhm / 2` |
| `gauss_curve.m` | Literal rounded constants `0.8326` and `1.7725`, rather than silently replacing them with exact constants |
| `pseudov_curve.m` | `mix × Lorentzian + (1 − mix) × Gaussian` |
| `lorentz_squared.m` | Original squared-Lorentzian expression, including its width convention |
| `doublet*.m` | Centers `CS ± QS/2`; A12 is the first-line area fraction, not an arbitrary ratio |
| `sextet*.m` | Original `0.1613`, `0.0934`, and `0.0255` field coefficients, QS shifts, and A12/A13 ratios; line areas sum to the intensity parameter |
| `cta_fit.m` | Thin-absorber spectrum is physical polynomial background minus summed absorption profiles |
| `cta_fit.m` / `cft_fit.m` result tables | Site intensity fraction is `100 × I_i / sum(I)`; raw intensity parameters remain separately visible |
| `cft_fit.m` | Source convolution with `exp(−sum(absorber profiles))`; fixed grid `−30:0.01:30`; MATLAB `conv(...,'same')` alignment; intensity scaling by `I0/100`; shape-preserving cubic interpolation to experimental velocities |
| `fold.m` | The original 1-based integer/half-integer circular pairing and summed counts |
| `MossA.m` velocity calibration | Linear or sinusoidal velocity axis, then subtract standard center shift |
| `MossA.m` mouse definition | Position/depth, then width, then opposite-line position for doublets/sextets; profile-specific height-to-area estimates and original `3.097` sextet starting-field conversion |

The full-transmission convolution is computed with zero-padded FFTs instead of a direct convolution. The result is checked against independently summed convolutions. Its finite-window and grid effects are retained, rather than renormalizing the source or replacing the reference model with an infinite-window approximation.

## Deliberate implementation choices

- **Solver:** Basin 3.2.0's bounded trust-region-reflective algorithm, using a pure Rust dense linear algebra path. This is not a reproduction of MATLAB's optimizer trajectory or `fmincon` algorithm. Tolerances, iteration counts, and final parameter values can differ.
- **Scaling and derivatives:** Independent coordinates are scaled by their starting magnitudes with sensible floors. Bound-aware finite differences use a nonzero step even when a starting parameter is zero. The reference's `calcJacobian.m` uses a relative step that becomes zero at zero; that failure is not retained.
- **Links:** Resolve proportional links as a graph before model evaluation; reject cycles/missing targets. Descendant bounds intersect with the independent source bounds, including negative factors. The optimizer never treats linked/fixed coordinates as independent variables. General xVBF normalization/equality constraints are outside the implemented scope.
- **Bounds:** Widths and sextet ratios have positive physical floors; intensities and field magnitudes are nonnegative. Doublet A12 and pseudo-Voigt mix are constrained to `[0,1]`. Initial values outside the combined bounds are rejected, not silently changed.
- **Background:** Stored coefficients are the actual additive background polynomial. MATLAB's internal optimizer sign conventions are not used as the new project format.
- **Residuals:** The plotted residual is always `observed − model`. The default minimized objective is unweighted SSE, matching the ordinary reference fit. Optional count weighting minimizes `sum(residual² / observed)` and requires strictly positive observations. This weighting is an additional explicit option; no count floor is silently imposed.
- **Uncertainties:** Approximate **1 std** from the local Jacobian covariance, scaled by `objective / (observations − independent parameters)`. These are not `nlparci` intervals or a full constrained/nonlinear uncertainty analysis. SVD diagnoses rank deficiency; errors are omitted for unidentifiable parameters and parameters at bounds. Linked errors propagate by the absolute link factor. No symmetric uncertainty is reported for fixed parameters.
- **Intensity fractions:** The percentage definition follows `cta_fit.m:870–903` and `cft_fit.m:879–913`. Fraction std is propagated as `sqrt(gᵀ C g)` using the full scaled-coordinate covariance, with proportional links included in the gradient. This improves on the MATLAB table's propagation of individual intensity errors without covariance terms. Fraction errors are percentage points. Nonconstant fractions have no symmetric std when their contributing directions are at active bounds or covariance is unavailable. Exact constant ratios (including a single nonzero site) have 0 std within the specified model. Zero total intensity has undefined percentages. Percentages refer to intensity parameters, not measured-window integrated dips or nonlinear transmitted components.
- **Progress:** The optimizer's accepted iteration states are published through a Rust observer. Expensive curve evaluation/serialization for progress occurs at most once per 100 ms, with a separate final result. Browser computation stays in the worker. Cancellation destroys the worker; the last displayed intermediate curve is discarded and starting parameters retained.
- **Mouse starting estimates:** Thin-absorber estimates retain MossA's height/width conversions, including rounded Gaussian conventions. Doublet/sextet centers are the midpoint of the selected outer lines in either click order. Full-transmission placement uses an optical-depth estimate `−ln(observed/background)` as an initial guess; it does not claim to invert source convolution. Switching models explicitly rescales intensity values and bounds by the current constant background as an approximate starting estimate, and records that action in Status.
- **Project files:** Versioned JSON keeps data and scientific model state separate from graphics. MATLAB `.map` files store MATLAB objects, including graphics-related fields; conversion requires a separate, explicit migration step.

## Validation status

Automated checks compare all 12 site/profile combinations with an independent JavaScript transcription of the MATLAB expressions, recover synthetic parameters, exercise bounds/fixed/linked parameters and uncertainty diagnostics, compare full transmission against direct convolution, and execute the actual compiled WASM APIs. The tests also cover progress throttling, import/folding/calibration, graph gestures, and click-to-define initialization. Browser checks exercise the real UI and worker.

**The profile fixtures are not MATLAB execution output.** MATLAB is unavailable here. The optional `reference/export_mossa_reference.m` can generate actual MATLAB values with the same test parameters. The next scientific validation step is a set of measured spectra with saved MATLAB models and results, including full transmission and difficult overlapping peaks. xVBF needs its own validation cases before porting.

The bundled iron mixture is deterministic synthetic teaching data, not an experimental spectrum or evidence of real-sample agreement.

## Site display and picking navigation

Selecting a site renders its curve after the observed points and fitted model, using a thicker colored stroke. Thin-absorber overlays retain their physical background-minus-profile scale. Full-transmission overlays use a common display-only factor, `0.8 × (I0 − min(observed)) / max(sum(absorber profiles))`, evaluated on the plotted data coordinates. This follows MossA's display convention and does not change the transmitted model or objective. These overlays are not additive transmission components. Residuals are shown as points.

During picking, only an undragged left click advances a definition step. Left-drag rectangle zoom, right-drag pan, wheel zoom, right-click unzoom, and double-right-click reset retain their normal meaning. Esc or Cancel exits picking. The lower-right instruction popup does not intercept pointer events or occupy layout space.

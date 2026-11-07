# Source basis for the SYNCmoss and physics chapters

Checked November 7, 2026. These notes record evidence and access limits for
authors; they are not a claim that every referenced paper was reanalyzed.

- The original public SYNCmoss `LICENSE` at commit
  `b712fbc1521004a47409b964b9ab012fe5c5e255` is MIT, copyright ESRF. The pinned
  repository tree and the headers of all three selected `.dat` files were
  inspected; no separate dataset restriction was found there. The exact
  notice is copied with the inputs and embedded in generated project,
  source-conversion, provenance, and fit-result records. No paper figures or
  upstream app screenshots are copied.
- Dataset paths, exact Git blob hashes, SHA-256 hashes, original header
  lines, row counts, and velocity ranges are in
  `public/tutorial-data/syncmoss/provenance.json`. CMS and Calibration numeric
  rows were compared directly and are identical. The SMS source triples
  come from its own `#@INSexp` header, rather than from a figure or a new fit.
- Yaroslavtsev (2023), DOI 10.1107/S1600577523001686: the publisher's full
  HTML was inspected. Section 2 describes extraction of an instrumental
  response and the consequences of replacing it by a symmetric shape;
  Section 3, equation 1 defines effective thickness; Sections 3.1–3.2
  distinguish approximate patterns from combined-Hamiltonian models.
  The tutorial does not reproduce Figure 1 or assign its component model
  to these newer bundled files. The implemented source conversion and
  narrow isotropic comparison are documented independently in
  `validation-data/syncmoss-sms/README.md` and its pinned harness.
- The physical equations in the foundations are original explanatory
  derivations with explicit units and assumptions. Their mapping to MossA
  was checked against `profile`, `site_curve_with_coefficients`,
  `Prepared::curves`, `source_transform`, and `residuals` in the current
  Rust core, and against the retained MATLAB `sextet.m`. In particular,
  the six normalized sextet line areas sum to its raw intensity, the
  Lorentzian-squared actual FWHM is `w * sqrt(sqrt(2)-1)`, and the ordinary
  full-transmission count model is `b0*T + B(v)-b0`. These are implementation
  statements, not conclusions inferred from a fitted spectrum.
- The modern Fe57 magnetic convention and its primary evaluated inputs
  are recorded in `validation-data/constants/RECOMMENDATION.md` and
  `src/nuclear-constants.json`. The Zhao–Sturhahn (2012) publisher HTML
  (DOI 10.1107/S0909049512022339), Section 3, is the transition-energy
  reference already used by that derivation.
- NNDC's adopted 57Fe PDF, evaluation September 1998, first page: ground
  spin 1/2, 14.4-keV spin 3/2, and half-life 98.3(3) ns. The tutorial uses
  those lifetime data only at illustrative precision and distinguishes
  half-life from mean lifetime. Its old magnetic moments are not adopted
  as the current MossA convention.
- Preston, Hanna, and Heberle (1962), DOI 10.1103/PhysRev.128.2207: the
  accessible publisher abstract was inspected for measured iron
  temperature shifts. Full text is subscription-restricted; no detailed
  temperature calibration was reconstructed from it.
- Prescher, McCammon, and Dubrovinsky (2012), DOI
  10.1107/S0021889812004979: publisher metadata/abstract confirm the program
  citation. Full text was not accessible here; current equations were
  audited against the available source code instead.
- Mössbauer's Nobel lecture is linked as primary historical reading.
  Search-indexed lecture text was available, while the direct PDF fetch
  returned HTTP 403. No lecture figures or extended quotations are used.
  The optional Gütlich lecture PDF exceeded the browser retrieval size
  limit and was not used as a full-text source.

The four worked fits are new production-WASM results, with source and
velocity inputs fixed as described. Reopening verifies their numerical
bindings; the CMS approximations deliberately retain poor residuals. The
two original calculated figures have their own scripts and theme variants.
Neither convergence nor a reduced objective near one is presented as
certification of phase assignment, source extraction, or general parity
with SYNCmoss.

## Added-site comparison lesson (2026-11-07)

- The general F theorem in the University of Leeds regression lecture,
  https://seehuhn.github.io/MATH3714/S12-selection.html, Section 12.3,
  was inspected for nested full-rank normal linear models and degrees of
  freedom. Its parameter convention excludes the intercept; the manual
  counts all independent fitted coordinates, including the background.
- GraphPad's own explanation,
  https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_howtheftestworks.htm,
  was inspected for extra-sum-of-squares arithmetic and nested-model
  interpretation. The manual does not claim an exact F law for arbitrary
  nonlinear, constrained, or count-weighted fits.
- Protassov et al. (2002), ApJ 571, 545, DOI 10.1086/339856,
  https://arxiv.org/html/astro-ph/0201547, abstract, Section 3 and Appendix B,
  directly address boundary hypotheses in tests for additional spectral
  components. Their Bayesian posterior-predictive procedure is distinguished
  from MossA's fitted-null parametric bootstrap.
- Current `src/comparison.ts` was audited for matching/nesting checks,
  null embedding, free-parameter counts, the Gaussian residual std,
  generation under the simpler fit, observed and simulated refits, raw
  objective-gain tails, the +1 p correction, Wilson interval, and failure
  handling. `src/CompareModels.tsx` was checked for the displayed verdict
  and the descriptive-only F statistic. No app inference code was changed.
- The original synthetic teaching spectra are generated by
  `scripts/prepare-comparison-tutorial.ts` with production WASM and the
  production comparison functions. Each case has 199 null trials, all
  retained, with full reports and reopenable observed projects. The
  renderer replays those fits and states that it does not analyze user
  data. Fixed line shapes simplify teaching; numerical-stationarity
  warnings and active intensity bounds remain recorded, not hidden.
- Completed actual-browser comparisons for the absent and weak cases
  reproduce the exceedance counts, corrected p-values, and Wilson intervals
  exactly. Their saved-start versus generator simulated gains differ by
  less than 6e-12. `test-results/comparison-tutorial/browser-report-check.json`
  records the comparison. Real light/dark app captures have their own
  ledger entries; no screenshots are recolored.

## Recorded magnetic constant convention

These values were derived and checked in the local preview.16 development checkout; they do not change the deployed app in this documentation-only commit. Extra calculation digits do not imply extra experimental precision.

### Evaluated inputs and derivation

November 6, 2026. Recommendation: use unrounded coefficients derived from the IAEA recommended central magnetic moments for a new explicitly identified convention. Preserve the current rounded coefficients for existing analyses. Do not adopt the inferred CONFIT coefficients merely to reproduce its BHF labels.

## Evaluated nuclear data

| Quantity | Value | Owning source and location |
| --- | --- | --- |
| Ground spin | 1/2 | IAEA INDC(NDS)-0794 (2019), printed/PDF p.17, 26 Fe 57 row |
| Ground magnetic moment | +0.09064(7) nuclear magnetons | Same table; measurement reference 1974Sa25 |
| Excited spin | 3/2 | IAEA INDC(NDS)-0816 (2020), printed/PDF p.18, 26 Fe 57 14-keV row |
| Excited magnetic moment | -0.15531(18) nuclear magnetons | Same table; measurement reference 1965Pe15 |
| Adopted transition energy for this calculation | 14.412497 keV | Zhao and Sturhahn (2012), section 3, DOI 10.1107/S0909049512022339 |
| Nuclear magneton | 5.0507837393(16) x 10^-27 J/T | CODATA 2022, NIST |
| Speed of light | 299792458 m/s, exact | SI |
| Electron volt | 1.602176634 x 10^-19 J, exact | SI |

The magnetic moments above are the IAEA's recommended evaluated values, not independent new measurements performed in 2019/2020. Their recommendation includes reassessment of reference moments, corrections, and uncertainties. The older ENSDF 57Fe evaluation is dated September 1998; its +0.09044(7) and -0.1549(2) entries should not be presented as the latest recommendation simply because the PDF remains available on the current NNDC website.

The IAEA tables were downloaded from the official records, their advertised MD5 checksums verified, the relevant text extracted, and the full relevant pages visually checked. Source PDFs and page images are preserved under `sources/`. The SHA-256 hashes and exact input values are in `fe57-recommended-coefficients.json`.

## Derivation and signs

Write magnetic moments as dimensionless multiples of the nuclear magneton, and set:

- `g_g = mu_g / I_g = +0.18128`;
- `g_e = mu_e / I_e = -0.10354`;
- `K = 1000 c mu_N / E_gamma`, using matching energy units.

For the simple dipole Zeeman Hamiltonian, `E(I,m) = -g mu_N m B`. The six allowed transitions have positive pair half-displacements per tesla:

- outer 1/6: `a1 = K (g_g - 3 g_e) / 2`;
- middle 2/5: `a2 = K (g_g - g_e) / 2`;
- inner 3/4: `a3 = K (g_g + g_e) / 2`.

The sign of the excited magnetic moment matters; substituting a negative g_e into a formula written for its magnitude without adjusting signs would be incorrect. These are half-separations, so the full outer separation is `2 a1 B`.

| Pair | Derived central value (mm/s/T) | Current MossA value | Current value above derived value |
| --- | ---: | ---: | ---: |
| 1/6 | 0.1612785758490726 | 0.1613 | 0.01328% |
| 2/5 | 0.0933835413159847 | 0.0934 | 0.01762% |
| 3/4 | 0.0254885067828967 | 0.0255 | 0.04509% |

All three derived values round to MossA's current four-decimal coefficients. This establishes that the present MossA convention is numerically consistent with modern evaluated nuclear moments. It does not establish which historical references originally motivated the MATLAB literals.

## Why use unrounded calculation values?

Use the unrounded derived central values internally and round only their human-readable display. This removes avoidable numerical approximation without claiming additional experimental precision. The extra digits describe a stable calculation from chosen central values; they are not extra measured digits of the nuclear moments.

The quoted moment uncertainties dominate the fundamental-constant and transition-energy precision relevant here. If the two moment uncertainties were independent, illustrative 1 std uncertainties in the outer/middle/inner coefficients would be about 0.000127, 0.0000605, and 0.0000605 mm/s/T. However, excited-state moment measurements can depend on ground-state reference moments: Perlow et al. (1965), the primary reference behind the excited-state entry, measured a moment ratio of magnitude 1.7135(15). A covariance of the two adopted moments is not supplied in the evaluations. The illustrative independent-error numbers are therefore not evaluated uncertainties for the derived coefficients and must not be silently folded into per-fit covariance estimates. Any constant uncertainty is shared between spectra/sites, rather than independent channel noise.

For scale: at an assumed 33 T reference field the derived full outer separation is about 10.6443860 mm/s, versus 10.6458 mm/s with current MossA literals. This is a much smaller change than the approximately 0.2% difference against the inferred CONFIT scale. The number 33 T is a reference-field assumption, not a universal room-temperature field certified for every iron foil.

## Interpretation of the CONFIT discrepancy

The previous analysis reconstructed CONFIT's effective coefficients as approximately 0.1609749, 0.0932103, and 0.0254443 mm/s/T. Those differ from the evaluated central-value convention and are not a reason to change MossA to match CONFIT. We still do not have CONFIT's internal source/versioned nuclear-constant documentation; its exact adopted moments cannot be established from those effective coefficients alone.

The previous matched-curve exercise remains valid: replacing coefficients with the reconstructed CONFIT values largely removes its BHF-label offset. The new conclusion is that agreement with that program is not the scientific criterion for selecting MossA's nuclear constants. The IAEA evaluations provide the defensible independently sourced basis.

## Applying this to software and saved analyses

Recommended convention identifier: `fe57-iaea-2019-2020-codata2022`.

The versioned implementation now:

1. Uses the derived coefficients consistently in line positions, graph-based initialization, and iron-reference velocity calibration for new analyses using this convention.
2. Saves the convention identifier and numerical coefficients in project and calibration provenance.
3. Treats existing projects lacking a convention identifier as `mossa-legacy-rounded`, preserving 0.1613/0.0934/0.0255 and their existing calibration/results.
4. Preserves old analyses on load/refit without providing an implicit conversion. Changing a model's convention invalidates its old fit binding.
5. Retains the underlying published reference data, legacy fixtures, and original MATLAB source. An adopted-convention change is distinct from a numerical port discrepancy.

Changing the same common field/velocity scale consistently in both iron calibration and sample fitting can substantially cancel its effect on BHF ratios. That cancellation does not hold for importing already calibrated velocity columns or for mixing different conventions. Differences in the relative three coefficients also mean the change is not exactly a single scale multiplier. Calibration standards should preferably carry their certified line positions/conditions; their assigned field itself can depend on the adopted nuclear convention.

The original investigation did not change production constants. The subsequent implementation uses `src/nuclear-constants.json` as the shared Rust/JavaScript registry. A fresh app and new velocity-column analyses use the unrounded convention. Raw-count imports reuse their active calibration's convention, so a legacy calibrated axis remains paired with legacy magnetic constants. Modern project/calibration files and autosaves use format version 2, while legacy-only saves remain version 1. Older model shapes, calibrated axes, fit results, and bindings are preserved; unknown or inconsistent constants are rejected. No automatic migration/recalibration is performed.

## Reproduction and references

Run `python3 scripts/derive-fe57-coefficients.py`. It checks agreement between the pair formulas and explicit enumeration of all six allowed Zeeman transitions, equal magnetic intervals, and rounding to the existing MossA literals. It uses exact SI definitions and explicit CODATA input rather than silently taking whichever constants happen to be installed in SciPy.

- N.J. Stone, [IAEA INDC(NDS)-0794 (2019), Table of Recommended Nuclear Magnetic Dipole Moments: Part I](https://doi.org/10.61092/iaea.yjpc-cns6), p.17; explanatory discussion pp.7-10.
- N.J. Stone, [IAEA INDC(NDS)-0816 (2020), Part II](https://doi.org/10.61092/iaea.1p48-p6c6), p.18; explanatory discussion pp.7-13.
- G.J. Perlow, C.E. Johnson, and W. Marshall, [Physical Review 140, A875 (1965)](https://doi.org/10.1103/PhysRev.140.A875). The accessible abstract states the moment ratio; full-text access was unavailable. The table's recommended moment, not a newly re-evaluated primary-paper value, is used here.
- [NIST CODATA 2022](https://physics.nist.gov/cuu/Constants/) and its [wall chart](https://physics.nist.gov/cuu/pdf/wall_2022.pdf).
- J. Zhao and W. Sturhahn, [Journal of Synchrotron Radiation 19, 602-608 (2012)](https://doi.org/10.1107/S0909049512022339), section 3, adopted transition energy.
- [NNDC's 1998 ENSDF 57Fe evaluation](https://www.nndc.bnl.gov/ensnds/57/Fe/adopted.pdf), p.1, retained only for historical comparison.

## Recorded SYNCmoss validation

This is the recorded comparison against the local preview.16 development core. The deployment containing this manual does not publish those application changes. Reproduction commands require that development checkout. Numerical records referenced below are retained there; the public tutorial separately bundles its original inputs, source conversion, full fit outputs, licenses, and provenance.

### Checked numerical cases

Upstream snapshot: [`b712fbc1521004a47409b964b9ab012fe5c5e255`](https://github.com/sergey-yaroslavtsev/syncmoss/tree/b712fbc1521004a47409b964b9ab012fe5c5e255).

**Scope:** production MossA WASM versus the actual, unmodified SYNCmoss `models.TI` calculation using the measured SMS α-Fe standard and the instrumental profile embedded in that same file. This is an identical-parameter calculation comparison; the source is held fixed.

## Source and absorber conventions

- SYNCmoss source triples `(a, μ, c)` mean Gaussian std `a² + 0.098/2`, center `μ`, and integrated area `c²`. Convert std to FWHM with `2√(2 ln 2)`.
- SYNCmoss integrates `S(u) T(v+u)`; MossA uses response convolution `R(v-u) T(u)`. The response must be reflected. MossA fixes its centroid to zero, so upstream absorber centers are shifted by the original source centroid.
- Original source centroid: **0.00364996708957 mm/s**. All three supplied components are used; their weights sum to one.
- SYNCmoss thickness `T` becomes MossA optical-depth area `π × 0.098/2 × T`. Common Lorentzian line widths and exact individual line positions are preserved.
- Magnetic constants differ. The primary comparison expands the MossA site into identical SYNCmoss Singlet lines. A second comparison uses native SYNCmoss Sextet/Doublet components; its field and two sextet correction slots are explicitly mapped to preserve all line positions. Those correction values are numerical convention conversions, not inferred second-order physics.
- Both paths use the full exponential of summed optical depth. No channel averaging, texture, relaxation, or nonzero absorber Gaussian broadening is included. The same constant continuum is applied.

## Results

| Case | Maximum difference (counts) | RMS difference (counts) | Maximum / continuum |
| --- | ---: | ---: | ---: |
| measured-standard | 0.000127753 | 1.425539e-05 | 2.13e-08 |
| mixed-sites-control | 8.723612e-05 | 1.12217e-05 | 1.46e-08 |
| saturated-control | 5.326313e-05 | 6.787758e-06 | 8.89e-09 |
| grid-aligned-control | 1.200533e-10 | 1.951045e-11 | 2e-14 |

Acceptance: maximum difference / continuum below `1e-07`. **Passed.**

SYNCmoss was evaluated at 64, 128, 256, 512, 1024, and 2048 nodes. The 1024→2048 change is checked separately; native-component versus expanded-line agreement is also checked. The complete convergence results and parameter mappings are in `summary.json` and `upstream-comparison.json`.

The measured standard has 511 velocity/count pairs. A representative natural-width powder sextet gives reduced χ² = 0.974817 in MossA. Its fitted values select a realistic absorber for the numerical comparison; this is not an independent determination of the sample composition or a reproduction of the author's final fit.

The deliberately reflected source control differs by up to **311.167 counts**, showing that the comparison detects an incorrect asymmetry convention.

The original Gaussian-source implementation used PCHIP on the 0.01 mm/s convolution grid. Initial shared-grid evaluations agreed with SYNCmoss to about 1e-8 counts, while off-grid evaluations differed by up to 0.21 counts. Gaussian-source evaluation now uses six-point local polynomial interpolation; legacy source interpolation remains unchanged. The earlier prediction arrays are retained in `before-interpolation-fix.json`.

## Reproduce

Run from the repository root after installing Python `numpy scipy numba matplotlib`:

```sh
npm run wasm
python scripts/validate-syncmoss-sms.py
npx tsx --test tests/syncmoss-transmission.test.tsx
```

Upstream source is cached under the system temporary directory and verified against pinned Git blob hashes. No expressions in the upstream physics modules are patched or replaced. The serial pool implements only the same `starmap` interface used by the upstream tests. The Qt-bearing GUI is not imported.

Use `--write-fixture` only when intentionally refreshing the pinned regression fixture after inspecting the results. The fixture lets normal MossA tests verify the external calculation without downloading or installing SYNCmoss.

## Files and limitations

- `inputs/Standard_SMS.dat`: exact upstream measured data and embedded source parameters; `UPSTREAM_LICENSE.txt` retains its repository license.
- `inputs/source-profile.json`: exact supplied parameters and conversion into the MossA response convention.
- `standard-fit-results.json`: actual production-WASM fit and diagnostics.
- `SMS-standard.mossa.json`: reopenable measured standard at the fitted parameter values; source provenance is retained. Saved fit diagnostics are in the separate results file.
- `comparison.png` / `comparison.pdf`: measured spectrum, shared predictions, residuals, and engine difference.
- `summary.json`: acceptance checks, environment, source hashes, and runtime/core hashes.
- `upstream-comparison.json`: all sampled predictions and exact upstream inputs.

- Fixed supplied source; source extraction from a measured singlet was not tested.
- Scalar, isotropic random-powder absorption; polarized/texture/relaxation/Voigt parity is not established.
- Channel averaging and drive/finite-source smearing are disabled in both engines.
- The measured source parameters and natural absorber width are treated as exact.
- The source and sample conventions are explicitly converted; equal numerical BHF values across packages are not assumed.

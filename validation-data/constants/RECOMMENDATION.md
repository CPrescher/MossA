# Recommended 57Fe magnetic conversion convention for MossA

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

The IAEA tables were downloaded from the official records, their advertised MD5 checksums verified, the relevant text extracted, and the full relevant pages visually checked. Source PDFs and page images are preserved under `sources/`. The SHA-256 hashes and exact input values are in [fe57-recommended-coefficients.json](fe57-recommended-coefficients.json).

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

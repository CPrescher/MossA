# CONFIT and MossA magnetic-field conversion

Follow-up: the [evaluated nuclear-constants recommendation](RECOMMENDATION.md) shows that MossA's existing coefficients are consistent with the IAEA 2019/2020 recommended central moments rounded to four decimals. Matching CONFIT is not the criterion for choosing the scientific convention.

The [historical-convention check](HISTORICAL-CONVENTIONS.md) tests documented older moments and energy choices against these effective coefficients. The common Raghavan/ENSDF values are close, but no tested documented set reproduces all three exactly; the attribution to specific internal CONFIT constants remains unresolved.

November 6, 2026. The approximately 0.2% BHF offset is explained predominantly by different effective velocity-per-field coefficients, rather than a local-optimizer error.

| Magnetic line pair | MossA, directly verified in MATLAB and Rust source (mm/s/T) | CONFIT, reconstructed from six exported components (mm/s/T) |
| --- | ---: | ---: |
| Outer, 1/6 | 0.1613000 | approximately 0.1609749 |
| Middle, 2/5 | 0.0934000 | approximately 0.0932103 |
| Inner, 3/4 | 0.0255000 | approximately 0.0254443 |

MossA uses `CS ± coefficient × BHF`, with `+QS/2` on the outer pair and `−QS/2` on the other two pairs. Its coefficients are directly visible in `rust-core/src/lib.rs` and in the original `reference/MossA/sextet*.m`. They are larger than the reconstructed CONFIT coefficients by approximately 0.202%, 0.204%, and 0.219%, respectively. A fit to the same line positions therefore reports a smaller BHF in MossA. The small differences among the three ratios mean this is not an exactly uniform rescaling of all line spacings.

## What is directly documented, and what is inferred

The CONFIT `.par` files export a magnetic-splitting parameter `P01SxxF` in mm/s. Their companion `.csv` tables export BHF in T. Across all six room-temperature sextets:

- `F/B ≈ 0.11865455 mm/s/T`;
- `B/F ≈ 8.427827 T/(mm/s)`.

The companion `.gr` files give individual component curves. Independent reconstructions with common Lorentzian width per site and the source 3:2:1 line ratios give pair half-spacings near:

- `d_outer/F ≈ 1.3566685`;
- `d_middle/F ≈ 0.7855603`;
- `d_inner/F ≈ 0.2144398`.

Combining those independently available quantities yields the coefficients in the table. All six reconstructions agree closely; the reconstructed component curves have RMS deviations around 2.8–3.0 × 10⁻⁷ in relative intensity, consistent with the six-decimal rounding of the source curve exports. No different line widths were introduced for this reconstruction.

**These are effective constants inferred for the CONFIT exports in this dataset.** I did not obtain CONFIT source code or a manual specifying its exact internal nuclear constants. Its exact adopted ground/excited nuclear g factors, transition energy, and physical constants cannot be uniquely recovered separately from these coefficients alone. Do not label the inferred values as independently verified internal defaults for every CONFIT version. The accessible abstract of the [CONFIT methods paper](https://doi.org/10.1002/sia.2285) describes its fitting approach but does not specify those constants. The [MossWinn manual, section 42](https://www.mosswinn.hu/downloads/mosswinn.pdf) documents configurable nuclear constants for MossWinn; those values are not evidence of CONFIT's defaults.

## Verification with a second dataset held out

The three effective coefficients were estimated from `dk23289v` only, then used in an independent SciPy implementation to refit both datasets with the same parameter links as the previous audit. MossA's production constants were not changed. The second dataset, `dk23287v`, was held out from the coefficient estimate.

| Held-out starting assemblage | Source BHF (T) | Fit with MossA coefficients (T) | Fit with reconstructed CONFIT coefficients (T) |
| --- | ---: | ---: | ---: |
| S1 | 45.15436 | 45.06579 | 45.15729 |
| S2 | 46.15138 | 46.05869 | 46.15181 |
| S3 | 49.24750 | 49.14765 | 49.24711 |

The original 0.089–0.100 T differences fall to 0.0004–0.0029 T. The small remaining differences can include the different weighting used in our unweighted refit, source-output rounding, and numerical precision. The original discrepancy is therefore overwhelmingly a field-conversion convention effect. This is not a reason to change the published measurements or silently rescale archived results.

## Consequence for MossA

Retain the current constants for backward compatibility unless a deliberate scientific convention change is made. If cross-program compatibility is needed, expose explicitly named coefficient conventions, save them in project provenance, and apply the same convention consistently to the iron velocity calibration and sample fitting. Changing only the sample's field conversion while leaving calibration on another convention would be inconsistent. A direct velocity-column comparison, such as this one, does not independently validate the instrument calibration.

## Reproduction and provenance

Run `python3 scripts/investigate-confit-constants.py` and `python3 scripts/verify-confit-constants.py` from the repository root. The original CC BY 4.0 data are [Geymond (2025), Zenodo 15331051](https://zenodo.org/records/15331051). Original archives and metadata remain under `../public/`. The numerical records, original archive member names, reconstructed spacings, and held-out fits are in:

- [confit-inferred-constants.json](confit-inferred-constants.json)
- [confit-conversion-verification.json](confit-conversion-verification.json)

The extra digits in these JSON files describe the numerical reconstruction, not additional precision of the published physical measurements.

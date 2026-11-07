# Historical ⁵⁷Fe constants versus the CONFIT exports

November 6, 2026.

**Conclusion:** the exports are consistent with an older effective conversion scale, but they do not identify a unique historical pair of nuclear moments. The commonly tabulated Raghavan/ENSDF values explain much of the change from the modern IAEA scale, but do not reproduce the reconstructed CONFIT coefficients exactly. It would be premature to state that a particular outdated constant set is verified inside CONFIT.

## Historical values actually checked

The [September 1998 ENSDF evaluation](https://www.nndc.bnl.gov/ensnds/57/Fe/adopted.pdf), p.1, explicitly lists ground moment +0.09044(7) μN and excited moment −0.1549(2) μN, both attributed to 1989Ra17, and transition energy 14.4129(6) keV. The page was visually inspected. These imply g_g = +0.18088 and g_e = −0.1032667.

The [MossWinn manual](https://www.mosswinn.hu/downloads/mosswinn.pdf), section 42, printed p.145, documents very similar defaults: g_g = +0.18088, g_e = −0.103267, Eγ = 14.4129 keV. It cites Cohen–Taylor (1987) and Raghavan (1989) among its sources, and explicitly allows overrides. This confirms that such older values are real software conventions; it does not establish that CONFIT uses them.

[Locher and Geschwind (1965)](https://doi.org/10.1103/PhysRev.139.A991), accessible abstract, reports +0.09024(7) μN. [Perlow et al. (1965)](https://doi.org/10.1103/PhysRev.140.A875), accessible abstract, reports moment-ratio magnitude 1.7135(15). Multiplying those produces an illustrative older pair (+0.09024, −0.15462624); this is a constructed sensitivity test, not an attribution to CONFIT. Full papers were not accessible.

## Numerical comparison

All coefficients are positive pair half-separations in mm/s/T, ordered outer/middle/inner. Historical-moment tests hold μN at CODATA 2022 to isolate the adopted moment/energy choices; they are not a bit-for-bit emulation of historical executable arithmetic.

| Convention | μg / μN | μe / μN | Eγ (keV) | Outer | Middle | Inner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| CONFIT exports, reconstructed | — | — | not identified | 0.160974886 | 0.093210300 | 0.025444262 |
| 1965 ENDOR ground moment + 1965 Perlow moment ratio (constructed pair) | +0.09024000 | -0.15462624 | 14.412900 | 0.160563424 | 0.092969191 | 0.025374958 |
| Raghavan values in September 1998 ENSDF evaluation | +0.09044000 | -0.15490000 | 14.412900 | 0.160874078 | 0.093160172 | 0.025446265 |
| Same historical moments with rounded 14.4 keV energy | +0.09044000 | -0.15490000 | 14.400000 | 0.161018194 | 0.093243627 | 0.025469061 |
| Documented MossWinn defaults (another program) | +0.09044000 | -0.15490050 | 14.412900 | 0.160874406 | 0.093160281 | 0.025446156 |
| Modern IAEA central moments used by new MossA analyses | +0.09064000 | -0.15531000 | 14.412497 | 0.161278576 | 0.093383541 | 0.025488507 |

The 1998 historical set differs from the inferred CONFIT coefficients by -0.06262%, -0.05378%, and +0.00787%. In contrast, modern MossA coefficients are approximately +0.189%, +0.186%, and +0.174% above the export coefficients. Older moments account for much of the overall scale difference, but **closeness is not identification**. Even allowing a single freely chosen energy/common scale does not remove the historical pair's relative-spacing mismatch.

## What constants would approximately reproduce the exports?

For I_g = 1/2, I_e = 3/2 and K = 1000 c μN/Eγ, the dipole coefficients satisfy:

```text
a_outer  = K (g_g − 3 g_e)/2
a_middle = K (g_g −   g_e)/2
a_inner  = K (g_g +   g_e)/2
```

At fixed Eγ = 14.412497 keV and CODATA 2022 μN, a least-squares inversion of the three reconstructed coefficients gives effective g_g ≈ 0.18094797, g_e ≈ -0.10334217; equivalently **μg ≈ +0.090474 μN and μe ≈ -0.155013 μN**. These lie near historical tabulations, but I did not locate an independently documented adopted set with these exact central values. They must not be labeled as CONFIT's verified internal inputs.

The middle/inner spacings alone imply |μe/μg| ≈ 1.713361. The archive also independently exposes F/B ≈ 0.118654548 mm/s/T. Neither quantity separates the moments, transition energy, magneton, and possible hard-coded conversion factors without further assumptions.

There is a further precision limit: any exact two-moment dipole model requires `a_outer − 2 a_middle + a_inner = 0`. All six reconstructed export triplets instead give approximately −1.45 × 10⁻⁶ mm/s/T (range −1.52 to −1.41 × 10⁻⁶). Thus no choice of two moments and a common energy scale reproduces all three central coefficients exactly. The least-squares residual is at most 4.84 × 10⁻⁷ mm/s/T. Legacy rounded line factors, formula details, and reconstruction/model assumptions remain possibilities; this is not a demonstrated solver error. Nuclear-moment accuracy must not be inferred from extra digits in the curve reconstruction.

## Could transition-energy rounding alone explain it?

No. Modern moments would require energies around 14.437558–14.439687 keV to reproduce the three export coefficients separately, rather than 14.412497 or 14.4129 keV. The 14.4129 versus 14.412497 choice changes the coefficient scale by only about 0.0028%. Rounding to 14.4 keV increases the coefficients, which moves modern MossA away from the lower CONFIT coefficients. It is not the sole explanation.

## What is and is not verified for CONFIT

The inspected archived `.par` files contain fitted magnetic splitting F in mm/s, and companion `.csv` tables contain the BHF values. The reconstructed component curves and F/B ratios define a reproducible **effective export convention**. No raw nuclear constants were present in the selected parameter files. No relevant conversion source/configuration was found among the archive files.

The accessible [CONFIT methods paper (2006)](https://doi.org/10.1002/sia.2285) abstract/reference list describes the method but does not specify nuclear constants; its PDF endpoint was inaccessible (403). The [CONFIT2000 paper (2001)](https://doi.org/10.1023/A:1017614319281) was available as an abstract/subscription preview. Neither was a full-text audit. A versioned CONFIT configuration/manual or source routine defining F-to-B and the six line positions would resolve the attribution. No authors were contacted.

The defensible wording is: **“These CONFIT exports use a field-conversion convention different from the modern IAEA-based convention. It is near older nuclear-data scales, but the exact adopted historical constants have not been established.”** There is no basis here to silently change published fields or existing projects.

## Reproduce

```sh
python3 scripts/check-historical-fe57-conventions.py
```

The script reads the six previously reconstructed coefficient sets without overwriting them. [historical-conventions.json](historical-conventions.json) records candidate inputs, predictions, inversion assumptions, energy sensitivities, residuals, references, and the input SHA-256. The [original coefficient investigation](REPORT.md) and [unrounded measured-spectrum refits](../benchmark/unrounded-refit/REPORT.md) remain separate. No production constants or prior fitted values were changed.

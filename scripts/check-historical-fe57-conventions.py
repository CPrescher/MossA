#!/usr/bin/env python3
"""Test documented historical 57Fe constants against reconstructed exports.

This diagnoses effective conventions. It does not claim access to CONFIT's
internal constants, and it does not modify any production model or past fit.
"""
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-data/constants'
observations = json.loads((OUT / 'confit-inferred-constants.json').read_text())
sample = np.array([o['effective_coefficients_mm_s_per_T'] for o in observations])
observed = sample.mean(axis=0)
C, MU_N, EV = 299792458., 5.0507837393e-27, 1.602176634e-19
ENERGY = 14412.497

def coefficients(mug, mue, energy):
    gg, ge = mug / .5, mue / 1.5
    k = 1000 * C * MU_N / (energy * EV)
    return k / 2 * np.array([gg - 3*ge, gg - ge, gg + ge])

cases = [
    dict(label='1965 ENDOR ground moment + 1965 Perlow moment ratio (constructed pair)',
         mug=.09024, mue=-.09024*1.7135, energy=14412.9,
         status='Ground moment and ratio independently documented; excited moment is their product, not an independently published adopted pair.',
         sources=['https://doi.org/10.1103/PhysRev.139.A991', 'https://doi.org/10.1103/PhysRev.140.A875']),
    dict(label='Raghavan values in September 1998 ENSDF evaluation',
         mug=.09044, mue=-.1549, energy=14412.9,
         status='Documented historical adopted moments/level energy, ENSDF p.1; not established as CONFIT inputs.',
         sources=['https://www.nndc.bnl.gov/ensnds/57/Fe/adopted.pdf']),
    dict(label='Same historical moments with rounded 14.4 keV energy',
         mug=.09044, mue=-.1549, energy=14400.,
         status='Sensitivity test of a common energy rounding, not a documented CONFIT setting.',
         sources=['https://www.nndc.bnl.gov/ensnds/57/Fe/adopted.pdf']),
    dict(label='Documented MossWinn defaults (another program)',
         mug=.18088*.5, mue=-.103267*1.5, energy=14412.9,
         status='MossWinn manual section 42, printed p.145, explicitly labeled defaults. Not evidence of CONFIT settings.',
         sources=['https://www.mosswinn.hu/downloads/mosswinn.pdf']),
    dict(label='Modern IAEA central moments used by new MossA analyses',
         mug=.09064, mue=-.15531, energy=ENERGY,
         status='IAEA 2019 ground and 2020 excited recommended central moments; energy and SI/CODATA inputs as in the existing derivation.',
         sources=['https://doi.org/10.61092/iaea.yjpc-cns6', 'https://doi.org/10.61092/iaea.1p48-p6c6', 'https://doi.org/10.1107/S0909049512022339']),
]
for item in cases:
    predicted = coefficients(item['mug'], item['mue'], item['energy'])
    scale = (predicted @ observed) / (predicted @ predicted)
    item.update(coefficients_mm_s_per_T=predicted.tolist(),
                coefficient_minus_export_percent=(100*(predicted/observed-1)).tolist(),
                best_common_scale=float(scale), best_energy_eV=float(item['energy']/scale),
                residual_after_best_common_scale_percent=(100*(scale*predicted/observed-1)).tolist())

# A pure dipole sextet has only two independent half-separation coefficients.
# Estimate the best two g factors at an explicitly fixed energy/magneton.
k = 1000 * C * MU_N / (ENERGY * EV)
matrix = k / 2 * np.array([[1., -3.], [1., -1.], [1., 1.]])
gg, ge = np.linalg.lstsq(matrix, observed, rcond=None)[0]
prediction = matrix @ np.array([gg, ge])
closure = sample[:,0]-2*sample[:,1]+sample[:,2]
f_per_b = np.mean([o['F_per_B'] for o in observations])
modern = cases[-1]
required_energies = ENERGY*np.array(modern['coefficients_mm_s_per_T'])/observed
registry = json.loads((ROOT/'src/nuclear-constants.json').read_text())
assert np.allclose(modern['coefficients_mm_s_per_T'], registry['fe57-iaea-2019-2020-codata2022']['coefficients'], rtol=0, atol=3e-17)
assert abs(prediction[0]-2*prediction[1]+prediction[2]) < 1e-16
assert np.max(abs(closure)) > 1e-6  # report this inconsistency rather than forcing an exact attribution

result = dict(
    conclusion='An older effective conversion convention is plausible, but no tested documented historical set reproduces all three inferred coefficients exactly. Exact CONFIT defaults remain unverified.',
    confit_export_coefficient_mean_mm_s_per_T=observed.tolist(),
    confit_export_coefficient_min_mm_s_per_T=sample.min(axis=0).tolist(),
    confit_export_coefficient_max_mm_s_per_T=sample.max(axis=0).tolist(),
    mean_F_per_B_mm_s_per_T=float(f_per_b),
    conditioned_dipole_least_squares=dict(transition_energy_eV=ENERGY, nuclear_magneton_J_T=MU_N,
        gg=float(gg), ge=float(ge), mug_muN=float(.5*gg), mue_muN=float(1.5*ge),
        predicted_coefficients_mm_s_per_T=prediction.tolist(), residual_mm_s_per_T=(observed-prediction).tolist(),
        interpretation='Effective approximation to exported coefficients at fixed energy/magneton, not a measured or independently documented historical constant set.'),
    closure_a1_minus_2a2_plus_a3_mm_s_per_T=closure.tolist(),
    moment_ratio_magnitude_from_middle_inner=float(3*(observed[1]-observed[2])/(observed[1]+observed[2])),
    modern_moments_required_transition_energy_per_pair_eV=required_energies.tolist(),
    cases=cases,
    reconstruction_input_sha256=hashlib.sha256((OUT/'confit-inferred-constants.json').read_bytes()).hexdigest(),
    evidence_limits=['Only abstract/reference access to the 2001/2006 CONFIT methods papers; full-text access unavailable.',
        'No CONFIT source code or versioned constants/configuration documentation was recovered.',
        'The archived .par uses magnetic splitting F in mm/s; companion CSV includes fields in T. These are effective export conventions, not proof of all-version internal defaults.',
        'Dipole closure is approximate in the reconstructed exports. Rounding/legacy formula details or reconstruction/model assumptions can contribute; no exact two-moment inversion is possible at these central coefficients.',
        'No uncertainty/covariance model is assigned to this reconstruction; export digit spread is not nuclear-moment uncertainty.'])
(OUT/'historical-conventions.json').write_text(json.dumps(result, indent=2)+'\n')

lines = ['# Historical ⁵⁷Fe constants versus the CONFIT exports', '', 'November 6, 2026.', '',
    '**Conclusion:** the exports are consistent with an older effective conversion scale, but they do not identify a unique historical pair of nuclear moments. The commonly tabulated Raghavan/ENSDF values explain much of the change from the modern IAEA scale, but do not reproduce the reconstructed CONFIT coefficients exactly. It would be premature to state that a particular outdated constant set is verified inside CONFIT.', '',
    '## Historical values actually checked', '',
    'The [September 1998 ENSDF evaluation](https://www.nndc.bnl.gov/ensnds/57/Fe/adopted.pdf), p.1, explicitly lists ground moment +0.09044(7) μN and excited moment −0.1549(2) μN, both attributed to 1989Ra17, and transition energy 14.4129(6) keV. The page was visually inspected. These imply g_g = +0.18088 and g_e = −0.1032667.', '',
    'The [MossWinn manual](https://www.mosswinn.hu/downloads/mosswinn.pdf), section 42, printed p.145, documents very similar defaults: g_g = +0.18088, g_e = −0.103267, Eγ = 14.4129 keV. It cites Cohen–Taylor (1987) and Raghavan (1989) among its sources, and explicitly allows overrides. This confirms that such older values are real software conventions; it does not establish that CONFIT uses them.', '',
    '[Locher and Geschwind (1965)](https://doi.org/10.1103/PhysRev.139.A991), accessible abstract, reports +0.09024(7) μN. [Perlow et al. (1965)](https://doi.org/10.1103/PhysRev.140.A875), accessible abstract, reports moment-ratio magnitude 1.7135(15). Multiplying those produces an illustrative older pair (+0.09024, −0.15462624); this is a constructed sensitivity test, not an attribution to CONFIT. Full papers were not accessible.', '',
    '## Numerical comparison', '',
    'All coefficients are positive pair half-separations in mm/s/T, ordered outer/middle/inner. Historical-moment tests hold μN at CODATA 2022 to isolate the adopted moment/energy choices; they are not a bit-for-bit emulation of historical executable arithmetic.', '',
    '| Convention | μg / μN | μe / μN | Eγ (keV) | Outer | Middle | Inner |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    f"| CONFIT exports, reconstructed | — | — | not identified | {observed[0]:.9f} | {observed[1]:.9f} | {observed[2]:.9f} |"]
for c in cases:
    co = c['coefficients_mm_s_per_T']
    lines.append(f"| {c['label']} | {c['mug']:+.8f} | {c['mue']:+.8f} | {c['energy']/1000:.6f} | {co[0]:.9f} | {co[1]:.9f} | {co[2]:.9f} |")
historical = cases[1]
diff = historical['coefficient_minus_export_percent']
lines += ['',
    f"The 1998 historical set differs from the inferred CONFIT coefficients by {diff[0]:+.5f}%, {diff[1]:+.5f}%, and {diff[2]:+.5f}%. In contrast, modern MossA coefficients are approximately +0.189%, +0.186%, and +0.174% above the export coefficients. Older moments account for much of the overall scale difference, but **closeness is not identification**. Even allowing a single freely chosen energy/common scale does not remove the historical pair's relative-spacing mismatch.", '',
    '## What constants would approximately reproduce the exports?', '',
    'For I_g = 1/2, I_e = 3/2 and K = 1000 c μN/Eγ, the dipole coefficients satisfy:', '',
    '```text', 'a_outer  = K (g_g − 3 g_e)/2', 'a_middle = K (g_g −   g_e)/2', 'a_inner  = K (g_g +   g_e)/2', '```', '',
    f"At fixed Eγ = {ENERGY/1000:.6f} keV and CODATA 2022 μN, a least-squares inversion of the three reconstructed coefficients gives effective g_g ≈ {gg:.8f}, g_e ≈ {ge:.8f}; equivalently **μg ≈ +{.5*gg:.6f} μN and μe ≈ {1.5*ge:.6f} μN**. These lie near historical tabulations, but I did not locate an independently documented adopted set with these exact central values. They must not be labeled as CONFIT's verified internal inputs.", '',
    f"The middle/inner spacings alone imply |μe/μg| ≈ {result['moment_ratio_magnitude_from_middle_inner']:.6f}. The archive also independently exposes F/B ≈ {f_per_b:.9f} mm/s/T. Neither quantity separates the moments, transition energy, magneton, and possible hard-coded conversion factors without further assumptions.", '',
    'There is a further precision limit: any exact two-moment dipole model requires `a_outer − 2 a_middle + a_inner = 0`. All six reconstructed export triplets instead give approximately −1.45 × 10⁻⁶ mm/s/T (range −1.52 to −1.41 × 10⁻⁶). Thus no choice of two moments and a common energy scale reproduces all three central coefficients exactly. The least-squares residual is at most 4.84 × 10⁻⁷ mm/s/T. Legacy rounded line factors, formula details, and reconstruction/model assumptions remain possibilities; this is not a demonstrated solver error. Nuclear-moment accuracy must not be inferred from extra digits in the curve reconstruction.', '',
    '## Could transition-energy rounding alone explain it?', '',
    f"No. Modern moments would require energies around {required_energies.min()/1000:.6f}–{required_energies.max()/1000:.6f} keV to reproduce the three export coefficients separately, rather than 14.412497 or 14.4129 keV. The 14.4129 versus 14.412497 choice changes the coefficient scale by only about 0.0028%. Rounding to 14.4 keV increases the coefficients, which moves modern MossA away from the lower CONFIT coefficients. It is not the sole explanation.", '',
    '## What is and is not verified for CONFIT', '',
    'The inspected archived `.par` files contain fitted magnetic splitting F in mm/s, and companion `.csv` tables contain the BHF values. The reconstructed component curves and F/B ratios define a reproducible **effective export convention**. No raw nuclear constants were present in the selected parameter files. No relevant conversion source/configuration was found among the archive files.', '',
    'The accessible [CONFIT methods paper (2006)](https://doi.org/10.1002/sia.2285) abstract/reference list describes the method but does not specify nuclear constants; its PDF endpoint was inaccessible (403). The [CONFIT2000 paper (2001)](https://doi.org/10.1023/A:1017614319281) was available as an abstract/subscription preview. Neither was a full-text audit. A versioned CONFIT configuration/manual or source routine defining F-to-B and the six line positions would resolve the attribution. No authors were contacted.', '',
    'The defensible wording is: **“These CONFIT exports use a field-conversion convention different from the modern IAEA-based convention. It is near older nuclear-data scales, but the exact adopted historical constants have not been established.”** There is no basis here to silently change published fields or existing projects.', '',
    '## Reproduce', '', '```sh', 'python3 scripts/check-historical-fe57-conventions.py', '```', '',
    'The script reads the six previously reconstructed coefficient sets without overwriting them. [historical-conventions.json](historical-conventions.json) records candidate inputs, predictions, inversion assumptions, energy sensitivities, residuals, references, and the input SHA-256. The [original coefficient investigation](REPORT.md) and [unrounded measured-spectrum refits](../benchmark/unrounded-refit/REPORT.md) remain separate. No production constants or prior fitted values were changed.']
(OUT/'HISTORICAL-CONVENTIONS.md').write_text('\n'.join(lines)+'\n')
print(result['conclusion'])
print('Effective fitted moments:', .5*gg, 1.5*ge)
print('Historical coefficient differences (%):', diff)

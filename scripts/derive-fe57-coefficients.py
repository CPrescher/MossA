#!/usr/bin/env python3
"""Derive 57Fe magnetic line coefficients from explicitly sourced central values.

This writes analysis artifacts only; it does not alter MossA's fitting constants.
The IAEA evaluations do not provide a covariance of the two moments. The optional
independent-error calculation below is illustrative, not an evaluated covariance.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-data/constants'
C = 299792458.0  # exact m/s
ELECTRON_VOLT_J = 1.602176634e-19  # exact
MU_N_J_T = 5.0507837393e-27  # CODATA 2022
MU_N_STD = 1.6e-36
E_GAMMA_EV = 14412.497  # Zhao & Sturhahn (2012), section 3
GROUND_MOMENT = 0.09064  # IAEA INDC(NDS)-0794, p.17; in nuclear magnetons
GROUND_STD = 0.00007
EXCITED_MOMENT = -0.15531  # IAEA INDC(NDS)-0816, p.18
EXCITED_STD = 0.00018


def coefficients(ground, excited, energy_ev=E_GAMMA_EV):
    # E_m = -g*mu_N*m*B; v(mm/s) = 1000*c*DeltaE/E_gamma.
    # I_g=1/2, I_e=3/2. Coefficients are positive pair half-separations.
    factor = 1000 * C * MU_N_J_T / (energy_ev * ELECTRON_VOLT_J)
    g_ground, g_excited = ground / .5, excited / 1.5
    return [factor*(g_ground-3*g_excited)/2,
            factor*(g_ground-g_excited)/2,
            factor*(g_ground+g_excited)/2]


def main():
    central = coefficients(GROUND_MOMENT, EXCITED_MOMENT)
    legacy = [.1613, .0934, .0255]
    factor = 1000 * C * MU_N_J_T / (E_GAMMA_EV * ELECTRON_VOLT_J)
    assert [round(v, 4) for v in central] == legacy
    assert math.isclose(central[0]-central[1], central[1]-central[2], abs_tol=1e-15)
    # Independent check directly enumerating the allowed Zeeman transitions.
    gg, ge = GROUND_MOMENT/.5, EXCITED_MOMENT/1.5
    transitions = sorted(factor * (gg*mg-ge*me)
                         for mg in [-.5,.5] for me in [-1.5,-.5,.5,1.5]
                         if abs(me-mg) <= 1)
    for a,b in zip(transitions, [-central[0],-central[1],-central[2],central[2],central[1],central[0]]):
        assert math.isclose(a,b,abs_tol=1e-15)
    records=[]
    for i,name in enumerate(['outer_1_6','middle_2_5','inner_3_4']):
        excited_factor=1 if i==0 else 1/3
        illustrative_std=factor*math.hypot(GROUND_STD,excited_factor*EXCITED_STD)
        records.append(dict(pair=name,central_mm_s_per_T=central[i],legacy_mm_s_per_T=legacy[i],legacy_relative_difference_percent=100*(legacy[i]/central[i]-1),illustrative_std_assuming_independent_moments=illustrative_std))
    documents=[]
    for name,page,url in [('stone-2019-0794.pdf',17,'https://doi.org/10.61092/iaea.yjpc-cns6'),('stone-2020-0816.pdf',18,'https://doi.org/10.61092/iaea.1p48-p6c6')]:
        p=OUT/'sources'/name
        documents.append(dict(file=str(p.relative_to(ROOT)),printed_page=page,url=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    result=dict(convention='fe57-iaea-2019-2020-codata2022',inputs=dict(c_m_s=C,eV_J=ELECTRON_VOLT_J,nuclear_magneton_J_T=MU_N_J_T,nuclear_magneton_std_J_T=MU_N_STD,transition_energy_eV=E_GAMMA_EV,ground_moment_muN=GROUND_MOMENT,ground_moment_std_muN=GROUND_STD,excited_moment_muN=EXCITED_MOMENT,excited_moment_std_muN=EXCITED_STD,ground_g=gg,excited_g=ge),coefficients=records,source_documents=documents,energy_source='https://doi.org/10.1107/S0909049512022339',nuclear_magneton_source='https://physics.nist.gov/cuu/Constants/',uncertainty_note='Moment covariance is unavailable. Independent-error std values are illustrative only; the extra calculation digits do not imply more precise nuclear measurements.',old_ensdf_1998_coefficients=coefficients(.09044,-.1549,14412.9))
    (OUT/'fe57-recommended-coefficients.json').write_text(json.dumps(result,indent=2)+'\n')
    for record in records:
        print(f"{record['pair']}: {record['central_mm_s_per_T']:.12f} mm/s/T; legacy difference {record['legacy_relative_difference_percent']:.5f}%")
    print('Checks passed: source-derived values round to legacy; equal magnetic intervals; explicit Zeeman-transition enumeration.')


if __name__=='__main__':
    main()

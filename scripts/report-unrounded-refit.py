#!/usr/bin/env python3
"""Summarize the paired WASM refits without modifying earlier audit results."""
import csv
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-data/benchmark/unrounded-refit'
data = json.loads((OUT / 'results.json').read_text())
records = data['records']
assert len(records) == 22
assert all(r[c]['result']['converged'] for r in records for c in ['legacy', 'modern'])
fields = [dict(dataset=r['id'], model=r['model'], **f) for r in records for f in r['fields']]
matched = [f for f in fields if f['reference_model_matched']]
assert len(fields) == 64 and len(matched) == 6
with (OUT / 'bhf-comparison.csv').open('w', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=list(fields[0]))
    writer.writeheader()
    writer.writerows(fields)

diagnostics = []
for r in records:
    old, control, new = r['previous'], r['legacy']['result'], r['modern']['result']
    diagnostics.append(dict(dataset=r['id'], model=r['model'], old_sse=old['evaluation']['sse'],
        legacy_sse=control['evaluation']['sse'], modern_sse=new['evaluation']['sse'],
        relative_sse_change_percent=100*(new['evaluation']['sse']/old['evaluation']['sse']-1),
        modern_termination=new['termination'], modern_iterations=new['iterations'],
        old_warnings=old['warnings'], new_warnings=new['warnings'],
        old_rank=old['rank'], new_rank=new['rank'], free_parameters=new['free_parameters']))

def interval(rows, key):
    values = [r[key] for r in rows]
    return [min(values), max(values)]

summary = dict(datasets=10, model_pairs=22, actual_wasm_fits=44, converged=44, magnetic_site_comparisons=len(fields),
    delta_B_T=interval(fields, 'delta_previous_T'), delta_B_percent=interval(fields, 'delta_previous_percent'),
    matched_delta_B_T=interval(matched, 'delta_previous_T'), matched_delta_B_percent=interval(matched, 'delta_previous_percent'),
    matched_new_minus_confit_T=interval(matched, 'new_minus_confit_T'),
    matched_new_minus_confit_percent=interval(matched, 'new_minus_confit_percent'),
    matched_old_minus_confit_T=interval(matched, 'previous_minus_confit_T'),
    max_legacy_control_B_drift_T=max(abs(f['legacy_control_drift_T']) for f in fields),
    max_matched_legacy_control_B_drift_T=max(abs(f['legacy_control_drift_T']) for f in matched),
    max_legacy_prediction_relative_difference=max(r['legacy_prediction_relative_difference'] for r in records),
    sse_change_percent=interval(diagnostics, 'relative_sse_change_percent'),
    new_warning_models=sum(bool(d['new_warnings']) for d in diagnostics),
    diagnostics=diagnostics, matched_confit_fields=matched)
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2)+'\n')

labels = {'MS-Fe2O3-Fe3O4_70-30': 'Mixture 70–30', 'MS_Fe2O3-Fe3O4_30-70': 'Mixture 30–70',
    'MS_Fe2O3-Fe3O4_50-50': 'Mixture 50–50', 'MS_Fe2O3': 'Hematite', 'MS_Fe3O4': 'Magnetite',
    'MS_MexicanMagnetite': 'Mexican ore', 'dk23289v': 'Reacted, 296 K', 'dk23287v': 'Starting, 296 K',
    'dk23297v': 'Low temperature, 0 T', 'dk23302v': 'Low temperature, 6 T'}
plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
fig, (ax, change) = plt.subplots(1, 2, figsize=(11.4, 4.3), sharey=True, layout='constrained', gridspec_kw={'width_ratios': [1.7, 1]})
y = np.arange(len(matched))
old = [1000*f['previous_minus_confit_T'] for f in matched]
new = [1000*f['new_minus_confit_T'] for f in matched]
for i, (a, b) in enumerate(zip(old, new)):
    ax.plot([a, b], [i, i], color='#bbbbbb', lw=2)
ax.scatter(old, y, color='#777777', label='Previous MossA', zorder=3)
ax.scatter(new, y, color='#127f86', label='Unrounded MossA', zorder=3)
ax.axvline(0, color='#333333', lw=1, ls='--', label='CONFIT reference')
ax.set_yticks(y, [f"{labels[f['dataset']]} · {f['site']}" for f in matched])
ax.invert_yaxis()
ax.set_xlabel('BHF − CONFIT reference (mT)')
ax.set_xlim(-108, 7)
ax.legend(fontsize=8, loc='upper right')
change.barh(y, [1000*f['delta_previous_T'] for f in matched], color='#127f86', height=.56)
change.tick_params(axis='y', left=False, labelleft=False)
change.set_xlim(0, 8.5)
change.set_xlabel('New − previous MossA BHF (mT)')
for i, f in enumerate(matched):
    change.text(1000*f['delta_previous_T']+.08, i, f"{1000*f['delta_previous_T']:.2f}", va='center', fontsize=9)
fig.suptitle('Unrounded coefficients shift BHF slightly; the CONFIT offset remains', fontsize=12)
fig.savefig(OUT / 'confit-bhf-comparison.png', dpi=180)
fig.savefig(OUT / 'confit-bhf-comparison.svg')
plt.close(fig)

lines = ['# Unrounded-coefficient refit and BHF comparison', '', 'November 6, 2026.', '',
    f"**Result:** all 44 paired WASM refits converged. Across 64 magnetic-site comparisons, BHF increases by {1000*summary['delta_B_T'][0]:.3f}–{1000*summary['delta_B_T'][1]:.3f} mT ({summary['delta_B_percent'][0]:.4f}–{summary['delta_B_percent'][1]:.4f}%). In the six model-matched room-temperature CONFIT comparisons the increase is only 6.37–7.29 mT. The remaining difference is approximately −0.081 to −0.093 T (−0.179% to −0.189%). Using unrounded modern coefficients does **not** remove the CONFIT convention offset.", '',
    '## Controlled comparison', '',
    'The ten public test spectra were refitted using their previously selected thin and transmission models, plus the two room-temperature reference-constrained thin models: 22 model pairs, each fitted with legacy and unrounded coefficients in the same captured WASM runtime. Both runs start from the same archived optimum. This isolates the coefficient change in the previously selected local basin; it does not repeat the broader initial-value search or establish global optimality.', '',
    'The observed counts, supplied calibrated velocity columns, weighting, site identities, profiles, fixed/varying flags, bounds, proportional links, and source settings were preserved. All models retain one common Lorentzian width within each site and fixed magnetic selection-rule ratios. No independent line widths, free empirical ratios, or new distribution parameters were introduced. Transmission keeps the original assumed 0.097 mm/s source FWHM; no newly calibrated Gaussian source was substituted. Calibration was deliberately not rerun: this compares coefficient conventions on the same supplied velocity scale.', '',
    '- Legacy coefficients: 0.1613, 0.0934, 0.0255 mm/s/T.',
    '- Unrounded coefficients: 0.1612785758490726, 0.09338354131598467, 0.02548850678289673 mm/s/T.',
    '- Positive pair half-displacements, outer/middle/inner, in `CS ± coefficient × BHF`; see [nuclear-constant derivation](../../constants/RECOMMENDATION.md).', '',
    '## Most comparable CONFIT results', '',
    'These two 296 K models retain the previously reconstructed source constraints: S2 intensity = 3 × S1, common widths for S1/S2, and linked doublet widths for the starting assemblage. MossA uses unweighted residuals. Source-table values are retained verbatim; the last digits are export precision, not an accuracy claim. Source CSV tables also contain reported parameter error columns; their full covariance and uncertainty definition are not established here. No independent-error significance test is applied.', '',
    '| Spectrum | Site | Previous MossA (T) | Unrounded MossA (T) | CONFIT table (T) | New − old (mT) | New − CONFIT (T) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
for f in matched:
    lines.append(f"| {labels[f['dataset']]} (`{f['dataset']}`) | {f['site']} | {f['previous_mossa_T']:.5f} | {f['new_mossa_T']:.5f} | {f['confit_reference_T']:.5f} | {1000*f['delta_previous_T']:.3f} | {f['new_minus_confit_T']:+.5f} |")
lines += ['', '![BHF changes and residual CONFIT offset](confit-bhf-comparison.png)', '',
    'The new coefficients are slightly smaller than the old rounded MossA coefficients, so the same magnetic spacings require slightly larger fitted fields. They remain appreciably larger than the coefficients previously reconstructed from the CONFIT component exports (approximately 0.1609749, 0.0932103, 0.0254443 mm/s/T). Therefore most of the earlier offset remains. This is consistent with the earlier [independent effective-coefficient investigation](../../constants/REPORT.md); it is not evidence that the unrounded convention or optimizer is defective. The exact internal nuclear constants of CONFIT remain unverified.', '',
    '## All ten spectra: preserved physical models', '',
    'Values are from actual optimization, not multiplication by a common field-scale correction. The three coefficient ratios are not identical, and parameter correlations change the shift between sites/models. S1/S2/etc. identify the archived component ordering; they are not a new phase assignment. Unconstrained components can exchange character or migrate relative to the source components, so their slot names alone do not establish a one-to-one CONFIT match. For example, the archived unconstrained reacted 296 K S1 has CS near −2.66 mm/s and BHF near 25.9 T; its lower SSE is not evidence for the physical source-site assignment. The reference-constrained models above provide the meaningful direct comparison.', '',
    '| Spectrum | Site | Old thin (T) | New thin (T) | Δ thin (mT) | Old transmission (T) | New transmission (T) | Δ transmission (mT) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for record in records:
    if record['model'] != 'thin': continue
    t = next(r for r in records if r['id'] == record['id'] and r['model'] == 'transmission')
    for f, ft in zip(record['fields'], t['fields']):
        assert f['site'] == ft['site']
        lines.append(f"| {labels[record['id']]} | {f['site']} | {f['previous_mossa_T']:.5f} | {f['new_mossa_T']:.5f} | {1000*f['delta_previous_T']:.3f} | {ft['previous_mossa_T']:.5f} | {ft['new_mossa_T']:.5f} | {1000*ft['delta_previous_T']:.3f} |")
lines += ['', '## Low-temperature CONFIT table: different model assumptions', '',
    'The 0 T low-temperature spectrum has exported field values, but its source analysis includes distributions. These simple-site refits do not reproduce all source constraints/physics. Their differences must not be read as pure conversion errors. The 6 T dataset has Hamiltonian/relaxation-model information; no directly comparable source BHF table was recovered in the earlier audit.', '',
    'The source table lists S1 = 51.05715 T, S2 = 52.05238 T, S3 = 50.09626 T, and S4 = 34.79562 T. The separate old/new MossA values are in the all-spectrum table above. No arbitrary slot-by-slot subtraction or phase matching is made for this different model.', '']
lines += ['',
    'The six oxide spectra come from a Recoil export, not CONFIT. Their supplied component curves lack a complete numerical field/constraint table. Curve-reconstructed estimates from the earlier audit remain separately labeled in the CSV; they are not substituted for published BHF values.', '',
    '## Numerical diagnostics and limits', '',
    f"- Legacy archived predictions agree with the current runtime within {summary['max_legacy_prediction_relative_difference']:.3g} relative to the maximum observed intensity. This guards against unrelated evaluator changes.",
    f"- Reoptimizing the unchanged legacy model moves any BHF by at most {summary['max_legacy_control_B_drift_T']:.3g} T; in the six matched CONFIT rows the maximum is {summary['max_matched_legacy_control_B_drift_T']:.3g} T. These controls are much smaller than the new-coefficient shifts.",
    f"- All 44 fits converged. {summary['new_warning_models']} of 22 modern model fits carry warnings; see `summary.json` for the archived/new warnings, ranks, and stopping codes.",
    f"- Changes in residual SSE range from {summary['sse_change_percent'][0]:+.4f}% to {summary['sse_change_percent'][1]:+.4f}%. A more accurately calculated central coefficient need not lower an imperfect model's residual against a particular calibrated dataset.",
    '- All 22 modern projects were exported and reopened through the actual project loader with matching fit results. Original projects, inputs, and benchmark outputs were not overwritten.',
    '- Approximate new 1 std values are provided in the CSV/results, conditional on the selected physical model and fixed calibration/constants. They do not incorporate shared nuclear-constant or calibration uncertainty. These paired fits reuse the same observations and are correlated; independent-error significance tests on their difference would be inappropriate.', '',
    '## Files and reproduction', '',
    '- [bhf-comparison.csv](bhf-comparison.csv): all 64 site/model rows, old/new/control values, approximate new std, six matched direct source comparisons, and separately labeled unmatched source-table/initial curve-reconstruction values.',
    '- [summary.json](summary.json): comparison ranges and per-model numerical diagnostics.',
    '- [results.json](results.json): full archived, legacy-control, and modern fit results, runtime/input hashes, and exact convention descriptors.',
    '- [projects/](projects/): 22 modern fitted, reopenable MossA projects. Supplied axes are unchanged; they are explicitly new analyses, separate from the legacy originals.',
    '- `runtime/`: captured WASM binary and binding used for all 44 fits.', '',
    '```sh', 'npm run wasm', 'node --import tsx scripts/refit-unrounded-coefficients.ts', 'python3 scripts/report-unrounded-refit.py', '```', '',
    'Source observations/reference exports: Praetz et al., v2 (2025), [Zenodo 14959531](https://doi.org/10.5281/zenodo.14959531) (Recoil); Geymond, v2 (2025), [Zenodo 15331051](https://doi.org/10.5281/zenodo.15331051) (CONFIT and advanced analyses). Both datasets are CC BY 4.0. Original data and metadata remain under `../../public/`; exact member names and checksums are retained in the original manifest/cases and each new project provenance. This analysis covers the ten public test spectra, not the separate private Freiburg tutorial files.']
(OUT / 'REPORT.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k: v for k,v in summary.items() if k not in ['diagnostics', 'matched_confit_fields']}, indent=2))

#!/usr/bin/env python3
"""Produce a measured-spectrum audit with reproducible plots and parameter tables."""
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'validation-data/benchmark'
cases=json.loads((OUT/'cases.json').read_text()); original=json.loads((OUT/'wasm-results.json').read_text())
runs=list(original['runs'])
for f in ['variant-results.json','refinement-results.json','physical-results.json']:
    runs+=json.loads((OUT/f).read_text())
valid=[r for r in runs if 'result' in r]
base_variants=lambda r: r['variant']=='reference-assisted' or r['variant'].startswith('perturbed-') or r['variant']=='coarse-start'
selections={}; summary=[]
for c in cases:
    rr=[r for r in valid if r['id']==c['id']]
    simple=min((r for r in rr if base_variants(r)),key=lambda r:r['result']['evaluation']['sse'])
    physical=next(r for r in rr if r['variant']=='transmission-random-powder')
    empirical=min((r for r in rr if ('ratio' in r['variant'] and r['variant']!='transmission-random-powder') or 'pseudo-voigt' in r['variant']),key=lambda r:r['result']['evaluation']['sse'])
    linked=next((r for r in rr if r['variant']=='reference-constraints'),None)
    selections[c['id']]=dict(thin=simple,transmission=physical,empirical=empirical,reference_constraints=linked)
    y=np.array(c['project']['spectrum']['y']);ref=np.array(c['reference_y']); ref_sse=float(sum((ref-y)**2))
    starts=[r for r in rr if base_variants(r)]
    summary.append(dict(id=c['id'],reference_sse=ref_sse,thin_ratio=simple['result']['evaluation']['sse']/ref_sse,transmission_ratio=physical['result']['evaluation']['sse']/ref_sse,empirical_ratio=empirical['result']['evaluation']['sse']/ref_sse,empirical_variant=empirical['variant'],linked_ratio=None if linked is None else linked['result']['evaluation']['sse']/ref_sse,start_worst_over_best=max(r['result']['evaluation']['sse'] for r in starts)/simple['result']['evaluation']['sse'],thin_best_variant=simple['variant']))

# All actual results and diagnostics remain separate from imported source data.
(OUT/'selected-fits.json').write_text(json.dumps(selections,indent=2)+'\n')
(OUT/'summary.json').write_text(json.dumps(dict(run_count=len(runs),failed_runs=[r for r in runs if 'error' in r],wasm_sha256=original['wasm_sha256'],cases=summary),indent=2)+'\n')
with (OUT/'parameters.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['dataset','fit','site','kind','profile','parameter','value','std','fraction_percent','fraction_std_percentage_points'])
    for id,ss in selections.items():
        for label,r in ss.items():
            if r is None:continue
            fit=r['result']
            for i,s in enumerate(fit['project']['sites']):
                frac=fit['intensity_fractions'][i]
                for k,p in s['params'].items():
                    w.writerow([id,label,s['name'],s['kind'],s['profile'],k,p['value'],fit['errors'].get(f'site:{i}:{k}'),frac['value'],frac['error']])

parameter_comparisons=[]
for c in cases:
    r=selections[c['id']]['reference_constraints']
    if r is None:continue
    for i,s in enumerate(r['result']['project']['sites']):
        reference=c['inferred_reference'][i]['source_table']
        item=dict(dataset=c['id'],site=s['name'],mossa_fraction_percent=r['result']['intensity_fractions'][i]['value'],reference_fraction_percent=reference['area_fraction']*100)
        for key,source_key in [('cs','cs'),('qs','qs'),('fwhm','width'),('bhf','field')]:
            item[key]=dict(mossa=s['params'][key]['value'],reference=reference[source_key],difference=s['params'][key]['value']-reference[source_key])
        parameter_comparisons.append(item)
(OUT/'reference-parameter-comparison.json').write_text(json.dumps(parameter_comparisons,indent=2)+'\n')

# Keep source curves and physically constrained fits in the main figures.
plt.rcParams.update({'font.size':9,'axes.spines.top':False,'axes.spines.right':False})
for record,name in [('14959531','oxide-comparison'),('15331051','assemblage-comparison')]:
    group=[c for c in cases if c['source']['record']==record]
    rows=(len(group)+1)//2
    fig=plt.figure(figsize=(14,rows*3.8),layout='constrained')
    gs=fig.add_gridspec(rows,2)
    for j,c in enumerate(group):
        sub=gs[j//2,j%2].subgridspec(2,1,height_ratios=[3,1],hspace=.05)
        ax=fig.add_subplot(sub[0]);res=fig.add_subplot(sub[1],sharex=ax)
        x=np.array(c['project']['spectrum']['x']); y=np.array(c['project']['spectrum']['y']); scale=np.median(y)
        ax.plot(x,y/scale,'.',color='#777777',ms=2.5,label='Observed',alpha=.8)
        selected=selections[c['id']]
        traces=[('Reference',c['reference_y'],'#242424','--'),('Thin, fixed powder ratios',selected['thin']['result']['evaluation']['y'],'#d47e22','-'),('Transmission, fixed powder ratios',selected['transmission']['result']['evaluation']['y'],'#1c7f9b','-')]
        if selected['reference_constraints']:
            traces.append(('Thin, reference links',selected['reference_constraints']['result']['evaluation']['y'],'#a23d80',':'))
        for label,yy,col,ls in traces:
            yy=np.array(yy);ax.plot(x,yy/scale,color=col,lw=1.1,ls=ls,label=label)
            res.plot(x,(y-yy)/scale*1000,color=col,lw=.8,ls=ls)
        ax.set_title(c['id']);ax.set_ylabel('Intensity / median');ax.tick_params(labelbottom=False)
        res.axhline(0,color='#999',lw=.5);res.set_xlabel('Velocity (mm/s)');res.set_ylabel('Residual\n(×10⁻³)')
        if j==0:ax.legend(fontsize=6.7,loc='lower left')
    fig.suptitle('Measured spectra: source reference and physically constrained MossA fits\nCommon width per site; transmission source FWHM = 0.097 mm/s assumed',fontsize=13)
    fig.savefig(OUT/(name+'.png'),dpi=160)
    fig.savefig(OUT/(name+'.svg'))
    plt.close(fig)

ind=json.loads((OUT/'comparison.json').read_text())['independent_checks']
improvement=max(1-r['scipy']['sse']/r['wasm_sse'] for r in ind)
converged=sum(r['result']['converged'] for r in valid)
warning_runs=[(r['id'],r['variant'],r['result']['warnings']) for r in valid if r['result']['warnings']]
labels={'MS-Fe2O3-Fe3O4_70-30':'Mixture 70–30','MS_Fe2O3-Fe3O4_30-70':'Mixture 30–70','MS_Fe2O3-Fe3O4_50-50':'Mixture 50–50','MS_Fe2O3':'Hematite','MS_Fe3O4':'Magnetite','MS_MexicanMagnetite':'Mexican ore','dk23289v':'Reacted, 296 K','dk23287v':'Starting, 296 K','dk23297v':'Low temperature, 0 T','dk23302v':'Low temperature, 6 T'}
lines=['# MossA measured-data fitting audit','', 'November 6, 2026. Actual Rust/WebAssembly fitting core, rebuilt from this workspace. No production fitting code was changed for this audit.','',
'**Conclusion:** MossA found numerically stationary fits for all ten public spectra. The tests did not reveal a fitting-core numerical defect. The practical issues are local minima, physical-model adequacy, and cross-program parameter conventions. A lower residual obtained by freeing empirical widths or intensities does not establish a physically correct model.','',
'## Physical interpretation comes first','',
'The primary comparisons retain a common Lorentzian width within each site and fixed 3:2:1:1:2:3 magnetic line ratios, explicitly assuming random absorber orientation. The doublets use equal intensities. Full transmission retains these ratios inside the absorber model and accounts for saturation through the transmission integral. Its source FWHM is the MossA default 0.097 mm/s, an assumption rather than a measured source calibration for these datasets. No absorber thickness, source shape, field distribution, or texture was independently established by this audit. These fits therefore test available calculations; they do not establish a unique physical explanation of every spectrum.','',
'Independent line widths are **not** proposed as a fix. A reference export is a comparison target, not a physically authoritative ground truth. A diagnostic reconstruction of the hematite reference curve inferred pair widths near 0.3860, 0.3466, and 0.3318 mm/s. This describes how the exported reference curve can be reproduced empirically; it is not an independently justified broadening mechanism. A physically defensible extension would need an appropriate model, such as a justified hyperfine-field distribution, texture, or transmission/source treatment. MossA already implements transmission; xVBF/distribution models remain outside the current port.','',
'## Comparison with supplied curves','',
'Each number below is unweighted residual sum of squares divided by that of the supplied reference curve on the same measured observations. One means the same residual level. The reference curves may use different constraints, profiles, weighting, or physical assumptions. Ratios are **not** model-selection statistics, likelihood ratios, or proof of scientific superiority. Extra parameters and different local minima matter.','',
'| Spectrum | Thin, powder ratios | Transmission, powder ratios | Thin with reference links | Best exploratory empirical fit | Worst/best across 6 thin starts |','| --- | ---: | ---: | ---: | ---: | ---: |']
for s in summary:
    linked='—' if s['linked_ratio'] is None else f"{s['linked_ratio']:.4f}"
    lines.append(f"| {labels[s['id']]} | {s['thin_ratio']:.3f} | {s['transmission_ratio']:.3f} | {linked} | {s['empirical_ratio']:.3f} | {s['start_worst_over_best']:.2f} |")
lines += ['',
'The exploratory column includes free A12/A13 ratios and pseudo-Voigt profiles. Those runs are diagnostic, not recommended physical solutions: in particular, freeing A13 can compensate for missing physics. Texture-only diagnostics varied A12 while retaining A13=3 and are preserved separately. No independent per-line widths were fitted in MossA. The low-temperature source analyses include distributions and, in a separate SpectrRelax model, Hamiltonian components; matching their reference residuals with simple sites does not reproduce their physics.','',
'![Oxide comparisons](oxide-comparison.png)','', '![Assemblage comparisons](assemblage-comparison.png)','',
'## Issues found and numerical checks','',
f'1. **Start dependence is real.** Four deterministic perturbations, a reference-assisted start, and a coarse start were run for every spectrum. Several multi-site spectra reached different stationary minima. The 30–70 mixture differed by {next(s["start_worst_over_best"] for s in summary if s["id"]=="MS_Fe2O3-Fe3O4_30-70"):.2f}× in residual sum of squares with the identical thin model. “Converged” indicates a numerical stopping criterion, not a globally best or physically adequate fit. Multiple starts and inspection of residual structure are necessary; an optional multi-start workflow would be useful.','',
f'2. **No stationary-solution defect detected.** An independent NumPy/SciPy implementation of the same thin Lorentzian models was restarted from 20 WASM solutions. Its largest relative residual-sum improvement was {improvement:.2g}. This tests local stationarity and model implementation, not global convergence. Six high-count spectra were also fitted with observed-count weighting. Four normalized spectra were repeated after a 10⁶ intensity rescaling; the difficult 6 T case can enter a different local minimum.','',
'3. **Reference constraints can matter more than a lower residual.** The two room-temperature CONFIT models were repeated with the source magnetic intensity ratio S2=3×S1 and shared widths for S1/S2; the starting-assemblage doublet widths were also linked. These fits reproduce the reference residual levels to about 0.04%, and their site fractions closely agree. This is a stronger comparison than freeing extra intensity parameters simply to lower the residual.','',
'4. **BHF conventions require reconciliation.** In those matched room-temperature fits, the sextet fields are about 0.09–0.10 T below the exported source-table fields (roughly 0.2%), while the curves and most other parameters agree closely. The current Rust core uses the original MATLAB coefficients 0.1613, 0.0934, and 0.0255 mm/s/T. The observed offset is consistent with a convention difference; the source program’s adopted constants have not been independently verified. Do not silently reinterpret this as a physical field change or “correct” the core constants from one dataset.','',
'5. **Better empirical agreement is not validation of missing physics.** Thin fixed-ratio oxide fits generally have larger residuals than the reference curves. Free ratios and profiles reduce those residuals substantially, and the transmission tests are finite and convergent, but no source calibration or independently justified broadening model was supplied. The present data do not warrant adding arbitrary line widths or claiming a unique physical model.','',
f'Total actual WASM fit runs: **{len(runs)}**; converged: **{converged}/{len(valid)}**; failed calls: **{len(runs)-len(valid)}**. Runs with diagnostics/warnings: **{len(warning_runs)}**. Existing validation also passed: 12 Rust-core tests and 5 compiled-WASM tests, including independent direct transmission convolution. All 24 warning-bearing runs hit parameter bounds; the solver correctly omitted the affected symmetric uncertainty estimates. There were no rank-deficiency warnings. Uncertainty coverage was not established from these measured datasets.','',
'Some complex exploratory fits took roughly 2.5 minutes in this run. Recorded times include concurrent CPU work and are indicative rather than controlled performance benchmarks.','',
'## Source-parameter comparison','',
'Room-temperature CONFIT source-table values are compared with reference-constrained MossA results in [reference-parameter-comparison.json](reference-parameter-comparison.json). All selected fitted values and approximate 1 std values are in [parameters.csv](parameters.csv). The Recoil archive supplies fitted curves, but no complete numerical parameter/constraint files; its component-derived initial estimates are explicitly reconstructions, not published parameter values. No source values were replaced by refit values.','',
'## Files and reproduction','',
'- [projects/](projects/): reopenable MossA projects for the best six-start thin fit, the random-powder transmission fit, and the two reference-constrained room-temperature fits. Exploratory empirical fits are explicitly labeled in their filenames.','- [summary.json](summary.json): comparison metrics and core-binary SHA-256.','- [cases.json](cases.json): observations, source reference curves, model inputs, provenance, and independently reconstructed initial estimates.','- `wasm-results.json`, `physical-results.json`, `variant-results.json`, `refinement-results.json`: complete actual fit results and starting models.','- [comparison.json](comparison.json): 20 independent same-model optimizer checks.','- [runtime-verification.json](runtime-verification.json): all 144 archived predictions were reevaluated against the captured runtime; the largest discrepancy was 1.4×10⁻¹⁵ relative to the observed intensity scale. Source-calibration development occurred concurrently in the workspace; the captured runtime and initial batch hash are recorded separately. The normal evaluation path agrees for every archived fit.','- `runtime/`: captured WASM runtime, JavaScript binding, and license for evaluating the saved results.','',
'From the repository root, use the following sequence (Python requires NumPy, SciPy, and Matplotlib):','',
'```sh','npm run wasm','python3 scripts/benchmark-public-data.py','node scripts/fit-public-validation.mjs','node scripts/fit-public-variants.mjs','node scripts/refine-public-validation.mjs','node scripts/fit-physical-validation.mjs','python3 scripts/compare-public-validation.py','node scripts/verify-public-validation.mjs','python3 scripts/report-public-validation.py','npx tsx scripts/export-public-validation.ts','```','',
'## Sources','',
'Praetz et al., v2 (2025), [Zenodo 14959531](https://zenodo.org/records/14959531), DOI 10.5281/zenodo.14959531. Geymond, v2 (2025), [Zenodo 15331051](https://zenodo.org/records/15331051), DOI 10.5281/zenodo.15331051. Both datasets are CC BY 4.0. The unmodified archives and metadata are preserved under `../public/`; extracted observations and analysis products are separate. The source archive checksums and selected-member hashes are recorded in `../manifest.json`.','',
'This audit covers the ten downloaded public spectra. The private Freiburg tutorial files were not refitted here, and this was a numerical-core audit rather than a browser-interaction audit.']
(OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')
print('Report and plots written;',len(runs),'WASM runs;',len(warning_runs),'runs with warnings')

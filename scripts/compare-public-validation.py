#!/usr/bin/env python3
"""Compare actual MossA fits with source curves and independent same-model fits."""
import copy
import json
import runpy
from pathlib import Path
import numpy as np

API=runpy.run_path(str(Path(__file__).with_name('benchmark-public-data.py')))
ROOT=API['ROOT']; OUT=API['OUT']; scipy_fit=API['scipy_fit']; curve=API['curve']
cases=json.loads((OUT/'cases.json').read_text())
runs=json.loads((OUT/'wasm-results.json').read_text())['runs']
summary=[]; independent=[]
for c in cases:
    rr=[r for r in runs if r['id']==c['id'] and 'result' in r]
    obs=np.array(c['project']['spectrum']['y']);ref=np.array(c['reference_y']);scale=float(np.median(obs))
    ref_sse=float(sum((obs-ref)**2))
    item=dict(id=c['id'],source_reference_sse=ref_sse,source=c['source']['source'],runs=[])
    for r in rr:
        f=r['result']; factor=1e6 if r['variant']=='intensity-scaled-1e6' else 1
        calculated=np.array(f['evaluation']['y'])/factor
        sse=float(sum((calculated-obs)**2))
        item['runs'].append(dict(variant=r['variant'],sse=sse,sse_over_reference=sse/ref_sse,rms_relative_to_baseline=float(np.sqrt(sse/len(obs))/scale),curve_rms_difference_from_reference=float(np.sqrt(np.mean((calculated-ref)**2))/scale),converged=f['converged'],iterations=f['iterations'],warnings=f['warnings'],rank=f['rank'],free_parameters=f['free_parameters']))
    for variant in ['reference-assisted','free-line-ratios']:
        r=next(r for r in rr if r['variant']==variant)
        # Restart the independent solver at the actual WASM solution to test stationarity.
        p,stat=scipy_fit(r['result']['project'])
        independent.append(dict(id=c['id'],variant=variant,wasm_sse=r['result']['evaluation']['sse'],scipy=stat,project=p,max_curve_change_relative_to_baseline=float(np.max(abs(curve(p)-np.array(r['result']['evaluation']['y'])))/scale)))
        print(c['id'],variant,'SciPy/WASM SSE',f"{stat['sse']/r['result']['evaluation']['sse']:.10f}",flush=True)
    summary.append(item)
(OUT/'comparison.json').write_text(json.dumps(dict(cases=summary,independent_checks=independent),indent=2)+'\n')

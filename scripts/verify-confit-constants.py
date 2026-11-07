#!/usr/bin/env python3
"""Hold out the second measured dataset when verifying inferred conversions."""
import copy,json,runpy
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'validation-data/constants'
api=runpy.run_path(str(ROOT/'scripts/benchmark-public-data.py'))
inferred=json.loads((OUT/'confit-inferred-constants.json').read_text())
coeff=np.mean([c['effective_coefficients_mm_s_per_T'] for c in inferred if c['dataset']=='dk23289v'],axis=0)
api['component'].__globals__['MAGNETIC_COEFFICIENTS']=coeff
runs=json.loads((ROOT/'validation-data/benchmark/variant-results.json').read_text())
cases=json.loads((ROOT/'validation-data/benchmark/cases.json').read_text());results=[]
for id in ['dk23289v','dk23287v']:
 r=next(r for r in runs if r['id']==id and r['variant']=='reference-constraints');p=copy.deepcopy(r['result']['project'])
 fitted,stats=api['scipy_fit'](p)
 source=next(c for c in cases if c['id']==id)
 rows=[]
 for i,s in enumerate(fitted['sites']):
  if s['kind']!='Sextet':continue
  table=source['inferred_reference'][i]['source_table'];old=p['sites'][i]['params']['bhf']['value'];new=s['params']['bhf']['value'];ref=table['field']
  rows.append(dict(site=s['name'],source_B_T=ref,mossa_original_B_T=old,confit_coefficients_B_T=new,original_difference_T=old-ref,new_difference_T=new-ref))
 results.append(dict(dataset=id,coefficients=coeff.tolist(),calibration_dataset='dk23289v',held_out=id!='dk23289v',scipy=stats,fields=rows))
 print(id,rows)
(OUT/'confit-conversion-verification.json').write_text(json.dumps(results,indent=2)+'\n')

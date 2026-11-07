#!/usr/bin/env python3
"""Infer effective CONFIT conversions from source exports, without changing MossA."""
import json,re,zipfile
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'validation-data/constants'
cases=json.loads((ROOT/'validation-data/benchmark/cases.json').read_text())
output=[]
with zipfile.ZipFile(ROOT/'validation-data/public/zenodo-15331051/JGR-SE_Geymond2025.zip') as z:
 for c in cases:
  if c['id'] not in ['dk23289v','dk23287v']:continue
  parent=str(Path(c['source']['archive_member']).parent)
  member=next(n for n in z.namelist() if not n.startswith('__MACOSX/') and str(Path(n).parent)==parent and Path(n).stem.lower()==c['id'] and n.endswith('.par'))
  pars={m.group(1):float(m.group(2)) for m in re.finditer(r'(\w+)\s*=\s*([+\-.\dEe]+)',z.read(member).decode())}
  x=np.array(c['project']['spectrum']['x'])
  for i,s in enumerate(c['inferred_reference']):
   if not s['name'].startswith('S'):continue
   k=int(s['name'].split()[1]);key=f'S{k:02}'
   F=pars['P01'+key+'F'];B=s['source_table']['field']
   y=np.array(c['reference_components'][i]);base=np.max(y)
   def model(v):
    b,cs,q,d1,d2,d3,w,area=v; a=area/4
    yy=np.zeros_like(x)+b
    for d,ratio,shift in [(d1,1,q),(d2,2/3,-q),(d3,1/3,-q)]:
     for sign in [-1,1]:yy-=a*ratio/(np.pi*(w/2)*(1+((x-cs-shift-sign*d)/(w/2))**2))
    return yy
   p=s['parameters'];cs=p['cs']['value'];qs=p['qs']['value']/2;bf=p['bhf']['value'];w=p['fwhm']['value'];area=p['intensity']['value']
   v=[base,cs,qs,bf*.1613,bf*.0934,bf*.0255,w,area]
   res=least_squares(lambda v:model(v)-y,v,x_scale='jac',ftol=1e-14,xtol=1e-14,gtol=1e-14,max_nfev=1000)
   d=res.x[3:6];entry=dict(dataset=c['id'],site=s['name'],source_par_member=member,F_mm_s=F,exported_B_T=B,F_per_B=F/B,B_per_F=B/F,spacings_mm_s=d.tolist(),spacings_per_F=(d/F).tolist(),effective_coefficients_mm_s_per_T=(d/B).tolist(),reference_curve_reconstruction_rms=float(np.sqrt(np.mean(res.fun**2))),parameters=res.x.tolist())
   output.append(entry);print(json.dumps(entry),flush=True)
OUT.mkdir(exist_ok=True);(OUT/'confit-inferred-constants.json').write_text(json.dumps(output,indent=2)+'\n')

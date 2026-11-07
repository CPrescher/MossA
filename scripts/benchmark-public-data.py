#!/usr/bin/env python3
"""Measured-data model preparation and independent SciPy comparison for MossA."""
import copy
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.signal import find_peaks

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-data/benchmark'
MAGNETIC_COEFFICIENTS = (.1613, .0934, .0255)
KEYS = {'Sextet': ['cs','fwhm','intensity','qs','bhf','a12','a13'], 'Doublet':['cs','fwhm','intensity','qs','a12']}

def param(value, fit=True, lo=None, hi=None):
    return dict(value=float(value), fit=fit, min=lo, max=hi, link=None)

def component(x, s):
    p = {k:v['value'] for k,v in s['params'].items()}
    cs,w,area,q=p['cs'],p['fwhm'],p['intensity'],p['qs']/2
    if s['kind']=='Doublet':
        centers=[cs-q,cs+q]; amps=[p['a12']*area,(1-p['a12'])*area]
    else:
        r2,r3=1/p['a12'],1/p['a13']; a=area/(2*(1+r2+r3))
        a1,a2,a3=MAGNETIC_COEFFICIENTS
        centers=[cs-a1*p['bhf']+q,cs-a2*p['bhf']-q,cs-a3*p['bhf']-q,cs+a3*p['bhf']-q,cs+a2*p['bhf']-q,cs+a1*p['bhf']+q]
        amps=[a,a*r2,a*r3,a*r3,a*r2,a]
    y=np.zeros_like(x)
    for c,a in zip(centers,amps):
        z=(x-c)/(w/2)
        l=a/(np.pi*(w/2)*(1+z*z))
        g=a*.8326/((w/2)*1.7725)*np.exp(-(z*.8326)**2)
        y += l if s['profile']=='Lorentzian' else p['mix']*l+(1-p['mix'])*g
    return y

def pack(project):
    entries={f'site:{i}:{k}':p for i,s in enumerate(project['sites']) for k,p in s['params'].items() if k in KEYS[s['kind']] or (k=='mix' and s['profile']=='PseudoVoigt')}
    entries.update({f'background:{i}':p for i,p in enumerate(project['background'])})
    free=[k for k,p in entries.items() if p['fit'] and not p['link']]
    def expand(v):
        p=copy.deepcopy(project)
        es={f'site:{i}:{k}':q for i,s in enumerate(p['sites']) for k,q in s['params'].items()}
        es.update({f'background:{i}':q for i,q in enumerate(p['background'])})
        for k,n in zip(free,v):es[k]['value']=float(n)
        def resolve(k):
            link=es[k]['link']
            if link:es[k]['value']=resolve(link['target'])*link['factor']
            return es[k]['value']
        for k in es:resolve(k)
        return p
    v=np.array([entries[k]['value'] for k in free])
    lo=[entries[k]['min'] if entries[k]['min'] is not None else -np.inf for k in free]
    hi=[entries[k]['max'] if entries[k]['max'] is not None else np.inf for k in free]
    return free, v, (lo,hi), expand

def curve(p):
    x=np.array(p['spectrum']['x'])
    return sum(q['value']*x**i for i,q in enumerate(p['background']))-sum((component(x,s) for s in p['sites']),np.zeros_like(x))

def scipy_fit(project, max_nfev=2500):
    free,v,bounds,expand=pack(project)
    y=np.array(project['spectrum']['y']); scale=max(abs(np.median(y)),1e-6)
    weight=np.sqrt(y) if project['weighting']=='counts' else np.ones_like(y)*scale
    fun=lambda v:(curve(expand(v))-y)/weight
    r=least_squares(fun,v,bounds=bounds,x_scale=np.maximum(abs(v),.2),ftol=1e-12,xtol=1e-12,gtol=1e-12,max_nfev=max_nfev)
    p=expand(r.x)
    return p,dict(success=bool(r.success),message=r.message,nfev=r.nfev,optimality=float(r.optimality),sse=float(sum((curve(p)-y)**2)))

def site(kind, name, cs=.4, width=.3, area=.03, qs=0, field=49, ratios=False):
    return dict(kind=kind,name=name,profile='Lorentzian',params=dict(cs=param(cs,True,-4,5),fwhm=param(width,True,.03,3),intensity=param(area,True,0,None),qs=param(qs,True,-6,6),bhf=param(field,True,0,80),a12=param(.5 if kind=='Doublet' else 1.5,ratios, .05 if kind=='Doublet' else .2,.95 if kind=='Doublet' else 8),a13=param(3,ratios,.3,10),mix=param(1,False,0,1)))

def read_source(entry):
    directory=ROOT/'validation-data/public'/('zenodo-'+entry['record'])
    if entry['record']=='14959531':
        raw=(directory/'selected-originals'/entry['archive_member']).read_text().splitlines()
        a=np.array([[float(v) for v in l.split()] for l in raw[3:]])
        return a[:,0],a[:,1],a[:,2],a[:,3:],{},None,[]
    with zipfile.ZipFile(directory/'JGR-SE_Geymond2025.zip') as z:
        parent=str(Path(entry['archive_member']).parent)
        gr=next(n for n in z.namelist() if not n.startswith('__MACOSX/') and str(Path(n).parent)==parent and Path(n).stem.lower()==Path(entry['archive_member']).stem.lower() and n.endswith('.gr'))
        lines=z.read(gr).decode().splitlines()
        header=next(i for i,l in enumerate(lines) if 'X[MM/S]' in l)
        labels=[re.fullmatch(r'([SD]):__([0-9]+)',t).groups() for t in lines[header].split() if re.fullmatch(r'([SD]):__([0-9]+)',t)]
        rows=[]
        for l in lines[header+1:]:
            c=l.split()
            if len(c)>=6+len(labels) and c[0].isdigit() and int(c[0])==len(rows)+1:
                rows.append([float(v) for v in c[:6+len(labels)]])
            if len(rows)==512:break
        a=np.array(rows)
        if len(a)!=512:raise ValueError(gr)
        # Preserve normalized observations from the .exp (higher precision than .gr display).
        raw=z.read(entry['archive_member']).decode().splitlines()
        obs=np.array([float(l[12:21]) for l in raw[2:514]])
        xs=np.array([float(l[3:12]) for l in raw[2:514]])
        assert np.max(abs(xs-a[:,1]))<1e-8 and np.max(abs(obs-a[:,3]))<6e-7
        tables={}
        csvs=[n for n in z.namelist() if not n.startswith('__MACOSX/') and str(Path(n).parent)==parent and Path(n).stem.lower()==Path(gr).stem.lower() and n.endswith('.csv')]
        if csvs:
            for l in z.read(csvs[0]).decode('utf-8-sig').splitlines()[2:]:
                c=[v.strip().replace(',','.') for v in l.split(';')]
                if re.fullmatch('[SD] [0-9]+',c[0]):
                    tables[c[0]]=dict(cs=float(c[13]),qs=float(c[15]),field=float(c[20]) if c[20] else 0,width=float(c[27]),area_fraction=float(c[1]))
        return xs,obs,a[:,2],a[:,6:],tables,a[:,5],labels

def prepare():
    OUT.mkdir(exist_ok=True,parents=True)
    manifest=json.loads((ROOT/'validation-data/manifest.json').read_text())
    cases=[]
    for entry in manifest['spectra']:
        x,obs,ref,components,tables,weights,labels=read_source(entry)
        scale=float(np.median(obs)); comps=components/scale
        sites=[]; inferred=[]
        for i,c in enumerate(comps.T):
            name=(' '.join(labels[i]) if labels else f'S {i+1}')
            kind='Doublet' if name.startswith('D') else 'Sextet'
            t=tables.get(name,{})
            absorption=np.max(c)-c
            peaks,_=find_peaks(absorption,prominence=max(np.ptp(c)*.025,1e-10))
            peaks=np.sort(peaks[np.argsort(absorption[peaks])[-(2 if kind=='Doublet' else 6):]])
            b=t.get('field', (x[peaks[-1]]-x[peaks[0]])/.3226 if len(peaks)>1 else 49)
            cs=t.get('cs',float((x[peaks[-1]]+x[peaks[0]])/2) if len(peaks)>1 else .4)
            qs=t.get('qs',float(x[peaks[-1]]-x[peaks[0]]) if kind=='Doublet' and len(peaks)>1 else 0)
            area=float(max(np.trapezoid(absorption,x),.001))
            s=site(kind,name,cs=cs,width=t.get('width',.35),area=area,qs=qs,field=b,ratios=True)
            q=dict(spectrum=dict(x=x.tolist(),y=c.tolist()),sites=[s],background=[param(float(np.max(c)),True,.7,1.3)],mode='thin',source_fwhm=.097,source_squared=False,weighting='unweighted',max_iterations=600)
            fitted,stats=scipy_fit(q,800)
            inferred.append(dict(name=name,source_table=t,reference_component_approximation=stats,parameters=copy.deepcopy(fitted['sites'][0]['params'])))
            s=fitted['sites'][0]
            for k in ['a12','a13']:s['params'][k]['fit']=False
            if kind=='Doublet':s['params']['a12']['value']=.5
            else:s['params']['a12']['value']=1.5;s['params']['a13']['value']=3
            s['params']['intensity']['value']*=scale
            sites.append(s)
        background=float(np.median(np.sum(components,axis=1)-ref)/(components.shape[1]-1)) if components.shape[1]>1 else float(np.max(ref)*1.003)
        q=dict(spectrum=dict(x=x.tolist(),y=obs.tolist()),sites=sites,background=[param(background,True,scale*.7,scale*1.3)],mode='thin',source_fwhm=.097,source_squared=False,weighting='unweighted',max_iterations=600)
        case=dict(id=Path(entry['file']).stem,source=entry,project=q,reference_y=ref.tolist(),reference_components=components.T.tolist(),reference_weights=None if weights is None else weights.tolist(),reference_labels=labels,inferred_reference=inferred)
        cases.append(case)
        print(case['id'],len(sites),'sites',flush=True)
    temp=OUT/'cases.json.tmp'
    temp.write_text(json.dumps(cases,indent=2)+'\n')
    temp.replace(OUT/'cases.json')

if __name__=='__main__':
    prepare()

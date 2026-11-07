#!/usr/bin/env python3
"""Compare production MossA WASM with an unmodified, pinned SYNCmoss TI engine.

Use a Python environment with numpy, scipy, numba and matplotlib. The upstream
modules are cached outside the repository and verified against their Git blob
hashes. No SYNCmoss GUI or Qt installation is needed. Run `npm run wasm` first.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from urllib.request import urlopen
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-data/syncmoss-sms'
COMMIT = 'b712fbc1521004a47409b964b9ab012fe5c5e255'
REPO = 'https://github.com/sergey-yaroslavtsev/syncmoss'
BLOBS = {
    'LICENSE': '9e889419862ce22f4af68a3a24606d2a9cf2d186',
    'syncmoss/constants.py': '62ef62e88407d2a7f559015ecd00c4bee88f8e45',
    'syncmoss/expression_eval.py': '45ffc0c3af0df22f0b166175ec6d56fa2b1112a7',
    'syncmoss/minimi_lib.py': 'c6475aeb4834218155c3643fcf91da98d0748203',
    'syncmoss/models.py': 'fddccc8dec2272b898715815d410162c0e52e6ef',
    'syncmoss/sms_theory.py': '4da186b6d776ba1b43de2c04b5ef99bc7ce22ffb',
    'syncmoss/spectrum_model.py': '940dac1f3d9c499e1a69493765421fa8c5ccb662',
    'syncmoss/thickness_distribution.py': '3f72f1a7f49f8699def4ca002985d21a8783d83b',
    'syncmoss/parameters/Standard_SMS.dat': '7e1b8d1bd0b0fbc4447e2e3a6b8adfaf24c0eafd',
}

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_upstream(cache):
    manifest = []
    for name, expected in BLOBS.items():
        target = cache / name
        url = f'https://raw.githubusercontent.com/sergey-yaroslavtsev/syncmoss/{COMMIT}/{name}'
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with urlopen(url, timeout=45) as response:
                target.write_bytes(response.read())
        content = target.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        if actual != expected:
            raise RuntimeError(f'Upstream snapshot hash mismatch: {name}: {actual} != {expected}')
        manifest.append(dict(path=name, url=url, git_blob_sha1=actual, sha256=sha256(target), bytes=len(content)))
    return manifest


def param(value, fit=False, lo=None, hi=None):
    return dict(value=value, fit=fit, min=lo, max=hi, link=None)


def site(name, kind='Sextet', center=0., width=.098, intensity=1., field=32.94, qs=0.):
    return dict(name=name, kind=kind, profile='Lorentzian', params=dict(
        cs=param(center, True, -1, 1), fwhm=param(width, False, .05, 1),
        intensity=param(intensity, True, 0, 10), qs=param(qs), bhf=param(field, kind=='Sextet', 25, 36),
        a12=param(.5 if kind=='Doublet' else 1.5), a13=param(3.), mix=param(.5)))


def prepare(cache):
    dat = cache / 'syncmoss/parameters/Standard_SMS.dat'
    (OUT / 'inputs').mkdir(parents=True, exist_ok=True)
    (OUT / 'inputs/Standard_SMS.dat').write_bytes(dat.read_bytes())
    (OUT / 'inputs/UPSTREAM_LICENSE.txt').write_bytes((cache / 'LICENSE').read_bytes())
    headers = dat.read_text().splitlines()
    ins = np.fromstring(next(line[9:] for line in headers if line.startswith('#@INSexp ')), sep=' ')
    mulco, x0 = np.fromstring(next(line[9:] for line in headers if line.startswith('#@INSint ')), sep=' ')
    triple = ins.reshape(-1,3)
    # Exact upstream TImod parameters: a is squared, c is squared. Its integral
    # samples T(v+u); MossA convolves a velocity RESPONSE kernel R(v-u).
    # R is the mirrored source, then centered by MossA. Consequently upstream
    # absorber positions must be MossA positions + the original source centroid.
    natural_width = .098
    weights = triple[:,2]**2
    centroid = float(np.sum(weights * triple[:,1]) / np.sum(weights))
    gaussians = [dict(center=-float(mu), fwhm=float(2*np.sqrt(2*np.log(2))*(a*a+natural_width/2)), weight=float(c*c)) for a,mu,c in triple]
    source = dict(upstream_commit=COMMIT, raw_INSexp=ins.tolist(), raw_INSint=[float(mulco),float(x0)],
                  raw_source_centroid=centroid, upstream_natural_width=natural_width,
                  mossa_response_gaussians=gaussians,
                  conversion='sigma=a^2+NAT_WIDTH/2; FWHM=2sqrt(2ln2)*sigma; area=c^2; response center=-mu; upstream absorber CS=MossA CS+raw source centroid')
    save(OUT / 'inputs/source-profile.json', source)
    observations = np.loadtxt(dat)
    definitions = json.loads((ROOT / 'src/nuclear-constants.json').read_text())
    ident = 'fe57-iaea-2019-2020-codata2022'
    p = dict(spectrum=dict(x=observations[:,0].tolist(), y=observations[:,1].tolist()),
             sites=[site('alpha-Fe (natural-width powder assumption)', center=-.003, intensity=1.1)],
             background=[param(float(np.median(observations[:,1])), True, 5000, 7000)],
             mode='transmission', source_fwhm=gaussians[0]['fwhm'], source_squared=False,
             source_gaussians=gaussians, nuclear_constants=dict(id=ident, coefficients=definitions[ident]['coefficients']),
             weighting='counts', max_iterations=500, search_starts=1)
    return source, p


def wasm(projects, name):
    request, output = OUT / f'{name}-request.json', OUT / f'{name}-results.json'
    save(request, dict(projects=projects))
    subprocess.run(['node', str(ROOT / 'scripts/evaluate-syncmoss-sms.mjs'), str(request), str(output)], cwd=ROOT, check=True)
    return json.loads(output.read_text())['results']


def line_list(p, source):
    lines = []
    k1,k2,k3 = p['nuclear_constants']['coefficients']
    for s in p['sites']:
        assert s['profile']=='Lorentzian', 'The shared validation model uses pure Lorentzian lines.'
        v = {k:x['value'] for k,x in s['params'].items()}
        c,w,a = v['cs']+source['raw_source_centroid'], v['fwhm'], v['intensity']
        if s['kind']=='Singlet':
            lines.append([c,w,a])
        elif s['kind']=='Doublet':
            lines.extend([[c-v['qs']/2,w,a*v['a12']], [c+v['qs']/2,w,a*(1-v['a12'])]])
        else:
            b,q,r2,r3 = v['bhf'],v['qs']/2,1/v['a12'],1/v['a13']
            aa = a*3/(6+6*(r2+r3))
            lines.extend([[c-b*k1+q,w,aa],[c-b*k2-q,w,aa*r2],[c-b*k3-q,w,aa*r3],
                          [c+b*k3-q,w,aa*r3],[c+b*k2-q,w,aa*r2],[c+b*k1+q,w,aa]])
    return lines


def upstream_params(p, source, constants, native=False):
    par = [1.] + [0.]*(constants.number_of_baseline_parameters-1)
    models, mapping = [], []
    if not native:
        for c,w,a in line_list(p, source):
            par.extend([a/(np.pi*constants.NAT_WIDTH/2), c, w, 0.])
            models.append('Singlet')
    else:
        mk1,mk2,mk3 = p['nuclear_constants']['coefficients']
        for s in p['sites']:
            v={k:x['value'] for k,x in s['params'].items()}
            c=v['cs']+source['raw_source_centroid']
            thickness=v['intensity']/(np.pi*constants.NAT_WIDTH/2)
            if s['kind']=='Sextet':
                assert v['a12']==1.5 and v['a13']==3, 'Native comparison uses random-powder ratios.'
                # Two supplied sextet correction slots remove differences of the
                # nuclear constants, while exactly preserving every line position.
                h=v['bhf']*(mk2+mk3)/(constants.LINE_SHIFT_25+constants.LINE_SHIFT_34)
                outer=h*constants.LINE_SHIFT_16-v['bhf']*mk1
                middle=v['bhf']*mk2-h*constants.LINE_SHIFT_25
                par.extend([thickness,c,v['qs']/2,h,v['fwhm'],0.,0.,0.,0.,0.,outer,middle,0.,3.])
                mapping.append(dict(site=s['name'],upstream_field=h,outer_correction=outer,middle_correction=middle))
                models.append('Sextet')
            elif s['kind']=='Doublet':
                assert v['a12']==.5
                par.extend([thickness,c,v['qs']/2,v['fwhm'],0.,0.,0.,0.,1.])
                models.append('Doublet')
            else:
                par.extend([thickness,c,v['fwhm'],0.]);models.append('Singlet')
    return np.array(par),models,mapping


class SerialPool:
    def starmap(self, function, args):
        return [function(*a) for a in args]


def upstream_curve(p, source, models_module, constants, nodes, native=False):
    par,models,mapping=upstream_params(p,source,constants,native)
    ins=np.array(source['raw_INSexp']);mulco,x0=source['raw_INSint'];pool=SerialPool()
    # This is instrumental_io.compute_norm's unsmeared call to actual TI; the
    # Qt-bearing GUI module is not imported. No integral expressions are replaced.
    empty=np.zeros(constants.number_of_baseline_parameters);empty[0]=1.
    norm=float(models_module.TI(np.array([1000.]),empty,[],nodes,pool,x0,mulco,ins,Met=0)[0])
    x=np.array(p['spectrum']['x'])
    transmission=np.asarray(models_module.TI(x,par,models,nodes,pool,x0,mulco,ins,Met=0,Norm=norm,pol=1.),dtype=float)
    background=p['background']
    counts=background[0]['value']*transmission
    for i,b in enumerate(background[1:],1):counts+=b['value']*x**i
    return counts,norm,dict(models=models,parameters=par.tolist(),native_mapping=mapping,
                            absorber_lines=line_list(p,source),integration_nodes=nodes,
                            source_norm=norm,source_INS=ins.tolist(),source_mulco=mulco,source_x0=x0)


def metrics(a,b,baseline):
    delta=np.asarray(a)-np.asarray(b)
    return dict(max_abs_counts=float(np.max(np.abs(delta))),rms_counts=float(np.sqrt(np.mean(delta**2))),
                max_relative_to_continuum=float(np.max(np.abs(delta))/baseline),rms_relative_to_continuum=float(np.sqrt(np.mean(delta**2))/baseline))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream-cache',type=Path,default=Path(tempfile.gettempdir())/'mossa-syncmoss-validation/upstream')
    parser.add_argument('--write-fixture',action='store_true',help='Explicitly refresh the pinned regression fixture after inspecting the comparison.')
    args=parser.parse_args()
    manifest=fetch_upstream(args.upstream_cache)
    sys.path.insert(0,str(args.upstream_cache))
    import syncmoss.models as models
    import syncmoss.constants as constants
    assert constants.NAT_WIDTH==.098
    source,project=prepare(args.upstream_cache)
    print('Fitting measured standard in production WASM with the supplied source held fixed...',flush=True)
    fitted=wasm([dict(id='measured-standard',project=project,fit=True)],'standard-fit')[0]
    assert fitted['fit']['converged']
    primary=fitted['project']
    # Parameter variations stress the full integral using the SAME measured
    # velocity axis and source. They are simulations, not additional observations.
    mixture=copy.deepcopy(primary)
    mixture['sites']=[site('magnetic component 1',center=-.03,width=.11,intensity=1.3,field=32.94),
                      site('magnetic component 2',center=.08,width=.17,intensity=.2,field=31.,qs=.12),
                      site('doublet',kind='Doublet',center=.066-source['raw_source_centroid'],width=.2,intensity=.08,qs=.522)]
    saturated=copy.deepcopy(mixture)
    for s in saturated['sites']:s['params']['intensity']['value']*=4
    grid=copy.deepcopy(primary)
    xx=np.arange(-12,12.0001,.02);grid['spectrum']=dict(x=xx.tolist(),y=np.full(xx.size,6000.).tolist())
    cases=[dict(id='measured-standard',project=primary,fit=False),dict(id='mixed-sites-control',project=mixture,fit=False),
           dict(id='saturated-control',project=saturated,fit=False),dict(id='grid-aligned-control',project=grid,fit=False)]
    evaluated=wasm(cases,'comparison')
    comparisons=[]
    for r in evaluated:
        p=r['project'];baseline=p['background'][0]['value'];curves=[];normalizations=[]
        for nodes in [64,128,256,512,1024,2048]:
            yy,norm,up=upstream_curve(p,source,models,constants,nodes)
            curves.append(yy);normalizations.append(dict(nodes=nodes,normalization=norm))
        native,_,native_params=upstream_curve(p,source,models,constants,2048,native=True)
        mossa=np.array(r['evaluation']['y']);reference=curves[-1]
        result=dict(id=r['id'],project=p,mossa_y=mossa.tolist(),syncmoss_y=reference.tolist(),
                    difference=metrics(mossa,reference,baseline),native_vs_expanded_lines=metrics(native,reference,baseline),
                    source_normalizations=normalizations,
                    upstream_convergence=[dict(nodes=n,**metrics(y,reference,baseline)) for n,y in zip([64,128,256,512,1024],curves[:-1])],
                    upstream=up,native_upstream=native_params)
        comparisons.append(result)
        print(r['id'],result['difference'],flush=True)
    # A sign-error negative control: naive direct use of source-energy centers
    # would reflect the asymmetric response, and must be detected by this data.
    mirrored=copy.deepcopy(primary)
    for g in mirrored['source_gaussians']:g['center']=-g['center']
    negative=wasm([dict(id='wrong-source-handedness',project=mirrored,fit=False)],'negative-control')[0]
    negative_error=metrics(negative['evaluation']['y'],comparisons[0]['syncmoss_y'],primary['background'][0]['value'])
    threshold=1e-7
    passed=all(c['difference']['max_relative_to_continuum']<threshold and
               c['native_vs_expanded_lines']['max_relative_to_continuum']<1e-10 and
               c['upstream_convergence'][-1]['max_relative_to_continuum']<1e-9 for c in comparisons)
    primary_reference=np.array(comparisons[0]['syncmoss_y']);observed=np.array(primary['spectrum']['y'])
    summary=dict(upstream_commit=COMMIT,repository=REPO,files=manifest,
                 environment=dict(python=platform.python_version(),packages={name:importlib.metadata.version(name) for name in ['numpy','scipy','numba','matplotlib']},node=subprocess.check_output(['node','--version'],text=True).strip()),
                 mossa_wasm_sha256=sha256(ROOT/'src/wasm/mossa_core_bg.wasm'),mossa_core_sha256=sha256(ROOT/'rust-core/src/lib.rs'),source_profile=source,
                 standard=dict(points=len(observed),velocity_range=[float(min(primary['spectrum']['x'])),float(max(primary['spectrum']['x']))],
                               mossa_weighted_chi2=fitted['evaluation']['objective'],mossa_reduced_chi2=fitted['fit']['reduced_objective'],
                               syncmoss_weighted_chi2=float(np.sum((observed-primary_reference)**2/observed)),
                               free_parameters=fitted['fit']['free_parameters'],fixed_absorber_fwhm=.098,
                               fit_interpretation='Representative single random-powder sextet with natural Lorentzian width. Not a reproduction of the author\'s final phase/texture model.'),
                 cases=[{k:v for k,v in c.items() if k not in ['project','mossa_y','syncmoss_y','upstream','native_upstream']} for c in comparisons],
                 wrong_source_handedness=negative_error,acceptance_max_relative_to_continuum=threshold,passed=passed,
                 limitations=['Fixed supplied source; source extraction from a measured singlet was not tested.',
                              'Scalar, isotropic random-powder absorption; polarized/texture/relaxation/Voigt parity is not established.',
                              'Channel averaging and drive/finite-source smearing are disabled in both engines.',
                              'The measured source parameters and natural absorber width are treated as exact.',
                              'The source and sample conventions are explicitly converted; equal numerical BHF values across packages are not assumed.'])
    save(OUT/'upstream-comparison.json',dict(cases=comparisons))
    save(OUT/'summary.json',summary)
    provenance=dict(source_url=f'{REPO}/blob/{COMMIT}/syncmoss/parameters/Standard_SMS.dat',upstream_commit=COMMIT,
                    instrumental_profile='Supplied in Standard_SMS.dat, not calibrated anew by MossA',source_conversion=source['conversion'])
    save(OUT/'SMS-standard.mossa.json',dict(format='mossa-project',version=2,name='SYNCmoss measured SMS alpha-Fe standard',project=primary,
         selected_site=0,preprocessing=dict(raw_counts=None,controls=dict(max=12,shift=0,sinusoidal=False,folding=False,center=256.5)),
         provenance=provenance,fit=None,fit_state=None))
    if args.write_fixture:
        save(ROOT/'tests/fixtures/syncmoss-sms-transmission.json',dict(upstream_commit=COMMIT,source_url=provenance['source_url'],
             upstream_source=source,project=primary,reference_y=comparisons[0]['syncmoss_y'],reference_nodes=2048,
             max_relative_tolerance=threshold,description='Actual unmodified SYNCmoss TI output; source and absorber lines matched explicitly.'))
    plot(primary,comparisons[0])
    report(summary)
    if not passed:raise SystemExit('SYNCmoss comparison exceeded its acceptance criteria.')


def plot(project,comparison):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    x=np.array(project['spectrum']['x']);y=np.array(project['spectrum']['y']);a=np.array(comparison['mossa_y']);b=np.array(comparison['syncmoss_y'])
    fig,axs=plt.subplots(3,1,figsize=(9,8),sharex=True,gridspec_kw=dict(height_ratios=[3,1,1]),layout='constrained')
    axs[0].plot(x,y,'.',ms=2.5,color='.5',label='Measured SMS standard')
    axs[0].plot(x,b,lw=1.7,color='#c47735',label='SYNCmoss, 2048 nodes')
    axs[0].plot(x,a,'--',lw=1,color='#168a87',label='MossA, same source and absorber')
    axs[0].set_ylabel('Counts');axs[0].legend(fontsize=9);axs[0].set_title('Measured SYNCmoss SMS iron standard: full transmission comparison')
    axs[1].plot(x,(y-b)/np.sqrt(y),'.',ms=2.5,color='.35');axs[1].axhline(0,color='.7',lw=.7);axs[1].set_ylabel('Data − model\n/ √counts')
    axs[2].plot(x,a-b,'.',ms=2.5,color='#168a87');axs[2].axhline(0,color='.7',lw=.7);axs[2].set_ylabel('MossA −\nSYNCmoss (counts)');axs[2].ticklabel_format(axis='y',style='sci',scilimits=(0,0));axs[2].set_xlabel('Velocity (mm/s)')
    for ax in axs:ax.grid(alpha=.15)
    fig.savefig(OUT/'comparison.png',dpi=180);fig.savefig(OUT/'comparison.pdf');plt.close(fig)


def report(s):
    lines=['# SYNCmoss SMS transmission validation','',f'Upstream snapshot: [`{COMMIT}`]({REPO}/tree/{COMMIT}).','',
           '**Scope:** production MossA WASM versus the actual, unmodified SYNCmoss `models.TI` calculation using the measured SMS α-Fe standard and the instrumental profile embedded in that same file. This is an identical-parameter calculation comparison; the source is held fixed.','',
           '## Source and absorber conventions','',
           '- SYNCmoss source triples `(a, μ, c)` mean Gaussian std `a² + 0.098/2`, center `μ`, and integrated area `c²`. Convert std to FWHM with `2√(2 ln 2)`.','- SYNCmoss integrates `S(u) T(v+u)`; MossA uses response convolution `R(v-u) T(u)`. The response must be reflected. MossA fixes its centroid to zero, so upstream absorber centers are shifted by the original source centroid.',
           f"- Original source centroid: **{s['source_profile']['raw_source_centroid']:.12g} mm/s**. All three supplied components are used; their weights sum to one.",
           '- SYNCmoss thickness `T` becomes MossA optical-depth area `π × 0.098/2 × T`. Common Lorentzian line widths and exact individual line positions are preserved.',
           '- Magnetic constants differ. The primary comparison expands the MossA site into identical SYNCmoss Singlet lines. A second comparison uses native SYNCmoss Sextet/Doublet components; its field and two sextet correction slots are explicitly mapped to preserve all line positions. Those correction values are numerical convention conversions, not inferred second-order physics.',
           '- Both paths use the full exponential of summed optical depth. No channel averaging, texture, relaxation, or nonzero absorber Gaussian broadening is included. The same constant continuum is applied.','',
           '## Results','',
           '| Case | Maximum difference (counts) | RMS difference (counts) | Maximum / continuum |','| --- | ---: | ---: | ---: |']
    for c in s['cases']:
        m=c['difference'];lines.append(f"| {c['id']} | {m['max_abs_counts']:.7g} | {m['rms_counts']:.7g} | {m['max_relative_to_continuum']:.3g} |")
    lines.extend(['',f"Acceptance: maximum difference / continuum below `{s['acceptance_max_relative_to_continuum']}`. **{'Passed' if s['passed'] else 'Failed'}.**",'',
                  'SYNCmoss was evaluated at 64, 128, 256, 512, 1024, and 2048 nodes. The 1024→2048 change is checked separately; native-component versus expanded-line agreement is also checked. The complete convergence results and parameter mappings are in `summary.json` and `upstream-comparison.json`.','',
                  f"The measured standard has {s['standard']['points']} velocity/count pairs. A representative natural-width powder sextet gives reduced χ² = {s['standard']['mossa_reduced_chi2']:.6g} in MossA. Its fitted values select a realistic absorber for the numerical comparison; this is not an independent determination of the sample composition or a reproduction of the author's final fit.",'',
                  f"The deliberately reflected source control differs by up to **{s['wrong_source_handedness']['max_abs_counts']:.6g} counts**, showing that the comparison detects an incorrect asymmetry convention.",'',
                  'The original Gaussian-source implementation used PCHIP on the 0.01 mm/s convolution grid. Initial shared-grid evaluations agreed with SYNCmoss to about 1e-8 counts, while off-grid evaluations differed by up to 0.21 counts. Gaussian-source evaluation now uses six-point local polynomial interpolation; legacy source interpolation remains unchanged. The earlier prediction arrays are retained in `before-interpolation-fix.json`.','',
                  '## Reproduce','', 'Run from the repository root after installing Python `numpy scipy numba matplotlib`:','',
                  '```sh','npm run wasm','python scripts/validate-syncmoss-sms.py','npx tsx --test tests/syncmoss-transmission.test.tsx','```','',
                  'Upstream source is cached under the system temporary directory and verified against pinned Git blob hashes. No expressions in the upstream physics modules are patched or replaced. The serial pool implements only the same `starmap` interface used by the upstream tests. The Qt-bearing GUI is not imported.','',
                  'Use `--write-fixture` only when intentionally refreshing the pinned regression fixture after inspecting the results. The fixture lets normal MossA tests verify the external calculation without downloading or installing SYNCmoss.','',
                  '## Files and limitations','',
                  '- `inputs/Standard_SMS.dat`: exact upstream measured data and embedded source parameters; `UPSTREAM_LICENSE.txt` retains its repository license.','- `inputs/source-profile.json`: exact supplied parameters and conversion into the MossA response convention.','- `standard-fit-results.json`: actual production-WASM fit and diagnostics.','- `SMS-standard.mossa.json`: reopenable measured standard at the fitted parameter values; source provenance is retained. Saved fit diagnostics are in the separate results file.','- `comparison.png` / `comparison.pdf`: measured spectrum, shared predictions, residuals, and engine difference.','- `summary.json`: acceptance checks, environment, source hashes, and runtime/core hashes.','- `upstream-comparison.json`: all sampled predictions and exact upstream inputs.','',
                  *['- '+x for x in s['limitations']]])
    (OUT/'README.md').write_text('\n'.join(lines)+'\n')


if __name__=='__main__':
    main()

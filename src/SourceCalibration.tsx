import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { calibrateCounts, parseSpectrum, type ImportInfo } from './io.mjs';
import { ImportDetails } from './ImportDetails';
import { SourceShapePreview } from './SourceShapePreview';
import { centeredGaussians } from './source-profile';
import { Numeric } from './Numeric';
import { Plot } from './Plot';
import { finishSourceCalibration, sourceReferenceProject, sourceReferenceSeeds, type SourceCalibration, type SourceSettings } from './source-calibration';
import type { Calibration } from './session';
import type { Evaluation, FitResult, Project } from './types';

const number = (v: number, digits = 5) => v !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e7)
  ? v.toExponential(digits - 1) : Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });
export function SourceCalibrationDialog({ project, filename, cal, spectrumImportInfo, onApply, onClose }: { project: Project; filename: string; cal: Calibration; spectrumImportInfo?: ImportInfo; onApply: (result: SourceCalibration) => void; onClose: () => void }) {
  const saved = cal.sourceReference;
  const [spectrum, setSpectrum] = useState(saved?.spectrum ?? project.spectrum);
  const [name, setName] = useState(saved?.name ?? filename);
  const [importInfo, setImportInfo] = useState<ImportInfo | undefined>(saved?.importInfo ?? spectrumImportInfo);
  const [settings, setSettings] = useState<SourceSettings>({ absorberFwhm: saved?.absorberFwhm ?? .097, initialSourceFwhm: saved?.sourceFwhm ?? .4, squared: project.source_squared, gaussianCount: project.source_gaussians?.length ?? 0, initialGaussians: project.source_gaussians });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState(''), [version, setVersion] = useState(0);
  const [view, setView] = useState<{ project: Project; evaluation: Evaluation | null } | null>(null);
  const [result, setResult] = useState<SourceCalibration | null>(null);
  const mixture = (settings.gaussianCount ?? 0) > 0;
  const engine = useRef<Engine | null>(null), token = useRef(0), dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setReady(false);
    const worker = new Engine(() => setReady(true), message => { setError(message); setReady(false); setBusy(false); });
    engine.current = worker;
    return () => { token.current++; worker.stop(); };
  }, [version]);
  useEffect(() => {
    if (!ready) return;
    const id = ++token.current;
    try {
      const preview = sourceReferenceProject(spectrum, settings);
      const sameSource = saved?.gaussians
        ? JSON.stringify(preview.source_gaussians) === JSON.stringify(saved.gaussians)
        : !preview.source_gaussians && settings.squared === saved?.squared && settings.initialSourceFwhm === saved?.sourceFwhm;
      if (saved && spectrum === saved.spectrum && settings.absorberFwhm === saved.absorberFwhm && sameSource) {
        preview.sites[0].params.cs.value = saved.center;
        preview.sites[0].params.intensity.value = saved.intensity;
        preview.background.forEach((b, i) => b.value = saved.background[i]);
      }
      setView({ project: preview, evaluation: null }); setError('');
      engine.current!.request('evaluate-source', preview).then(response => { if (id === token.current) setView({ project: preview, evaluation: response.result as Evaluation }); }).catch(e => { if (id === token.current) setError(String(e)); });
    } catch (e) { setView(null); setError(String(e)); }
  }, [spectrum, settings, ready]);
  function change(next: Partial<SourceSettings>) { setSettings(old => ({ ...old, ...next })); setResult(null); setProgress(''); }
  function useSpectrum(next: Project['spectrum'], filename: string, info?: ImportInfo) { setSpectrum(next); setName(filename); setImportInfo(info); setResult(null); setProgress(''); setError(''); }
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8e6) throw new Error('Reference file is too large (maximum 8 MB).');
      const data = parseSpectrum(await file.text());
      const next = data.spectrum ?? calibrateCounts(data.raw!, cal.max, cal.shift, cal.sinusoidal, cal.folding ? cal.center : null);
      // Validate before replacing the previous reference.
      sourceReferenceProject(next, settings); useSpectrum(next, file.name, data.importInfo ? { ...data.importInfo, filename: file.name } : undefined);
    } catch (e) { setResult(null); setError(String(e)); }
  }
  async function fit() {
    if (!engine.current || !ready || busy) return;
    if (dialog.current?.querySelector('input[aria-invalid="true"]')) { setError('Correct the highlighted input before fitting.'); return; }
    const id = ++token.current; setBusy(true); setError(''); setResult(null);
    try {
      const seeds = sourceReferenceSeeds(spectrum, settings);
      let best: SourceCalibration | null = null, failure = '';
      for (let i = 0; i < seeds.length; i++) {
        setProgress(`Fitting ${i + 1}/${seeds.length}…`);
        const response = await engine.current.request('fit-source', seeds[i], update => {
          if (id !== token.current) return;
          setView({ project: update.project, evaluation: update.evaluation }); setProgress(`Fit ${i + 1}/${seeds.length} · ${update.iteration} iterations`);
        });
        if (id !== token.current) return;
        const fitted = response.result as FitResult;
        setView({ project: fitted.project, evaluation: fitted.evaluation });
        try { const candidate = finishSourceCalibration(name, fitted); if (!best || candidate.fit.evaluation.sse < best.fit.evaluation.sse) best = candidate; }
        catch (e) { failure = String(e); }
      }
      if (!best) throw new Error(failure || 'Source fit failed.');
      if (importInfo) best.reference.importInfo = importInfo;
      setResult(best); setView({ project: best.fit.project, evaluation: best.fit.evaluation });
      setProgress(`Converged · ${best.fit.iterations} ${best.fit.iterations === 1 ? 'iteration' : 'iterations'} · RMS ${number(best.reference.rms, 3)} counts`);
    } catch (e) { if (id === token.current) { setError(String(e)); setProgress(''); } }
    finally { if (id === token.current) setBusy(false); }
  }
  function stop() { token.current++; engine.current?.stop(); setBusy(false); setReady(false); setResult(null); setProgress('Canceled'); setVersion(v => v + 1); }
  return <dialog className="calibration-dialog" ref={dialog} aria-labelledby="source-calibration-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <div className="calibration-heading"><h2 id="source-calibration-heading">Source-profile calibration</h2><form method="dialog"><button aria-label="Close source calibration">×</button></form></div>
    <div className="calibration-body"><div className="calibration-controls">
      <p className="calibration-note">Use a singlet standard with a known Lorentzian absorber width (mm/s).</p>
      <fieldset className="bare" disabled={busy}>
        <button className="full-width" onClick={() => input.current?.click()}>Open source reference</button>
        <button className="full-width" onClick={() => useSpectrum(project.spectrum, filename, spectrumImportInfo)}>Use current spectrum</button>
        <ImportDetails info={importInfo}/>
        <input ref={input} type="file" hidden accept=".txt,.dat,.csv,.asc,.mca" aria-label="Source reference file" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }}/>
        <p className="calibration-filename" title={name}>{name}<br/>{spectrum.x.length} points</p>
        <label className="inline-label">Known absorber FWHM<Numeric label="Known absorber FWHM" value={settings.absorberFwhm} onChange={v => change({ absorberFwhm: v! })}/></label>
        <label className="inline-label">Source model<select aria-label="Source model" value={mixture ? 'gaussian' : settings.squared ? 'squared' : 'lorentzian'} onChange={e => change({ gaussianCount: e.target.value === 'gaussian' ? 2 : 0, squared: e.target.value === 'squared', initialGaussians: undefined, initialSourceFwhm: Math.max(.03, settings.initialSourceFwhm) })}><option value="lorentzian">Lorentzian</option><option value="squared">Lorentzian-squared</option><option value="gaussian">Gaussian mixture</option></select></label>
        {mixture && <label className="inline-label">Gaussians<select aria-label="Gaussian components" value={settings.gaussianCount} onChange={e => change({ gaussianCount: Number(e.target.value), initialGaussians: undefined })}>{[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
        <label className="inline-label">Initial source width<Numeric label="Initial source width" value={settings.initialSourceFwhm} onChange={v => change({ initialSourceFwhm: v!, initialGaussians: undefined })}/></label>
        <details className="calibration-warnings"><summary>Model details</summary><p>{mixture ? "Fit a positive Gaussian mixture through the transmission integral. The complete unit-area source shape is centered at zero and held fixed in sample fits. Component widths span 0.03–5 mm/s. Start with fewer components; add complexity only if the reference supports it. Measure the reference under the same source conditions as the samples, with comparable or better statistics." : "MATLAB transmission calibration model; source width range 0.001–5 mm/s. The squared profile uses the original MossA width convention."}</p></details>
      </fieldset>
      {busy ? <button className="full-width" onClick={stop}>Stop source calibration</button> : <button className="fit-button" disabled={!ready || !view || !!error} onClick={() => void fit()}>Fit source reference</button>}
      <p className="calibration-progress" role="status">{progress || (!ready ? 'Loading fitting engine…' : '')}</p>
      {error && <p className="calibration-error" role="alert">{error}</p>}
      {result && !result.reference.gaussians && <dl className="calibration-values"><div><dt>Source width</dt><dd>{number(result.reference.sourceFwhm)} mm/s</dd></div><div><dt>± 1 std</dt><dd>{number(result.reference.sourceStd, 2)} mm/s</dd></div><div><dt>Line center</dt><dd>{number(result.reference.center)} mm/s</dd></div></dl>}
      {result?.reference.gaussians && <div className="source-component-results"><p className="calibration-note">Complete calibrated source · {result.reference.gaussians.length} Gaussian{result.reference.gaussians.length > 1 ? 's' : ''}. Reference center: {number(result.reference.center)} mm/s.</p><table><thead><tr><th>Center</th><th>FWHM ± 1 std</th><th>Area (%)</th></tr></thead><tbody>{centeredGaussians(result.reference.gaussians).map((g,i) => <tr key={i}><td>{number(g.center, 3)}</td><td>{number(g.fwhm, 3)} ± {result.reference.sourceErrors?.[`source:${i}:fwhm`] == null ? '—' : number(result.reference.sourceErrors[`source:${i}:fwhm`]!, 2)}</td><td>{number(100 * g.weight, 3)}</td></tr>)}</tbody></table><p className="calibration-note">Centers and widths in mm/s. Centers use the source centroid as zero. Component parameters describe the instrumental shape.</p></div>}
      {result && <p className="calibration-note">Std assumes the known absorber width and velocity scale are exact.</p>}
      {view && result && result.fit.warnings.length > 0 && <details className="calibration-warnings"><summary>Fit warnings ({result.fit.warnings.length})</summary>{result.fit.warnings.map(w => <p key={w}>{w}</p>)}</details>}
      {!result && saved && <p className="calibration-note">Last applied: {saved.gaussians ? `${saved.gaussians.length}-Gaussian source` : `${number(saved.sourceFwhm)} ± ${number(saved.sourceStd, 2)} mm/s`} from {saved.name}.</p>}
    </div><div className="calibration-preview"><div className="calibration-view">{view ? <Plot id="source-calibration-plot" project={view.project} evaluation={view.evaluation} fitted={!!result} picking={null} onPick={() => {}} onHover={() => {}} onCancelPick={() => {}}/> : <p>Open a singlet standard to preview its fit.</p>}</div>{view && <SourceShapePreview project={view.project}/>}</div></div>
    <div className="calibration-footer"><p>Apply updates the source profile. Sample sites and data are retained; Undo restores the previous settings and fit. Raw references use the current folding and velocity controls.</p><button title="Apply the fitted source profile to this model; the sample’s velocity calibration is retained" disabled={!result || busy} onClick={() => { if (dialog.current?.querySelector('input[aria-invalid="true"]')) { setError('Correct the highlighted input before applying.'); return; } if (result) { try { onApply(result); dialog.current?.close(); } catch (e) { setError(String(e)); } } }}>Apply source profile</button></div>
  </dialog>;
}

import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { parseSpectrum } from './io.mjs';
import { Numeric } from './Numeric';
import { Plot } from './Plot';
import { finishCalibration, referenceProject, referenceSeeds, type CalibrationSettings, type VelocityCalibration } from './calibration';
import type { Calibration } from './session';
import type { Evaluation, FitResult, Project } from './types';
import { estimateFoldCenter, type FoldEstimate } from './folding';
import { FoldingDiagnostics } from './FoldingDiagnostics';

export function VelocityCalibrationDialog({ cal, raw, onApply, onClose }: { cal: Calibration; raw: number[] | null; onApply: (result: VelocityCalibration) => void; onClose: () => void }) {
  const saved = cal.reference;
  const [counts, setCounts] = useState<number[] | null>(saved?.counts ?? null);
  const [name, setName] = useState(saved?.name ?? '');
  const [settings, setSettings] = useState<CalibrationSettings>(saved?.settings ?? { max: cal.max, field: 33, sinusoidal: cal.sinusoidal, folding: cal.folding, center: 256.5, autoCenter: true });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [view, setView] = useState<{ project: Project; evaluation: Evaluation | null } | null>(null);
  const [result, setResult] = useState<VelocityCalibration | null>(null);
  const [previewTab, setPreviewTab] = useState<'spectrum' | 'folding'>('spectrum');
  const [foldEstimate, setFoldEstimate] = useState<FoldEstimate | null>(null);
  const [workerVersion, setWorkerVersion] = useState(0);
  const engine = useRef<Engine | null>(null), token = useRef(0), dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setReady(false);
    const worker = new Engine(() => setReady(true), message => { setError(message); setReady(false); setBusy(false); });
    engine.current = worker;
    return () => { token.current++; worker.stop(); };
  }, [workerVersion]);
  useEffect(() => {
    if (!counts || busy) return;
    try { setView({ project: referenceProject(counts, settings), evaluation: null }); setError(''); }
    catch (e) { setView(null); setError(String(e)); }
  }, [counts, settings]);
  const change = (next: Partial<CalibrationSettings>) => { setResult(null); setSettings(old => ({ ...old, ...next })); setProgress(''); if (next.folding === false) setPreviewTab('spectrum'); };
  const useCounts = (next: number[], filename: string, folding = settings.folding, center = next.length / 2 + .5) => {
    setCounts(next); setName(filename); setResult(null); setFoldEstimate(null); setProgress(''); setSettings(old => ({ ...old, folding, center, autoCenter: true }));
  };
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8e6) throw new Error('Reference file is too large (maximum 8 MB).');
      const parsed = parseSpectrum(await file.text());
      if (!parsed.raw) throw new Error('Load one column of raw reference counts. Two-column files already contain velocity values.');
      useCounts(parsed.raw, file.name);
    } catch (e) { setResult(null); setError(String(e)); }
  }
  async function fit() {
    if (!counts || !engine.current || !ready || busy) return;
    if (dialog.current?.querySelector('input[aria-invalid="true"]')) { setError('Correct the highlighted input before fitting.'); return; }
    const id = ++token.current;
    setResult(null); setError(''); setBusy(true); setPreviewTab('spectrum');
    try {
      const usedSettings = { ...settings };
      if (usedSettings.folding && usedSettings.autoCenter !== false) {
        setProgress('Finding fold center…');
        const found = await estimateFoldCenter(counts, async project => (await engine.current!.request('fit', project)).result as FitResult);
        if (id !== token.current) return;
        usedSettings.center = found.center; setSettings(usedSettings); setFoldEstimate(found);
      }
      const seeds = referenceSeeds(counts, usedSettings);
      let best: VelocityCalibration | null = null, failure = '';
      for (let i = 0; i < seeds.length; i++) {
        if (id !== token.current) return;
        setProgress(`Fitting ${i + 1}/${seeds.length}…`);
        const response = await engine.current.request('fit', seeds[i], update => {
          if (id !== token.current) return;
          setView({ project: update.project, evaluation: update.evaluation });
          setProgress(`Fit ${i + 1}/${seeds.length} · ${update.iteration} iterations`);
        });
        if (id !== token.current) return;
        const fitted = response.result as FitResult;
        setView({ project: fitted.project, evaluation: fitted.evaluation });
        try {
          const candidate = finishCalibration(counts, usedSettings, name, fitted);
          if (!best || candidate.fit.evaluation.sse < best.fit.evaluation.sse) best = candidate;
        } catch (e) { failure = String(e); }
      }
      if (!best) throw new Error(failure || 'Reference fit failed.');
      const evaluated = await engine.current.request('evaluate', best.preview);
      if (id !== token.current) return;
      setResult(best); setView({ project: best.preview, evaluation: evaluated.result as Evaluation });
      setProgress(`Converged · RMS ${best.reference.rms.toPrecision(3)}%`);
    } catch (e) { if (id === token.current) { setError(String(e)); setProgress(''); } }
    finally { if (id === token.current) setBusy(false); }
  }
  async function findCenter() {
    if (!counts || !engine.current || !ready || busy) return;
    const id = ++token.current;
    setBusy(true); setResult(null); setError(''); setPreviewTab('folding'); setProgress('Finding fold center…');
    try {
      const found = await estimateFoldCenter(counts, async project => (await engine.current!.request('fit', project)).result as FitResult);
      if (id !== token.current) return;
      const next = { ...settings, center: found.center };
      setSettings(next); setFoldEstimate(found); setView({ project: referenceProject(counts, next), evaluation: null });
      setProgress(`Fold center ${found.center}${found.refined ? '' : ' · best half-channel match'}`);
    } catch (e) { if (id === token.current) setError(String(e)); }
    finally { if (id === token.current) setBusy(false); }
  }
  function stop() { token.current++; engine.current?.stop(); setBusy(false); setReady(false); setResult(null); setProgress('Canceled'); setWorkerVersion(v => v + 1); }

  return <dialog className="calibration-dialog" ref={dialog} aria-labelledby="velocity-calibration-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <div className="calibration-heading"><h2 id="velocity-calibration-heading">Velocity calibration</h2><form method="dialog"><button aria-label="Close velocity calibration">×</button></form></div>
    <div className="calibration-body"><div className="calibration-controls">
      <p className="calibration-note">Use an α-Fe reference and an approximate velocity range. Partial iron patterns are supported. Turn folding off for an already folded reference.</p>
      <fieldset className="bare" disabled={busy}><button className="full-width" onClick={() => input.current?.click()}>Open reference spectrum</button>
        {raw && <button className="full-width" onClick={() => useCounts(raw, 'Current raw spectrum', cal.folding, cal.center)}>Use current raw spectrum</button>}
        <input ref={input} type="file" hidden accept=".txt,.dat,.csv,.asc" aria-label="Reference spectrum file" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }}/>
        {name && <p className="calibration-filename" title={name}>{name}<br/>{counts?.length} loaded points{settings.folding && counts ? ` → ${Math.floor(counts.length / 2)} folded points` : ''}</p>}
        <label className="inline-label">Initial max. velocity<Numeric label="Reference initial maximum velocity" value={settings.max} onChange={v => change({ max: v! })}/></label>
        <label className="inline-label">Reference BHF (T)<Numeric label="Reference hyperfine field" value={settings.field} onChange={v => change({ field: v! })}/></label>
        <label className="check-label"><input type="checkbox" checked={settings.sinusoidal} onChange={e => change({ sinusoidal: e.target.checked })}/>Sinusoidal drive</label>
        <label className="check-label"><input type="checkbox" checked={settings.folding} onChange={e => change({ folding: e.target.checked })}/>Fold reference channels</label>
        <label className="check-label"><input type="checkbox" checked={settings.autoCenter !== false} disabled={!settings.folding} onChange={e => change({ autoCenter: e.target.checked })}/>Automatic fold center</label>
        <label className="inline-label">Fold center<Numeric label="Reference fold center" value={settings.center} disabled={!settings.folding} onChange={v => change({ center: v!, autoCenter: false })}/></label>
        <button className="full-width" disabled={!counts || !ready || !settings.folding} onClick={() => void findCenter()}>Find fold center</button>
      </fieldset>
      {busy ? <button className="full-width" onClick={stop}>Stop calibration</button> : <button className="fit-button" disabled={!ready || !view || !!error} onClick={() => void fit()}>Fit reference</button>}
      <p className="calibration-progress" role="status">{progress || (!ready ? 'Loading fitting engine…' : '')}</p>
      {error && <p className="calibration-error" role="alert">{error}</p>}
      {result && <dl className="calibration-values"><div><dt>Max. velocity</dt><dd>{result.max.toPrecision(6)} mm/s</dd></div><div><dt>Standard CS</dt><dd>{result.shift.toPrecision(6)} mm/s</dd></div></dl>}
      {result && result.fit.warnings.length > 0 && <details className="calibration-warnings"><summary>Fit warnings ({result.fit.warnings.length})</summary>{result.fit.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
    </div><div className="calibration-preview"><div className="calibration-view-tabs" role="tablist" aria-label="Calibration preview"><button role="tab" id="cal-spectrum-tab" aria-controls="cal-spectrum-view" aria-selected={previewTab === 'spectrum'} onClick={() => setPreviewTab('spectrum')}>Spectrum</button><button role="tab" id="cal-folding-tab" aria-controls="cal-folding-view" aria-selected={previewTab === 'folding'} disabled={!counts || !settings.folding} onClick={() => setPreviewTab('folding')}>Folding</button></div>
      {previewTab === 'folding' && counts && settings.folding ? <div className="calibration-view" id="cal-folding-view" role="tabpanel" aria-labelledby="cal-folding-tab"><FoldingDiagnostics counts={counts} center={settings.center} estimate={foldEstimate} disabled={busy} onCenter={center => change({ center, autoCenter: false })}/></div>
        : <div className="calibration-view" id="cal-spectrum-view" role="tabpanel" aria-labelledby="cal-spectrum-tab">{view ? <Plot id="calibration-plot" project={view.project} evaluation={view.evaluation} fitted={!!result} picking={null} onPick={() => {}} onHover={() => {}} onCancelPick={() => {}}/> : <p>Open a reference spectrum to preview its fit.</p>}</div>}
    </div></div>
    <div className="calibration-footer"><p>{raw ? 'Apply recalibrates the current raw spectrum. Undo restores its previous scale and fit.' : 'This spectrum already has velocity values. The calibration will be saved for future raw-count imports.'}</p><button disabled={!result || busy} onClick={() => { if (dialog.current?.querySelector('input[aria-invalid="true"]')) { setError('Correct the highlighted input before applying.'); return; } if (result) { try { onApply(result); dialog.current?.close(); } catch (e) { setError(String(e)); } } }}>{raw ? 'Apply calibration' : 'Use calibration'}</button></div>
  </dialog>;
}

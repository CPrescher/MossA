import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { parseSpectrum } from './io.mjs';
import { Numeric } from './Numeric';
import { Plot } from './Plot';
import { finishCalibration, referenceProject, referenceSeeds, type CalibrationSettings, type VelocityCalibration } from './calibration';
import type { Calibration } from './session';
import type { Evaluation, FitResult, Project } from './types';

export function VelocityCalibrationDialog({ cal, raw, onApply, onClose }: { cal: Calibration; raw: number[] | null; onApply: (result: VelocityCalibration) => void; onClose: () => void }) {
  const saved = cal.reference;
  const [counts, setCounts] = useState<number[] | null>(saved?.counts ?? null);
  const [name, setName] = useState(saved?.name ?? '');
  const [settings, setSettings] = useState<CalibrationSettings>(saved?.settings ?? { max: cal.max, field: 33, sinusoidal: cal.sinusoidal, folding: false, center: 256.5 });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [view, setView] = useState<{ project: Project; evaluation: Evaluation | null } | null>(null);
  const [result, setResult] = useState<VelocityCalibration | null>(null);
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
  const change = (next: Partial<CalibrationSettings>) => { setResult(null); setSettings(old => ({ ...old, ...next })); setProgress(''); };
  const useCounts = (next: number[], filename: string, folding = false, center = next.length / 2 + .5) => {
    setCounts(next); setName(filename); setResult(null); setProgress(''); setSettings(old => ({ ...old, folding, center }));
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
    setResult(null); setError(''); setBusy(true);
    try {
      const seeds = referenceSeeds(counts, settings);
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
          const candidate = finishCalibration(counts, settings, name, fitted);
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
  function stop() { token.current++; engine.current?.stop(); setBusy(false); setReady(false); setResult(null); setProgress('Canceled'); setWorkerVersion(v => v + 1); }

  return <dialog className="calibration-dialog" ref={dialog} aria-labelledby="velocity-calibration-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <div className="calibration-heading"><h2 id="velocity-calibration-heading">Velocity calibration</h2><form method="dialog"><button aria-label="Close velocity calibration">×</button></form></div>
    <div className="calibration-body"><div className="calibration-controls">
      <p className="calibration-note">Use an α-Fe reference with all six lines. Load one count per channel; turn folding off for an already folded reference.</p>
      <fieldset className="bare" disabled={busy}><button className="full-width" onClick={() => input.current?.click()}>Open reference spectrum</button>
        {raw && <button className="full-width" onClick={() => useCounts(raw, 'Current raw spectrum', cal.folding, cal.center)}>Use current raw spectrum</button>}
        <input ref={input} type="file" hidden accept=".txt,.dat,.csv,.asc" aria-label="Reference spectrum file" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }}/>
        {name && <p className="calibration-filename" title={name}>{name} · {counts?.length} channels</p>}
        <label className="inline-label">Initial max. velocity<Numeric label="Reference initial maximum velocity" value={settings.max} onChange={v => change({ max: v! })}/></label>
        <label className="inline-label">Reference BHF (T)<Numeric label="Reference hyperfine field" value={settings.field} onChange={v => change({ field: v! })}/></label>
        <label className="check-label"><input type="checkbox" checked={settings.sinusoidal} onChange={e => change({ sinusoidal: e.target.checked })}/>Sinusoidal drive</label>
        <label className="check-label"><input type="checkbox" checked={settings.folding} onChange={e => change({ folding: e.target.checked })}/>Fold reference channels</label>
        <label className="inline-label">Fold center<Numeric label="Reference fold center" value={settings.center} disabled={!settings.folding} onChange={v => change({ center: v! })}/></label>
      </fieldset>
      {busy ? <button className="full-width" onClick={stop}>Stop calibration</button> : <button className="fit-button" disabled={!ready || !view || !!error} onClick={() => void fit()}>Fit reference</button>}
      <p className="calibration-progress" role="status">{progress || (!ready ? 'Loading fitting engine…' : '')}</p>
      {error && <p className="calibration-error" role="alert">{error}</p>}
      {result && <dl className="calibration-values"><div><dt>Max. velocity</dt><dd>{result.max.toPrecision(6)} mm/s</dd></div><div><dt>Standard CS</dt><dd>{result.shift.toPrecision(6)} mm/s</dd></div></dl>}
    </div><div className="calibration-preview">{view ? <Plot id="calibration-plot" project={view.project} evaluation={view.evaluation} fitted={!!result} selectedSite={-1} picking={null} onPick={() => {}} onHover={() => {}} onCancelPick={() => {}}/> : <p>Open a reference spectrum to preview its fit.</p>}</div></div>
    <div className="calibration-footer"><p>{raw ? 'Apply recalibrates the current raw spectrum. Undo restores its previous scale and fit.' : 'This spectrum already has velocity values. The calibration will be saved for future raw-count imports.'}</p><button disabled={!result || busy} onClick={() => { if (result) { try { onApply(result); dialog.current?.close(); } catch (e) { setError(String(e)); } } }}>{raw ? 'Apply calibration' : 'Use calibration'}</button></div>
  </dialog>;
}

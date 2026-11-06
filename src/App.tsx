import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { VelocityCalibrationDialog } from './VelocityCalibration';
import { applyVelocityCalibration, validCalibrationReference } from './calibration';
import { VersionIndicator } from './VersionIndicator';
import { buildInfo } from './version';
import { demo } from './demo';
import { calibrateCounts, csvSpectrum, parseSpectrum, validateProjectFile } from './io.mjs';
import { Plot } from './Plot';
import { ResultsPane } from './ResultsPane';
import { ResultsTable } from './ResultsTable';
import { intensityFractions } from './results';
import { FitDetails } from './FitDetails';
import { SiteList } from './site-list';
import { AddSiteMenu } from './AddSiteMenu';
import { Numeric } from './Numeric';
import { SiteListPane } from './SiteListPane';
import { useSnapshotHistory } from './history';
import { removeSiteAt, duplicateSiteAt } from './sites.mjs';
import { SiteNameEditor } from './SiteNameEditor';
import { readSession, summarizeFit, defaultLayout, type Snapshot } from './session';
import { useAutosave } from './useAutosave';
import { placedParameters, placementProject, updatePlacementSite } from './placement.mjs';
import { keys, labels, newSite, parameter, type Evaluation, type FitResult, type FitProgress, type Parameter, type Project, type Site } from './types';

function download(name: string, data: string, type: string) { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const fmt = (v: number | null | undefined, digits = 5) => v == null ? '—' : Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });

export default function App() {
  type Point = { x: number; y: number };
  type Placement = { site: Site; kind: string; stage: number; index: number | null; first?: Point; width?: Point; cursor?: Point };
  const [restored] = useState(() => readSession());
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [restoreError, setRestoreError] = useState(restored.error);
  const [layout, setLayout] = useState(restored.session?.layout ?? defaultLayout);
  const history = useSnapshotHistory<Snapshot>(() => ({ ...(restored.session?.snapshot ?? { project: demo(), raw: null, cal: { max: 10, shift: 0, sinusoidal: false, folding: true, center: 256.5 }, filename: 'Synthetic iron mixture', selected: 0 }), fit: restored.session?.fit ?? null, fitElapsed: restored.session?.elapsed ?? null }));
  const { project, raw, cal, filename, selected } = history.present;
  const setSelected = (value: number) => history.set({ ...history.present, selected: value }, false);
  const setCal = (next: (c: typeof cal) => typeof cal) => { const value = next(cal); history.set({ ...history.present, cal: { ...value, reference: value.max === cal.max && value.shift === cal.shift && value.sinusoidal === cal.sinusoidal ? cal.reference : undefined } }); };
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationVersion, setEvaluationVersion] = useState(0);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  const { tab, optionsOpen } = layout;
  const setTab = (tab: string) => setLayout(l => ({ ...l, tab }));
  const setOptionsOpen = (update: (value: boolean) => boolean) => setLayout(l => ({ ...l, optionsOpen: update(l.optionsOpen) }));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([restored.session ? 'Restored local project.' : 'Ready.']);
  const result = busy ? null : history.present.fit ?? null;
  const elapsed = history.present.fitElapsed ?? null;
  const [targetKey, setTargetKey] = useState('fwhm');
  const [linkSource, setLinkSource] = useState('');
  const [linkFactor, setLinkFactor] = useState(1);
  const [engineVersion, setEngineVersion] = useState(0);
  const [newKind, setNewKind] = useState<Site['kind']>('Doublet');
  const [newProfile, setNewProfile] = useState<Site['profile']>('Lorentzian');
  const [picking, setPicking] = useState<Placement | null>(null);
  const lastHover = useRef(0);
  const placementToken = useRef(0);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Engine | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null);
  const fitToken = useRef(0);
  const autosaveError = useAutosave({ version: 1, snapshot: history.present, layout, fit: history.present.fit ?? null, elapsed }, !restoreError);
  const append = (message: string) => setLog(old => [...old.slice(-5), message]);
  useEffect(() => {
    setReady(false);
    const engine = new Engine(() => setReady(true), message => { setError(message); setReady(false); setBusy(false); }); worker.current = engine;
    return () => engine.stop();
  }, [engineVersion]);
  useEffect(() => {
    if (!ready || busy) return;
    let current = true;
    const model = picking?.cursor ? placementProject(project, picking.site, picking.index) : project;
    const timer = setTimeout(() => worker.current?.request('evaluate', model).then(({ result: value }) => { if (current) { const evaluation = value as Evaluation; setEvaluation(evaluation); setError(''); } }).catch(e => { if (current) { setError(e.message); setEvaluation(null); } }), picking ? 10 : 90);
    return () => { current = false; clearTimeout(timer); };
  }, [project, ready, busy, engineVersion, picking, evaluationVersion]);
  const edit = (next: Project | ((p: Project) => Project), metadata: Partial<typeof history.present> = {}) => { setRestoreError(''); setEvaluation(null); setError(''); history.set({ ...history.present, ...metadata, project: typeof next === 'function' ? next(project) : next, fit: null, fitElapsed: null }); };
  function travel(direction: 'undo' | 'redo') { if (!ready || busy || picking || calibrationOpen) return; const target = direction === 'undo' ? history.past.at(-1) : history.future[0]; if (!target) return; history[direction](); if (target.project !== project) setEvaluation(null); setEvaluationVersion(v => v + 1); setError(''); append(direction === 'undo' ? 'Undid change.' : 'Redid change.'); }
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if (target.closest('input,textarea,select,[contenteditable=true]') || !(e.metaKey || e.ctrlKey) || e.altKey) return; if (e.key.toLowerCase() === 'z' || (e.key.toLowerCase() === 'y' && !e.metaKey)) { e.preventDefault(); travel(e.shiftKey || e.key.toLowerCase() === 'y' ? 'redo' : 'undo'); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [history, busy, picking, calibrationOpen]);
  const renameSite = (name: string) => { if (project.sites[selected]?.name === name) return; const next = { ...project, sites: project.sites.map((site,i) => i === selected ? { ...site, name } : site) }; history.set({ ...history.present, project: next }); };
  const updateSite = (next: Partial<Site>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, ...next } : s) }));
  const updateParam = (key: string, next: Partial<Parameter>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, params: { ...s.params, [key]: { ...s.params[key], ...next } } } : s) }));
  const hasCurrent = project.sites.length > 0;
  const current = picking?.site ?? progress?.project.sites[selected] ?? project.sites[Math.min(selected, project.sites.length - 1)] ?? newSite(0, newKind);
  useEffect(() => { if (!picking) return; const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPick(); }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, [!!picking]);
  async function fit() {
    if (!worker.current || !ready || busy || error || picking) return;
    const token = ++fitToken.current; setBusy(true); setProgress(null); setError(''); append('Fitting with trust-region reflective…');
    try {
      const response = await worker.current.request('fit', project, update => { if (token !== fitToken.current) return; setProgress(update); setEvaluation(update.evaluation); });
      if (token !== fitToken.current) return;
      const fitResult = response.result as FitResult;
      history.set({ ...history.present, project: { ...fitResult.project, spectrum: project.spectrum }, fit: summarizeFit(fitResult), fitElapsed: response.elapsed }); setEvaluation(fitResult.evaluation);
      append(`${fitResult.converged ? 'Converged' : 'Stopped'} · ${fitResult.iterations} iterations · ${response.elapsed.toFixed(0)} ms`);
      fitResult.warnings.forEach(append);
    } catch (e) { if (token === fitToken.current) { setError(String(e)); setEvaluation(null); append('Fit failed; starting parameters retained.'); } }
    finally { if (token === fitToken.current) { setBusy(false); setProgress(null); } }
  }
  function stop() { fitToken.current++; worker.current?.stop(); setProgress(null); setEvaluation(null); setBusy(false); setReady(false); setEngineVersion(v => v + 1); append('Fit canceled; starting parameters retained.'); }
  async function loadSpectrum(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8e6) throw new Error('Spectrum file is too large (maximum 8 MB).');
      const parsed = parseSpectrum(await file.text());
      let spectrum: Project['spectrum'];
      let nextRaw: number[] | null = null, nextCal = cal;
      if (parsed.raw) {
        const calibration = { ...cal, folding: cal.folding && parsed.raw.length >= 16 && parsed.raw.length % 2 === 0, center: parsed.raw.length / 2 + .5 }; spectrum = calibrateCounts(parsed.raw, calibration.max, calibration.shift, calibration.sinusoidal, calibration.folding ? calibration.center : null);
        nextRaw = parsed.raw; nextCal = calibration; setTab('Gen');
      } else { spectrum = parsed.spectrum!; }
      const next = { ...project, spectrum, background: [parameter(Math.max(...spectrum.y))] };
      const checked = await worker.current!.request('evaluate', next);
      edit(next, { raw: nextRaw, cal: nextCal, filename: file.name }); setEvaluation(checked.result as Evaluation); append(`Loaded ${spectrum.x.length} points from ${file.name}.`);
    } catch (e) { setError(String(e)); }
  }
  async function loadProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12e6) throw new Error('Project file is too large (maximum 12 MB).');
      const doc = JSON.parse(await file.text()), p = validateProjectFile(doc);
      const savedRaw = doc.preprocessing?.raw_counts;
      const savedCal = doc.preprocessing?.controls;
      if (savedRaw != null && (!Array.isArray(savedRaw) || savedRaw.length < 8 || savedRaw.length > 20000 || savedRaw.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))) throw new Error('Invalid saved raw channel data.');
      if (savedCal && (![savedCal.max, savedCal.shift, savedCal.center].every(Number.isFinite) || savedCal.max <= 0 || typeof savedCal.sinusoidal !== 'boolean' || typeof savedCal.folding !== 'boolean')) throw new Error('Invalid saved calibration controls.');
      if (savedCal?.reference && !validCalibrationReference(savedCal.reference)) throw new Error('Invalid saved velocity reference.');
      const checked = await worker.current!.request('evaluate', p);
      edit(p, { filename: typeof doc.name === 'string' ? doc.name : file.name, raw: savedRaw ?? null, cal: savedCal ?? cal, selected: 0 }); setEvaluation(checked.result as Evaluation); append('Browser project loaded; fit results cleared.');
    } catch (e) { setError(String(e)); }
  }
  function saveProject() { download('spectrum.mossa.json', JSON.stringify({ format: 'mossa-project', version: 1, name: filename, project, preprocessing: { raw_counts: raw, controls: cal }, provenance: { application: `MossA ${buildInfo.version}`, commit: buildInfo.commit, modified: buildInfo.dirty, matlab_reference: 'd201482b7990afbd0e2dcc23e306bfc8d60a5049' }, fit: result }, null, 2), 'application/json'); append('Project saved with data, parameters, bounds, and links.'); }
  function exportResults() {
    if (!result) return;
    const rows = ['site,type,profile,parameter,value,approx_1std,link'];
    project.background.forEach((b, i) => rows.push(['Background', 'Polynomial', '', `b${i}`, b.value, result.errors[`bkg:${i}`] ?? '', ''].join(',')));
    project.sites.forEach((s, i) => keys(s).forEach(k => rows.push([`"${s.name.replaceAll('"', '""')}"`, s.kind, s.profile, k, s.params[k].value, result.errors[`site:${i}:${k}`] ?? '', s.params[k].link ? `"${s.params[k].link!.factor} * ${s.params[k].link!.target}"` : ''].join(','))));
    intensityFractions(project,evaluation,result).forEach((fraction,i) => { const site = project.sites[i]; rows.push([`"${site.name.replaceAll('"', '""')}"`, site.kind, site.profile, 'intensity_fraction_percent', fraction.value ?? '', fraction.error ?? '', ''].join(',')); });
    download('mossa-fit-parameters.csv', rows.join('\n'), 'text/csv');
  }
  function addSite() {
    const site = newSite(project.sites.length, newKind); site.profile = newProfile; if (newKind === 'Sextet') site.params.qs.value = 0;
    site.params.cs.min = project.spectrum.x[0]; site.params.cs.max = project.spectrum.x.at(-1)!;
    site.params.fwhm.max = null; site.params.bhf.max = null;
    site.params.qs.min = null; site.params.qs.max = null;
    if (project.mode === 'transmission') site.params.intensity.value = .01;
    placementToken.current++; setPicking({ site, kind: site.kind, stage: 0, index: null }); setError('');
    append(`Define ${newKind.toLowerCase()}: click position/depth, then width${newKind === 'Singlet' ? '.' : ', then the opposite line.'}`);
  }
  function redefineSite() {
    if (!hasCurrent) return;
    const site = structuredClone(project.sites[selected]);
    placementToken.current++; setPicking({ site, kind: site.kind, stage: 0, index: selected }); setError('');
  }
  function draftAt(state: Placement, point: Point): Placement {
    const first = state.first ?? point;
    const baseline = project.background.reduce((sum, b, i) => sum + b.value * first.x ** i, 0);
    const values = placedParameters(state.stage < 2 ? 'Singlet' : state.site.kind, state.site.profile, first, state.stage === 1 ? point : state.width ?? null, state.stage === 2 ? point : null, baseline, project.mode, state.site.params.mix.value);
    if (state.stage === 2 && state.site.kind === 'Sextet') values.cs -= state.site.params.qs.value / 2;
    return { ...state, cursor: point, site: updatePlacementSite(state.site, values) };
  }
  function hoverPick(point: Point) { const now = performance.now(); if (now - lastHover.current < 40) return; lastHover.current = now; setPicking(old => old ? draftAt(old, point) : null); }
  async function commitPick(point: Point) {
    if (!picking) return; const next = draftAt(picking, point);
    if (next.stage === 0) { setPicking({ ...next, stage: 1, first: point }); return; }
    if (next.stage === 1 && next.site.kind !== 'Singlet') { setPicking({ ...next, stage: 2, width: point }); return; }
    const token = placementToken.current;
    setPicking(next);
    const candidate = placementProject(project, next.site, next.index);
    try {
      const checked = await worker.current!.request('evaluate', candidate);
      if (token !== placementToken.current) return;
      placementToken.current++;
      edit(candidate, { selected: next.index ?? project.sites.length }); setEvaluation(checked.result as Evaluation); setPicking(null);
      append(`${next.site.name} ${next.index === null ? 'added' : 'redefined'}.`);
    } catch (e) { if (token === placementToken.current) setError(String(e)); }
  }
  function cancelPick() { placementToken.current++; setPicking(null); setEvaluation(null); setError(''); append('Peak placement canceled.'); }
  function removeSite(index: number) {
    const next = removeSiteAt(project, selected, index);
    edit(next.project, { selected: next.selected }); append('Site removed; links to it were released.');
  }
  function duplicateSite() { const next = duplicateSiteAt(project, selected); if (next.project === project) return; edit(next.project, { selected: next.selected }); append('Site duplicated.'); }
  function changeKind(kind: Site['kind']) { const defaults = newSite(selected, kind); updateSite({ kind, params: { ...current.params, a12: defaults.params.a12, ...(kind === 'Singlet' ? {} : {}) } }); }
  function changeMode(mode: Project['mode']) {
    if (mode === project.mode) return;
    const factor = mode === 'transmission' ? 1 / Math.max(1, project.background[0].value) : Math.max(1, project.background[0].value);
    edit(p => ({ ...p, mode, sites: p.sites.map(s => ({ ...s, params: { ...s.params, intensity: { ...s.params.intensity, value: s.params.intensity.value * factor, min: s.params.intensity.min === null ? null : s.params.intensity.min * factor, max: s.params.intensity.max === null ? null : s.params.intensity.max * factor } } })) }));
    append(`Switched model; intensity values and bounds scaled by ${factor.toPrecision(4)} as starting estimates.`);
  }
  function applyCalibration() {
    try { if (!raw) return; const spectrum = calibrateCounts(raw, cal.max, cal.shift, cal.sinusoidal, cal.folding ? cal.center : null); edit(p => ({ ...p, spectrum, background: [parameter(Math.max(...spectrum.y))] })); append('Applied channel folding and velocity calibration.'); } catch (e) { setError(String(e)); }
  }
  const paramId = (k: string) => `site:${selected}:${k}`;
  const linkOptions = project.sites.flatMap((s, i) => keys(s).map(k => ({ id: `site:${i}:${k}`, label: `${i + 1} · ${s.name} · ${labels[k]}` }))).filter(o => o.id !== paramId(targetKey));
  const canCalculate = ready && !busy && !picking;
  return <div className="app">
    <header className="app-header"><div className="brand"><span className="brand-mark">MossA 2</span><span className="brand-divider"/><h1>Mössbauer analysis</h1></div><div className="header-actions"><VersionIndicator/><button className="help-button" onClick={() => helpDialog.current?.showModal()}>Help</button></div></header>
    <nav className="main-toolbar" aria-label="File actions"><div className="toolbar-group"><button disabled={!canCalculate} onClick={() => fileInput.current?.click()}><span aria-hidden>↥</span> Open spectrum</button><button disabled={!canCalculate} onClick={() => projectInput.current?.click()}>Open project</button><button disabled={!canCalculate || !!error} onClick={saveProject}>Save project</button></div><div className="toolbar-group"><button disabled={!evaluation || busy || !!picking} onClick={() => download('mossa-spectrum.csv', csvSpectrum(project, evaluation!), 'text/csv')}>Export data</button><button disabled={!evaluation || busy || !!picking} onClick={() => { const svg = document.getElementById('spectrum-plot')!.cloneNode(true) as SVGElement; svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = '.grid{stroke:#e8edf0;stroke-width:1}.axis{stroke:#a0aab2}.tick{fill:#687783;font:12px sans-serif}.axis-label{fill:#4a5964;font:13px sans-serif}.section-label{fill:#687783;font:11px sans-serif}'; svg.prepend(style); download('mossa-spectrum.svg', new XMLSerializer().serializeToString(svg), 'image/svg+xml'); }}>Export graph</button></div><div className="toolbar-group history-controls"><button aria-label="Undo" title="Undo (⌘/Ctrl+Z)" disabled={!canCalculate || !history.past.length} onClick={() => travel('undo')}>↶ Undo</button><button aria-label="Redo" title="Redo (⌘/Ctrl+Shift+Z)" disabled={!canCalculate || !history.future.length} onClick={() => travel('redo')}>↷ Redo</button></div><button className="example-button" disabled={!canCalculate} onClick={() => { edit(demo(), { selected: 0, raw: null, filename: 'Synthetic iron mixture' }); append('Synthetic teaching example reset.'); }}>Load example</button></nav>
    <input ref={fileInput} type="file" hidden aria-label="Spectrum file" accept=".txt,.dat,.csv,.asc" onChange={e => { void loadSpectrum(e.target.files?.[0]); e.target.value = ''; }}/><input ref={projectInput} type="file" hidden aria-label="Project file" accept=".json" onChange={e => { void loadProject(e.target.files?.[0]); e.target.value = ''; }}/>
    <div className={`workspace ${optionsOpen ? 'options-open' : ''}`}>
      <aside className="left-panel"><div className="panel-heading"><h2>Sites</h2><span className="count">{project.sites.length}</span><div className="heading-actions">{picking ? <button className="cancel-placement" onClick={cancelPick}>Cancel</button> : <button className="redefine-button" disabled={!canCalculate || !hasCurrent} onClick={redefineSite} title="Redraw the selected site; keep its name and settings">Redefine</button>}<button className="duplicate-site" aria-label="Duplicate site" title="Duplicate selected site" disabled={!canCalculate || !hasCurrent || project.sites.length >= 16} onClick={duplicateSite}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/></svg></button><AddSiteMenu disabled={!canCalculate || project.sites.length >= 16} kind={newKind} profile={newProfile} onKind={setNewKind} onProfile={setNewProfile} onDefine={addSite}/></div></div>
        <SiteListPane count={project.sites.length} height={layout.sitesHeight} onHeightChange={sitesHeight => setLayout(l => ({ ...l, sitesHeight }))}><SiteList sites={project.sites} selected={selected} disabled={!canCalculate} onSelect={index => { setSelected(index); setTargetKey('fwhm'); }} onDelete={removeSite}/></SiteListPane>
        <fieldset disabled={!canCalculate} className="bare site-editor">
          {(hasCurrent || picking) ? <fieldset className="bare selected-site-editor" disabled={!!picking}>
          <section className="left-section"><div className="section-heading"><SiteNameEditor key={selected} name={current.name} onCommit={renameSite}/><span title="Checked parameters vary during fitting">Fit</span></div><div className="param-rows">{keys(current).map(k => <div className="param-row" key={k}><label title={k === 'intensity' ? (project.mode === 'thin' ? 'Area parameter in original MossA convention' : 'Absorber optical-depth area parameter') : k === 'mix' ? 'Pseudo-Voigt Lorentzian mixing fraction (0–1), not the site intensity percentage' : k === 'a12' && current.kind === 'Doublet' ? 'Fraction assigned to the first line (0–1)' : labels[k]}>{labels[k]}<small>{['cs','fwhm','qs'].includes(k) ? 'mm/s' : k === 'bhf' ? 'T' : ''}</small></label><Numeric label={`${labels[k]} value`} value={current.params[k].link ? evaluation?.parameters?.[paramId(k)] ?? current.params[k].value : current.params[k].value} onChange={v => updateParam(k, { value: v! })} disabled={!!current.params[k].link}/>{current.params[k].link ? <span className="linked" title={`Linked to ${current.params[k].link!.target}`}>↗</span> : <input type="checkbox" aria-label={`Fit ${labels[k]}`} checked={current.params[k].fit} onChange={e => updateParam(k, { fit: e.target.checked })}/>}</div>)}</div></section><details className="site-properties"><summary aria-label="Site settings" title="Edit site type and profile">⚙</summary><div className="left-section"><div className="two-columns"><label className="stack-label">Site type<select aria-label="Site type" value={current.kind} onChange={e => changeKind(e.target.value as Site['kind'])}>{['Singlet','Doublet','Sextet'].map(s => <option key={s}>{s}</option>)}</select></label><label className="stack-label">Line profile<select aria-label="Line profile" value={current.profile} onChange={e => updateSite({ profile: e.target.value as Site['profile'] })}>{['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].map(s => <option key={s}>{s}</option>)}</select></label></div></div></details></fieldset> : <div className="empty-sites">No sites</div>}

        </fieldset>
        <div className="fit-area">{busy ? <button className="fit-button stop" onClick={stop}><span className="spinner"/> Stop fitting</button> : <button className="fit-button" disabled={!ready || !!error || !!picking} onClick={() => void fit()}>Fit spectrum <span>↵</span></button>}</div>
        <section className={`status-panel ${error ? 'status-error' : ''}`} aria-label="Fit status"><h3>Status</h3>{(restoreError || autosaveError) && <span className="local-save-warning" role="alert" title={restoreError || autosaveError}>Local save unavailable · Save project</span>}<div className="status-current" role={error ? 'alert' : 'status'} aria-live="polite">{error || (picking ? `${picking.stage + 1}/${picking.kind === 'Singlet' ? 2 : 3} · ${picking.index === null ? 'Adding site' : 'Redefining site'}` : busy ? `Fitting · ${progress?.iteration ?? 0} iterations` : result ? `${result.converged ? 'Converged' : 'Stopped'} · ${result.iterations} iterations · ${elapsed?.toFixed(0)} ms` : !ready ? 'Loading…' : log.at(-1))}</div>{error && <button className="clear-error" onClick={() => { setError(''); setEngineVersion(v => v + 1); }}>Retry</button>}{!picking && (busy || result) && <FitDetails warningCount={result?.warnings.length ?? 0}>{!picking && (busy || result) && <dl className="status-stats"><div><dt title="Sum of squared residuals; count weighting divides each term by the observation">{project.weighting === 'counts' ? 'Weighted SSE' : 'SSE'}</dt><dd data-testid="objective">{evaluation?.objective.toExponential(3) ?? '—'}</dd></div>{result && <div><dt title="Objective divided by the residual degrees of freedom">Reduced</dt><dd>{fmt(result.reduced_objective)}</dd></div>}</dl>}{!picking && result?.warnings.length ? <details className="status-warnings"><summary>{result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}</summary>{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</details> : null}</FitDetails>}</section>
      </aside>
      <main className="center-panel"><div className="document-bar"><div><span className="file-icon">▤</span><strong title={filename}>{filename}</strong>{filename === 'Synthetic iron mixture' && <span className="demo-badge">SYNTHETIC</span>}</div><button className="toggle-options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(v => !v)}>Options</button></div>
        <Plot selectedSite={picking ? picking.index ?? project.sites.length : selected} project={progress ? { ...progress.project, spectrum: project.spectrum } : project} evaluation={evaluation} fitted={!!result && !picking} picking={picking} onPick={point => { void commitPick(point); }} onHover={hoverPick} onCancelPick={cancelPick}/>

      </main>
      <aside className="right-panel"><div className="tabs" role="tablist" aria-label="Fitting options">{['Gen','Bnds','xVBF','Opt'].map(t => <button id={`tab-${t}`} aria-controls={`panel-${t}`} role="tab" aria-selected={tab === t} key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div><div className="options-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}><fieldset className="bare" disabled={!canCalculate}>
        {tab === 'Gen' && <>
          <section className="option-section"><h3>General</h3><label className="stack-label">Spectrum model<select aria-label="Spectrum model" value={project.mode} onChange={e => changeMode(e.target.value as Project['mode'])}><option value="thin">Thin absorber</option><option value="transmission">Full transmission integral</option></select></label></section>
          <section className="option-section"><div className="section-heading"><h3>Background</h3><span title="Checked parameters vary during fitting">Fit</span></div><label className="inline-label">Polynomial<select aria-label="Background order" value={project.background.length - 1} onChange={e => edit(p => ({ ...p, background: Array.from({ length: Number(e.target.value) + 1 }, (_, i) => p.background[i] ?? parameter(0)) }))}>{[0,1,2,3].map(i => <option value={i} key={i}>{i === 0 ? 'Constant' : `Order ${i}`}</option>)}</select></label>{project.background.map((p, i) => <div className="param-row" key={i}><label>{i === 0 ? 'I₀' : `b${i}`}</label><Numeric label={`Background ${i}`} value={p.value} onChange={v => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, value: v! } : b) }))}/><input type="checkbox" aria-label={`Fit background ${i}`} checked={p.fit} onChange={e => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, fit: e.target.checked } : b) }))}/></div>)}</section>
          <section className="option-section" title="Calibrate from an iron reference; folding controls apply to raw-count spectra"><h3>Folding & calibration</h3><button className="full-width velocity-calibration-open" onClick={() => setCalibrationOpen(true)}>Velocity calibration…</button><fieldset className="bare" disabled={!raw}><label className="inline-label">Max. velocity<Numeric label="Maximum velocity" value={cal.max} onChange={v => setCal(c => ({ ...c, max: v! }))}/></label><label className="inline-label">Standard CS<Numeric label="Standard center shift" value={cal.shift} onChange={v => setCal(c => ({ ...c, shift: v! }))}/></label><label className="check-label"><input type="checkbox" checked={cal.sinusoidal} onChange={e => setCal(c => ({ ...c, sinusoidal: e.target.checked }))}/>Sinusoidal drive</label><label className="check-label"><input type="checkbox" checked={cal.folding} onChange={e => setCal(c => ({ ...c, folding: e.target.checked }))}/>Fold raw channels</label><label className="inline-label" title="1-based channel, integer or half-integer">Fold center<Numeric label="Fold center" value={cal.center} onChange={v => setCal(c => ({ ...c, center: v! }))}/></label><button className="full-width" onClick={applyCalibration}>Apply calibration</button></fieldset></section>
          <section className="option-section"><h3>Source profile</h3><label className="inline-label">FWHM (mm/s)<Numeric label="Source FWHM" value={project.source_fwhm} onChange={v => edit(p => ({ ...p, source_fwhm: v! }))} disabled={project.mode !== 'transmission'}/></label><label className="check-label"><input type="checkbox" disabled={project.mode !== 'transmission'} checked={project.source_squared} onChange={e => edit(p => ({ ...p, source_squared: e.target.checked }))}/>Lorentzian-squared source</label></section>

        </>}
        {tab === 'Bnds' && !hasCurrent && <section className="option-section"><h3>Parameter bounds</h3><p className="body-note">No site selected.</p></section>}
        {tab === 'Bnds' && hasCurrent && <>
          <section className="option-section"><h3>Parameter bounds</h3><div className="bounds-header" title="Leave a bound empty for no limit"><span>Parameter</span><span>Lower</span><span>Upper</span></div>{keys(current).map(k => <div className="bounds-row" key={k}><label>{labels[k]}</label><Numeric nullable label={`${labels[k]} lower bound`} value={current.params[k].min} onChange={v => updateParam(k, { min: v })}/><Numeric nullable label={`${labels[k]} upper bound`} value={current.params[k].max} onChange={v => updateParam(k, { max: v })}/></div>)}</section>
          <section className="option-section" title="Target = factor × source. Target bounds also constrain the source."><h3>Parameter links</h3><label className="stack-label">Target in selected site<select aria-label="Link target" value={targetKey} onChange={e => setTargetKey(e.target.value)}>{keys(current).map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label><label className="stack-label">Source parameter<select aria-label="Link source" value={linkSource} onChange={e => setLinkSource(e.target.value)}><option value="">Choose source…</option>{linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label><label className="inline-label">Factor<Numeric label="Link factor" value={linkFactor} onChange={v => setLinkFactor(v!)}/></label><button className="full-width" disabled={!linkSource || !linkOptions.some(o => o.id === linkSource)} onClick={() => { updateParam(targetKey, { link: { target: linkSource, factor: linkFactor } }); append(`${labels[targetKey]} linked to ${linkSource}.`); }}>Apply link</button><div className="link-list">{keys(current).filter(k => current.params[k].link).map(k => <div key={k}><span>{labels[k]} = {current.params[k].link!.factor} × {current.params[k].link!.target}</span><button aria-label={`Remove ${labels[k]} link`} onClick={() => updateParam(k, { link: null })}>×</button></div>)}</div></section>
        </>}
        {tab === 'xVBF' && <section className="option-section"><h3>Distribution fitting</h3><span className="pending-badge">Not available yet</span></section>}
        {tab === 'Opt' && <>
          <section className="option-section"><h3>Fitting options</h3><label className="stack-label">Solver<select disabled value="trf"><option value="trf">Trust-region reflective</option></select></label><label className="stack-label">Residual weighting<select aria-label="Residual weighting" value={project.weighting} onChange={e => edit(p => ({ ...p, weighting: e.target.value as Project['weighting'] }))}><option value="unweighted">Unweighted</option><option value="counts">1 / observed counts</option></select></label><label className="inline-label">Max. iterations<Numeric label="Maximum iterations" value={project.max_iterations} onChange={v => edit(p => ({ ...p, max_iterations: v! }))}/></label></section>

        </>}
      </fieldset></div></aside>
    </div>
    <ResultsPane height={layout.resultsHeight} onHeightChange={resultsHeight => setLayout(l => ({ ...l, resultsHeight }))}><div className="results-heading"><div><h2>Site parameters</h2><span className={`results-note ${result ? '' : 'needs-fit'}`} title={result ? 'Approximate 1 std; fixed and unavailable values are labeled in each cell.' : 'No current fit uncertainties. Fit again after changing the model or data.'}>{result ? '± 1 std' : 'Fit for errors'}</span></div><button disabled={!result || busy} onClick={exportResults}>Export parameters</button></div><div className="table-scroll"><ResultsTable project={progress?.project ?? project} evaluation={evaluation} result={result} selected={selected} onSelect={index => { if (!picking && !busy) { setSelected(index); setTargetKey('fwhm'); } }}/></div></ResultsPane>
    {calibrationOpen && <VelocityCalibrationDialog cal={cal} raw={raw} onClose={() => setCalibrationOpen(false)} onApply={value => { history.set(applyVelocityCalibration(history.present, value)); setError(''); setRestoreError(''); if (raw) setEvaluation(null); append(`Velocity calibrated from ${value.reference.name}.`); }}/>}
    <dialog className="help-dialog" ref={helpDialog}><div className="help-heading"><h2>MossA 2 help</h2><form method="dialog"><button aria-label="Close help">×</button></form></div><h3>Graph</h3><p>Left drag: rectangle zoom. Right drag: pan. Right click: previous zoom. Double right click: reset. Mouse wheel: zoom velocity.</p><h3>Sites</h3><p>Press + to choose the new site type and profile, then Define on graph. The site list scrolls separately from the numeric editor. Edit the selected site name above its parameters (Enter or click away to apply, Esc to cancel). Duplicate copies the selected site and selects the copy. Type and profile are under Site settings; background controls are in Gen. Click position/depth, then half-width; for a doublet or sextet, click the opposite line. Redefine redraws the selected site in place, preserving its name, profile, fit flags, bounds, and links. Linked parameters continue following their source. Esc or Cancel exits picking. All graph navigation remains available during picking; only an undragged left click places a point.</p><h3>Editing</h3><p>Numeric fields show up to five significant digits. Focus a field to see its full value; leaving it unchanged preserves full precision. Undo and Redo retain up to 50 model/data changes in memory, including fits, their results/errors, and imports. Undo/Redo restores the completed fit for each state without optimization; curves are reevaluated for display. Use ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z outside text fields. Inside a field, native text undo applies. Graph navigation is independent of model history. Fit details stay visible when there is room; use the Fit details button in compact layouts. Drag the divider below the site list to allocate more space to sites or parameters.</p><h3>Results</h3><p>Drag the divider above the table to resize it. The table header stays visible as rows scroll. Select a site in the list or table to bring its curve forward. Trash icons remove individual sites. Checked parameters vary during fitting; fixed labels mark parameters held fixed. The table shows values with approximate 1 std on the line below. Fit for errors means the current model needs fitting; model/data changes clear old errors, while renaming keeps them. Fixed parameters are labeled fixed; ± — means an uncertainty is unavailable (hover for the reason). Intensity is the raw area parameter; Fraction is 100 × site intensity / total site intensity, as in MATLAB. In full transmission it is an absorber-intensity fraction. Fraction std includes parameter correlations and is expressed in percentage points; a fraction fixed by the model can have 0 std. A zero total intensity has no defined fraction. Uncertainties are approximate 1 std from the local Jacobian, scaled by residual variance. They are unavailable for fixed, active-bound, or unidentifiable parameters and differ from MATLAB confidence intervals.</p><h3>Autosave</h3><p>The current project, raw counts, calibration controls, selected site, fit results, option tab, and panel sizes are saved locally in this browser and restored on reload. Input edits commit before a normal reload. Fits restore their last completed state; unfinished fits and peak placement previews are discarded. Undo history starts fresh after reload. Use Save project for a portable backup; clearing browser storage removes the local autosave.</p><h3>Files and models</h3><p>Import plain text with velocity/count columns or one column of raw counts. Folding and calibration apply to raw channels. Fold centers use 1-based integer or half-integer indices. Projects save data, bounds, and links as JSON; MATLAB .map import is not available yet.</p><p>Thin-absorber and full-transmission modes use different intensity units. Switching models rescales current intensities as starting estimates. In full-transmission mode, site overlays are absorber profiles scaled together for display, following the original MossA convention; they are not additive transmission components. Gaussian constants and sextet conventions follow the retained MATLAB reference. xVBF distributions and automatic source calibration are not yet ported.</p><p>All calculations run on this device. No spectrum is uploaded.</p><a href="https://github.com/CPrescher/MossA/tree/d201482b7990afbd0e2dcc23e306bfc8d60a5049" target="_blank" rel="noreferrer">MATLAB reference ↗</a><p className="help-credit">MossA · C. Prescher · GPL-3.0 · Prototype 0.1.0</p></dialog>
  </div>;
}

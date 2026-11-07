import { isTauri } from '@tauri-apps/api/core';
import { ProjectFiles, openDesktopProject, type ProjectFileTarget } from './project-files';
import { saveText } from './file-save';
import { newNuclearConstants } from './nuclear-constants.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { estimateFoldCenter } from './folding';
import { FoldingDialog } from './FoldingDialog';
import { CalibrationPresetsPanel } from './CalibrationPresets';
import { calibrationForImport, controlsFromPreset } from './calibration-presets';
import { SourceCalibrationDialog } from './SourceCalibration';
import { applySourceCalibration } from './source-calibration';
import { applyRawCalibration, importedSpectrumConstants, reverseVelocity } from './calibration';
import { ImportDetails } from './ImportDetails';
import { createWorkspaceFile, openWorkspaceFile } from './workspaceFile';
import { activeModel, activeSpectrum, addModel, appendSpectra, removeModel, removeSpectrum, renameEntry, selectEntry, freshWorkspace, useWorkspaceHistory, workspaceFromSnapshot, type Workspace, type SpectrumEntry } from './workspace';
import { readWorkspaceSession, useWorkspaceAutosave } from './workspaceStorage';
import { ModelNavigation } from './ProjectNavigation';
import { InlineNameEditor } from './InlineNameEditor';
import { ProjectSidebar } from './ProjectSidebar';
import { SidebarIcon } from './SidebarIcon';
import { HistoryIcon } from './HistoryIcon';
import { FileActionIcon } from './FileActionIcon';
import { SidebarScrollbars } from './SidebarScrollbars';
import { AppFooter } from './AppFooter';
import { ThemeToggle } from './ThemeToggle';
import { FullscreenToggle } from './FullscreenToggle';
import { buildInfo } from './version';
import { demo } from './demo';
import { calibrateCounts, csvSpectrum, parseSpectrum } from './io.mjs';
import { Plot } from './Plot';
import { FigureExportDialog } from './FigureExportDialog';
import { CompareModelsDialog } from './CompareModels';
import './comparison.css';
import { ResultsPane } from './ResultsPane';
import { ResultsTable } from './ResultsTable';
import { intensityFractions } from './results';
import { FitDetails } from './FitDetails';
import { SiteList } from './site-list';
import { AddSiteMenu } from './AddSiteMenu';
import { Numeric } from './Numeric';
import { XvbfEditor } from './XvbfEditor';
import { CorrelationDialog } from './XvbfPlots';
import { SiteListPane } from './SiteListPane';
import { removeSiteAt, duplicateSiteAt } from './sites.mjs';
import { SiteNameEditor } from './SiteNameEditor';
import { readSession, summarizeFit, defaultLayout, type Layout, type Snapshot } from './session';
import { placedParameters, placementProject, updatePlacementSite } from './placement.mjs';
import { keys, labels, newSite, parameter, type Evaluation, type FitResult, type FitProgress, type Parameter, type Project, type Site } from './types';

const fmt = (v: number | null | undefined, digits = 5) => v == null ? '—' : Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });

type RestoredProject = { workspace: Workspace; layout: Layout; error: string; restored: boolean };
export default function App() {
  const [initial, setInitial] = useState<RestoredProject | null>(null);
  useEffect(() => {
    let current = true;
    void readWorkspaceSession().then(saved => {
      if (!current) return;
      if (saved.session) { setInitial({ ...saved.session, error: saved.error, restored: true }); return; }
      const legacy = readSession();
      const snapshot: Snapshot = legacy.session ? { ...legacy.session.snapshot, fit: legacy.session.fit, fitElapsed: legacy.session.elapsed } : {
        project: demo(), raw: null, cal: { nuclear_constants: newNuclearConstants(), max: 10, shift: 0, sinusoidal: false, folding: true, center: 256.5 }, filename: 'Synthetic iron mixture', selected: 0,
      };
      setInitial({ workspace: workspaceFromSnapshot(snapshot), layout: legacy.session?.layout ?? defaultLayout, error: saved.error || legacy.error, restored: !!legacy.session });
    });
    return () => { current = false; };
  }, []);
  return initial ? <ProjectEditor restored={initial}/> : <div className="app-loading" role="status"><span className="brand-mark">MossA 2</span><p>Opening your project…</p></div>;
}
function ProjectEditor({ restored }: { restored: RestoredProject }) {
  type Point = { x: number; y: number };
  type Placement = { site: Site; kind: string; stage: number; index: number | null; first?: Point; width?: Point; cursor?: Point };
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [sourceCalibrationOpen, setSourceCalibrationOpen] = useState(false);
  const [correlationOpen,setCorrelationOpen] = useState(false);
  const [comparisonSpectrum, setComparisonSpectrum] = useState<SpectrumEntry | null>(null);
  const [foldingOpen, setFoldingOpen] = useState(false);
  const [figureExport, setFigureExport] = useState<{ viewRange: [number, number] | null } | null>(null);
  const [restoreError, setRestoreError] = useState(restored.error);
  const [layout, setLayout] = useState(restored.layout);
  const history = useWorkspaceHistory(() => restored.workspace);
  const workspace = history.workspace, spectrumEntry = activeSpectrum(workspace), modelEntry = activeModel(workspace);
  const [renaming, setRenaming] = useState<'project' | 'spectrum' | 'model' | null>(null);
  const [renameModelId, setRenameModelId] = useState<string | undefined>();
  const { project, raw, cal, filename, selected } = history.present;
  const hasSpectrum = project.spectrum.x.length > 0;
  const setSelected = (value: number) => { if (value !== selected) history.set({ ...history.present, selected: value }, false); };
  const [hoveredSite, setHoveredSite] = useState<number | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationVersion, setEvaluationVersion] = useState(0);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  const { tab } = layout;
  const setTab = (tab: string) => setLayout(l => ({ ...l, tab, ...(tab === 'xVBF' ? { optionsCollapsed: false } : {}) }));
  const optionsVisible = !layout.optionsCollapsed;
  const openOptions = () => setLayout(l => ({ ...l, optionsCollapsed: false }));
  const closeOptions = () => setLayout(l => ({ ...l, optionsCollapsed: true }));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyTask, setBusyTask] = useState<'fit' | 'fold' | 'load'>('fit');
  const [error, setError] = useState('');
  const [log, setLog] = useState([restored.restored ? 'Restored local project.' : 'Ready.']);
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
  const evaluateComparison = useCallback(async (p: Project) => {
    if (!worker.current) throw new Error('Fitting engine is unavailable.');
    return (await worker.current.request('evaluate', p)).result as Evaluation;
  }, []);
  const fileInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null);
  const fitToken = useRef(0);
  const projectFiles = useRef(new ProjectFiles());
  const fileOperation = useRef(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const autosaveError = useWorkspaceAutosave({ version: 1, workspace, layout }, !restoreError);
  const evaluationCache = useRef(new Map<string, { model: typeof modelEntry.project; spectrum: Project['spectrum']; evaluation: Evaluation }>());
  const append = (message: string) => setLog(old => [...old.slice(-5), message]);
  useEffect(() => {
    setReady(false);
    const engine = new Engine(() => setReady(true), message => { setError(message); setReady(false); setBusy(false); }); worker.current = engine;
    return () => engine.stop();
  }, [engineVersion]);
  useEffect(() => {
    if (!ready || busy || !hasSpectrum) return;
    let current = true;
    const cached = evaluationCache.current.get(modelEntry.id);
    if (!picking && cached?.model === modelEntry.project && cached.spectrum === project.spectrum) { setEvaluation(cached.evaluation); return; }
    const model = picking?.cursor ? placementProject(project, picking.site, picking.index) : project;
    const timer = setTimeout(() => worker.current?.request('evaluate', model).then(({ result: value }) => {
      if (!current) return;
      const evaluated = value as Evaluation;
      setEvaluation(evaluated); setError('');
      if (!picking) {
        const cache = evaluationCache.current;
        cache.delete(modelEntry.id);
        cache.set(modelEntry.id, { model: modelEntry.project, spectrum: project.spectrum, evaluation: evaluated });
        if (cache.size > 24) cache.delete(cache.keys().next().value!);
      }
    }).catch(e => { if (current) { setError(e.message); setEvaluation(null); } }), picking ? 10 : 90);
    return () => { current = false; clearTimeout(timer); };
  }, [project, ready, busy, engineVersion, picking, evaluationVersion]);
  const edit = (next: Project | ((p: Project) => Project), metadata: Partial<typeof history.present> = {}) => { setRestoreError(''); setEvaluation(null); setError(''); history.set({ ...history.present, ...metadata, project: typeof next === 'function' ? next(project) : next, fit: null, fitElapsed: null }); append('Model changed; fit again to update results.'); };
  function travel(direction: 'undo' | 'redo') { if (!ready || busy || picking || calibrationOpen || sourceCalibrationOpen || foldingOpen || renaming || comparisonSpectrum) return; const target = direction === 'undo' ? history.past.at(-1) : history.future[0]; if (!target) return; history[direction](); if (target.project !== project) setEvaluation(null); setEvaluationVersion(v => v + 1); setError(''); append(direction === 'undo' ? 'Undid change.' : 'Redid change.'); }
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if (target.closest('input,textarea,select,[contenteditable=true]') || !(e.metaKey || e.ctrlKey) || e.altKey) return; if (e.key.toLowerCase() === 'z' || (e.key.toLowerCase() === 'y' && !e.metaKey)) { e.preventDefault(); travel(e.shiftKey || e.key.toLowerCase() === 'y' ? 'redo' : 'undo'); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [history, busy, picking, calibrationOpen, sourceCalibrationOpen, foldingOpen, renaming, comparisonSpectrum]);
  const renameSite = (name: string) => { if (project.sites[selected]?.name === name) return; const next = { ...project, sites: project.sites.map((site,i) => i === selected ? { ...site, name } : site) }; history.set({ ...history.present, project: next }); };
  const updateSite = (next: Partial<Site>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, ...next } : s) }));
  const updateParam = (key: string, next: Partial<Parameter>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, params: { ...s.params, [key]: { ...s.params[key], ...next } } } : s) }));
  const hasCurrent = project.sites.length > 0;
  const current = picking?.site ?? progress?.project.sites[selected] ?? project.sites[Math.min(selected, project.sites.length - 1)] ?? newSite(0, newKind);
  useEffect(() => { if (!picking) return; const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPick(); }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, [!!picking]);
  async function fit() {
    if (!worker.current || !ready || busy || error || picking || !hasSpectrum) return;
    const token = ++fitToken.current; setBusyTask('fit'); setBusy(true); setProgress(null); setError(''); append('Fitting with trust-region reflective…');
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
  function stop() { fitToken.current++; worker.current?.stop(); setProgress(null); setEvaluation(null); setBusy(false); setReady(false); setEngineVersion(v => v + 1); append('Calculation canceled; previous project retained.'); }
  function changeWorkspace(next: Workspace, record = true, newDocument = false) {
    const document = history.setWorkspace(next, record, newDocument); setRestoreError(''); setError(''); setFileError(''); setHoveredSite(null); setLinkSource(''); setTargetKey('fwhm');
    const model = activeModel(next), data = activeSpectrum(next).spectrum, cached = evaluationCache.current.get(model.id);
    append(`${model.name} · ${model.fit ? 'Saved fit restored.' : 'Not fitted.'}`);
    if (model.project !== modelEntry.project || data !== project.spectrum) setEvaluation(cached?.model === model.project && cached.spectrum === data ? cached.evaluation : null);
    return document;
  }
  function resetProject() {
    if (!ready || busy || picking || calibrationOpen || sourceCalibrationOpen || foldingOpen || renaming || comparisonSpectrum) return;
    evaluationCache.current.clear(); setEvaluation(null); setProgress(null);
    setRenaming(null); setRenameModelId(undefined); setLinkFactor(1);
    setNewKind('Doublet'); setNewProfile('Lorentzian');
    changeWorkspace(freshWorkspace(), true, true);
    setLayout(l => ({ ...l, tab: 'Gen' }));
    setLog(['Started a new project. Undo restores the previous project.']);
  }
  async function loadSpectra(files: File[]) {
    if (!files.length || busy || !ready) return;
    if (workspace.spectra.length + files.length > 1000 || workspace.spectra.reduce((n, s) => n + s.models.length, 0) + files.length > 4096) { setError('A project supports up to 1,000 spectra and 4,096 models.'); return; }
    const id = ++fitToken.current; setBusyTask('load'); setBusy(true);
    const snapshots: Snapshot[] = [], failures: string[] = [];
    try {
      for (const file of files) {
        try {
          setBusyTask('load');
          if (file.size > 8e6) throw new Error('Spectrum file is too large (maximum 8 MB).');
          const parsed = parseSpectrum(await file.text());
          const importPreset = workspace.calibrationPresets.find(p => p.id === workspace.importCalibrationPresetId)!;
          let spectrum: Project['spectrum'], nextRaw: number[] | null = null, nextCal = controlsFromPreset(importPreset);
          if (parsed.raw) {
            const calibration = calibrationForImport(importPreset, parsed.raw.length);
            if (calibration.folding && calibration.autoFold !== false) {
              setBusyTask('fold');
              try { const found = await estimateFoldCenter(parsed.raw, async p => (await worker.current!.request('fit', p)).result as FitResult); if (id !== fitToken.current) return; calibration.center = found.center; }
              catch { if (id !== fitToken.current) return; append(`Automatic fold center unavailable for ${file.name}; inspect folding before fitting.`); }
            }
            spectrum = calibrateCounts(parsed.raw, calibration.max, calibration.shift, calibration.sinusoidal, calibration.folding ? calibration.center : null);
            nextRaw = parsed.raw; nextCal = calibration;
          } else { spectrum = parsed.spectrum!; }
          const next = { ...structuredClone(project), nuclear_constants: importedSpectrumConstants(parsed.raw, nextCal), spectrum, background: [parameter(Math.max(...spectrum.y))] };
          await worker.current!.request('evaluate', next);
          if (id !== fitToken.current) return;
          snapshots.push({ project: next, raw: nextRaw, cal: nextCal, filename: file.name, selected: 0, fit: null, fitElapsed: null, ...(parsed.importInfo ? { importInfo: { ...parsed.importInfo, filename: file.name } } : {}) });
          if (parsed.notice) append(`${file.name}: ${parsed.notice}`);
        } catch (e) { if (id !== fitToken.current) return; failures.push(`${file.name}: ${String(e)}`); }
      }
      if (snapshots.length) { changeWorkspace(appendSpectra(workspace, snapshots)); append(`Added ${snapshots.length} ${snapshots.length === 1 ? 'spectrum' : 'spectra'} to the project.`); }
      if (failures.length) setError(failures.join('\n'));
    } finally { if (id === fitToken.current) setBusy(false); }
  }
  async function loadProject(file?: File, nativeTarget?: ProjectFileTarget) {
    if (!file || busy || !ready) return;
    const id = ++fitToken.current; setBusyTask('load'); setBusy(true);
    try {
      if (file.size > 256e6) throw new Error('Project file is too large (maximum 256 MB).');
      const loaded = await openWorkspaceFile(JSON.parse(await file.text()), cal, file.name, async p => (await worker.current!.request('evaluate', p)).result as Evaluation);
      if (id !== fitToken.current) return;
      const document = changeWorkspace(loaded.workspace, true, true);
      if (nativeTarget) projectFiles.current.opened(document, nativeTarget);
      setEvaluation(loaded.evaluation);
      append(loaded.notice || `Opened ${loaded.workspace.spectra.length} spectra with all models and saved fit results.`);
    } catch (e) { if (id === fitToken.current) setFileError(String(e)); }
    finally { if (id === fitToken.current) setBusy(false); }
  }
  async function openProject() {
    if (!isTauri()) { projectInput.current?.click(); return; }
    if (!ready || busy || fileOperation.current) return;
    fileOperation.current = true; setFileBusy(true); setFileError('');
    try {
      const opened = await openDesktopProject();
      if (opened) await loadProject(new File([opened.contents], opened.filename), opened);
    } catch (e) { setFileError(String(e)); }
    finally { fileOperation.current = false; setFileBusy(false); }
  }
  async function saveProject(saveAs = false) {
    if (fileOperation.current) return;
    fileOperation.current = true; setFileBusy(true); setFileError('');
    try {
      const file = await createWorkspaceFile(workspace, { application: `MossA ${buildInfo.version}`, commit: buildInfo.commit, modified: buildInfo.dirty, matlab_reference: 'd201482b7990afbd0e2dcc23e306bfc8d60a5049' });
      if (await projectFiles.current.save(history.document, `${workspace.name.replace(/[\\/:*?"<>|]/g, '_')}.mossa`, JSON.stringify(file, null, 2), saveAs)) append('Saved the whole project with every spectrum, model, and completed fit.');
    } catch (e) { setFileError(String(e)); }
    finally { fileOperation.current = false; setFileBusy(false); }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (event.shiftKey && !isTauri()) || document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy) void saveProject(event.shiftKey && isTauri()); }
      if (!event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); if (ready && !busy) void openProject(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [workspace, ready, busy]);
  function exportResults() {
    if (!result) return;
    const rows = ['site,type,profile,parameter,value,approx_1std,link'];
    project.background.forEach((b, i) => rows.push(['Background', 'Polynomial', '', `b${i}`, b.value, result.errors[`bkg:${i}`] ?? '', ''].join(',')));
    project.sites.forEach((s, i) => keys(s).forEach(k => rows.push([`"${s.name.replaceAll('"', '""')}"`, s.kind, s.profile, k, s.params[k].value, result.errors[`site:${i}:${k}`] ?? '', s.params[k].link ? `"${s.params[k].link!.factor} * ${s.params[k].link!.target}"` : ''].join(','))));
    project.sites.forEach((s,i)=>{ if(!s.xvbf)return; const add=(name:string,value:number,id:string)=>rows.push([`"${s.name.replaceAll('"','""')}"`,'Doublet','xVBF',name,value,result.errors[id]??'',''].join(','));
      for(const k of ['cs','qs'])add(`${k}_mean`,evaluation?.parameters?.[`site:${i}:${k}`]??s.params[k].value,`site:${i}:${k}`);
      add('coupling_delta',s.xvbf.delta.value,`site:${i}:delta`);
      for(const axis of ['cs','qs'] as const)s.xvbf[axis].forEach((component,j)=>{for(const key of ['center','width','weight'] as const)add(`${axis}_${j+1}_${key}`,component[key].value,`site:${i}:${axis==='cs'?'csd':'qsd'}:${j}:${key}`);});
    });
    intensityFractions(project,evaluation,result).forEach((fraction,i) => { const site = project.sites[i]; rows.push([`"${site.name.replaceAll('"', '""')}"`, site.kind, site.profile, 'intensity_fraction_percent', fraction.value ?? '', fraction.error ?? '', ''].join(',')); });
    void saveText('mossa-fit-parameters.csv', rows.join('\n'), 'text/csv').catch(e => setError(String(e)));
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
    const values = placedParameters(state.stage < 2 ? 'Singlet' : state.site.kind, state.site.profile, first, state.stage === 1 ? point : state.width ?? null, state.stage === 2 ? point : null, baseline, project.mode, state.site.params.mix.value, project.nuclear_constants);
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
  const paramId = (k: string) => `site:${selected}:${k}`;
  const linkOptions = project.sites.flatMap((s, i) => keys(s).map(k => ({ id: `site:${i}:${k}`, label: `${i + 1} · ${s.name} · ${labels[k]}` }))).filter(o => o.id !== paramId(targetKey));
  const canCalculate = ready && !busy && !picking && !comparisonSpectrum;
  const calibrationPanel = <CalibrationPresetsPanel key={spectrumEntry.id} cal={spectrumEntry.cal} raw={raw} hasSpectrum={hasSpectrum} disabled={!canCalculate} calibrationPresets={workspace.calibrationPresets} importCalibrationPresetId={workspace.importCalibrationPresetId}
            onChange={settings => { history.setWorkspace({ ...workspace, ...settings }); setRestoreError(''); setError(''); }} onDialogChange={setCalibrationOpen}
            onInspectFolding={() => setFoldingOpen(true)} onApply={controls => {
              const next = applyRawCalibration(history.present, { ...controls, ...(cal.sourceReference ? { sourceReference: cal.sourceReference } : {}) });
              history.set(next); setRestoreError(''); setError(''); if (next.project !== project) setEvaluation(null);
              append(next.project === project ? 'Calibration unchanged; current fit retained.' : 'Applied channel folding and velocity calibration.');
            }}/>;
  return <div className="app">
    <header className="app-header">
      <div className="brand"><span className="brand-mark">MossA 2</span><span className="brand-divider"/><h1><span className="analysis-title">Mössbauer analysis <span aria-hidden="true">—</span> </span><span className="header-project-title">{renaming === 'project' ? <InlineNameEditor name={workspace.name} label="Project name" rowId="header-project-name" onCommit={name => { changeWorkspace(renameEntry(workspace, 'project', name)); setRenaming(null); }} onCancel={() => setRenaming(null)}/> : <button id="header-project-name" className="header-project-name" disabled={!canCalculate} aria-label={`Rename project: ${workspace.name}`} title={`${workspace.name} · Click to rename`} onClick={() => setRenaming('project')}><span>{workspace.name}</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg></button>}</span></h1></div>
      <nav className="header-file-actions" aria-label="Spectrum actions">
        <button className="header-add-spectra" disabled={!canCalculate} onClick={() => fileInput.current?.click()} aria-label="Add spectra" title="Add one or more spectra"><FileActionIcon action="add"/><span>Add spectra</span></button>
        <div className="header-exports"><button className="header-icon-button" aria-label="Export data" title="Export spectrum data (CSV)" disabled={!evaluation || busy || !!picking} onClick={() => void saveText('mossa-spectrum.csv', csvSpectrum(project, evaluation!), 'text/csv').catch(e => setError(String(e)))}><FileActionIcon action="data"/></button><button className="header-icon-button" aria-label="Export graph" title="Export figure…" disabled={!evaluation || busy || !!picking} onClick={() => { const range = document.getElementById('spectrum-plot')?.getAttribute('data-view-x')?.split(',').map(Number); setFigureExport({ viewRange: range?.length === 2 && range.every(Number.isFinite) ? range as [number, number] : null }); }}><FileActionIcon action="graph"/></button></div>
      </nav>
      <div className="header-actions"><div className="history-controls" role="group" aria-label="Edit history"><button className="header-icon-button" aria-label="Undo" title="Undo (⌘/Ctrl+Z)" disabled={!canCalculate || !history.past.length} onClick={() => travel('undo')}><HistoryIcon direction="undo"/></button><button className="header-icon-button" aria-label="Redo" title="Redo (⌘/Ctrl+Shift+Z)" disabled={!canCalculate || !history.future.length} onClick={() => travel('redo')}><HistoryIcon direction="redo"/></button></div><ThemeToggle/><a className="manual-link" href="./manual/" target="_blank" rel="noreferrer" title="Open the MossA manual (new tab)"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4.5C7.5 3 4.5 3 2 4v12c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V4c-2.5-1-5.5-1-8 .5Zm0 0v12"/></svg><span>Manual</span></a><button className="help-button" onClick={() => helpDialog.current?.showModal()}>Help</button>{buildInfo.channel !== 'desktop' && <FullscreenToggle onError={setError}/>}</div>
    </header>
    <input ref={fileInput} type="file" multiple hidden aria-label="Spectrum file" accept=".txt,.dat,.csv,.asc,.mca" onChange={e => { void loadSpectra(Array.from(e.target.files ?? [])); e.target.value = ''; }}/><input ref={projectInput} type="file" hidden aria-label="Project file" accept=".mossa,.json" onChange={e => { void loadProject(e.target.files?.[0]); e.target.value = ''; }}/>
    <div className="project-shell">
      <ProjectSidebar workspace={workspace} disabled={!canCalculate || fileBusy || calibrationOpen || sourceCalibrationOpen || foldingOpen} collapsed={!!layout.projectCollapsed} ratio={layout.projectSplit ?? .55} onCollapse={() => setLayout(l => ({ ...l, projectCollapsed: !l.projectCollapsed }))} onRatio={projectSplit => setLayout(l => ({ ...l, projectSplit }))} onSelect={id => changeWorkspace(selectEntry(workspace, id), false)} onImport={() => fileInput.current?.click()} onNew={resetProject} onOpen={() => void openProject()} onSave={() => void saveProject()} onSaveAs={isTauri() ? () => void saveProject(true) : undefined} saveDisabled={!!error || fileBusy} onRename={setRenaming} onRemove={() => changeWorkspace(removeSpectrum(workspace))} renamingSpectrumId={renaming === 'spectrum' ? spectrumEntry.id : undefined} onCommitName={name => { changeWorkspace(renameEntry(workspace, 'spectrum', name)); setRenaming(null); }} onCancelName={() => setRenaming(null)}>
        {hasSpectrum ? <ModelNavigation onCompare={() => setComparisonSpectrum(structuredClone(spectrumEntry))} workspace={workspace} disabled={!canCalculate || fileBusy || calibrationOpen || sourceCalibrationOpen || foldingOpen} onSelect={id => changeWorkspace(selectEntry(workspace, spectrumEntry.id, id), false)} onDuplicate={id => changeWorkspace(addModel(workspace, true, id))} onNew={() => changeWorkspace(addModel(workspace, false))} onRename={id => { setRenameModelId(id); setRenaming('model'); }} onRemove={id => changeWorkspace(removeModel(workspace, id))} renamingModelId={renaming === 'model' ? renameModelId ?? modelEntry.id : undefined} onCommitName={name => { changeWorkspace(renameEntry(workspace, 'model', name, renameModelId)); setRenaming(null); setRenameModelId(undefined); }} onCancelName={() => { setRenaming(null); setRenameModelId(undefined); }}/>: <p className="no-spectra">Add a spectrum to create models.</p>}
      </ProjectSidebar>
      <div className="analysis-body">
    <div className={`workspace ${optionsVisible ? 'options-visible' : 'options-collapsed'} ${tab==='xVBF'?'xvbf-open':''}`}>
      <aside className="left-panel"><div className="panel-heading"><h2>Sites</h2><span className="count">{project.sites.length}</span><div className="heading-actions">{picking ? <button className="cancel-placement" onClick={cancelPick}>Cancel</button> : <button className="redefine-button" disabled={!canCalculate || !hasCurrent || !!current.xvbf} onClick={redefineSite} title={current?.xvbf ? 'Edit distribution centers and widths in xVBF' : 'Redraw the selected site; keep its name and settings'}>Redefine</button>}<button className="duplicate-site" aria-label="Duplicate site" title="Duplicate selected site" disabled={!canCalculate || !hasCurrent || project.sites.length >= 16} onClick={duplicateSite}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/></svg></button><AddSiteMenu disabled={!canCalculate || !hasSpectrum || project.sites.length >= 16} kind={newKind} profile={newProfile} onKind={setNewKind} onProfile={setNewProfile} onDefine={addSite}/></div></div>
        <SiteListPane count={project.sites.length} height={layout.sitesHeight} onHeightChange={sitesHeight => setLayout(l => ({ ...l, sitesHeight }))}><SiteList sites={project.sites} selected={selected} disabled={!canCalculate} onSelect={index => { setSelected(index); setTargetKey('fwhm'); }} onDelete={removeSite} onHover={setHoveredSite}/></SiteListPane>
        <fieldset disabled={!canCalculate} className="bare site-editor">
          {(hasCurrent || picking) ? <fieldset className="bare selected-site-editor" disabled={!!picking}>
          <section className="left-section"><div className="section-heading"><SiteNameEditor key={`${spectrumEntry.id}:${modelEntry.id}:${selected}`} name={current.name} onCommit={renameSite}/><span title="Checked parameters vary during fitting">Fit</span></div>{current.xvbf&&<button className="full-width" onClick={()=>setTab('xVBF')}>Edit xVBF distributions</button>}<div className="param-rows">{keys(current).map(k => <div className="param-row" key={k}><label title={k === 'intensity' ? (project.mode === 'thin' ? 'Area parameter in original MossA convention' : 'Absorber optical-depth area parameter') : k === 'mix' ? 'Pseudo-Voigt Lorentzian mixing fraction (0–1), not the site intensity percentage' : k === 'a12' && current.kind === 'Doublet' ? 'Fraction assigned to the first line (0–1)' : labels[k]}>{labels[k]}<small>{['cs','fwhm','qs'].includes(k) ? 'mm/s' : k === 'bhf' ? 'T' : ''}</small></label><Numeric label={`${labels[k]} value`} value={current.params[k].link ? evaluation?.parameters?.[paramId(k)] ?? current.params[k].value : current.params[k].value} onChange={v => updateParam(k, { value: v! })} disabled={!!current.params[k].link}/>{current.params[k].link ? <span className="linked" title={`Linked to ${current.params[k].link!.target}`}>↗</span> : <input type="checkbox" aria-label={`Fit ${labels[k]}`} checked={current.params[k].fit} onChange={e => updateParam(k, { fit: e.target.checked })}/>}</div>)}</div></section><details className="site-properties"><summary aria-label="Site settings" title="Edit site type and profile">⚙</summary><div className="left-section"><div className="two-columns"><label className="stack-label">Site type<select disabled={!!current.xvbf} aria-label="Site type" value={current.kind} onChange={e => changeKind(e.target.value as Site['kind'])}>{['Singlet','Doublet','Sextet'].map(s => <option key={s}>{s}</option>)}</select></label><label className="stack-label">Line profile<select disabled={!!current.xvbf} aria-label="Line profile" value={current.profile} onChange={e => updateSite({ profile: e.target.value as Site['profile'] })}>{['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].map(s => <option key={s}>{s}</option>)}</select></label></div></div></details></fieldset> : <div className="empty-sites">No sites</div>}

        </fieldset>
        <div className="fit-area">{busy ? <button className="fit-button stop" onClick={stop}><span className="spinner"/> {busyTask === 'fit' ? 'Stop fitting' : 'Stop calculation'}</button> : <button className="fit-button" disabled={!ready || !hasSpectrum || !!error || !!picking} onClick={() => void fit()}>Fit spectrum <span>↵</span></button>}</div>
        <section className={`status-panel ${error || fileError ? 'status-error' : ''}`} aria-label="Fit status"><h3>Status</h3>{(restoreError || autosaveError) && <span className="local-save-warning" role="alert" title={restoreError || autosaveError}>Local save unavailable · Save project</span>}<div className="status-current" role={error || fileError ? 'alert' : 'status'} aria-live="polite">{fileError || error || (picking ? `${picking.stage + 1}/${picking.kind === 'Singlet' ? 2 : 3} · ${picking.index === null ? 'Adding site' : 'Redefining site'}` : busy ? busyTask === 'fold' ? 'Finding fold center…' : busyTask === 'load' ? 'Loading spectrum…' : `Fitting${progress?.search_start ? ` · start ${progress.search_start}/${progress.search_starts}` : ''} · ${progress?.iteration ?? 0} iterations` : result ? `${result.converged ? 'Converged' : 'Stopped'}${result.search ? ` · best of ${result.search.completed} starts` : ''} · ${result.iterations} iterations${elapsed == null ? '' : ` · ${elapsed.toFixed(0)} ms`}` : !ready ? 'Loading…' : log.at(-1))}</div>{fileError && <button className="clear-error" onClick={() => setFileError('')}>Dismiss</button>}{error && <button className="clear-error" onClick={() => { setError(''); setEngineVersion(v => v + 1); }}>Retry</button>}{!picking && ((busy && busyTask === 'fit') || result) && <FitDetails warningCount={result?.warnings.length ?? 0}>{!picking && ((busy && busyTask === 'fit') || result) && <dl className="status-stats"><div><dt title="Sum of squared residuals; count weighting divides each term by the observation">{project.weighting === 'counts' ? 'Weighted SSE' : 'SSE'}</dt><dd data-testid="objective">{evaluation?.objective.toExponential(3) ?? '—'}</dd></div>{result && <div><dt title="Objective divided by the residual degrees of freedom">Reduced</dt><dd>{fmt(result.reduced_objective)}</dd></div>}</dl>}{!picking && result?.warnings.length ? <details className="status-warnings"><summary>{result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}</summary>{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</details> : null}</FitDetails>}</section>
      </aside>
      <main className="center-panel" id="model-workspace" role="tabpanel" aria-label={hasSpectrum ? undefined : "Empty project"} aria-labelledby={hasSpectrum ? `model-${modelEntry.id}` : undefined}><div className="document-bar"><div><span className="file-icon">▤</span><strong title={filename}>{filename}</strong>{filename === 'Synthetic iron mixture' && <span className="demo-badge">SYNTHETIC</span>}{hasSpectrum && <span className="document-model-name" title={modelEntry.name}>{modelEntry.name}</span>}</div></div>
        {hasSpectrum ? <Plot highlightedSite={picking ? picking.index ?? project.sites.length : hoveredSite} project={progress ? { ...progress.project, spectrum: project.spectrum } : project} evaluation={evaluation} fitted={!!result && !picking} picking={picking} onPick={point => { void commitPick(point); }} onHover={hoverPick} onCancelPick={cancelPick}/> : <div className="empty-project">
          <FileActionIcon action="new"/><h2>Start a new project</h2>
          <p>Add spectra or open a saved project to begin.</p>
          <div><button className="primary" disabled={!canCalculate} onClick={() => fileInput.current?.click()}>Add spectra</button><button disabled={!canCalculate} onClick={() => void openProject()}>Open project</button></div>
          {history.past.length > 0 && <p className="empty-project-undo">Undo restores your previous project.</p>}
        </div>}


      </main>
      <button className="sidebar-toggle options-toggle" aria-label={optionsVisible ? 'Collapse fitting options' : 'Show fitting options'} aria-expanded={optionsVisible} aria-controls="fitting-options-sidebar" title={optionsVisible ? 'Collapse fitting options' : 'Expand fitting options'} onClick={optionsVisible ? closeOptions : openOptions}><SidebarIcon side="right" expanded={optionsVisible}/></button>
      <aside className="right-panel" id="fitting-options-sidebar" aria-label="Fitting options sidebar"><div className="options-pane-heading"><span>Fitting options</span></div><div className="tabs" role="tablist" aria-label="Fitting options">{['Gen','Bnds','xVBF','Opt'].map(t => <button id={`tab-${t}`} aria-controls={`panel-${t}`} role="tab" aria-selected={tab === t} key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div><div className="options-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{!hasSpectrum ? <><p className="no-spectra">Add a spectrum to edit fitting options.</p>{tab === 'Gen' && <fieldset className="bare" disabled={!canCalculate}>{calibrationPanel}</fieldset>}</> : <fieldset className="bare" disabled={!canCalculate}>
        {tab === 'Gen' && <>
          <section className="option-section"><h3>General</h3><label className="stack-label">Spectrum model<select aria-label="Spectrum model" value={project.mode} onChange={e => changeMode(e.target.value as Project['mode'])}><option value="thin">Thin absorber</option><option value="transmission">Full transmission integral</option></select></label></section>
          <section className="option-section"><div className="section-heading"><h3>Background</h3><span title="Checked parameters vary during fitting">Fit</span></div><label className="inline-label">Polynomial<select aria-label="Background order" value={project.background.length - 1} onChange={e => edit(p => ({ ...p, background: Array.from({ length: Number(e.target.value) + 1 }, (_, i) => p.background[i] ?? parameter(0)) }))}>{[0,1,2,3].map(i => <option value={i} key={i}>{i === 0 ? 'Constant' : `Order ${i}`}</option>)}</select></label>{project.background.map((p, i) => <div className="param-row" key={i}><label>{i === 0 ? 'I₀' : `b${i}`}</label><Numeric label={`Background ${i}`} value={p.value} onChange={v => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, value: v! } : b) }))}/><input type="checkbox" aria-label={`Fit background ${i}`} checked={p.fit} onChange={e => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, fit: e.target.checked } : b) }))}/></div>)}</section>
          {calibrationPanel}
          <section className="option-section"><h3>Velocity direction</h3><label className="check-label" title="Negate calibrated velocities; applies to every model of this spectrum."><input type="checkbox" aria-label="Reverse velocity axis" checked={!!spectrumEntry.velocityReversed} onChange={() => { const next = reverseVelocity(history.present); history.set(next); setEvaluation(null); setRestoreError(''); setError(''); append(next.velocityReversed ? 'Reversed calibrated velocities (v → −v) for this spectrum and cleared its model fits.' : 'Restored the original velocity direction and cleared this spectrum’s model fits.'); }}/>Reverse velocity axis</label>{spectrumEntry.velocityReversed && <p className="calibration-note">Applied after calibration to all models of this spectrum.</p>}<ImportDetails info={spectrumEntry.importInfo}/></section>

          {project.mode === 'transmission' && <section className="option-section"><h3>Source profile</h3><button className="full-width" onClick={() => setSourceCalibrationOpen(true)}>Calibrate source…</button>{project.source_gaussians ? <><p className="calibration-note">Calibrated {project.source_gaussians.length}-Gaussian source. The complete shape is used in the transmission integral.</p><button className="full-width" onClick={() => edit(p => { const { source_gaussians: _source, ...rest } = p; return rest; })}>Use simple source</button></> : <><label className="inline-label">FWHM (mm/s)<Numeric label="Source FWHM" value={project.source_fwhm} onChange={v => edit(p => ({ ...p, source_fwhm: v! }))}/></label><label className="check-label"><input type="checkbox" checked={project.source_squared} onChange={e => edit(p => ({ ...p, source_squared: e.target.checked }))}/>Lorentzian-squared source</label></>}</section>}

        </>}
        {tab === 'Bnds' && !hasCurrent && <section className="option-section"><h3>Parameter bounds</h3><p className="body-note">No site selected.</p></section>}
        {tab === 'Bnds' && hasCurrent && <>
          <section className="option-section"><h3>Parameter bounds</h3><div className="bounds-header" title="Leave a bound empty for no limit"><span>Parameter</span><span>Lower</span><span>Upper</span></div>{keys(current).map(k => <div className="bounds-row" key={k}><label>{labels[k]}</label><Numeric nullable label={`${labels[k]} lower bound`} value={current.params[k].min} onChange={v => updateParam(k, { min: v })}/><Numeric nullable label={`${labels[k]} upper bound`} value={current.params[k].max} onChange={v => updateParam(k, { max: v })}/></div>)}</section>
          <section className="option-section" title="Target = factor × source. Target bounds also constrain the source."><h3>Parameter links</h3><label className="stack-label">Target in selected site<select aria-label="Link target" value={targetKey} onChange={e => setTargetKey(e.target.value)}>{keys(current).map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label><label className="stack-label">Source parameter<select aria-label="Link source" value={linkSource} onChange={e => setLinkSource(e.target.value)}><option value="">Choose source…</option>{linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label><label className="inline-label">Factor<Numeric label="Link factor" value={linkFactor} onChange={v => setLinkFactor(v!)}/></label><button className="full-width" disabled={!linkSource || !linkOptions.some(o => o.id === linkSource)} onClick={() => { updateParam(targetKey, { link: { target: linkSource, factor: linkFactor } }); append(`${labels[targetKey]} linked to ${linkSource}.`); }}>Apply link</button><div className="link-list">{keys(current).filter(k => current.params[k].link).map(k => <div key={k}><span>{labels[k]} = {current.params[k].link!.factor} × {current.params[k].link!.target}</span><button aria-label={`Remove ${labels[k]} link`} onClick={() => updateParam(k, { link: null })}>×</button></div>)}</div></section>
        </>}
        {tab === 'xVBF' && <XvbfEditor key={`${modelEntry.id}:${selected}`} onCorrelation={()=>setCorrelationOpen(true)} project={progress?.project ?? project} selected={selected} result={result} onSite={site=>edit(p=>({...p,sites:p.sites.map((old,i)=>i===selected?site:old)}))}/>}
        {tab === 'Opt' && <>
          <section className="option-section"><h3>Fitting options</h3><label className="stack-label">Solver<select disabled value="trf"><option value="trf">Trust-region reflective</option></select></label><label className="stack-label">Residual weighting<select aria-label="Residual weighting" value={project.weighting} onChange={e => edit(p => ({ ...p, weighting: e.target.value as Project['weighting'] }))}><option value="unweighted">Unweighted</option><option value="counts">1 / observed counts</option></select></label><label className="stack-label" title="Refine several deterministic starting models and keep the lowest objective. More starts take longer and do not guarantee a global optimum.">Starting models<select aria-label="Starting models" value={project.search_starts ?? 1} onChange={e => edit(p => ({ ...p, search_starts: Number(e.target.value) }))}>{[1,4,8,12,24,32].map(n => <option key={n} value={n}>{n === 1 ? '1 · Current model' : `${n} · Explore alternatives`}</option>)}</select></label><label className="inline-label">Max. iterations<Numeric label="Maximum iterations" value={project.max_iterations} onChange={v => edit(p => ({ ...p, max_iterations: v! }))}/></label></section>

        </>}
      </fieldset>}</div></aside>
    </div>
    <ResultsPane height={layout.resultsHeight} onHeightChange={resultsHeight => setLayout(l => ({ ...l, resultsHeight }))}><div className="results-heading"><div><h2>Site parameters</h2><span className={`results-note ${result ? '' : 'needs-fit'}`} title={result ? 'Approximate 1 std; fixed and unavailable values are labeled in each cell.' : 'No current fit uncertainties. Fit again after changing the model or data.'}>{result ? '± 1 std' : 'Fit for errors'}</span></div><button disabled={!result || busy} onClick={exportResults}>Export parameters</button></div><div className="table-scroll"><ResultsTable project={progress?.project ?? project} evaluation={evaluation} result={result} selected={selected} onSelect={index => { if (!picking && !busy) { setSelected(index); setTargetKey('fwhm'); } }}/></div></ResultsPane>
      </div>
    </div>
    <AppFooter/>
    <SidebarScrollbars/>

    {comparisonSpectrum && <CompareModelsDialog spectrum={comparisonSpectrum} activeModelId={comparisonSpectrum.activeModelId} evaluate={evaluateComparison} onClose={() => setComparisonSpectrum(null)}/>}
    {correlationOpen&&current.xvbf&&<CorrelationDialog model={progress?.project.sites[selected]?.xvbf??current.xvbf} onClose={()=>setCorrelationOpen(false)}/>}
    {foldingOpen && raw && <FoldingDialog counts={raw} initialCenter={cal.center} onClose={() => setFoldingOpen(false)} onApply={(center, automatic) => { const next = applyRawCalibration(history.present, { ...cal, center, folding: true, autoFold: automatic }); history.set(next); setRestoreError(''); setError(''); if (next.project !== project) setEvaluation(null); append(`Applied folding at center ${center}.`); }}/>}
    {figureExport && evaluation && <FigureExportDialog project={project} evaluation={evaluation} fitted={!!result} name={`${spectrumEntry.name} · ${modelEntry.name}`} viewRange={figureExport.viewRange} onClose={() => setFigureExport(null)}/>}
    {sourceCalibrationOpen && <SourceCalibrationDialog project={project} filename={filename} cal={cal} spectrumImportInfo={spectrumEntry.importInfo} onClose={() => setSourceCalibrationOpen(false)} onApply={value => { const next = applySourceCalibration(history.present, value); history.set(next); setError(''); setRestoreError(''); if (next.project !== project) setEvaluation(null); append(`Source calibrated from ${value.reference.name}.`); }}/>}
    <dialog className="help-dialog" ref={helpDialog}><div className="help-heading"><h2>MossA 2 help</h2><form method="dialog"><button aria-label="Close help">×</button></form></div><p><a href="./manual/" target="_blank" rel="noreferrer">Open the MossA 2 manual ↗</a> for a first-fit tutorial, step-by-step workflows, and the scientific reference.</p>{buildInfo.channel !== 'desktop' && <><h3>Full screen</h3><p>The full-screen button at the upper right hides browser tabs and the toolbar; click it again or press Esc to return.</p></>}<h3>Graph</h3><p>Left drag: rectangle zoom. Right drag: pan. Right click: previous zoom. Double right click: reset. Mouse wheel: zoom velocity around the pointer, keeping vertical limits fixed.</p><h3>Sites</h3><p>Press + to choose the new site type and profile, then Define on graph. The site list scrolls separately from the numeric editor. Edit the selected site name above its parameters (Enter or click away to apply, Esc to cancel). Duplicate copies the selected site and selects the copy. Type and profile are under Site settings; background controls are in Gen. Click position/depth, then half-width; for a doublet or sextet, click the opposite line. Redefine redraws the selected site in place, preserving its name, profile, fit flags, bounds, and links. Linked parameters continue following their source. Esc or Cancel exits picking. All graph navigation remains available during picking; only an undragged left click places a point.</p><h3>Editing</h3><p>Numeric fields show up to five significant digits. Focus a field to see its full value; leaving it unchanged preserves full precision. Undo and Redo retain up to 50 model/data changes in memory, including fits, their results/errors, and imports. Undo/Redo restores the completed fit for each state without optimization; curves are reevaluated for display. Use ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z outside text fields. Inside a field, native text undo applies. Graph navigation is independent of model history. Fit details stay visible when there is room; use the Fit details button in compact layouts. Drag the divider below the site list to allocate more space to sites or parameters.</p><h3>Results</h3><p>Drag the divider above the table to resize it. The table header stays visible as rows scroll. Select a site in the list or table to bring its curve forward. Trash icons remove individual sites. Checked parameters vary during fitting; fixed labels mark parameters held fixed. The table shows values with approximate 1 std on the line below. Fit for errors means the current model needs fitting; model/data changes clear old errors, while renaming keeps them. Fixed parameters are labeled fixed; ± — means an uncertainty is unavailable (hover for the reason). Intensity is the raw area parameter; Fraction is 100 × site intensity / total site intensity, as in MATLAB. In full transmission it is an absorber-intensity fraction. Fraction std includes parameter correlations and is expressed in percentage points; a fraction fixed by the model can have 0 std. A zero total intensity has no defined fraction. Uncertainties are approximate 1 std from the local Jacobian, scaled by residual variance. They are unavailable for fixed, active-bound, or unidentifiable parameters and differ from MATLAB confidence intervals.</p><h3>Autosave</h3><p>Every spectrum and model, raw counts, calibration controls, selected sites, fit results, option tab, and panel sizes are saved locally in this browser and restored on reload. Input edits commit before a normal reload. Fits restore their last completed state; unfinished fits and peak placement previews are discarded. Undo history starts fresh after reload. Use Save project for a portable backup; clearing browser storage removes the local autosave.</p><h3>Files and models</h3><p>Add spectra imports one or more plain-text files with velocity/count columns or one column of raw counts. Click the project title or its pencil icon in the header to rename it in place. Enter or clicking away saves; Escape cancels. Use the project sidebar to select a spectrum and one of its models. Drag the divider between spectra and models to adjust their space, or use arrow keys when the divider is focused; double-click resets it. The project sidebar and right fitting-options sidebar can each be collapsed independently. Panel settings are saved locally. Fitting options stay docked until you explicitly hide them; clicking the plot keeps them open. Edit xVBF distributions opens the panel when hidden. Duplicate a model to explore another interpretation without losing its fit. New model starts without sites. Model rows switch immediately without optimization; Up/Down moves between them. Right-click any model row for Duplicate, Rename, and Remove; these actions apply to the clicked model. Shift+F10 opens the same menu from the keyboard. Double-click a model row to edit its name in place. Enter or clicking away saves the name; Escape cancels. Spectrum names use the same in-place editing. Use the + and − buttons above either list to add or remove the selected item. Double-click a spectrum name to rename it in place. Removal is undoable. Gen → Folding &amp; calibration contains named presets. Choose a preset to preview it; Apply to this spectrum commits it to the current raw-count spectrum. Use for new imports chooses the default for subsequent raw-count files and does not change existing spectra. Selecting a different spectrum leaves that import default unchanged. The + button creates a manually defined preset, fits one from an α-Fe reference, or saves the current settings as a copy. Edit preset opens a separate dialog for the saved preset’s velocity and folding controls. Save and Cancel remain visible while its content scrolls. Recalibrate from reference refits its standard or loads a replacement file. Save changes to preset updates that same preset; Cancel, the close button, or Escape discards unsaved edits. Saving a preset affects future imports when it is the import default. Apply to this spectrum separately updates current raw-count data. Unsaved preset edits are labeled. The ⋯ button offers Edit, rename, and remove actions. Presets and the import default are saved with the project and autosave. Calibration and folding changes update the spectrum for all its models and invalidate their fits; source settings remain independent per model. New project beside Open and Save starts an empty project and replaces the local autosave. Undo restores the previous project, including every spectrum, model, and fit, until this page is closed. Save project includes every spectrum and model. Older single-spectrum projects open as a collection with one spectrum and one model. Folding and calibration apply to raw channels. Fold centers use 1-based integer or half-integer indices. Projects save data, bounds, links, and completed fit results/errors in .mossa files. Existing .mossa.json projects also open here. Opening restores matching results without fitting again; changed model/data inputs invalidate stored uncertainties. MATLAB .map import is not available yet.</p><p>Thin-absorber and full-transmission modes use different intensity units. Switching models rescales current intensities as starting estimates. In full-transmission mode, site overlays are absorber profiles scaled together for display, following the original MossA convention; they are not additive transmission components. Gaussian constants and sextet conventions follow the retained MATLAB reference. Use Gen → Source profile → Calibrate source to fit a known-width Lorentzian singlet standard with the MATLAB full-transmission calibration model. Review the curve, residuals, source width, and approximate 1 std before applying. The fixed absorber width and velocity scale are treated as exact; their uncertainties are not propagated. Source calibration updates source settings without replacing sample sites or changing the sample model. The squared source width uses the original MossA convention. Choose Gaussian mixture to fit one to three positive Gaussian source components. Inspect the complete source-shape preview and reference residuals; the calibrated unit-area, zero-centroid shape is held fixed in all subsequent full-transmission sample fits. Use a reference measured under matching source conditions with comparable or better statistics. The xVBF tab converts a Lorentzian doublet into Gaussian CS and QS distributions with correlated broadening. Each distribution has nonnegative weights summing to 100%, fixed flags, and bounds. Curves use the original MossA Voigt approximation and width convention. Distribution means appear as CS and QS in the results table; widths and weights are edited in xVBF. The spectrum stays visible while editing distributions in the right sidebar. Use its CS and QS tabs for a distribution plot and parameter editor, or Corr for coupling and the joint CS–QS map. The map opens in a larger view. Bounds open from the gear beside each component. The plots use matching marginals of MATLAB’s joint-density formula. Uncertainties include the normalization constraint. A single symmetric doublet cannot independently resolve both distribution widths and their coupling; the initial QS width is fixed.</p><p>All calculations run on this device. No spectrum is uploaded.</p><a href="https://github.com/CPrescher/MossA/tree/d201482b7990afbd0e2dcc23e306bfc8d60a5049" target="_blank" rel="noreferrer">MATLAB reference ↗</a><p className="help-credit">MossA 2 · C. Prescher · MIT</p></dialog>
  </div>;
}

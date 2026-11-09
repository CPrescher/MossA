import {updateFigureSettings} from './workspace';
import {useActionNotice} from './useActionNotice';
import {rememberFigureSettings,restoreFigureSettings,storeFigureSettings,hydrateFigureSettings,type FigureSettings,type RememberedFigureSettings} from './figure-settings';
import { captureDialogFocus,focusActivatedControl,restoreDialogFocus } from './focus-control';
import {commitActiveEdit} from './commit-edit';
import { ResultFitNote } from './ResultFitNote';
import {ResultsViewport} from './ResultsViewport';
import { HeaderOptions } from './HeaderOptions';
import { ExportOptions } from './ExportOptions';
import {exportFilename} from './export-filename';
import { useCompactSites } from './useCompactSites';
import { FitWarningsDialog } from './FitWarningsDialog';
import { warningParameters,type WarningParameter } from './warning-parameters';
import { displayKeys } from './display-parameters';
import { ResultsDialog } from './ResultsDialog';
import { SiteOptionsPicker } from './SiteOptionsPicker';
import { isTauri } from '@tauri-apps/api/core';
import { ProjectFiles, openDesktopProject, type ProjectFileTarget } from './project-files';
import { saveText } from './file-save';
import { newNuclearConstants } from './nuclear-constants.mjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSiteColors } from './useSiteColors';
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
import { activeModel, activeSpectrum, addModel, appendSpectra, removeModel, removeSpectrum, renameEntry, selectEntry, freshWorkspace, useWorkspaceHistory, workspaceFromSnapshot, updateActiveSnapshot, entryId, type Workspace, type SpectrumEntry } from './workspace';
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
import { TextSizeControl } from './TextSizeControl';
import { FullscreenToggle } from './FullscreenToggle';
import { FittingTabs } from './FittingTabs';
import { InspectorSwitch } from './InspectorSwitch';
import { useDialogKeyboardNavigation } from './useDialogKeyboardNavigation';
import { buildInfo } from './version';
import { demo } from './demo';
import { fitShortcut } from './fit-shortcut';
import { calibrateCounts, csvSpectrum, parseSpectrum } from './io.mjs';
import { Plot } from './Plot';
import { FigureExportDialog } from './FigureExportDialog';
import { FitReportDialog } from './FitReportDialog';
import { CompareModelsDialog } from './CompareModels';
import './comparison.css';
import { ResultsPane } from './ResultsPane';
import { ResultsTable } from './ResultsTable';
import { intensityFractions } from './results';
import { FitDetails } from './FitDetails';
import { SiteList } from './site-list';
import { AddSiteMenu } from './AddSiteMenu';
import { Numeric, NumericScope } from './Numeric';
import { XvbfEditor } from './XvbfEditor';
import { CorrelationDialog } from './XvbfPlots';
import { SiteListPane } from './SiteListPane';
import { removeSiteAt, duplicateSiteAt } from './sites.mjs';
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
  useDialogKeyboardNavigation();
  useEffect(()=>{const key=(event:KeyboardEvent)=>fitShortcut(event,document.querySelector<HTMLElement>('.app'));window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  type Point = { x: number; y: number };
  type Placement = { site: Site; kind: string; stage: number; index: number | null; first?: Point; width?: Point; cursor?: Point };
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [sourceCalibrationOpen, setSourceCalibrationOpen] = useState(false);
  const [correlationOpen,setCorrelationOpen] = useState(false);
  const [comparisonSpectrum, setComparisonSpectrum] = useState<SpectrumEntry | null>(null);
  const [foldingOpen, setFoldingOpen] = useState(false);
  const [figureExport, setFigureExport] = useState<{ viewRange: [number, number] | null; settings:RememberedFigureSettings } | null>(null);
  const [reportOptions, setReportOptions] = useState<FigureSettings['options'] | null>(null);
  const [restoreError, setRestoreError] = useState(restored.error);
  const [layout, setLayout] = useState(restored.layout);
  const history = useWorkspaceHistory(() => restored.workspace);
  const workspace = history.workspace, spectrumEntry = activeSpectrum(workspace), modelEntry = activeModel(workspace);
  const numericDocument=useMemo(entryId,[history.document]);
  const numericContext=`${numericDocument}:${spectrumEntry.id}:${modelEntry.id}`;
  const figureDrafts=useRef(new WeakMap<object,Map<string,RememberedFigureSettings>>());
  function modelFigures(){let drafts=figureDrafts.current.get(history.document);if(!drafts){drafts=new Map();figureDrafts.current.set(history.document,drafts);}return drafts;}
  const saveContext=useRef({workspace,document:history.document});
  saveContext.current={workspace,document:history.document};
  const [renaming, setRenaming] = useState<'project' | 'spectrum' | 'model' | null>(null);
  const [renameModelId, setRenameModelId] = useState<string | undefined>();
  const { project, raw, cal, filename, selected } = history.present;
  const siteColors=useSiteColors(history.present,history.set);
  const hasSpectrum = project.spectrum.x.length > 0;
  const setSelected = (value: number) => { if (value !== selected) history.set({ ...history.present, selected: value }, false); };
  useEffect(() => { const editor = document.querySelector<HTMLElement>('.site-editor'); if (editor) editor.scrollTop = 0; }, [spectrumEntry.id, modelEntry.id, selected]);
  const [hoveredSite, setHoveredSite] = useState<number | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationVersion, setEvaluationVersion] = useState(0);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  // A progress message can arrive before React renders it. Keep the newest
  // snapshot available to the stop action, including during a multi-start search.
  const latestFitProgress = useRef<FitProgress | null>(null);
  const [inspector, setInspector] = useState<'sites'|'options'>(() => restored.layout.tab === 'xVBF' ? 'options' : 'sites');
  const [warningInspection,setWarningInspection]=useState<{view:'cs'|'qs'|'corr';revision:number}>({view:'cs',revision:0});
  const [smallScreen, setSmallScreen] = useState(() => window.innerWidth <= 900);
  useEffect(() => { if (smallScreen) setLayout(l => ({ ...l, projectCollapsed:true })); }, [smallScreen]);
  const [compactWindow, setCompactWindow] = useState(() => window.innerWidth <= 1200);
  useEffect(() => { const resize = () => setCompactWindow(window.innerWidth <= 1200); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (compactWindow) setLayout(l => ({ ...l, projectCollapsed:true })); }, [compactWindow]);
  const [resultsDialogOpen,setResultsDialogOpen]=useState(false);
  const [fitWarningsOpen,setFitWarningsOpen]=useState(false);
  const warningTrigger=useRef<HTMLElement|null>(null);
  const [mobilePane, setMobilePane] = useState<'plot'|'sites'|'options'>('plot');
  useEffect(() => { const resize = () => setSmallScreen(window.innerWidth <= 900); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const { tab } = layout;
  const setTab = (tab: string) => { if (tab === 'xVBF') { setInspector('options'); setMobilePane('options'); window.requestAnimationFrame?.(() => document.getElementById('tab-xVBF')?.focus()); } setLayout(l => ({ ...l, tab, ...(tab === 'xVBF' ? { optionsCollapsed: false } : {}) })); };
  const optionsVisible = !layout.optionsCollapsed;
  const openOptions = () => { setInspector('options'); setMobilePane('options'); setLayout(l => ({ ...l, optionsCollapsed: false })); };
  const closeOptions = () => setLayout(l => ({ ...l, optionsCollapsed: true }));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyTask, setBusyTask] = useState<'fit' | 'fold' | 'load'>('fit');
  const [error, setError] = useState('');
  const actionNotice=useActionNotice();
  const [inputNotice, setInputNotice] = useState('');
  useEffect(()=>{if(!inputNotice)return;const frame=window.requestAnimationFrame(()=>{if(!document.querySelector('.app input[aria-invalid="true"]'))setInputNotice('');});return()=>window.cancelAnimationFrame(frame);},[numericContext,selected,tab,inputNotice]);
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
  const projectFilesAvailable=ready&&!busy&&!picking&&!comparisonSpectrum&&!calibrationOpen&&!sourceCalibrationOpen&&!foldingOpen&&!fileBusy;
  const autosaveError = useWorkspaceAutosave({ version: 1, workspace, layout }, !restoreError);
  const evaluationCache = useRef(new Map<string, { model: typeof modelEntry.project; spectrum: Project['spectrum']; evaluation: Evaluation }>());
  const append = (message: string) => setLog(old => [...old.slice(-5), message]);
  const notify=(message:string,persistent=false)=>{append(message);actionNotice.show(message,persistent);};
  function persistFigure(settings:FigureSettings){
    const remembered=rememberFigureSettings(settings,project,`${spectrumEntry.name} · ${modelEntry.name}`);
    modelFigures().set(modelEntry.id,remembered);
    const next=updateFigureSettings(workspace,modelEntry.id,storeFigureSettings(remembered));
    if(next!==workspace)history.setWorkspace(next,false);
  }
  useEffect(()=>{
    if(figureExport)return;
    const drafts=modelFigures(),saved=drafts.get(modelEntry.id)??hydrateFigureSettings(modelEntry.figureExport,project,`${spectrumEntry.name} · ${modelEntry.name}`);
    if(saved){const restored=restoreFigureSettings(saved,project,`${spectrumEntry.name} · ${modelEntry.name}`);drafts.set(modelEntry.id,restored);const next=updateFigureSettings(workspace,modelEntry.id,storeFigureSettings(restored));if(next!==workspace)history.setWorkspace(next,false);}
  },[history.document,modelEntry.id,modelEntry.figureExport,project.sites,spectrumEntry.name,modelEntry.name,!!figureExport]);
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
  const edit = (next: Project | ((p: Project) => Project), metadata: Partial<typeof history.present> = {}) => { actionNotice.clear(); setRestoreError(''); setEvaluation(null); setError(''); history.set({ ...history.present, ...metadata, project: typeof next === 'function' ? next(project) : next, fit: null, fitElapsed: null }); append('Model changed; fit again to update results.'); };
  function travel(direction: 'undo' | 'redo') { if (!ready || busy || picking || calibrationOpen || sourceCalibrationOpen || foldingOpen || renaming || comparisonSpectrum) return; actionNotice.clear();const target = direction === 'undo' ? history.past.at(-1) : history.future[0]; if (!target) return; history[direction](); if (target.project !== project) setEvaluation(null); setEvaluationVersion(v => v + 1); setError(''); append(direction === 'undo' ? 'Undid change.' : 'Redid change.'); }
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if ((document.querySelector('dialog[open]') || target.closest('input:not([type=color]):not([type=checkbox]),textarea,[contenteditable=true]')) || !(e.metaKey || e.ctrlKey) || e.altKey) return; if (e.key.toLowerCase() === 'z' || (e.key.toLowerCase() === 'y' && !e.metaKey)) { e.preventDefault(); travel(e.shiftKey || e.key.toLowerCase() === 'y' ? 'redo' : 'undo'); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [history, busy, picking, calibrationOpen, sourceCalibrationOpen, foldingOpen, renaming, comparisonSpectrum]);
  const renameSite = (name: string, index = selected) => { if (project.sites[index]?.name === name) return; const next = { ...project, sites: project.sites.map((site,i) => i === index ? { ...site, name } : site) }; history.set({ ...history.present, project: next }); };
  const updateSite = (next: Partial<Site>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, ...next } : s) }));
  const updateParam = (key: string, next: Partial<Parameter>) => edit(p => ({ ...p, sites: p.sites.map((s, i) => i === selected ? { ...s, params: { ...s.params, [key]: { ...s.params[key], ...next } } } : s) }));
  const hasCurrent = project.sites.length > 0;
  const current = picking?.site ?? progress?.project.sites[selected] ?? project.sites[Math.min(selected, project.sites.length - 1)] ?? newSite(0, newKind);
  useEffect(() => { if (!picking) return; const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPick(); }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, [!!picking]);
  async function fit() {
    if (!worker.current || !ready || busy || error || picking || !hasSpectrum) return;
    const invalid = document.querySelector<HTMLInputElement>('.app input[aria-invalid="true"]');
    if (invalid) { setInputNotice(`${invalid.getAttribute('aria-label')??'Value'}: ${invalid.title}`); const panel = invalid.closest('#fitting-options-sidebar') ? 'options' : 'sites'; setInspector(panel); setMobilePane(panel); window.requestAnimationFrame(() => invalid.focus()); return; }
    setInputNotice('');actionNotice.clear();
    const token = ++fitToken.current; latestFitProgress.current = null; setBusyTask('fit'); setBusy(true); setProgress(null); setError(''); append('Fitting with trust-region reflective…');
    try {
      const response = await worker.current.request('fit', project, update => { if (token !== fitToken.current) return; latestFitProgress.current = update; setProgress(update); setEvaluation(update.evaluation); });
      if (token !== fitToken.current) return;
      const fitResult = response.result as FitResult;
      history.set({ ...history.present, project: { ...fitResult.project, spectrum: project.spectrum }, fit: summarizeFit(fitResult), fitElapsed: response.elapsed }); setEvaluation(fitResult.evaluation);
      append(`${fitResult.converged ? 'Converged' : 'Stopped'} · ${fitResult.iterations} ${fitResult.iterations === 1 ? 'iteration' : 'iterations'} · ${response.elapsed.toFixed(0)} ms`);
      fitResult.warnings.forEach(append);
    } catch (e) { if (token === fitToken.current) { setError(String(e)); setEvaluation(null); append('Fit failed; starting parameters retained.'); } }
    finally { if (token === fitToken.current) { latestFitProgress.current = null; setBusy(false); setProgress(null); } }
  }
  function stop(keepProgress = false) {
    const kept = busyTask === 'fit' && keepProgress ? latestFitProgress.current : null;
    if (keepProgress && !kept) return;
    // Invalidate callbacks before canceling either the browser or native engine.
    fitToken.current++; worker.current?.stop(); latestFitProgress.current = null;
    if (kept) {
      // Iteration snapshots have no covariance estimate. Clear the previous fit
      // so its std and diagnostics cannot be paired with these new parameters.
      history.set({ ...history.present, project: { ...kept.project, spectrum: project.spectrum, search_starts: project.search_starts, search_strategy: project.search_strategy }, fit: null, fitElapsed: null });
    }
    setProgress(null); setEvaluation(kept?.evaluation ?? null); setBusy(false); setReady(false); setEngineVersion(v => v + 1);
    notify(kept ? 'Fit stopped · current values kept. Fit again to calculate std.' : busyTask === 'fit' ? (history.present.fit ? 'Fit canceled · previous fit restored.' : 'Fit canceled · starting model restored.') : 'Calculation stopped · previous project kept.', true);
  }
  function changeWorkspace(next: Workspace, record = true, newDocument = false) {
    actionNotice.clear();
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
    if (workspace.spectra.length + files.length > 1000 || workspace.spectra.reduce((n, s) => n + s.models.length, 0) + files.length > 4096) { setFileError('A project supports up to 1,000 spectra and 4,096 models.'); return; }
    actionNotice.clear();const id = ++fitToken.current; setBusyTask('load'); setBusy(true);
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
      if (failures.length) setFileError(failures.join('\n'));
    } finally { if (id === fitToken.current) setBusy(false); }
  }
  async function loadProject(file?: File, nativeTarget?: ProjectFileTarget) {
    if (!file || busy || !ready) return;
    actionNotice.clear();const id = ++fitToken.current; setBusyTask('load'); setBusy(true);
    try {
      if (file.size > 256e6) throw new Error('Project file is too large (maximum 256 MB).');
      const loaded = await openWorkspaceFile(JSON.parse(await file.text()), cal, file.name, async p => (await worker.current!.request('evaluate', p)).result as Evaluation);
      if (id !== fitToken.current) return;
      const document = changeWorkspace(loaded.workspace, true, true);
      if (nativeTarget) projectFiles.current.opened(document, nativeTarget);
      setEvaluation(loaded.evaluation);
      notify(loaded.notice || `Opened ${loaded.workspace.spectra.length} spectra with all models and saved fit results.`);
    } catch (e) { if (id === fitToken.current) setFileError(String(e)); }
    finally { if (id === fitToken.current) setBusy(false); }
  }
  async function openProject() {
    if (!projectFilesAvailable || fileOperation.current) return;
    if (!isTauri()) { projectInput.current?.click(); return; }
    const returnFocus=captureDialogFocus();
    fileOperation.current = true; setFileBusy(true); setFileError('');
    try {
      const opened = await openDesktopProject();
      if (opened) await loadProject(new File([opened.contents], opened.filename), opened);
    } catch (e) { setFileError(String(e)); }
    finally { fileOperation.current = false; setFileBusy(false); restoreDialogFocus(returnFocus); }
  }
  async function saveProject(saveAs = false) {
    if (!projectFilesAvailable || fileOperation.current) return;
    const {origin:returnFocus,invalid}=commitActiveEdit();
    if(invalid){setInputNotice(`${invalid.getAttribute('aria-label')??'Value'}: ${invalid.title}`);const panel=invalid.closest('#fitting-options-sidebar')?'options':'sites';setInspector(panel);setMobilePane(panel);window.requestAnimationFrame(()=>invalid.focus());return;}
    const current=saveContext.current;
    fileOperation.current = true; setFileBusy(true); setFileError('');
    try {
      const file = await createWorkspaceFile(current.workspace, { application: `MossA ${buildInfo.version}`, commit: buildInfo.commit, modified: buildInfo.dirty, matlab_reference: 'd201482b7990afbd0e2dcc23e306bfc8d60a5049' });
      const suggested=`${current.workspace.name.replace(/[\\/:*?"<>|]/g, '_')}.mossa`;
      if(await projectFiles.current.save(current.document,suggested,JSON.stringify(file,null,2),saveAs,returnFocus))notify(`${isTauri()?'Saved':'Downloaded'} ${projectFiles.current.filename(current.document)??suggested} · all spectra and models.`);
      else notify('Save canceled · project kept.');
    } catch (e) { setFileError(String(e)); }
    finally { fileOperation.current = false; setFileBusy(false); }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (event.shiftKey && !isTauri()) || document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveProject(event.shiftKey && isTauri()); }
      if (!event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); void openProject(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [workspace,projectFilesAvailable]);
  function allowExport(){const {invalid}=commitActiveEdit();if(!invalid)return true;setInputNotice(`${invalid.getAttribute('aria-label')??'Value'}: ${invalid.title}`);const panel=invalid.closest('#fitting-options-sidebar')?'options':'sites';setInspector(panel);setMobilePane(panel);window.requestAnimationFrame(()=>invalid.focus());return false;}
  function exportResults() {
    if (!allowExport()||!result) return;
    const rows = ['site,type,profile,parameter,value,approx_1std,link'];
    project.background.forEach((b, i) => rows.push(['Background', 'Polynomial', '', `b${i}`, b.value, result.errors[`bkg:${i}`] ?? '', ''].join(',')));
    project.sites.forEach((s, i) => keys(s).forEach(k => rows.push([`"${s.name.replaceAll('"', '""')}"`, s.kind, s.profile, k, s.params[k].value, result.errors[`site:${i}:${k}`] ?? '', s.params[k].link ? `"${s.params[k].link!.factor} * ${s.params[k].link!.target}"` : ''].join(','))));
    project.sites.forEach((s,i)=>{ if(!s.xvbf)return; const add=(name:string,value:number,id:string)=>rows.push([`"${s.name.replaceAll('"','""')}"`,'Doublet','xVBF',name,value,result.errors[id]??'',''].join(','));
      for(const k of ['cs','qs'])add(`${k}_mean`,evaluation?.parameters?.[`site:${i}:${k}`]??s.params[k].value,`site:${i}:${k}`);
      add('coupling_delta',s.xvbf.delta.value,`site:${i}:delta`);
      for(const axis of ['cs','qs'] as const)s.xvbf[axis].forEach((component,j)=>{for(const key of ['center','width','weight'] as const)add(`${axis}_${j+1}_${key}`,component[key].value,`site:${i}:${axis==='cs'?'csd':'qsd'}:${j}:${key}`);});
    });
    intensityFractions(project,evaluation,result).forEach((fraction,i) => { const site = project.sites[i]; rows.push([`"${site.name.replaceAll('"', '""')}"`, site.kind, site.profile, 'intensity_fraction_percent', fraction.value ?? '', fraction.error ?? '', ''].join(',')); });
    void saveText(exportFilename(filename,modelEntry.name,'parameters'), rows.join('\n'), 'text/csv').then(saved=>{if(saved)notify(`${isTauri()?'Saved':'Downloaded'} parameter table CSV.`);else notify('Export canceled · project kept.');}).catch(e => setFileError(String(e)));
  }
  function addSite(method:'graph'|'parameters' = 'graph') {
    const site = newSite(project.sites.length, newKind); site.profile = newProfile; if (newKind === 'Sextet') site.params.qs.value = 0;
    site.params.cs.min = project.spectrum.x[0]; site.params.cs.max = project.spectrum.x.at(-1)!;
    site.params.fwhm.max = null; site.params.bhf.max = null;
    site.params.qs.min = null; site.params.qs.max = null;
    if (project.mode === 'transmission') site.params.intensity.value = .01;
    if (method === 'parameters') {
      site.params.cs.value = Math.max(site.params.cs.min!, Math.min(site.params.cs.max!, site.params.cs.value));
      edit(placementProject(project, site, null), { selected:project.sites.length });
      setInspector('sites'); setMobilePane('sites');
      append(`${site.name} added with starting values; edit the parameters before fitting.`);
      window.requestAnimationFrame?.(() => document.querySelector<HTMLInputElement>('[aria-label="CS value"]')?.focus());
      return;
    }
    placementToken.current++; setPicking({ site, kind: site.kind, stage: 0, index: null }); setMobilePane('plot'); setError('');
    append(`Define ${newKind.toLowerCase()}: click position/depth, then width${newKind === 'Singlet' ? '.' : ', then the opposite line.'}`);
  }
  function redefineSite() {
    if (!hasCurrent) return;
    const site = structuredClone(project.sites[selected]);
    placementToken.current++; setPicking({ site, kind: site.kind, stage: 0, index: selected }); setMobilePane('plot'); setError('');
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
      edit(candidate, { selected: next.index ?? project.sites.length }); setEvaluation(checked.result as Evaluation); setPicking(null); setInspector('sites'); setMobilePane('sites'); window.requestAnimationFrame?.(() => document.querySelector<HTMLInputElement>('[aria-label="CS value"]')?.focus());
      append(`${next.site.name} ${next.index === null ? 'added' : 'redefined'}.`);
    } catch (e) { if (token === placementToken.current) setError(String(e)); }
  }
  function cancelPick() { actionNotice.clear();placementToken.current++; setPicking(null); setEvaluation(null); setError(''); append('Peak placement canceled.'); }
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
            onInspectFolding={() => setFoldingOpen(true)} onApply={(controls, settings) => {
              const next = applyRawCalibration(history.present, { ...controls, ...(cal.sourceReference ? { sourceReference: cal.sourceReference } : {}) });
              if (settings) history.setWorkspace(updateActiveSnapshot({ ...workspace, ...settings }, next));
              else history.set(next);
              setRestoreError(''); setError(''); if (next.project !== project) setEvaluation(null);
              append(next.project === project ? 'Calibration unchanged; current fit retained.' : 'Updated folding and velocity calibration.');
            }}/>;
  const siteInspector=useRef<HTMLElement|null>(null);
  const sitePresentation=useCompactSites(siteInspector,project.sites);
  const hasFitWarnings=!!result?.warnings.length&&!busy&&!picking;
  const fitSummary=result?`${result.converged?'Converged':'Stopped'}${result.search?` · best of ${result.search.completed} starts`:''} · ${result.iterations} ${result.iterations===1?'iteration':'iterations'}${elapsed==null?'':` · ${elapsed.toFixed(0)} ms`}`:'';
  const openFitWarnings=()=>{warningTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setFitWarningsOpen(true);};
  const inspectWarningParameter=(parameter:WarningParameter)=>{
    setFitWarningsOpen(false);setResultsDialogOpen(false);
    if(parameter.site!==undefined)setSelected(parameter.site);
    if(parameter.tab==='sites'){setInspector('sites');setMobilePane('sites');}
    else {openOptions();setTab(parameter.tab);if(parameter.view)setWarningInspection(previous=>({view:parameter.view!,revision:previous.revision+1}));}
    window.requestAnimationFrame(()=>document.querySelector<HTMLInputElement>(`input[aria-label="${parameter.field}"]`)?.focus());
  };
  const resultsContent=<><div className="results-heading"><div><h2>Site parameters</h2><ResultFitNote result={result} fitting={busy&&busyTask==='fit'} onWarnings={openFitWarnings}/></div><div className="results-actions"><button className="expand-results" aria-label="Expand results" title="Expand the table for a full-width comparison" onClick={()=>setResultsDialogOpen(true)}>↗</button><button disabled={!result || busy} onClick={exportResults}>Export parameters</button></div></div><ResultsViewport><ResultsTable project={progress?.project ?? project} evaluation={evaluation} result={busy && busyTask === 'fit' ? null : result} selected={picking ? picking.index ?? -1 : selected} onSelect={index => { if (!picking && !busy) { setSelected(index); setTargetKey('fwhm'); setInspector('sites'); } }}/></ResultsViewport></>;
  const exportSpectrum=()=>{if(!allowExport())return;void saveText(exportFilename(filename,modelEntry.name,'spectrum'),csvSpectrum(project,evaluation!),'text/csv').then(saved=>{if(saved)notify(`${isTauri()?'Saved':'Downloaded'} spectrum data CSV.`);else notify('Export canceled · project kept.');}).catch(e=>setFileError(String(e)));};
  const exportFigure=()=>{if(!allowExport())return;const range=document.getElementById('spectrum-plot')?.getAttribute('data-view-x')?.split(',').map(Number);setFigureExport({viewRange:range?.length===2&&range.every(Number.isFinite)?range as [number,number]:null,settings:restoreFigureSettings(modelFigures().get(modelEntry.id)??hydrateFigureSettings(modelEntry.figureExport,project,`${spectrumEntry.name} · ${modelEntry.name}`),project,`${spectrumEntry.name} · ${modelEntry.name}`)});};
  return <NumericScope scopeKey={numericContext}><div className="app" onClickCapture={event=>focusActivatedControl(event.target)} onKeyDownCapture={fitShortcut} onKeyUpCapture={event=>{if(event.key==='Escape'&&!document.querySelector('.app input[aria-invalid="true"]'))setInputNotice('');}} onInputCapture={() => {setInputNotice('');actionNotice.clear();}}>
    <header className="app-header">
      <div className="brand"><span className="brand-mark">MossA 2</span><span className="brand-divider"/><h1><span className="analysis-title">Mössbauer analysis <span aria-hidden="true">—</span> </span><span className="header-project-title">{renaming === 'project' ? <InlineNameEditor name={workspace.name} label="Project name" rowId="header-project-name" onCommit={name => { changeWorkspace(renameEntry(workspace, 'project', name)); setRenaming(null); }} onCancel={() => setRenaming(null)}/> : <button id="header-project-name" className="header-project-name" disabled={!canCalculate} aria-label={`Rename project: ${workspace.name}`} title={`${workspace.name}${projectFiles.current.filename(history.document)?` · Project file: ${projectFiles.current.filename(history.document)}`:''} · Click to rename`} onClick={() => setRenaming('project')}><span>{workspace.name}</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg></button>}</span></h1></div>
      <nav className="header-file-actions" aria-label="Spectrum actions">
        <button className="header-add-spectra" disabled={!canCalculate} onClick={() => fileInput.current?.click()} aria-label="Add spectra" title="Add one or more spectra"><FileActionIcon action="add"/><span className="header-long-label">Add spectra</span><span className="header-short-label" aria-hidden="true">Add</span></button>
        <button className="header-save-project" disabled={!projectFilesAvailable} onClick={()=>void saveProject()} aria-label="Save project" title={projectFiles.current.filename(history.document)?`Save to ${projectFiles.current.filename(history.document)} (⌘/Ctrl+S)`:'Save the complete editable MossA project (⌘/Ctrl+S)'}><FileActionIcon action="save"/><span className="header-long-label">Save project</span><span className="header-short-label" aria-hidden="true">Save</span></button>
        <ExportOptions context={`${filename} · ${modelEntry.name}`} unavailableReason={!hasSpectrum?'Add a spectrum to export data, parameters, or a figure.':picking?'Finish or cancel the site definition before exporting.':busy?'Wait for the current calculation to finish before exporting.':!evaluation?(error?'Resolve the calculation error before exporting.':'Preparing the spectrum for export…'):undefined} canExport={!!evaluation&&!busy&&!picking} canExportTable={!!result&&!busy&&!picking} onData={exportSpectrum} onFigure={exportFigure} onTable={exportResults} onReport={()=>{if(!allowExport()||!result||!evaluation)return;const name=`${spectrumEntry.name} · ${modelEntry.name}`;setReportOptions(restoreFigureSettings(modelFigures().get(modelEntry.id)??hydrateFigureSettings(modelEntry.figureExport,project,name),project,name).options);}}/>
      </nav>
      <div className="header-actions"><div className="history-controls" role="group" aria-label="Edit history"><button className="header-icon-button" aria-label="Undo" title="Undo (⌘/Ctrl+Z)" disabled={!canCalculate || !history.past.length} onClick={() => travel('undo')}><HistoryIcon direction="undo"/></button><button className="header-icon-button" aria-label="Redo" title="Redo (⌘/Ctrl+Shift+Z)" disabled={!canCalculate || !history.future.length} onClick={() => travel('redo')}><HistoryIcon direction="redo"/></button></div><HeaderOptions prefix={<><TextSizeControl/><ThemeToggle/></>}><a className="manual-link" href="./manual/" target="_blank" rel="noreferrer" title="Open the MossA manual (new tab)"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4.5C7.5 3 4.5 3 2 4v12c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V4c-2.5-1-5.5-1-8 .5Zm0 0v12"/></svg><span>Manual</span></a><button className="help-button" title="Open quick help for calibration, layouts, fitting, and exports" onClick={() => helpDialog.current?.showModal()}>Help</button>{buildInfo.channel !== 'desktop' && <FullscreenToggle onError={setError}/>}</HeaderOptions></div>
    </header>
    <input ref={fileInput} type="file" multiple hidden aria-label="Spectrum file" accept=".txt,.dat,.csv,.asc,.mca" onChange={e => { void loadSpectra(Array.from(e.target.files ?? [])); e.target.value = ''; }}/><input ref={projectInput} type="file" hidden aria-label="Project file" accept=".mossa,.json" onChange={e => { void loadProject(e.target.files?.[0]); e.target.value = ''; }}/>
    <div className="project-shell">
      <ProjectSidebar workspace={workspace} disabled={!canCalculate || fileBusy || calibrationOpen || sourceCalibrationOpen || foldingOpen} collapsed={!!layout.projectCollapsed} ratio={layout.projectSplit ?? .55} onCollapse={() => setLayout(l => ({ ...l, projectCollapsed: !l.projectCollapsed }))} onRatio={projectSplit => setLayout(l => ({ ...l, projectSplit }))} onSelect={id => { changeWorkspace(selectEntry(workspace, id), false); setMobilePane('plot'); }} onImport={() => fileInput.current?.click()} onNew={resetProject} onOpen={() => void openProject()} onSave={() => void saveProject()} onSaveAs={isTauri() ? () => void saveProject(true) : undefined} saveDisabled={!projectFilesAvailable} onRename={(kind, id) => { if (id) changeWorkspace(selectEntry(workspace, id), false); setRenaming(kind); }} onRemove={id => { setRenaming(null); changeWorkspace(removeSpectrum(workspace, id)); }} renamingSpectrumId={renaming === 'spectrum' ? spectrumEntry.id : undefined} onCommitName={name => { changeWorkspace(renameEntry(workspace, 'spectrum', name)); setRenaming(null); }} onCancelName={() => setRenaming(null)}>
        {hasSpectrum ? <ModelNavigation onCompare={() => setComparisonSpectrum(structuredClone(spectrumEntry))} workspace={workspace} disabled={!canCalculate || fileBusy || calibrationOpen || sourceCalibrationOpen || foldingOpen} onSelect={id => changeWorkspace(selectEntry(workspace, spectrumEntry.id, id), false)} onDuplicate={id => changeWorkspace(addModel(workspace, true, id))} onNew={() => changeWorkspace(addModel(workspace, false))} onRename={id => { setRenameModelId(id); setRenaming('model'); }} onRemove={id => { setRenaming(null); setRenameModelId(undefined); changeWorkspace(removeModel(workspace, id)); }} renamingModelId={renaming === 'model' ? renameModelId ?? modelEntry.id : undefined} onCommitName={name => { changeWorkspace(renameEntry(workspace, 'model', name, renameModelId)); setRenaming(null); setRenameModelId(undefined); }} onCancelName={() => { setRenaming(null); setRenameModelId(undefined); }}/>: <p className="no-spectra">Add a spectrum to create models.</p>}
      </ProjectSidebar>
      <div className="analysis-body">
    <div className={`workspace ${optionsVisible ? 'options-visible' : 'options-collapsed'} ${tab==='xVBF'?'xvbf-open':''} inspector-${inspector} mobile-pane-${mobilePane}`}>
      <InspectorSwitch selected={smallScreen ? mobilePane : inspector} onSelect={value => { setMobilePane(value); if (value !== 'plot') setInspector(value); if (value === 'options') openOptions(); }}/><aside ref={siteInspector} className="left-panel" id="site-inspector" aria-label="Site editor"><div className="panel-heading"><h2>Sites</h2>{sitePresentation.canToggle&&!picking?<button className="count site-count-toggle" aria-label={sitePresentation.compact?'Show all sites':'Use compact site selector'} title={sitePresentation.compact?'Show every site; the parameter editor may need scrolling':'Give the parameter editor more room'} onClick={sitePresentation.toggle}>{project.sites.length}<span aria-hidden="true"> {sitePresentation.compact?'▾':'▴'}</span></button>:<span className="count">{project.sites.length+(picking?.index===null?1:0)}</span>}<div className="heading-actions">{picking ? <button className="cancel-placement" onClick={cancelPick}>Cancel</button> : <button className="redefine-button" disabled={!canCalculate || !hasCurrent || !!current.xvbf} onClick={redefineSite} title={current?.xvbf ? 'Edit distribution centers and widths in xVBF' : 'Redraw the selected site; keep its name and settings'}>Redefine</button>}<button className="duplicate-site" aria-label="Duplicate site" title="Duplicate selected site" disabled={!canCalculate || !hasCurrent || project.sites.length >= 16} onClick={duplicateSite}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/></svg></button><AddSiteMenu disabled={!canCalculate || !hasSpectrum || project.sites.length >= 16} kind={newKind} profile={newProfile} onKind={setNewKind} onProfile={setNewProfile} onDefine={() => addSite()} onAdd={() => addSite('parameters')}/></div></div>

        <SiteListPane compact={sitePresentation.compact} count={project.sites.length+(picking?.index===null?1:0)} height={layout.sitesHeight} onHeightChange={sitesHeight => setLayout(l => ({ ...l, sitesHeight }))}><SiteList key={`${spectrumEntry.id}:${modelEntry.id}`} compact={sitePresentation.compact} sites={picking?.index===null?[...project.sites,picking.site]:project.sites} selected={picking ? picking.index ?? project.sites.length : selected} disabled={!canCalculate} onSelect={index => { setSelected(index); setTargetKey('fwhm'); }} onDelete={removeSite} onRename={(index, name) => renameSite(name, index)} onHover={setHoveredSite} onColor={siteColors.change} onColorStart={siteColors.begin}/></SiteListPane>
        <NumericScope scopeKey={`${numericContext}:site:${selected}:${project.sites.length}:${picking?'placing':'editing'}`}><fieldset disabled={!canCalculate} className="bare site-editor">
          {(hasCurrent || picking) ? <fieldset className="bare selected-site-editor" disabled={!!picking}>
          <section className="left-section"><details className="site-properties"><summary aria-label="Site settings" title="Edit site type and profile">Site settings</summary><div className="left-section"><div className="two-columns"><label className="stack-label">Site type<select disabled={!!current.xvbf} aria-label="Site type" value={current.kind} onChange={e => changeKind(e.target.value as Site['kind'])}>{['Singlet','Doublet','Sextet'].map(s => <option key={s}>{s}</option>)}</select></label><label className="stack-label">Line profile<select disabled={!!current.xvbf} aria-label="Line profile" value={current.profile} onChange={e => updateSite({ profile: e.target.value as Site['profile'] })}>{['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].map(s => <option key={s}>{s}</option>)}</select></label></div></div></details>{current.xvbf&&<button className="full-width" onClick={()=>setTab('xVBF')}>Edit xVBF distributions</button>}<div className="param-rows"><div className="param-column-heading" aria-hidden="true"><span>Parameter</span><span>Value</span><span title="Checked parameters vary during fitting">Fit</span></div>{displayKeys(current).map(k => <div className="param-row" key={k}><label title={k === 'intensity' ? (project.mode === 'thin' ? 'Area parameter in original MossA convention' : 'Absorber optical-depth area parameter') : k === 'mix' ? 'Pseudo-Voigt Lorentzian mixing fraction (0–1), not the site intensity percentage' : k === 'a12' && current.kind === 'Doublet' ? 'Fraction assigned to the first line (0–1)' : labels[k]}>{labels[k]}<small>{['cs','fwhm','qs'].includes(k) ? 'mm/s' : k === 'bhf' ? 'T' : ''}</small></label><Numeric label={`${labels[k]} value`} value={current.params[k].link ? evaluation?.parameters?.[paramId(k)] ?? current.params[k].value : current.params[k].value} onChange={v => updateParam(k, { value: v! })} disabled={!!current.params[k].link}/>{current.params[k].link ? <span className="linked" title={`Linked to ${current.params[k].link!.target}`}>↗</span> : <input type="checkbox" aria-label={`Fit ${labels[k]}`} checked={current.params[k].fit} onChange={e => updateParam(k, { fit: e.target.checked })}/>}</div>)}</div></section></fieldset> : <div className="empty-sites">No sites</div>}

        </fieldset></NumericScope>
      </aside>
      <div className="inspector-fit-controls">
        {inputNotice && <p className="input-notice" role="alert">{inputNotice}</p>}
        <div className="fit-area"><div className="fit-actions">
          <button className={`fit-button${busy ? ' stop' : ''}`}
            title={busy ? busyTask === 'fit' ? 'Stop and keep the latest displayed parameter values; std requires a completed fit' : 'Stop the calculation' : 'Fit current model (⌘/Ctrl+Enter)'}
            aria-keyshortcuts={busy ? undefined : 'Meta+Enter Control+Enter'}
            disabled={busy ? busyTask === 'fit' && !progress : !ready || !hasSpectrum || !!error || !!picking}
            onClick={() => busy ? stop(busyTask === 'fit') : void fit()}>
            <span className={`fit-action-icon${busy ? ' spinner' : ''}`} aria-hidden="true"/>
            {busy ? busyTask === 'fit' ? 'Stop & keep' : 'Stop calculation' : 'Fit spectrum'}
          </button>
          <button className="cancel-fit" aria-label="Cancel fit" title="Discard this fit and restore its starting parameters and previous results"
            aria-hidden={!busy || busyTask !== 'fit'} disabled={!busy || busyTask !== 'fit'} tabIndex={busy && busyTask === 'fit' ? 0 : -1}
            onClick={() => stop()}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
        </div><span id="fit-results-toggle"/></div>
        <section className={`status-panel ${error || fileError ? 'status-error' : ''}`} aria-label="Fit status"><h3>Status</h3>{(restoreError || autosaveError) && <span className="local-save-warning" role="alert" title={restoreError || autosaveError}>Local save unavailable · Save project</span>}<div className={`status-current ${hasFitWarnings?'has-fit-warnings':''}`} title={hasFitWarnings&&!actionNotice.text?fitSummary:undefined} role={error || fileError ? 'alert' : 'status'} aria-live="polite">{fileError || error || (picking ? `${picking.stage + 1}/${picking.kind === 'Singlet' ? 2 : 3} · ${picking.index === null ? 'Adding site' : 'Redefining site'}` : busy ? busyTask === 'fold' ? 'Finding fold center…' : busyTask === 'load' ? 'Loading spectrum…' : `Fitting${progress?.search_start ? ` · start ${progress.search_start}/${progress.search_starts}` : ''} · ${progress?.iteration ?? 0} ${(progress?.iteration ?? 0) === 1 ? 'iteration' : 'iterations'}` : actionNotice.text ? actionNotice.text : hasFitWarnings ? <>{result!.converged?'Converged':'Stopped'} <button className="fit-warning-link" onClick={openFitWarnings} aria-label={`${result!.warnings.length} warning${result!.warnings.length===1?'':'s'}`}>⚠ {result!.warnings.length} warning{result!.warnings.length===1?'':'s'}</button></> : result ? `${result.converged ? 'Converged' : 'Stopped'}${result.search ? ` · best of ${result.search.completed} starts` : ''} · ${result.iterations} ${result.iterations === 1 ? 'iteration' : 'iterations'}${elapsed == null ? '' : ` · ${elapsed.toFixed(0)} ms`}` : !ready ? 'Loading…' : log.at(-1))}</div>{fileError && <button className="clear-error" onClick={() => setFileError('')}>Dismiss</button>}{error && <button className="clear-error" onClick={() => { setError(''); setEngineVersion(v => v + 1); }}>Retry</button>}{!picking && ((busy && busyTask === 'fit') || result) && <FitDetails>{!picking && ((busy && busyTask === 'fit') || result) && <dl className="status-stats"><div><dt title="Sum of squared residuals; count weighting divides each term by the observation">{project.weighting === 'counts' ? 'Weighted SSE' : 'SSE'}</dt><dd data-testid="objective">{evaluation?.objective.toExponential(3) ?? '—'}</dd></div>{!busy && result && <div><dt title="Objective divided by the residual degrees of freedom">Reduced</dt><dd>{fmt(result.reduced_objective)}</dd></div>}{!busy&&result&&<>{result.search&&<div><dt>Search</dt><dd>Best of {result.search.completed} starts</dd></div>}<div><dt>Iterations</dt><dd>{result.iterations}</dd></div>{elapsed!=null&&<div><dt>Time</dt><dd>{elapsed.toFixed(0)} ms</dd></div>}</>}</dl>}</FitDetails>}</section>
      </div>
      <main className="center-panel" id="model-workspace" role="tabpanel" aria-label={hasSpectrum ? undefined : "Empty project"} aria-labelledby={hasSpectrum ? `model-${modelEntry.id}` : undefined}><div className="document-bar"><div><span className="file-icon" aria-hidden="true">▤</span><strong title={filename}>{filename}</strong>{filename === 'Synthetic iron mixture' && <span className="demo-badge">SYNTHETIC</span>}{hasSpectrum && <span className="document-model-name" title={modelEntry.name}>{modelEntry.name}</span>}{hasSpectrum&&!result&&!busy&&!picking&&<span className="model-needs-fit" title="The current model has no completed fit. Fit to update values and std.">Needs fit</span>}</div></div>
        {hasSpectrum ? <Plot highlightedSite={picking ? picking.index ?? project.sites.length : hoveredSite ?? selected} project={progress ? { ...progress.project, spectrum: project.spectrum } : project} evaluation={evaluation} fitted={!!result && !picking} picking={picking} onPick={point => { void commitPick(point); }} onHover={hoverPick} onCancelPick={cancelPick}/> : <div className="empty-project">
          <FileActionIcon action="new"/><h2>Start a new project</h2>
          <p>Add spectra or open a saved project to begin.</p>
          <div><button className="primary" disabled={!canCalculate} onClick={() => fileInput.current?.click()}>Add spectra</button><button disabled={!canCalculate} onClick={() => void openProject()}>Open project</button></div>
          {history.past.length > 0 && <p className="empty-project-undo">Undo restores your previous project.</p>}
        </div>}


    <ResultsPane active={!smallScreen||mobilePane==='plot'} onExpandedChange={expanded=>{if(expanded)setMobilePane('plot');}} controlsId="fit-results-toggle" summary={`${project.sites.length} ${project.sites.length === 1 ? 'site' : 'sites'} · ${busy && busyTask === 'fit' ? 'Fitting' : result ? `${result.converged?'Converged':'Fit completed'}${result.warnings.length?` with ${result.warnings.length} warning${result.warnings.length===1?'':'s'}`:''}` : 'Not fitted'}`} height={layout.resultsHeight} onHeightChange={resultsHeight => setLayout(l => ({ ...l, resultsHeight }))}>{resultsContent}</ResultsPane>
      </main>
      <button className="sidebar-toggle options-toggle" aria-label={optionsVisible ? 'Collapse fitting options' : 'Show fitting options'} aria-expanded={optionsVisible} aria-controls="fitting-options-sidebar" title={optionsVisible ? 'Hide fitting options' : 'Show fitting options'} onClick={optionsVisible ? closeOptions : openOptions}><SidebarIcon side="right" expanded={optionsVisible}/></button>
      <aside className="right-panel" id="fitting-options-sidebar" aria-label="Fitting options sidebar"><div className="options-pane-heading"><span>Fitting options</span></div><FittingTabs selected={tab} onSelect={setTab}/><div className="options-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}><NumericScope scopeKey={`${numericContext}:${tab}:${['Bnds','xVBF'].includes(tab)?`${selected}:${project.sites.length}`:'model'}`}>{!hasSpectrum ? <><p className="no-spectra">Add a spectrum to edit fitting options.</p>{tab === 'Gen' && <fieldset className="bare" disabled={!canCalculate}>{calibrationPanel}</fieldset>}</> : <fieldset className="bare" disabled={!canCalculate}>
        {tab === 'Gen' && <>
          {calibrationPanel}
          <section className="option-section"><h3>General</h3><label className="stack-label">Spectrum model<select aria-label="Spectrum model" value={project.mode} onChange={e => changeMode(e.target.value as Project['mode'])}><option value="thin">Thin absorber</option><option value="transmission">Full transmission integral</option></select></label></section>
          <section className="option-section"><div className="section-heading"><h3>Background</h3></div><label className="inline-label">Polynomial<select aria-label="Background order" value={project.background.length - 1} onChange={e => edit(p => ({ ...p, background: Array.from({ length: Number(e.target.value) + 1 }, (_, i) => p.background[i] ?? parameter(0)) }))}>{[0,1,2,3].map(i => <option value={i} key={i}>{i === 0 ? 'Constant' : `Order ${i}`}</option>)}</select></label>{project.background.map((p, i) => <div className="param-row" key={i}><label>{i === 0 ? 'I₀' : `b${i}`}</label><Numeric label={`Background ${i}`} value={p.value} onChange={v => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, value: v! } : b) }))}/><input type="checkbox" aria-label={`Fit background ${i}`} checked={p.fit} onChange={e => edit(old => ({ ...old, background: old.background.map((b, j) => i === j ? { ...b, fit: e.target.checked } : b) }))}/></div>)}</section>
          <section className="option-section"><h3>Velocity direction</h3><label className="check-label" title="Negate calibrated velocities; applies to every model of this spectrum."><input type="checkbox" aria-label="Reverse velocity axis" checked={!!spectrumEntry.velocityReversed} onChange={() => { const next = reverseVelocity(history.present); history.set(next); setEvaluation(null); setRestoreError(''); setError(''); append(next.velocityReversed ? 'Reversed calibrated velocities (v → −v) for this spectrum and cleared its model fits.' : 'Restored the original velocity direction and cleared this spectrum’s model fits.'); }}/>Reverse velocity axis</label>{spectrumEntry.velocityReversed && <p className="calibration-note">Applied after calibration to all models of this spectrum.</p>}<ImportDetails info={spectrumEntry.importInfo}/></section>

          {project.mode === 'transmission' && <section className="option-section"><h3>Source profile</h3><button className="full-width" title="Fit a known-width singlet to determine the source line shape; velocity calibration is under Folding & calibration" onClick={() => setSourceCalibrationOpen(true)}>Calibrate source…</button>{project.source_gaussians ? <><p className="calibration-note">Calibrated {project.source_gaussians.length}-Gaussian source. The complete shape is used in the transmission integral.</p><button className="full-width" title="Replace the Gaussian mixture with the FWHM and Lorentzian-squared source controls" onClick={() => edit(p => { const { source_gaussians: _source, ...rest } = p; return rest; })}>Use simple source</button></> : <><label className="inline-label">FWHM (mm/s)<Numeric label="Source FWHM" value={project.source_fwhm} onChange={v => edit(p => ({ ...p, source_fwhm: v! }))}/></label><label className="check-label"><input type="checkbox" checked={project.source_squared} onChange={e => edit(p => ({ ...p, source_squared: e.target.checked }))}/>Lorentzian-squared source</label></>}</section>}

        </>}
        {tab === 'Bnds' && !hasCurrent && <section className="option-section"><h3>Parameter bounds</h3><p className="body-note">No site selected.</p></section>}
        {tab === 'Bnds' && hasCurrent && <>
          <section className="option-section"><div className="site-options-heading"><h3>Bounds</h3><SiteOptionsPicker sites={project.sites} selected={selected} onSelect={index=>{setSelected(index);setTargetKey('fwhm');}}/></div><div className="bounds-header" title="Leave a bound empty for no limit"><span>Parameter</span><span>Lower</span><span>Upper</span></div>{displayKeys(current).map(k => <div className="bounds-row" key={k}><label>{labels[k]}</label><Numeric nullable label={`${labels[k]} lower bound`} value={current.params[k].min} onChange={v => updateParam(k, { min: v })}/><Numeric nullable label={`${labels[k]} upper bound`} value={current.params[k].max} onChange={v => updateParam(k, { max: v })}/></div>)}</section>
          <section className="option-section" title="Target = factor × source. Target bounds also constrain the source."><h3>Parameter links</h3><label className="stack-label">Target in selected site<select aria-label="Link target" value={targetKey} onChange={e => setTargetKey(e.target.value)}>{displayKeys(current).map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label><label className="stack-label">Source parameter<select aria-label="Link source" value={linkSource} onChange={e => setLinkSource(e.target.value)}><option value="">Choose source…</option>{linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label><label className="inline-label">Factor<Numeric label="Link factor" value={linkFactor} onChange={v => setLinkFactor(v!)}/></label><button className="full-width" disabled={!linkSource || !linkOptions.some(o => o.id === linkSource)} onClick={() => { updateParam(targetKey, { link: { target: linkSource, factor: linkFactor } }); append(`${labels[targetKey]} linked to ${linkSource}.`); }}>Apply link</button><div className="link-list">{keys(current).filter(k => current.params[k].link).map(k => <div key={k}><span>{labels[k]} = {current.params[k].link!.factor} × {current.params[k].link!.target}</span><button aria-label={`Remove ${labels[k]} link`} onClick={() => updateParam(k, { link: null })}>×</button></div>)}</div></section>
        </>}
        {tab === 'xVBF' && <XvbfEditor key={`${modelEntry.id}-${warningInspection.revision}`} initialView={warningInspection.view} onSelect={index=>{setSelected(index);setTargetKey('fwhm');}} onCorrelation={()=>setCorrelationOpen(true)} project={progress?.project ?? project} selected={selected} result={result} onSite={site=>edit(p=>({...p,sites:p.sites.map((old,i)=>i===selected?site:old)}))}/>}
        {tab === 'Opt' && <>
          <section className="option-section"><h3>Fitting options</h3><label className="stack-label">Solver<select disabled value="trf"><option value="trf">Trust-region reflective</option></select></label><label className="stack-label">Derivatives<select aria-label="Derivatives" aria-describedby="derivatives-help" value={project.derivative_method ?? 'analytical'} onChange={e => edit(p => ({ ...p, derivative_method: e.target.value as Project['derivative_method'] }))}><option value="numerical">Numerical</option><option value="analytical">Analytical</option></select></label><p id="derivatives-help" className="fit-starts-help">Analytical derivatives support thin and transmission models, source calibration, and distributions. Numerical fallback handles nonsmooth limits. Coincident thin components are separated within their free parameter bounds before fitting.</p>{project.mode === 'thin' && <><label className="stack-label">Thin fitting<select aria-label="Thin fitting" aria-describedby="thin-fitting-help" disabled={project.derivative_method === 'numerical'} value={project.derivative_method === 'numerical' ? 'joint' : project.thin_solver ?? 'variable_projection'} onChange={e => edit(p => ({ ...p, thin_solver: e.target.value as Project['thin_solver'] }))}><option value="variable_projection">Variable projection (default)</option><option value="joint">Joint fitting</option></select></label><p id="thin-fitting-help" className="fit-starts-help">{project.derivative_method === 'numerical' ? 'Numerical derivatives use joint fitting. Select analytical derivatives to use variable projection.' : 'Variable projection is the default for thin models. It solves intensities and background separately to reduce the nonlinear fit. Joint fitting remains available for comparison.'}</p></>}<label className="stack-label">Residual weighting<select aria-label="Residual weighting" value={project.weighting} onChange={e => edit(p => ({ ...p, weighting: e.target.value as Project['weighting'] }))}><option value="unweighted">Unweighted</option><option value="counts">1 / observed counts</option></select></label><label className="stack-label" title="Refine several deterministic starting models and keep the lowest objective. More starts take longer and do not guarantee a global optimum.">Starting models<select aria-label="Starting models" aria-describedby="starting-models-help" value={project.search_starts ?? 1} onChange={e => edit(p => ({ ...p, search_starts: Number(e.target.value) }))}>{[1,4,8,12,24,32].map(n => <option key={n} value={n}>{n === 1 ? '1 · Current model' : `${n} · Explore alternatives`}</option>)}</select></label><p id="starting-models-help" className="fit-starts-help">Tries different initial parameter guesses for the same sites and keeps the lowest fit error. 1 uses your current guesses only. More starts take longer.</p>{(project.search_starts ?? 1) > 1 && <><label className="stack-label">Search strategy<select aria-label="Search strategy" aria-describedby="search-strategy-help" value={project.search_strategy ?? 'full'} onChange={e => edit(p => ({ ...p, search_strategy: e.target.value as Project['search_strategy'] }))}><option value="full">Full exploration</option><option value="selective">Selective continuation</option></select></label><p id="search-strategy-help" className="fit-starts-help">Selective continuation stops less promising starts early to save time. Full exploration can find a better minimum.</p></>}<label className="inline-label">Max. iterations<Numeric label="Maximum iterations" value={project.max_iterations} onChange={v => edit(p => ({ ...p, max_iterations: v! }))}/></label></section>

        </>}
      </fieldset>}</NumericScope></div></aside>
    </div>

      </div>
    </div>
    <AppFooter/>
    <SidebarScrollbars/>

    {resultsDialogOpen&&<ResultsDialog context={`${filename} · ${modelEntry.name}`} onClose={()=>{setResultsDialogOpen(false);window.requestAnimationFrame(()=>{const expand=document.querySelector<HTMLButtonElement>('.results-actions .expand-results');if(expand?.getClientRects().length)expand.focus();else document.querySelector<HTMLElement>('#site-inspector .site-select[aria-pressed=true],#site-inspector select[aria-label="Selected site"]')?.focus();});}}>{resultsContent}</ResultsDialog>}
    {comparisonSpectrum && <CompareModelsDialog spectrum={comparisonSpectrum} activeModelId={comparisonSpectrum.activeModelId} evaluate={evaluateComparison} onClose={() => setComparisonSpectrum(null)}/>}
    {correlationOpen&&current.xvbf&&<CorrelationDialog model={progress?.project.sites[selected]?.xvbf??current.xvbf} onClose={()=>setCorrelationOpen(false)}/>}
    {foldingOpen && raw && <FoldingDialog counts={raw} initialCenter={cal.center} onClose={() => setFoldingOpen(false)} onApply={(center, automatic) => { const next = applyRawCalibration(history.present, { ...cal, center, folding: true, autoFold: automatic }); history.set(next); setRestoreError(''); setError(''); if (next.project !== project) setEvaluation(null); append(`Applied folding at center ${center}.`); }}/>}
    {reportOptions && evaluation && result && <FitReportDialog input={{project,evaluation,result,options:reportOptions,projectName:workspace.name,spectrumName:spectrumEntry.name,modelName:modelEntry.name,application:`MossA ${buildInfo.version}`,calibration:raw?cal:undefined,velocityReversed:spectrumEntry.velocityReversed}} onClose={()=>setReportOptions(null)}/>}
    {figureExport && evaluation && <FigureExportDialog project={project} evaluation={evaluation} fitted={!!result} result={result} name={`${spectrumEntry.name} · ${modelEntry.name}`} viewRange={figureExport.viewRange} initial={figureExport.settings} sitesRefreshed={figureExport.settings.sitesRefreshed} onSettingsChange={persistFigure} onClose={(settings:FigureSettings) => {persistFigure(settings);setFigureExport(null);}}/>}
    {sourceCalibrationOpen && <SourceCalibrationDialog project={project} filename={filename} cal={cal} spectrumImportInfo={spectrumEntry.importInfo} onClose={() => setSourceCalibrationOpen(false)} onApply={value => { const next = applySourceCalibration(history.present, value); history.set(next); setError(''); setRestoreError(''); if (next.project !== project) setEvaluation(null); append(`Source calibrated from ${value.reference.name}.`); }}/>}
    <dialog className="help-dialog" ref={helpDialog} aria-labelledby="help-title">
      <div className="help-heading"><h2 id="help-title">MossA 2 help</h2><form method="dialog"><button aria-label="Close help">×</button></form></div>
      <p><a href="./manual/" target="_blank" rel="noreferrer">Open the MossA 2 manual ↗</a> for tutorials, detailed workflows, and the scientific reference.</p>
      <details className="help-section" open>
        <summary>Find the controls and velocity calibration</summary>
        <p>Start with <strong>Fitting options → General → Folding &amp; calibration</strong> for raw-count data. It is the first section in General. The <strong>Fit options</strong> tab contains solver settings; velocity calibration is in <strong>General</strong>.</p>
        <ul><li><strong>Wide desktop:</strong> use the right Fitting options panel; choose <strong>Show fitting options</strong> at the graph’s right edge if hidden.</li><li><strong>Laptop:</strong> select <strong>Fitting options</strong> above the editor shared with Sites, then <strong>General</strong>.</li><li><strong>Tablet or narrow window:</strong> choose <strong>Fitting options → General</strong>. A tall portrait tablet keeps a live graph above the editor; select <strong>Spectrum</strong> for a larger graph and Results. Shorter screens show one view at a time.</li></ul>
        <p>The far-left project sidebar selects spectra and models. Sites edits the selected model’s components. Results sits below the graph. Panels scroll independently; drag their dividers to adjust the available space. See <a href="./manual/getting-started/workspace/" target="_blank" rel="noreferrer">the workspace tour ↗</a>.</p>
      </details>
      <details className="help-section" open>
        <summary>Folding and velocity calibration</summary>
        <p>Under <strong>Fitting options → General → Folding &amp; calibration</strong>, select + (<strong>Add calibration preset</strong>) → <strong>From reference file…</strong>. In <strong>Velocity calibration</strong>, choose <strong>Open reference spectrum</strong>, or <strong>Use current raw spectrum</strong> if it is the standard. This does not replace the sample.</p>
        <p>Set <strong>Initial max. velocity</strong> and <strong>Reference BHF (T)</strong> for the α-Fe standard. Enable <strong>Sinusoidal drive</strong> for a sinusoidal acquisition; leave it unchecked for linear drive. Enable <strong>Fold reference channels</strong> only for an unfolded reference. Use <strong>Automatic fold center</strong>, or disable it to enter a manual center. Choose <strong>Fit reference</strong> and inspect the curve, residuals, scale, and warnings.</p>
        <p>Choose <strong>Continue with calibration</strong>, enter <strong>Preset name</strong>, then <strong>Save preset</strong>. Saving or selecting a preset immediately calibrates the current raw spectrum. <strong>Use for new imports</strong> sets the default for later raw-count files. + → <strong>Define manually…</strong> enters a known scale; <strong>Save current settings…</strong> creates a copy.</p>
        <p>For an existing preset, use <strong>Edit preset… → Recalibrate from reference…</strong>, then <strong>Use revised calibration → Save changes to preset</strong>. Saving applies the revised calibration to the current raw spectrum. The ⋯ control (<strong>Manage calibration presets</strong>) opens the list for renaming, Edit, or Remove. Cancel, the close button, or Escape discards unsaved preset edits.</p>
        <p>Use <strong>Fold spectrum</strong> to enable or disable folding immediately. Folding is enabled by default for raw-count imports. For a raw sample with folding enabled, <strong>Inspect this spectrum’s folding…</strong> opens <strong>Folding alignment</strong>. Inspect the paired halves, enter <strong>Fold center</strong> or use <strong>Find automatically</strong>. Center changes apply immediately; choose <strong>Done</strong> to close. Centers use 1-based integer or half-integer channels. Do not fold already folded data. Velocity-column files retain their supplied axis. <strong>General → Velocity direction → Reverse velocity axis</strong> reverses calibrated velocity for all models of that spectrum.</p>
        <p>Changed folding or calibration invalidates obsolete fits in every model of that spectrum; reapplying identical settings retains matching fits. Other spectra keep their settings. <strong>Calibrate source…</strong> determines a line shape, not velocity. Follow <a href="./manual/guides/folding-and-calibration/" target="_blank" rel="noreferrer">folding and velocity calibration ↗</a> for reference assumptions and checks.</p>
      </details>
      <details className="help-section">
        <summary>Sites and graph placement</summary>
        <p>In <strong>Sites</strong>, choose <strong>＋ Add</strong> to open <strong>New site</strong>. Choose <strong>Site type</strong> and <strong>Line profile</strong>, then <strong>Add with starting values</strong> for numeric editing or <strong>Define on graph</strong> for visual placement. Click position/depth, then half-width; a doublet needs its other line, a sextet its opposite outer line. A singlet needs only two points. <strong>Cancel</strong> or Escape leaves the model unchanged.</p>
        <p><strong>Redefine</strong> redraws the selected site while keeping its name, profile, fit flags, bounds, and links. Linked parameters continue following their sources. The <strong>Duplicate site</strong> icon copies and selects the site. Type and profile are under <strong>Site settings</strong>. Edit <strong>Site name</strong> above its parameters; Enter or clicking away applies, Escape cancels. Names support LaTeX such as <code>{'Fe$^{2+}$'}</code>. Click the color swatch to change its color.</p>
        <p>A short site list can be resized with its divider. Limited height or longer lists use a compact <strong>Site</strong> selector; the numbered count button shows the full list. Trash icons in Sites remove sites; Undo restores them.</p>
      </details>
      <details className="help-section">
        <summary>Graph navigation</summary>
        <p>Left drag zooms a rectangle. Ctrl/Command + left drag or right drag pans. One-finger touch drag pans; use <strong>Zoom in</strong> (+) and <strong>Zoom out</strong> (−) to zoom. Right click returns to the previous view; double right click resets. The mouse wheel zooms velocity around the pointer, keeping vertical limits fixed. <strong>Unzoom</strong> restores the previous view; <strong>Reset view</strong> restores the full view.</p>
        <p><strong>During site placement:</strong> a click or tap places a point; left drag, including Ctrl/Command + left drag or touch drag, zooms. Right drag still pans. Cancel placement to return to normal touch panning. With the graph focused, +/− zoom, arrow keys pan, 0/Home resets, and Backspace unzooms.</p>
        <p>Selecting a site emphasizes its outline; the total model stays solid and above site curves. <strong>Sites</strong> in the plot legend shows the individual curves; <strong>Fill sites</strong> shades them to the background. In full transmission these are display-scaled absorber profiles, not additive transmission components. Mouse coordinates appear while pointing at the plot. Their box moves only after sustained pointer overlap.</p>
      </details>
      <details className="help-section">
        <summary>Fitting and warnings</summary>
        <p>Under <strong>Fitting options → Fit options</strong>, choose <strong>Residual weighting</strong>, <strong>Starting models</strong>, and <strong>Max. iterations</strong>. <strong>Unweighted</strong> minimizes squared residuals; <strong>1 / observed counts</strong> divides each squared residual by its observation and requires strictly positive counts. Multiple starts explore alternative starting estimates; they do not guarantee a global optimum.</p>
        <p><strong>Fit spectrum</strong> or ⌘/Ctrl+Enter commits pending numeric edits and fits the current model. During fitting, <strong>Stop &amp; keep</strong> keeps the latest displayed parameters as the next starting model; std requires a completed fit. The × icon (<strong>Cancel fit</strong>) restores the starting model and any previous fit results.</p>
        <p>Read Status, residuals, parameters, and warnings together. A warning count opens <strong>Fit warnings</strong>; <strong>Inspect parameter →</strong> opens the relevant editor when offered. <strong>Fit details</strong> shows iterations, objective, timing, and search information automatically when space permits; otherwise open its disclosure. Convergence does not remove warnings.</p>
      </details>
      <details className="help-section">
        <summary>Editing, bounds, and undo</summary>
        <p>A checked Fit box lets a parameter vary; uncheck it to hold the value fixed. In <strong>Fitting options → Bounds</strong>, choose the intended <strong>Site</strong> and enter Lower/Upper limits; an empty bound means no user limit, subject to physical restrictions. For links, choose <strong>Target in selected site</strong>, <strong>Source parameter</strong>, and <strong>Factor</strong>, then <strong>Apply link</strong>: target = factor × source.</p>
        <p>Numeric fields show up to five significant digits; hover for full precision. An unchanged field preserves stored precision. Enter commits and keeps focus; Shift+Enter commits and moves to the next numeric field, skipping Fit boxes. Escape cancels the edit. Decimal points, unambiguous decimal commas, and the Unicode minus sign are accepted. Do not enter thousands separators; ambiguous values such as 1,234 need clarification.</p>
        <p>Undo/Redo keeps up to 50 committed model/data changes, including imports and completed fits. Use ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z outside editable fields; Ctrl+Y also redoes. Native text undo applies inside a field. Graph navigation does not consume undo steps. History starts fresh after reload and is not saved in project files.</p>
      </details>
      <details className="help-section">
        <summary>Results</summary>
        <p><strong>Results</strong> beside Fit spectrum toggles the table below the graph. Drag its divider or choose <strong>Expand results</strong> for the <strong>Expanded results</strong> dialog; Escape returns. Selecting a row opens that site for editing. The editor remains available while Results is docked.</p>
        <p>The table shows approximate <strong>1 std</strong> in parentheses in the last quoted digits: 0.12044(33) means 0.12044 ± 0.00033. <strong>fixed</strong> marks a held parameter; <strong>(—)</strong> means std unavailable (hover for the reason). <strong>Not fitted · fit to estimate std</strong> means the model needs fitting. Model/data changes clear obsolete errors; names and colors preserve matching fits. Errors use a local-Jacobian covariance estimate scaled by residual variance; active bounds or unidentifiable directions can prevent symmetric errors. These differ from MATLAB confidence intervals.</p>
        <p><strong>Intensity raw</strong> is the model’s raw intensity parameter. <strong>Fraction %</strong> is 100 × site intensity / total site intensity; in full transmission it is an absorber-intensity fraction, not a phase abundance. Fraction std includes correlations and is in percentage points. An exactly fixed ratio can have 0 std; a zero total intensity has undefined fractions. <strong>Lorentz mix</strong> is the editor’s <strong>L fraction</strong>, a shape parameter rather than an intensity percentage.</p>
      </details>
      <details className="help-section">
        <summary>Projects, spectra, and models</summary>
        <p>The far-left sidebar contains <strong>New project</strong>, <strong>Open project</strong>, and <strong>Save project</strong>. Expand it with <strong>Expand project sidebar</strong>. New project starts empty and replaces local autosave; Undo can restore the previous project while the session remains open. Save a portable project before starting another analysis.</p>
        <p><strong>Add spectra</strong> imports plain text with velocity/count columns or raw counts, plus the supported SPEC MCA and five-column SMS layouts. Imports copy the active model’s site/source settings and estimate a new background; they do not fit automatically. Use Open project for <code>.mossa</code> or older <code>.mossa.json</code> files. Matching fits reopen without optimization. MATLAB <code>.map</code> import is unavailable.</p>
        <p>Select a spectrum and a model in the sidebar. <strong>New model</strong> starts without sites; <strong>Duplicate model</strong> retains the selected fit and independent model settings. Right-click a model row for <strong>Duplicate model</strong>, <strong>Rename model</strong>, or <strong>Remove model</strong>; Shift+F10 opens the same menu. Double-click a spectrum or model name to rename it; Enter or clicking away applies, Escape cancels. Click the project title to rename the project. +/− acts on the corresponding spectrum or model list. Removal is undoable.</p>
      </details>
      <details className="help-section">
        <summary>Saving and autosave</summary>
        <p><strong>Save project</strong> or ⌘/Ctrl+S preserves all spectra, models, raw channels, presets, conventions, completed fits, and figure settings in a portable <code>.mossa</code> file. Save commits and validates pending edits first. The browser downloads a file each time. A new native project asks for a destination; subsequent saves in that session use its linked file. Opening a native project links Save to that file. The native <strong>Save project as</strong> icon in the sidebar (⌘/Ctrl+Shift+S) selects another destination.</p>
        <p>Autosave retains the committed project and layout locally. Browser storage belongs to the same browser, device, and app address; the native app has its own storage. Clearing it removes autosave. Running fits and placement previews are not saved; Stop &amp; keep commits its parameters for later saving. Keep portable project files as backups.</p>
      </details>
      <details className="help-section">
        <summary>Exporting data, figures, and reports</summary>
        <p><strong>Export</strong> in the header groups <strong>Spectrum data · CSV</strong>, <strong>Parameter table · CSV</strong>, <strong>Figure · SVG / PNG / EPS / PDF</strong>, and <strong>Fit report · PDF</strong>. <strong>Export parameters</strong> above Results also saves the parameter CSV. Parameter tables and reports require a current completed fit.</p>
        <p>In <strong>Export figure</strong>, choose <strong>Figure size</strong>, <strong>Velocity range</strong>, <strong>Legend</strong>, <strong>Residual</strong>, and <strong>Sites &amp; colors</strong>. <strong>Current velocity range</strong> copies horizontal graph bounds, without vertical zoom. Each model’s figure choices, including the selected range, survive reopening and are saved with the project. <strong>Reset</strong> restores defaults. Choose <strong>Format</strong>, then <strong>Download SVG/PNG/EPS/PDF</strong> in the browser or <strong>Save figure…</strong> in the native app.</p>
        <p><strong>Export fit report</strong> uses the model’s saved Figure settings for its graph and includes all sites in its parameter table. Use <strong>Download PDF</strong> or native <strong>Save report…</strong>. A report does not replace the editable project. See <a href="./manual/guides/saving-and-exporting/" target="_blank" rel="noreferrer">saving and exporting ↗</a>.</p>
      </details>
      <details className="help-section">
        <summary>Spectrum modes and source profiles</summary>
        <p><strong>Fitting options → General → Spectrum model</strong> chooses <strong>Thin absorber</strong> or <strong>Full transmission integral</strong>. They use different raw intensity units. Switching mode rescales intensities as starting estimates and requires a new fit. Full-transmission site curves are display-scaled absorber profiles, not additive transmitted components.</p>
        <p>For full transmission, scroll down General to <strong>Source profile → Calibrate source…</strong>. In <strong>Source-profile calibration</strong>, choose <strong>Open source reference</strong> or <strong>Use current spectrum</strong>, set <strong>Known absorber FWHM</strong>, <strong>Source model</strong>, and <strong>Initial source width</strong>, then <strong>Fit source reference</strong>. Review the curve, residuals, shape, and diagnostics before <strong>Apply source profile</strong>. Gaussian mixture supports one to three components. Applying updates only this model’s source, not its sample sites or shared velocity scale.</p>
        <p>The calibrated shape is normalized to unit area and zero centroid, then held fixed in sample fits. Fixed absorber width, velocity scale, and source shape uncertainties are not propagated. Use a matching known-width singlet reference. The squared source retains the original MossA width convention. To replace a Gaussian mixture with simple-source controls, choose <strong>Use simple source</strong>, then set <strong>FWHM (mm/s)</strong> and <strong>Lorentzian-squared source</strong> as appropriate. See <a href="./manual/guides/source-profiles/" target="_blank" rel="noreferrer">source profiles ↗</a> for assumptions and validation limits.</p>
      </details>
      <details className="help-section">
        <summary>xVBF distributions</summary>
        <p>Select a Lorentzian doublet, open <strong>Fitting options → xVBF</strong>, and check <strong>xVBF</strong>. Use <strong>CS</strong> and <strong>QS</strong> for component centers, widths, weights, and Fit boxes. The gear opens component bounds. <strong>Corr</strong> edits coupling and shows the joint CS–QS map; click it or <strong>Enlarge correlation plot</strong>, then <strong>Export SVG</strong>. Use the tab’s <strong>Site</strong> selector to change the site.</p>
        <p>The graph stays beside the editor on desktops/laptops and above it on tall portrait tablets. On shorter narrow screens, return to Spectrum. Distribution means appear as CS/QS in Results. Nonnegative weights sum to 100% separately; uncertainties include that normalization. Curves retain the original MossA Voigt approximation and width convention. Density contours are relative levels, not confidence regions. A single symmetric doublet cannot independently resolve both distribution widths and coupling; the initial QS width is fixed. See <a href="./manual/guides/xvbf/" target="_blank" rel="noreferrer">xVBF distributions ↗</a>.</p>
      </details>
      <details className="help-section">
        <summary>Compare models</summary>
        <p>In the expanded project sidebar, choose <strong>Compare models</strong> below Models. Select <strong>Simpler model</strong> and <strong>Larger model</strong> to compare curves, residuals, and fit summaries. For an added-site simulation test, duplicate the simpler model and append sites while retaining the original constraints; inspect the dialog’s eligibility explanation.</p>
        <p>Choose <strong>Measurement noise</strong>, <strong>Simulated spectra</strong>, <strong>Random seed</strong>, and <strong>CPU workers</strong>, then <strong>Run simulation test</strong>. Use actual integer counts for Poisson; the synthetic first-fit example uses Gaussian noise. Review warnings and <strong>Calculation and recovery details</strong>, then <strong>Export comparison report</strong> before closing. The test does not modify the project’s models. Read <a href="./manual/foundations/model-comparison/" target="_blank" rel="noreferrer">More sites? Understanding the F-test ↗</a> and <a href="./manual/guides/comparing-models/" target="_blank" rel="noreferrer">the comparison workflow ↗</a> for assumptions and interpretation.</p>
      </details>
      <details className="help-section">
        <summary>Display and help</summary>
        <p>The Aa control (<strong>Interface text size</strong>) chooses Compact, Comfortable, Large, or Extra large. Theme and text size stay inline where they fit; smaller screens group them with Manual and Help in the three-dot control (<strong>Manual and help</strong> or <strong>Display and help</strong>). Choices are saved on this device. Narrow headers shorten <strong>Add spectra</strong> to <strong>Add</strong> and <strong>Save project</strong> to <strong>Save</strong>.</p>
        {buildInfo.channel !== 'desktop' && <p>The browser’s <strong>Enter full screen</strong> control is in the header or three-dot menu. Choose <strong>Exit full screen</strong> or press Escape to return. The deployed browser app checks for updates without reloading automatically; use its version control in the footer to review changes and reload after saving.</p>}
        <p>The compact footer’s <strong>About</strong> control opens version and change information. All calculations run on this device. No spectrum is uploaded.</p>
      </details>
      <p><a href="https://github.com/CPrescher/MossA/tree/d201482b7990afbd0e2dcc23e306bfc8d60a5049" target="_blank" rel="noreferrer">MATLAB reference ↗</a></p><p className="help-credit">MossA 2 · C. Prescher · MIT</p>
    </dialog>
    {fitWarningsOpen&&result&&<FitWarningsDialog warnings={result.warnings} parameters={warningParameters(project,result)} onInspect={inspectWarningParameter} context={`${filename} · ${modelEntry.name}`} onClose={()=>{setFitWarningsOpen(false);window.requestAnimationFrame(()=>warningTrigger.current?.isConnected&&warningTrigger.current.focus());}}/>}
  </div></NumericScope>;
}

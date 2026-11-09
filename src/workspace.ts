import {decodeFigureSettings,type StoredFigureSettings} from './figure-settings';
import { useMemo, useRef } from 'react';
import { useSnapshotHistory } from './history';
import { decodeSession, defaultLayout, snapshotVersion, type Calibration, type FitSummary, type Snapshot } from './session';
import type { Project } from './types';
import { parameter } from './types';
import { newNuclearConstants } from './nuclear-constants.mjs';
import type { ImportInfo } from './io.mjs';
import { decodeCalibrationPresets, initialCalibrationPresets, type CalibrationPresets } from './calibration-presets';

export type ModelEntry = {
  id: string; name: string; project: Omit<Project, 'spectrum'>;
  selected: number; fit: FitSummary | null; fitElapsed: number | null;
  sourceReference?: Calibration['sourceReference'];
  figureExport?: StoredFigureSettings;
};
export type SpectrumEntry = {
  id: string; name: string; spectrum: Project['spectrum']; raw: number[] | null;
  cal: Calibration; models: ModelEntry[]; activeModelId: string;
  velocityReversed?: boolean; importInfo?: ImportInfo;
};
export type Workspace = CalibrationPresets & { name: string; spectra: SpectrumEntry[]; activeSpectrumId: string };
export const entryId = () => globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function activeSpectrum(workspace: Workspace) {
  return workspace.spectra.find(s => s.id === workspace.activeSpectrumId)!;
}
export function activeModel(workspace: Workspace) {
  const spectrum = activeSpectrum(workspace);
  return spectrum.models.find(m => m.id === spectrum.activeModelId)!;
}
export function modelSnapshot(spectrum: SpectrumEntry, model: ModelEntry): Snapshot {
  return { project: { ...model.project, spectrum: spectrum.spectrum }, raw: spectrum.raw,
    cal: { ...spectrum.cal, ...(model.sourceReference ? { sourceReference: model.sourceReference } : {}) }, filename: spectrum.name,
    selected: model.selected, fit: model.fit, fitElapsed: model.fitElapsed,
    ...(spectrum.velocityReversed ? { velocityReversed: true } : {}), ...(spectrum.importInfo ? { importInfo: spectrum.importInfo } : {}) };
}
export function activeSnapshot(workspace: Workspace) { return modelSnapshot(activeSpectrum(workspace), activeModel(workspace)); }

function modelFromSnapshot(snapshot: Snapshot, name = 'Model 1'): ModelEntry {
  const { spectrum: _spectrum, ...project } = snapshot.project;
  return { id: entryId(), name, project, selected: snapshot.selected, fit: snapshot.fit ?? null,
    fitElapsed: snapshot.fitElapsed ?? null, ...(snapshot.cal.sourceReference ? { sourceReference: snapshot.cal.sourceReference } : {}) };
}
export function spectrumFromSnapshot(snapshot: Snapshot): SpectrumEntry {
  const model = modelFromSnapshot(snapshot), { sourceReference: _source, ...cal } = snapshot.cal;
  return { id: entryId(), name: snapshot.filename, spectrum: snapshot.project.spectrum,
    raw: snapshot.raw, cal, models: [model], activeModelId: model.id,
    ...(snapshot.velocityReversed ? { velocityReversed: true } : {}), ...(snapshot.importInfo ? { importInfo: snapshot.importInfo } : {}) };
}
export function workspaceFromSnapshot(snapshot: Snapshot): Workspace {
  const spectrum = spectrumFromSnapshot(snapshot);
  return { name: 'Untitled project', spectra: [spectrum], activeSpectrumId: spectrum.id, ...initialCalibrationPresets(snapshot.cal) };
}
// Keep one empty editing slot so the editor has a model before the first import.
// It contains no observations and is replaced by the first imported spectrum.
export function freshWorkspace(): Workspace {
  const constants = newNuclearConstants();
  return workspaceFromSnapshot({
    project: { nuclear_constants: constants, spectrum: { x: [], y: [] }, sites: [], background: [parameter(0)], mode: 'thin', source_fwhm: .097, source_squared: false, weighting: 'unweighted', max_iterations: 200 },
    raw: null, cal: { nuclear_constants: constants, max: 10, shift: 0, sinusoidal: false, folding: true, center: 256.5 },
    filename: 'No spectrum loaded', selected: 0, fit: null, fitElapsed: null,
  });
}
export function appendSpectra(workspace: Workspace, snapshots: Snapshot[]): Workspace {
  if (!snapshots.length) return workspace;
  const entries = snapshots.map(spectrumFromSnapshot);
  return { ...workspace, spectra: [...workspace.spectra.filter(s => s.spectrum.x.length), ...entries], activeSpectrumId: entries[0].id };
}

// Observations and velocity preprocessing belong to the spectrum. Source shape,
// sites, solver settings, and fit results belong to each independent model.
export function updateActiveSnapshot(workspace: Workspace, snapshot: Snapshot): Workspace {
  const old = activeSpectrum(workspace), previousModel = activeModel(workspace), { spectrum, ...candidate } = snapshot.project;
  const sameProject = Object.keys(candidate).length === Object.keys(previousModel.project).length && Object.entries(candidate).every(([key, value]) => value === previousModel.project[key as keyof typeof candidate]);
  const project = sameProject ? previousModel.project : candidate;
  const { sourceReference, ...cal } = snapshot.cal;
  const changedData = spectrum !== old.spectrum;
  return { ...workspace, spectra: workspace.spectra.map(s => s.id !== old.id ? s : {
    ...s, name: snapshot.filename, spectrum, raw: snapshot.raw, cal, velocityReversed: snapshot.velocityReversed, importInfo: snapshot.importInfo,
    models: s.models.map(m => { const { sourceReference: _oldSource, ...rest } = m; return m.id === s.activeModelId ? { ...rest, project, selected: snapshot.selected,
      ...(sourceReference ? { sourceReference } : {}), fit: snapshot.fit ?? null, fitElapsed: snapshot.fit ? snapshot.fitElapsed ?? null : null } : changedData ? {
      ...m, project: snapshot.raw ? { ...m.project, nuclear_constants: project.nuclear_constants } : m.project,
      fit: null, fitElapsed: null,
    } : m; }),
  }) };
}
export function selectEntry(workspace: Workspace, spectrumId: string, modelId?: string): Workspace {
  const target = workspace.spectra.find(s => s.id === spectrumId);
  if (!target || (modelId && !target.models.some(m => m.id === modelId))) return workspace;
  if (workspace.activeSpectrumId === spectrumId && (!modelId || target.activeModelId === modelId)) return workspace;
  return { ...workspace, activeSpectrumId: spectrumId, spectra: modelId ? workspace.spectra.map(s => s.id === spectrumId ? { ...s, activeModelId: modelId } : s) : workspace.spectra };
}
function uniqueName(base: string, names: string[]) {
  let name = base, n = 2;
  while (names.includes(name)) name = `${base} ${n++}`;
  return name;
}
export function addModel(workspace: Workspace, duplicate: boolean, modelId?: string): Workspace {
  const spectrum = activeSpectrum(workspace), current = modelId ? spectrum.models.find(m => m.id === modelId) : activeModel(workspace);
  if (!current) return workspace;
  if (spectrum.models.length >= 256 || workspace.spectra.reduce((n, s) => n + s.models.length, 0) >= 4096) return workspace;
  const model: ModelEntry = duplicate ? { ...structuredClone(current), id: entryId(), name: uniqueName(`${current.name} copy`, spectrum.models.map(m => m.name)) } : {
    ...modelFromSnapshot(activeSnapshot(workspace)), name: uniqueName('New model', spectrum.models.map(m => m.name)),
    project: { ...structuredClone(current.project), sites: [], background: current.project.background.map(p => ({ ...p, link: null })) }, selected: 0, fit: null, fitElapsed: null,
  };
  return { ...workspace, spectra: workspace.spectra.map(s => s.id === spectrum.id ? { ...s, models: [...s.models, model], activeModelId: model.id } : s) };
}
export function removeModel(workspace: Workspace, modelId?: string): Workspace {
  const spectrum = activeSpectrum(workspace);
  const targetId = modelId ?? spectrum.activeModelId;
  if (spectrum.models.length === 1) return workspace;
  const index = spectrum.models.findIndex(m => m.id === targetId);
  if (index < 0) return workspace;
  const models = spectrum.models.filter(m => m.id !== targetId);
  return { ...workspace, spectra: workspace.spectra.map(s => s.id === spectrum.id ? { ...s, models, activeModelId: targetId === spectrum.activeModelId ? models[Math.max(0, index - 1)].id : spectrum.activeModelId } : s) };
}
export function removeSpectrum(workspace: Workspace, spectrumId = workspace.activeSpectrumId): Workspace {
  const index = workspace.spectra.findIndex(s => s.id === spectrumId);
  if (index < 0) return workspace;
  if (workspace.spectra.length === 1) {
    if (!activeSpectrum(workspace).spectrum.x.length) return workspace;
    const { spectra, activeSpectrumId } = freshWorkspace();
    return { ...workspace, spectra, activeSpectrumId };
  }
  const spectra = workspace.spectra.filter(s => s.id !== spectrumId);
  return { ...workspace, spectra, activeSpectrumId: spectrumId === workspace.activeSpectrumId ? spectra[Math.max(0, index - 1)].id : workspace.activeSpectrumId };
}
export function renameEntry(workspace: Workspace, kind: 'project' | 'spectrum' | 'model', name: string, modelId?: string): Workspace {
  name = name.trim().slice(0, 160);
  if (!name) return workspace;
  if (kind === 'project') return name === workspace.name ? workspace : { ...workspace, name };
  const target = activeSpectrum(workspace).models.find(m => m.id === (modelId ?? activeSpectrum(workspace).activeModelId));
  if (kind === 'model' && !target) return workspace;
  if (name === (kind === 'spectrum' ? activeSpectrum(workspace).name : target!.name)) return workspace;
  return { ...workspace, spectra: workspace.spectra.map(s => s.id !== workspace.activeSpectrumId ? s : kind === 'spectrum' ? { ...s, name } : {
    ...s, models: s.models.map(m => m.id === target!.id ? { ...m, name } : m),
  }) };
}

export function decodeWorkspace(value: unknown): Workspace {
  const w = value as Workspace;
  const validText = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 1000;
  if (!w || !validText(w.name) || !Array.isArray(w.spectra) || !w.spectra.length || w.spectra.length > 1000) throw new Error('Invalid project collection.');
  const ids = new Set<string>();
  const checkId = (id: string) => { if (!validText(id) || ids.has(id)) throw new Error('Invalid or duplicate project entry ID.'); ids.add(id); };
  let count = 0;
  const spectra = w.spectra.map(s => {
    checkId(s.id);
    if (!validText(s.name) || !Array.isArray(s.models) || !s.models.length || s.models.length > 256 || (count += s.models.length) > 4096) throw new Error('Invalid spectrum models.');
    const models = s.models.map(m => {
      checkId(m.id);
      if (!validText(m.name)) throw new Error('Invalid model name.');
      const snapshot = modelSnapshot(s, m);
      const decoded = decodeSession(JSON.stringify({ version: snapshotVersion(snapshot), snapshot, layout: defaultLayout, fit: m.fit, elapsed: m.fitElapsed }), true);
      const { spectrum: _data, ...project } = decoded.snapshot.project;
      const figureExport=decodeFigureSettings(m.figureExport,decoded.snapshot.project);
      return { id: m.id, name: m.name, project, ...(figureExport?{figureExport}:{}), selected: decoded.snapshot.selected, fit: decoded.fit, fitElapsed: decoded.fit ? decoded.elapsed : null,
        ...(decoded.snapshot.cal.sourceReference ? { sourceReference: decoded.snapshot.cal.sourceReference } : {}) };
    });
    if (!models.some(m => m.id === s.activeModelId)) throw new Error('Invalid selected model.');
    return { ...s, models };
  });
  if (spectra.some(s => !s.spectrum.x.length) && (spectra.length !== 1 || spectra[0].models.length !== 1)) throw new Error('An empty project must have a single editing slot.');
  if (!spectra.some(s => s.id === w.activeSpectrumId)) throw new Error('Invalid selected spectrum.');
  return { name: w.name, spectra, activeSpectrumId: w.activeSpectrumId, ...decodeCalibrationPresets(w, spectra[0].cal) };
}

export function useWorkspaceHistory(initial: () => Workspace) {
  // Entries are immutable. Comparing by identity avoids serializing every
  // spectrum's observations whenever the user changes tabs.
  const documents = useRef(new WeakMap<Workspace, object>());
  const collection = useSnapshotHistory(initial, true);
  const documentFor = (workspace: Workspace) => {
    let document = documents.current.get(workspace);
    if (!document) { document = {}; documents.current.set(workspace, document); }
    return document;
  };
  const setWorkspace = (value: Workspace, record = true, newDocument = false) => {
    const document = newDocument ? {} : documentFor(collection.present);
    documents.current.set(value, document);
    collection.set(value, record);
    return document;
  };
  const present = useMemo(() => activeSnapshot(collection.present), [collection.present]);
  return { ...collection, workspace: collection.present, present, document: documentFor(collection.present),
    past: collection.past.map(activeSnapshot), future: collection.future.map(activeSnapshot),
    set: (snapshot: Snapshot, record = true) => setWorkspace(updateActiveSnapshot(collection.present, snapshot), record),
    setWorkspace,
  };
}

/** Appearance changes preserve the scientific model and completed fit by identity. */
export function updateFigureSettings(workspace:Workspace,modelId:string,figureExport:StoredFigureSettings):Workspace {
 const model=workspace.spectra.flatMap(s=>s.models).find(m=>m.id===modelId);
 if(!model||JSON.stringify(model.figureExport)===JSON.stringify(figureExport))return workspace;
 return {...workspace,spectra:workspace.spectra.map(s=>s.models.some(m=>m.id===modelId)?{...s,models:s.models.map(m=>m.id===modelId?{...m,figureExport}:m)}:s)};
}

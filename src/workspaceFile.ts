import { createProjectFile, openProjectFile } from './projectFile';
import { activeSnapshot, decodeWorkspace, modelSnapshot, workspaceFromSnapshot, type Workspace } from './workspace';
import type { Calibration } from './session';
import type { Evaluation, Project } from './types';

export async function createWorkspaceFile(workspace: Workspace, provenance: Record<string, unknown>) {
  const spectra = [];
  for (const spectrum of workspace.spectra) {
    const models = [];
    for (const model of spectrum.models) {
      const file = await createProjectFile(modelSnapshot(spectrum, model), provenance);
      models.push({ ...model, version: file.version, required_features: file.required_features, fit_state: file.fit_state });
    }
    spectra.push({ ...spectrum, models });
  }
  return { format: 'mossa-workspace', version: workspace.spectra.some(s => s.velocityReversed) ? 2 : 1, provenance, workspace: { ...workspace, spectra } };
}

export async function openWorkspaceFile(doc: unknown, cal: Calibration, filename: string, evaluate: (project: Project) => Promise<Evaluation>) {
  const file = doc as ReturnType<typeof JSON.parse>;
  if (file?.format !== 'mossa-workspace') {
    const legacy = await openProjectFile(doc, cal, filename, evaluate);
    const workspace = workspaceFromSnapshot(legacy.snapshot);
    workspace.name = filename.replace(/\.(mossa(?:\.json)?|json)$/i, '') || 'Imported project';
    return { workspace, evaluation: legacy.evaluation, notice: legacy.notice };
  }
  if (![1,2].includes(file.version)) throw new Error('Unsupported project collection version.');
  if (file.version === 1 && file.workspace?.spectra?.some((s: { velocityReversed?: boolean }) => s.velocityReversed)) throw new Error('Reversed velocities require collection format version 2.');
  let workspace = decodeWorkspace(file.workspace);
  // Empty projects are drafts, not spectra to send to the numerical engine.
  if (!activeSnapshot(workspace).project.spectrum.x.length) return { workspace, evaluation: null, notice: '' };
  let evaluation: Evaluation | null = null;
  const notices: string[] = [];
  // Reuse the established model/data binding checks for every saved fit,
  // including inactive models. Opening never runs an optimization.
  for (let i = 0; i < workspace.spectra.length; i++) {
    const spectrum = workspace.spectra[i];
    for (let j = 0; j < spectrum.models.length; j++) {
      const model = spectrum.models[j], stored = file.workspace.spectra[i].models[j];
      const snapshot = modelSnapshot(spectrum, model);
      const loaded = await openProjectFile({
        format: 'mossa-project', version: stored.version, required_features: stored.required_features,
        name: spectrum.name, project: snapshot.project, selected_site: snapshot.selected,
        preprocessing: { raw_counts: snapshot.raw, controls: snapshot.cal, ...(snapshot.velocityReversed ? { velocity_reversed: true } : {}), ...(snapshot.importInfo ? { import_info: snapshot.importInfo } : {}) }, fit: stored.fit,
        fit_state: stored.fit_state,
      }, cal, spectrum.name, evaluate);
      model.fit = loaded.snapshot.fit ?? null; model.fitElapsed = loaded.snapshot.fitElapsed ?? null;
      if (loaded.notice) notices.push(`${spectrum.name} / ${model.name}: ${loaded.notice}`);
      if (spectrum.id === workspace.activeSpectrumId && model.id === spectrum.activeModelId) evaluation = loaded.evaluation;
    }
  }
  return { workspace, evaluation: evaluation ?? await evaluate(activeSnapshot(workspace).project), notice: notices.join('\n') };
}

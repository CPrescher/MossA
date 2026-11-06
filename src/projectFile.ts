import { validateProjectFile } from './io.mjs';
import { decodeFitSummary, decodeSession, defaultLayout, type Calibration, type FitSummary, type Snapshot } from './session';
import type { Evaluation, Project } from './types';

// Stable across JSON whitespace/key order and site renames. All numerical
// inputs, data, bounds, fit flags, links, and model options remain in the hash.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function scientificProject(project: Project) {
  const scientific = { ...project, sites: project.sites.map(({ name: _name, ...site }) => site) };
  return canonical(scientific);
}
async function digest(text: string) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function binding(project: Project) {
  const text = scientificProject(project);
  // Plain HTTP hosts without WebCrypto still get an exact local binding;
  // their exported file is larger because it contains the canonical text.
  return globalThis.crypto?.subtle ? { algorithm: 'sha256-canonical-project-v1', value: await digest(text) } : { algorithm: 'canonical-project-v1', value: text };
}

export async function createProjectFile(snapshot: Snapshot, provenance: Record<string, unknown>) {
  const fit = snapshot.fit ?? null;
  return {
    format: 'mossa-project', version: 1, name: snapshot.filename, project: snapshot.project,
    selected_site: snapshot.selected,
    preprocessing: { raw_counts: snapshot.raw, controls: snapshot.cal }, provenance, fit,
    fit_state: fit ? { binding: await binding(snapshot.project), elapsed_ms: snapshot.fitElapsed ?? null } : null,
  };
}

const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

export async function openProjectFile(doc: unknown, fallbackCal: Calibration, filename: string, evaluate: (project: Project) => Promise<Evaluation>) {
  const project = validateProjectFile(doc);
  const file = doc as ReturnType<typeof JSON.parse>;
  // Reuse the local-session schema for project/preprocessing validation, while
  // retaining the current app's layout outside the portable project file.
  const snapshot: Snapshot = decodeSession(JSON.stringify({ version: 1, snapshot: { project, raw: file.preprocessing?.raw_counts ?? null, cal: file.preprocessing?.controls ?? fallbackCal, filename: typeof file.name === 'string' ? file.name : filename, selected: file.selected_site ?? 0 }, layout: defaultLayout, fit: null, elapsed: null })).snapshot;
  const evaluation = await evaluate(snapshot.project);
  let fit: FitSummary | null = decodeFitSummary(file.fit, project.sites.length), notice = '';
  if (file.fit != null && !fit) notice = 'Saved fit metadata is invalid; data and parameters were loaded without fit results.';
  if (fit && file.fit_state != null) {
    const saved = file.fit_state.binding;
    let matches = false;
    if (saved && typeof saved.value === 'string') {
      if (saved.algorithm === 'canonical-project-v1') matches = saved.value === scientificProject(project);
      else if (saved.algorithm === 'sha256-canonical-project-v1' && globalThis.crypto?.subtle) matches = saved.value === await digest(scientificProject(project));
    }
    if (!matches) {
      fit = null; notice = 'Saved fit does not match the model and data; fit results were cleared.';
    }
  } else if (fit) {
    // Older files may contain the full fit project, or only a fit summary.
    // Check any available project and always check the recalculated objective.
    let matches = true;
    try { if (file.fit.project) matches = scientificProject(file.fit.project) === scientificProject(project); } catch { matches = false; }
    if (!matches) {
      fit = null; notice = 'Saved legacy fit does not match the model and data; fit results were cleared.';
    } else {
      fit = { ...fit, warnings: [...new Set([...fit.warnings, 'Legacy fit restored without a model/data binding. Refit if the file was edited externally.'])] };
    }
  }
  if (fit && !close(fit.reduced_objective * fit.dof, evaluation.objective)) {
    fit = null; notice = 'Saved fit objective does not match the current model evaluation; fit results were cleared.';
  }
  const elapsed = file.fit_state?.elapsed_ms;
  snapshot.fit = fit;
  snapshot.fitElapsed = fit && typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
  return { snapshot, evaluation, notice };
}

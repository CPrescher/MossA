import { storageKey } from './storage-namespace';
import { validCalibrationReference, type CalibrationReference } from './calibration';
import { validXvbf } from './xvbf';
import { validSourceReference, type SourceReference } from './source-calibration';
import { validGaussianSource } from './source-profile';
import { nuclearConstants, validNuclearConstants, usesModernNuclearConstants, type NuclearConstants } from './nuclear-constants.mjs';
import type { FitResult, Parameter, Project } from './types';
import { calibrateCounts, validImportInfo, type ImportInfo } from './io.mjs';
export const SESSION_KEY = storageKey('mossa.session.v1');
export type Calibration = { max: number; shift: number; sinusoidal: boolean; folding: boolean; center: number; autoFold?: boolean; reference?: CalibrationReference; sourceReference?: SourceReference; nuclear_constants?: NuclearConstants; preset?: { id: string; name: string } };
export type Snapshot = { project: Project; raw: number[] | null; cal: Calibration; filename: string; selected: number; fit?: FitSummary | null; fitElapsed?: number | null; velocityReversed?: boolean; importInfo?: ImportInfo };
export type Layout = { resultsHeight: number; sitesHeight: number; tab: string; optionsOpen: boolean; projectCollapsed?: boolean; optionsCollapsed?: boolean; projectSplit?: number };
export type FitSummary = Omit<FitResult, 'project' | 'evaluation'>;
export type Session = { version: 1 | 2 | 3; snapshot: Snapshot; layout: Layout; fit: FitSummary | null; elapsed: number | null };
// Older applications reject version 2 rather than silently dropping a complete
// source shape or evaluating/reusing a calibration with rounded constants.
export function snapshotVersion(snapshot: Snapshot): 1 | 2 | 3 {
  if (snapshot.velocityReversed) return 3;
  if (snapshot.project.sites.some(s=>s.xvbf) || snapshot.project.source_gaussians || snapshot.cal.sourceReference?.gaussians) return 2;
  return [snapshot.project.nuclear_constants, snapshot.cal.nuclear_constants, snapshot.cal.reference?.settings.nuclear_constants].some(usesModernNuclearConstants) ? 2 : 1;
}
export const defaultLayout: Layout = { resultsHeight: 200, sitesHeight: 104, tab: 'Gen', optionsOpen: false, projectCollapsed: true, optionsCollapsed: false, projectSplit: .55 };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validCalibration(value: unknown): value is Calibration {
  const c = value as Calibration | null;
  return !!c && [c.max, c.shift, c.center].every(finite) && c.max > 0 && typeof c.folding === 'boolean' && typeof c.sinusoidal === 'boolean'
    && (c.autoFold === undefined || typeof c.autoFold === 'boolean')
    && (c.nuclear_constants === undefined || validNuclearConstants(c.nuclear_constants))
    && (!c.reference || (validCalibrationReference(c.reference) && nuclearConstants(c.nuclear_constants).id === nuclearConstants(c.reference.settings.nuclear_constants).id))
    && (!c.sourceReference || validSourceReference(c.sourceReference))
    && (c.preset === undefined || (!!c.preset && typeof c.preset.id === 'string' && c.preset.id.length > 0 && c.preset.id.length <= 1000 && typeof c.preset.name === 'string' && c.preset.name.length > 0 && c.preset.name.length <= 160));
}
function parameterOK(p: Parameter) { return p && finite(p.value) && typeof p.fit === 'boolean' && (p.min === null || finite(p.min)) && (p.max === null || finite(p.max)) && (p.link == null || (typeof p.link.target === 'string' && finite(p.link.factor))); }
export function decodeFitSummary(value: unknown, sites: number): FitSummary | null {
  const f = value as FitSummary | null;
  if (!f || typeof f.converged !== 'boolean' || typeof f.termination !== 'string' || ![f.iterations, f.free_parameters, f.dof, f.rank].every(v => Number.isInteger(v) && v >= 0) || f.rank > f.free_parameters || !finite(f.reduced_objective) || f.reduced_objective < 0 || !f.errors || Array.isArray(f.errors) || typeof f.errors !== 'object' || !Object.values(f.errors).every(n => n === null || (finite(n) && n >= 0)) || !Array.isArray(f.warnings) || !f.warnings.every(w => typeof w === 'string')) return null;
  const fit: FitSummary = { converged: f.converged, termination: f.termination, iterations: f.iterations, free_parameters: f.free_parameters, dof: f.dof, rank: f.rank, reduced_objective: f.reduced_objective, errors: { ...f.errors }, warnings: [...f.warnings] };
  if (finite(f.stationarity) && f.stationarity >= 0) fit.stationarity = f.stationarity;
  if (Array.isArray(f.intensity_fractions) && f.intensity_fractions.length === sites && f.intensity_fractions.every(v => v && (v.value === null || (finite(v.value) && v.value >= 0 && v.value <= 100)) && (v.error === null || (finite(v.error) && v.error >= 0)))) fit.intensity_fractions = f.intensity_fractions.map(v => ({ ...v }));
  const search = f.search;
  const selectiveValid = search?.strategy === undefined || (search.strategy === 'selective'
    && Number.isInteger(search.exploration_iterations) && search.exploration_iterations! >= 1 && search.exploration_iterations! <= 2000
    && finite(search.objective_margin) && search.objective_margin >= 0
    && Number.isInteger(search.pruned_starts) && search.pruned_starts! >= 0 && search.pruned_starts! < search.completed
    && Array.isArray(search.trials) && search.trials.length === search.completed
    && search.trials.every((t, i, trials) => t && Number.isInteger(t.start) && t.start >= 1 && t.start <= search.requested && (i === 0 || t.start > trials[i - 1].start)
      && Number.isInteger(t.iterations) && t.iterations >= 0 && finite(t.objective) && t.objective >= 0 && t.objective === search.objectives?.[i]
      && typeof t.termination === 'string' && typeof t.pruned === 'boolean' && t.pruned === (t.termination === 'ExplorationPruned')
      && typeof t.screened === 'boolean' && (!t.pruned || t.screened) && (t.start % 3 !== 1 || !t.screened))
    && search.trials.filter(t => t.pruned).length === search.pruned_starts
    && search.trials.reduce((n, t) => n + t.iterations, 0) === search.total_iterations
    && search.trials.some(t => t.start === search.best_start && !t.pruned));
  if (search && selectiveValid && [search.requested, search.completed, search.best_start, search.rejected_candidates, search.failed_starts, search.total_iterations].every(v => Number.isInteger(v) && v >= 0) && search.requested >= 1 && search.requested <= 32 && search.completed >= 1 && search.completed <= search.requested && search.best_start >= 1 && search.best_start <= search.requested && Array.isArray(search.objectives) && search.objectives.length === search.completed && search.objectives.every(v => finite(v) && v >= 0)) fit.search = { ...search, objectives: [...search.objectives], ...(search.trials ? { trials: search.trials.map(t => ({ ...t })) } : {}) };
  return fit;
}
export function decodeSession(text: string, allowEmptySpectrum = false): Session {
  const saved = JSON.parse(text), s = saved?.snapshot as Snapshot, p = s?.project;
  const empty = allowEmptySpectrum && p?.spectrum?.x?.length === 0 && p?.spectrum?.y?.length === 0 && p?.sites?.length === 0 && s.raw === null && saved.fit == null && s.fit == null && s.fitElapsed == null && saved.elapsed == null;
  if (![1, 2, 3].includes(saved?.version) || !p || !Array.isArray(p.spectrum?.x) || !Array.isArray(p.spectrum?.y) || (!empty && p.spectrum.x.length < 8) || p.spectrum.x.length > 20000 || p.spectrum.x.length !== p.spectrum.y.length || !p.spectrum.x.every(finite) || !p.spectrum.y.every(finite) || p.spectrum.x.some((x,i,a) => i > 0 && x <= a[i-1])) throw new Error('Invalid saved spectrum.');
  if (!Array.isArray(p.sites) || p.sites.length > 16 || !p.sites.every(site => typeof site.name === 'string' && (site.color === undefined || (typeof site.color === 'string' && /^#[0-9a-f]{6}$/i.test(site.color))) && ['Singlet','Doublet','Sextet'].includes(site.kind) && ['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].includes(site.profile) && ['cs','fwhm','intensity','qs','bhf','a12','a13','mix'].every(k => parameterOK(site.params?.[k]))) || !Array.isArray(p.background) || p.background.length < 1 || p.background.length > 4 || !p.background.every(parameterOK) || !['thin','transmission'].includes(p.mode) || !['unweighted','counts'].includes(p.weighting) || !finite(p.source_fwhm) || typeof p.source_squared !== 'boolean' || !finite(p.max_iterations)) throw new Error('Invalid saved model.');
  if (p.source_gaussians !== undefined && !validGaussianSource(p.source_gaussians)) throw new Error('Invalid saved Gaussian source profile.');
  if (p.search_starts !== undefined && (!Number.isInteger(p.search_starts) || p.search_starts < 1 || p.search_starts > 32)) throw new Error('Invalid saved search starts.');
  if (p.derivative_method !== undefined && !['numerical', 'analytical'].includes(p.derivative_method)) throw new Error('Invalid saved derivative method.');
  if (p.thin_solver !== undefined && !['joint', 'variable_projection'].includes(p.thin_solver)) throw new Error('Invalid saved thin solver.');
  if (p.search_strategy !== undefined && !['full', 'selective'].includes(p.search_strategy)) throw new Error('Invalid saved search strategy.');
  if (p.nuclear_constants !== undefined && !validNuclearConstants(p.nuclear_constants)) throw new Error('Invalid saved nuclear constants.');
  if (p.sites.some(site=>site.xvbf && (site.kind!=='Doublet'||site.profile!=='Lorentzian'||!validXvbf(site.xvbf)))) throw new Error('Invalid saved xVBF model.');
  if (typeof s.filename !== 'string' || (s.raw !== null && (!Array.isArray(s.raw) || s.raw.length < 8 || s.raw.length > 20000 || !s.raw.every(finite))) || !validCalibration(s.cal)) throw new Error('Invalid saved preprocessing.');
  if (s.velocityReversed !== undefined && typeof s.velocityReversed !== 'boolean') throw new Error('Invalid saved velocity direction.');
  if (s.velocityReversed && saved.version !== 3) throw new Error('Reversed velocities require project format version 3.');
  if (s.importInfo !== undefined && (!validImportInfo(s.importInfo) || s.importInfo.channels !== (s.raw?.length ?? p.spectrum.x.length))) throw new Error('Invalid saved import provenance.');
  if (saved.version === 3 && s.raw) {
    const expected = calibrateCounts(s.raw, s.cal.max, s.cal.shift, s.cal.sinusoidal, s.cal.folding ? s.cal.center : null, s.velocityReversed);
    if (expected.x.length !== p.spectrum.x.length || expected.x.some((x,i) => Math.abs(x-p.spectrum.x[i]) > 1e-9*Math.max(1,Math.abs(x))) || expected.y.some((y,i) => y !== p.spectrum.y[i])) throw new Error('Saved raw counts, calibration, and velocity direction do not match the spectrum.');
  }
  if (s.cal.reference && !validCalibrationReference(s.cal.reference)) throw new Error('Invalid saved velocity reference.');
  if (s.cal.nuclear_constants !== undefined && !validNuclearConstants(s.cal.nuclear_constants)) throw new Error('Invalid saved calibration nuclear constants.');
  if (s.cal.reference && nuclearConstants(s.cal.nuclear_constants).id !== nuclearConstants(s.cal.reference.settings.nuclear_constants).id) throw new Error('Inconsistent saved calibration nuclear constants.');
  if (s.raw && nuclearConstants(p.nuclear_constants).id !== nuclearConstants(s.cal.nuclear_constants).id) throw new Error('The saved raw-count model and calibration use different nuclear constants.');
  if (s.cal.sourceReference && !validSourceReference(s.cal.sourceReference)) throw new Error('Invalid saved source reference.');
  s.selected = Number.isInteger(s.selected) ? Math.max(0,Math.min(p.sites.length-1,s.selected)) : 0;
  const l = saved.layout ?? {};
  const layout: Layout = { resultsHeight: finite(l.resultsHeight) ? Math.max(196,Math.min(2000,l.resultsHeight)) : 200, sitesHeight: finite(l.sitesHeight) ? Math.max(52,Math.min(300,l.sitesHeight)) : 104, tab: ['Gen','Bnds','xVBF','Opt'].includes(l.tab) ? l.tab : 'Gen', optionsOpen: l.optionsOpen === true,
    projectCollapsed: l.projectCollapsed !== false, optionsCollapsed: l.optionsCollapsed === true, projectSplit: finite(l.projectSplit) ? Math.max(.2, Math.min(.8, l.projectSplit)) : .55 };
  const fit = decodeFitSummary(saved.fit, p.sites.length);
  return { version: saved.version, snapshot: s, layout, fit, elapsed: finite(saved.elapsed) ? saved.elapsed : null };
}
export function readSession(storage?: Store): { session: Session | null; error: string } {
  try { const text = (storage ?? window.localStorage).getItem(SESSION_KEY); return { session: text ? decodeSession(text) : null, error: '' }; }
  catch { return { session: null, error: 'The previous local session could not be restored. Open a saved project to recover it.' }; }
}
export function writeSession(session: Session, storage?: Store): boolean {
  // The active fit is serialized once; history-only fields do not duplicate it.
  const { fit: _fit, fitElapsed: _elapsed, ...snapshot } = session.snapshot;
  try { (storage ?? window.localStorage).setItem(SESSION_KEY, JSON.stringify({ ...session, version: snapshotVersion(snapshot), snapshot })); return true; } catch { return false; }
}
export function summarizeFit(result: FitResult | null): FitSummary | null {
  if (!result) return null;
  const { project: _project, evaluation: _evaluation, ...summary } = result;
  return summary;
}

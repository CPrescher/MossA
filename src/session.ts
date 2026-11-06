import { validCalibrationReference, type CalibrationReference } from './calibration';
import { validXvbf } from './xvbf';
import { validSourceReference, type SourceReference } from './source-calibration';
import type { FitResult, Parameter, Project } from './types';
export const SESSION_KEY = 'mossa.session.v1';
export type Calibration = { max: number; shift: number; sinusoidal: boolean; folding: boolean; center: number; autoFold?: boolean; reference?: CalibrationReference; sourceReference?: SourceReference };
export type Snapshot = { project: Project; raw: number[] | null; cal: Calibration; filename: string; selected: number; fit?: FitSummary | null; fitElapsed?: number | null };
export type Layout = { resultsHeight: number; sitesHeight: number; tab: string; optionsOpen: boolean };
export type FitSummary = Omit<FitResult, 'project' | 'evaluation'>;
export type Session = { version: 1; snapshot: Snapshot; layout: Layout; fit: FitSummary | null; elapsed: number | null };
export const defaultLayout: Layout = { resultsHeight: 200, sitesHeight: 104, tab: 'Gen', optionsOpen: false };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function parameterOK(p: Parameter) { return p && finite(p.value) && typeof p.fit === 'boolean' && (p.min === null || finite(p.min)) && (p.max === null || finite(p.max)) && (p.link == null || (typeof p.link.target === 'string' && finite(p.link.factor))); }
export function decodeFitSummary(value: unknown, sites: number): FitSummary | null {
  const f = value as FitSummary | null;
  if (!f || typeof f.converged !== 'boolean' || typeof f.termination !== 'string' || ![f.iterations, f.free_parameters, f.dof, f.rank].every(v => Number.isInteger(v) && v >= 0) || f.rank > f.free_parameters || !finite(f.reduced_objective) || f.reduced_objective < 0 || !f.errors || Array.isArray(f.errors) || typeof f.errors !== 'object' || !Object.values(f.errors).every(n => n === null || (finite(n) && n >= 0)) || !Array.isArray(f.warnings) || !f.warnings.every(w => typeof w === 'string')) return null;
  const fit: FitSummary = { converged: f.converged, termination: f.termination, iterations: f.iterations, free_parameters: f.free_parameters, dof: f.dof, rank: f.rank, reduced_objective: f.reduced_objective, errors: { ...f.errors }, warnings: [...f.warnings] };
  if (Array.isArray(f.intensity_fractions) && f.intensity_fractions.length === sites && f.intensity_fractions.every(v => v && (v.value === null || (finite(v.value) && v.value >= 0 && v.value <= 100)) && (v.error === null || (finite(v.error) && v.error >= 0)))) fit.intensity_fractions = f.intensity_fractions.map(v => ({ ...v }));
  return fit;
}
export function decodeSession(text: string): Session {
  const saved = JSON.parse(text), s = saved?.snapshot as Snapshot, p = s?.project;
  if (saved?.version !== 1 || !p || !Array.isArray(p.spectrum?.x) || !Array.isArray(p.spectrum?.y) || p.spectrum.x.length < 8 || p.spectrum.x.length > 20000 || p.spectrum.x.length !== p.spectrum.y.length || !p.spectrum.x.every(finite) || !p.spectrum.y.every(finite) || p.spectrum.x.some((x,i,a) => i > 0 && x <= a[i-1])) throw new Error('Invalid saved spectrum.');
  if (!Array.isArray(p.sites) || p.sites.length > 16 || !p.sites.every(site => typeof site.name === 'string' && ['Singlet','Doublet','Sextet'].includes(site.kind) && ['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].includes(site.profile) && ['cs','fwhm','intensity','qs','bhf','a12','a13','mix'].every(k => parameterOK(site.params?.[k]))) || !Array.isArray(p.background) || p.background.length < 1 || p.background.length > 4 || !p.background.every(parameterOK) || !['thin','transmission'].includes(p.mode) || !['unweighted','counts'].includes(p.weighting) || !finite(p.source_fwhm) || typeof p.source_squared !== 'boolean' || !finite(p.max_iterations)) throw new Error('Invalid saved model.');
  if (p.sites.some(site=>site.xvbf && (site.kind!=='Doublet'||site.profile!=='Lorentzian'||!validXvbf(site.xvbf)))) throw new Error('Invalid saved xVBF model.');
  if (typeof s.filename !== 'string' || (s.raw !== null && (!Array.isArray(s.raw) || s.raw.length < 8 || s.raw.length > 20000 || !s.raw.every(finite))) || !s.cal || ![s.cal.max,s.cal.shift,s.cal.center].every(finite) || s.cal.max <= 0 || typeof s.cal.folding !== 'boolean' || typeof s.cal.sinusoidal !== 'boolean') throw new Error('Invalid saved preprocessing.');
  if (s.cal.reference && !validCalibrationReference(s.cal.reference)) throw new Error('Invalid saved velocity reference.');
  if (s.cal.sourceReference && !validSourceReference(s.cal.sourceReference)) throw new Error('Invalid saved source reference.');
  s.selected = Number.isInteger(s.selected) ? Math.max(0,Math.min(p.sites.length-1,s.selected)) : 0;
  const l = saved.layout ?? {};
  const layout: Layout = { resultsHeight: finite(l.resultsHeight) ? Math.max(196,Math.min(2000,l.resultsHeight)) : 200, sitesHeight: finite(l.sitesHeight) ? Math.max(52,Math.min(300,l.sitesHeight)) : 104, tab: ['Gen','Bnds','xVBF','Opt'].includes(l.tab) ? l.tab : 'Gen', optionsOpen: l.optionsOpen === true };
  const fit = decodeFitSummary(saved.fit, p.sites.length);
  return { version: 1, snapshot: s, layout, fit, elapsed: finite(saved.elapsed) ? saved.elapsed : null };
}
export function readSession(storage?: Store): { session: Session | null; error: string } {
  try { const text = (storage ?? window.localStorage).getItem(SESSION_KEY); return { session: text ? decodeSession(text) : null, error: '' }; }
  catch { return { session: null, error: 'The previous local session could not be restored. Open a saved project to recover it.' }; }
}
export function writeSession(session: Session, storage?: Store): boolean {
  // The active fit is serialized once; history-only fields do not duplicate it.
  const { fit: _fit, fitElapsed: _elapsed, ...snapshot } = session.snapshot;
  try { (storage ?? window.localStorage).setItem(SESSION_KEY, JSON.stringify({ ...session, snapshot })); return true; } catch { return false; }
}
export function summarizeFit(result: FitResult | null): FitSummary | null {
  if (!result) return null;
  const { project: _project, evaluation: _evaluation, ...summary } = result;
  return summary;
}

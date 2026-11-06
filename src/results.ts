import type { FitSummary } from './session';
import { type Evaluation, type Parameter, type Project } from './types';
export const formatResult = (value: number | null | undefined, digits = 5) => value == null ? '—' : Number(value.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });
export const formatStd = (value: number | null | undefined) => value == null ? '—' : value === 0 ? '0' : Math.abs(value) < 1e-5 || Math.abs(value) >= 1e6 ? value.toExponential(1) : value.toLocaleString('en-US',{ minimumSignificantDigits: 2, maximumSignificantDigits: 2 });
export function parameterValue(project: Project, evaluation: Evaluation | null, site: number, key: string) {
  const p = project.sites[site].params[key];
  return p.link ? evaluation?.parameters?.[`site:${site}:${key}`] ?? resolveValue(project, `site:${site}:${key}`, new Set()) : p.value;
}
function parameterAt(project: Project, id: string): Parameter | undefined {
  const bits = id.split(':');
  return bits[0] === 'site' ? project.sites[Number(bits[1])]?.params[bits[2]] : bits[0] === 'bkg' ? project.background[Number(bits[1])] : undefined;
}
function resolveValue(project: Project, id: string, seen: Set<string>): number {
  const p = parameterAt(project,id);
  if (!p || seen.has(id)) return NaN;
  if (!p.link) return p.value;
  seen.add(id); return p.link.factor * resolveValue(project,p.link.target,seen);
}
export function uncertainty(project: Project, result: FitSummary | null, id: string) {
  let p = parameterAt(project,id), fixed = false; const seen = new Set<string>();
  while (p?.link && !seen.has(p.link.target)) { if (p.link.factor === 0) { fixed = true; break; } seen.add(p.link.target); p = parameterAt(project,p.link.target); }
  fixed ||= !!p && !p.link && (!p.fit || (p.min !== null && p.min === p.max));
  const error = result?.errors[id];
  if (fixed) return { state: 'fixed', error: null, reason: 'Fixed by parameter settings or a link to a fixed parameter.' } as const;
  if (!result) return { state: 'needs-fit', error: null, reason: 'Fit the current model to estimate its std. Model or data changes invalidate previous uncertainties.' } as const;
  if (error != null && Number.isFinite(error)) return { state: 'estimated', error, reason: `Approximate 1 std: ${error}` } as const;
  return { state: 'unavailable', error: null, reason: result.rank < result.free_parameters ? 'Uncertainty unavailable: the fit Jacobian is rank deficient.' : 'Symmetric uncertainty unavailable: this parameter or its source may be at a bound.' } as const;
}
export function intensityFractions(project: Project, evaluation: Evaluation | null, result: FitSummary | null) {
  const intensities = project.sites.map((_,i) => parameterValue(project,evaluation,i,'intensity'));
  const total = intensities.reduce((sum,value) => sum + value,0);
  return intensities.map((value,i) => ({ value: Number.isFinite(total) && total > 0 && intensities.every(v=>Number.isFinite(v)&&v>=0) ? 100 * (value / total) : null, error: result?.intensity_fractions?.[i]?.error ?? null }));
}
export function formatFraction(value: number | null, error: number | null) {
  if (value == null) return '—';
  if (value > 0 && value < .01) return formatResult(value,3);
  const decimals = error && error > 0 ? Math.max(2,Math.min(6,1-Math.floor(Math.log10(error)))) : 2;
  return value.toFixed(decimals);
}

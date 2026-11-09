import type { NuclearConstants } from './nuclear-constants.mjs';
export type Parameter = { value: number; fit: boolean; min: number | null; max: number | null; link?: { target: string; factor: number } | null };
export type DistributionComponent = { center: Parameter; width: Parameter; weight: Parameter };
export type Xvbf = { delta: Parameter; cs: DistributionComponent[]; qs: DistributionComponent[] };
export type Site = { name: string; kind: 'Singlet' | 'Doublet' | 'Sextet'; profile: 'Lorentzian' | 'Gaussian' | 'PseudoVoigt' | 'LorSquared'; params: Record<string, Parameter>; xvbf?: Xvbf };
export type SourceGaussian = { center: number; fwhm: number; weight: number };
export type Project = { spectrum: { x: number[]; y: number[] }; sites: Site[]; background: Parameter[]; mode: 'thin' | 'transmission'; source_fwhm: number; source_squared: boolean; source_gaussians?: SourceGaussian[]; weighting: 'unweighted' | 'counts'; max_iterations: number; nuclear_constants?: NuclearConstants; search_starts?: number; search_strategy?: 'full' | 'selective'; derivative_method?: 'numerical' | 'analytical'; thin_solver?: 'joint' | 'variable_projection' };
export type Evaluation = { parameters: Record<string, number>; y: number[]; background: number[]; components: number[][]; residual: number[]; sse: number; objective: number };
export type FitResult = { project: Project; evaluation: Evaluation; errors: Record<string, number | null>; intensity_fractions?: { value: number | null; error: number | null }[]; iterations: number; converged: boolean; termination: string; free_parameters: number; dof: number; rank: number; reduced_objective: number; stationarity?: number | null; warnings: string[]; search?: { requested: number; completed: number; best_start: number; rejected_candidates: number; failed_starts: number; objectives: number[]; total_iterations: number; strategy?: 'selective'; exploration_iterations?: number; objective_margin?: number; pruned_starts?: number; trials?: { start: number; iterations: number; objective: number; termination: string; pruned: boolean; screened: boolean }[] } };
export type FitProgress = { project: Project; evaluation: Evaluation; iteration: number; elapsed_ms: number; search_start?: number; search_starts?: number };
// Internal solver coordinates retain the original parameter scaling. These
// transport-only values must be finalized before exposing a completed fit.
export type FitState = { x: number[]; iterations: number; converged: boolean; termination: string; source_calibration: boolean };
export type FitFinalization = { project: Project; state: FitState };
export type FitTrial = Pick<FitResult, 'project' | 'evaluation' | 'iterations' | 'converged' | 'termination' | 'free_parameters'> & { finalization: FitFinalization };
export type LocalFitResult = FitResult | FitTrial;
export const labels: Record<string, string> = { cs: 'CS', fwhm: 'FWHM', intensity: 'Intensity', qs: 'QS', bhf: 'BHF', a12: 'A12', a13: 'A13', mix: 'L fraction' };
export const colors = ['#168a87', '#c47735', '#8261a9', '#5684b3', '#a85e78', '#6c8f42'];
export function keys(site: Site) {
  if (site.xvbf) return ['intensity'];
  return ['cs', 'fwhm', 'intensity', ...(site.kind !== 'Singlet' ? ['qs', 'a12'] : []), ...(site.kind === 'Sextet' ? ['bhf', 'a13'] : []), ...(site.profile === 'PseudoVoigt' ? ['mix'] : [])];
}
export function parameter(value: number, fit = true, min: number | null = null, max: number | null = null): Parameter { return { value, fit, min, max, link: null }; }
export function newSite(index: number, kind: Site['kind'] = 'Doublet'): Site {
  return { name: `Site ${index + 1}`, kind, profile: 'Lorentzian', params: { cs: parameter(0, true, -10, 10), fwhm: parameter(.35, true, .01, 3), intensity: parameter(400, true, 0), qs: parameter(1, kind !== 'Sextet', -10, 10), bhf: parameter(33, true, 0, 60), a12: parameter(kind === 'Doublet' ? .5 : 1.5, false, kind === 'Doublet' ? 0 : .001, kind === 'Doublet' ? 1 : null), a13: parameter(3, false, .001), mix: parameter(.5, true, 0, 1) } };
}


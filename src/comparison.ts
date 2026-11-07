import { keys, type Evaluation, type FitResult, type Parameter, type Project, type Site } from './types';
import { nuclearConstants } from './nuclear-constants.mjs';

export type NoiseModel = 'poisson' | 'gaussian';
export type ComparisonOptions = { simulations: number; seed: number; noise: NoiseModel; doubledFirstChannel: boolean; doubledLastChannel?: boolean; workers?: number };
export type ComparisonProgress = { phase: string; completed: number; total: number };
export type ComparisonResult = {
  version: 1; method: 'parametric-bootstrap'; options: ComparisonOptions;
  simpler: FitResult; larger: FitResult; improvement: number; fStatistic: number | null;
  exceedances: number; pValue: number; monteCarloInterval: [number, number];
  noiseStd: number | null; improvements: number[]; warnings: string[];
  execution?: { workers: number; backend?: 'native-rust' | 'wasm' };
  diagnostics: { simpler: FitDiagnostic; larger: FitDiagnostic }[];
  fitAttempts?: { stage: string; attempts: (FitDiagnostic & { start: string; iterationLimit: number; algorithm?: 'trf' | 'bounded-lm'; search?: FitResult['search'] })[] }[];
};
type FitDiagnostic = Pick<FitResult, 'converged' | 'termination' | 'stationarity' | 'rank' | 'free_parameters' | 'iterations'> & { objective: number };
function diagnostic(f: FitResult): FitDiagnostic {
  return { converged: f.converged, termination: f.termination, stationarity: f.stationarity, rank: f.rank,
    free_parameters: f.free_parameters, iterations: f.iterations, objective: f.evaluation.objective };
}

// Compare constraints, not fitted values. Fixed values and links define the
// hypothesis; differing free values merely define different starting points.
function sameParameter(a: Parameter, b: Parameter) {
  return a.fit === b.fit && a.min === b.min && a.max === b.max
    && (a.link?.target ?? null) === (b.link?.target ?? null)
    && (a.link?.factor ?? null) === (b.link?.factor ?? null)
    && (a.fit || a.link || a.value === b.value);
}
function siteParameters(site: Site): Parameter[] {
  const x = site.xvbf;
  return [...keys(site).map(k => site.params[k]), ...(x ? [x.delta, ...[...x.cs, ...x.qs].flatMap(c => [c.center, c.width, c.weight])] : [])];
}
function sameSite(a: Site, b: Site) {
  if (a.kind !== b.kind || a.profile !== b.profile || !!a.xvbf !== !!b.xvbf) return false;
  if (a.xvbf && b.xvbf && (a.xvbf.cs.length !== b.xvbf.cs.length || a.xvbf.qs.length !== b.xvbf.qs.length)) return false;
  const aa = siteParameters(a), bb = siteParameters(b);
  return aa.length === bb.length && aa.every((p, i) => sameParameter(p, bb[i]));
}
export function nestingIssue(a: Project, b: Project): string | null {
  if (a.spectrum.x.length !== b.spectrum.x.length || a.spectrum.x.some((v, i) => v !== b.spectrum.x[i] || a.spectrum.y[i] !== b.spectrum.y[i])) return 'Use the same observations and velocity range for both models.';
  if (a.weighting !== b.weighting) return 'Both models must use the same residual weighting.';
  if (a.mode !== b.mode || JSON.stringify(nuclearConstants(a.nuclear_constants)) !== JSON.stringify(nuclearConstants(b.nuclear_constants))
    || (a.mode === 'transmission' && (a.source_fwhm !== b.source_fwhm || a.source_squared !== b.source_squared || JSON.stringify(a.source_gaussians ?? null) !== JSON.stringify(b.source_gaussians ?? null)))) return 'Both models must use the same absorber mode, nuclear constants, and source profile.';
  if (b.sites.length <= a.sites.length) return 'The larger model must contain additional sites. Duplicate the simpler model, then append sites.';
  if (a.background.length !== b.background.length || !a.background.every((p, i) => sameParameter(p, b.background[i]))) return 'Keep the same background order, fixed values, bounds, and fit flags in both models.';
  if (!a.sites.every((site, i) => sameSite(site, b.sites[i]))) return 'Keep the original sites in the same order, with matching types, profiles, fixed values, fit flags, bounds, and links.';
  for (const site of b.sites.slice(a.sites.length)) {
    const p = site.params.intensity;
    if (!p.fit || p.link || (p.min ?? 0) > 0 || (p.max !== null && p.max <= 0)) return 'Each added site needs a free intensity whose bounds allow zero and positive values.';
    if (siteParameters(site).some(p => p.link)) return 'Remove parameter links from added sites; they may impose extra constraints on the simpler model.';
  }
  return null;
}
export function noiseIssue(project: Project, options: ComparisonOptions): string | null {
  if (options.noise === 'gaussian' && project.weighting !== 'unweighted') return 'Gaussian simulations require unweighted fits. For count weighting, use Poisson count simulations.';
  if (options.noise === 'poisson' && project.spectrum.y.some(v => v < 0 || !Number.isInteger(v))) return 'Poisson simulations require nonnegative integer counts. Use Gaussian noise for continuous or background-subtracted intensities.';
  if (options.doubledFirstChannel && (options.noise !== 'poisson' || project.spectrum.y[0] % 2 !== 0)) return 'A doubled turnaround channel requires Poisson counts and an even first observation.';
  if (options.doubledLastChannel && (options.noise !== 'poisson' || project.spectrum.y.at(-1)! % 2 !== 0)) return 'A reversed doubled turnaround channel requires Poisson counts and an even last observation.';
  if (options.doubledFirstChannel && options.doubledLastChannel) return 'Only one folded turnaround observation can be doubled.';
  return null;
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296 + .5 / 4294967296;
  };
}
export function normalSample(random: () => number) {
  return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
}
function logFactorial(k: number) {
  if (k < 32) { let sum = 0; for (let i = 2; i <= k; i++) sum += Math.log(i); return sum; }
  const z = k + 1;
  return (z - .5) * Math.log(z) - z + .9189385332046727 + 1 / (12 * z) - 1 / (360 * z ** 3) + 1 / (1260 * z ** 5);
}
// Inversion at low means, Hörmann's PTRS rejection algorithm at high means:
// https://doi.org/10.1016/0167-6687(93)90997-4
// No Gaussian approximation: the samples remain integer Poisson counts.
export function poissonSample(mean: number, random: () => number): number {
  if (!Number.isFinite(mean) || mean < 0 || mean > 1e9) throw new Error('Poisson model means must be between zero and 1 billion counts.');
  if (mean === 0) return 0;
  if (mean < 10) {
    const limit = Math.exp(-mean); let product = 1, k = 0;
    do { k++; product *= random(); } while (product > limit);
    return k - 1;
  }
  const b = .931 + 2.53 * Math.sqrt(mean), a = -.059 + .02483 * b;
  const invAlpha = 1.1239 + 1.1328 / (b - 3.4), vr = .9277 - 3.6224 / (b - 2);
  for (;;) {
    const u = random() - .5, v = random(), us = .5 - Math.abs(u);
    const k = Math.floor((2 * a / us + b) * u + mean + .43);
    if (k >= 0 && us >= .07 && v <= vr) return k;
    if (k < 0 || (us < .013 && v > us)) continue;
    if (Math.log(v * invAlpha / (a / (us * us) + b)) <= -mean + k * Math.log(mean) - logFactorial(k)) return k;
  }
}
export function simulateSpectrum(means: number[], options: ComparisonOptions, std: number | null, random: () => number) {
  return means.map((mu, i) => options.noise === 'gaussian' ? mu + std! * normalSample(random)
    : ((options.doubledFirstChannel && i === 0) || (options.doubledLastChannel && i === means.length - 1)) ? 2 * poissonSample(mu / 2, random) : poissonSample(mu, random));
}
export function monteCarloSummary(exceedances: number, simulations: number) {
  const pValue = (exceedances + 1) / (simulations + 1);
  // Wilson interval for the simulated tail probability, not a confidence
  // interval for the scientific truth of either model.
  const z = 1.959963984540054, p = exceedances / simulations, d = 1 + z * z / simulations;
  const center = (p + z * z / (2 * simulations)) / d;
  const half = z * Math.sqrt(p * (1 - p) / simulations + z * z / (4 * simulations ** 2)) / d;
  return { pValue, monteCarloInterval: [Math.max(0, center - half), Math.min(1, center + half)] as [number, number] };
}
export function acceptableFit(fit: Pick<FitResult, 'converged' | 'termination' | 'stationarity'>) {
  return fit.converged || (['NumericalNoProgress', 'SolverFailed'].includes(fit.termination) && fit.stationarity != null && Number.isFinite(fit.stationarity) && fit.stationarity <= 1e-6);
}
function checkFit(fit: FitResult, stage: string) {
  if (!acceptableFit(fit) || !Number.isFinite(fit.evaluation.objective) || fit.evaluation.objective < 0 || fit.dof <= 0) throw new Error(`${stage}: fit did not converge or pass the independent projected-gradient check to a finite objective with positive residual degrees of freedom. Increase iterations or starting models, then rerun. No failed simulations are discarded.`);
  if (fit.search && (fit.search.failed_starts || fit.search.completed !== fit.search.requested)) throw new Error(`${stage}: some search starts failed. Resolve the fitting problem before interpreting this test.`);
}
function improvement(a: FitResult, b: FitResult, stage: string) {
  const delta = a.evaluation.objective - b.evaluation.objective;
  if (delta < -1e-7 * Math.max(1, a.evaluation.objective)) throw new Error(`${stage}: the larger model fitted worse despite containing the simpler model. Explore more starting models before rerunning the test.`);
  return Math.max(0, delta);
}

// A simulated disappearing component can create a very slow, nearly degenerate
// split of a retained site. Retry the SAME dataset with a null-informed start
// and a bounded continuation budget; never replace or drop that dataset.
function nullStart(larger: Project, simpler: FitResult) {
  const p = structuredClone(larger), count = simpler.project.sites.length;
  p.background = structuredClone(simpler.project.background);
  p.sites.splice(0, count, ...structuredClone(simpler.project.sites));
  const area = simpler.project.sites.reduce((sum, s) => sum + s.params.intensity.value, 0);
  for (const site of p.sites.slice(count)) {
    const intensity = site.params.intensity;
    intensity.value = Math.max(intensity.min ?? 0, Math.min(intensity.max ?? Infinity,
      area > 0 ? .05 * area / (p.sites.length - count) : Math.max(1, intensity.value * .05)));
  }
  return p;
}
function residualStart(larger: Project, simpler: FitResult) {
  const p = nullStart(larger, simpler), xs = p.spectrum.x, residual = simpler.evaluation.residual;
  const steps = xs.slice(1).map((x, i) => x - xs[i]).sort((a, b) => a - b), step = steps[Math.floor(steps.length / 2)];
  const order = residual.map((_, i) => i).sort((a, b) => residual[a] - residual[b]);
  const clamp = (parameter: Parameter, value: number, physicalMin = -Infinity) => {
    if (parameter.fit && !parameter.link) parameter.value = Math.max(physicalMin, parameter.min ?? -Infinity, Math.min(parameter.max ?? Infinity, value));
  };
  for (const [offset, site] of p.sites.slice(simpler.project.sites.length).entries()) {
    if (site.xvbf || site.kind === 'Sextet') continue;
    const peaks: number[] = [], separation = Math.max(2 * step, .5 * site.params.fwhm.value);
    for (const i of order) {
      if (peaks.every(j => Math.abs(xs[i] - xs[j]) > separation)) peaks.push(i);
      if (peaks.length >= 2 * (offset + 1)) break;
    }
    const i = peaks[Math.min(2 * offset, peaks.length - 1)], j = peaks[Math.min(2 * offset + 1, peaks.length - 1)];
    clamp(site.params.cs, site.kind === 'Singlet' ? xs[i] : (xs[i] + xs[j]) / 2);
    if (site.kind === 'Doublet') clamp(site.params.qs, Math.abs(xs[i] - xs[j]));
    clamp(site.params.fwhm, Math.min(site.params.fwhm.value, 2 * step), 1e-6);
    const depth = Math.max(.01, site.kind === 'Singlet' ? -residual[i] : -(residual[i] + residual[j]) / 2);
    const normalization = p.mode === 'transmission' ? Math.max(1, simpler.evaluation.background[i]) : 1;
    clamp(site.params.intensity, depth / normalization * Math.PI * site.params.fwhm.value * (site.kind === 'Singlet' ? .5 : 1), 0);
  }
  return p;
}
function widthBoundStart(project: Project) {
  const p = structuredClone(project); let changed = false;
  const steps = p.spectrum.x.slice(1).map((x,i) => x-p.spectrum.x[i]).sort((a,b) => a-b);
  const step = steps[Math.floor(steps.length/2)] ?? 0;
  const targets = new Set([...p.background, ...p.sites.flatMap(siteParameters)].flatMap(parameter => parameter.link ? [parameter.link.target] : []));
  for (const [index,site] of p.sites.entries()) {
    const width = site.params.fwhm, lower = Math.max(1e-6, width.min ?? 1e-6);
    // A very narrow component may approach its existing bound extremely
    // slowly. Try that boundary as a start; the width remains free to move.
    if (width.fit && !width.link && !targets.has(`site:${index}:fwhm`) && width.value > lower && width.value <= Math.max(1.5 * lower,2 * step)) {
      width.value = lower; changed = true;
    }
  }
  return changed ? p : null;
}
export type PreparedComparison = Pick<ComparisonResult, 'options' | 'simpler' | 'larger' | 'improvement' | 'noiseStd'> & {
  fitAttempts: NonNullable<ComparisonResult['fitAttempts']>;
};
export type SimulationOutcome = {
  index: number; improvement: number; diagnostic: ComparisonResult['diagnostics'][number];
  fitAttempts: NonNullable<ComparisonResult['fitAttempts']>;
  verifiedStationary: number; rankDeficient: boolean; bounded: boolean;
};
type LocalFit = (p: Project, algorithm?: 'trf' | 'bounded-lm') => FitResult;
type Progress = (p: ComparisonProgress) => void;
type NumericalStep = { method: 'fit'; project: Project; algorithm?: 'trf' | 'bounded-lm' } | { method: 'evaluate'; project: Project };
type NumericalSteps<T> = Generator<NumericalStep, T, FitResult | Evaluation>;
type AsyncFit = (p: Project, algorithm?: 'trf' | 'bounded-lm') => Promise<FitResult>;
type AsyncEvaluate = (p: Project) => Promise<Evaluation>;
function drive<T>(steps: NumericalSteps<T>, fit: LocalFit, evaluate: (p: Project) => Evaluation): T {
  let state = steps.next();
  while (!state.done) {
    let value: FitResult | Evaluation;
    try { const step = state.value; value = step.method === 'fit' ? fit(step.project, step.algorithm) : evaluate(step.project); }
    catch (error) { state = steps.throw(error); continue; }
    state = steps.next(value);
  }
  return state.value;
}
async function driveAsync<T>(steps: NumericalSteps<T>, fit: AsyncFit, evaluate: AsyncEvaluate): Promise<T> {
  let state = steps.next();
  while (!state.done) {
    let value: FitResult | Evaluation;
    try { const step = state.value; value = await (step.method === 'fit' ? fit(step.project, step.algorithm) : evaluate(step.project)); }
    catch (error) { state = steps.throw(error); continue; }
    state = steps.next(value);
  }
  return state.value;
}

function createRefitter(options: ComparisonOptions, notify: Progress, fitAttempts: NonNullable<ComparisonResult['fitAttempts']>) {
  function* refit(project: Project, stage: string, completed: number, nullFit?: FitResult): NumericalSteps<FitResult> {
    const attempts: NonNullable<ComparisonResult['fitAttempts']>[number]['attempts'] = [];
    fitAttempts.push({ stage, attempts });
    let best: FitResult | null = null, bestAcceptable: FitResult | null = null;
    const sufficient = (f: FitResult) => acceptableFit(f) && Number.isFinite(f.evaluation.objective) && f.dof > 0
      && (!f.search || (!f.search.failed_starts && f.search.completed === f.search.requested))
      && (!nullFit || f.evaluation.objective <= nullFit.evaluation.objective + 1e-7 * Math.max(1, nullFit.evaluation.objective));
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate: Project | null = attempt === 0 ? structuredClone(project)
        : attempt === 1 && nullFit ? nullStart(project, nullFit)
        : attempt === 2 && nullFit ? residualStart(project, nullFit)
        : attempt === 4 ? widthBoundStart(best!.project)
        : attempt === 5 ? structuredClone(project) : structuredClone(best!.project);
      if (!candidate) continue;
      if (attempt === 5) candidate.search_starts = Math.max(5, project.search_starts ?? 1);
      const iterationLimit = attempt === 0 ? project.max_iterations
        : Math.min(2000, Math.max(project.max_iterations, [0, 400, 1000, 2000, 2000, 1000][attempt]));
      candidate.max_iterations = iterationLimit;
      if (attempt) notify({ phase: `${stage}: recovery ${attempt}`, completed, total: options.simulations });
      const algorithm = attempt >= 2 && attempt !== 5 && !(attempt === 2 && nullFit) ? 'bounded-lm' : 'trf';
      const fitted = (yield { method: 'fit', project: candidate, algorithm }) as FitResult;
      attempts.push({ ...diagnostic(fitted), start: attempt === 0 ? 'supplied model start' : attempt === 1 && nullFit ? 'simpler-fit start, 5% added area' : attempt === 2 && nullFit ? 'simpler-fit start, residual peaks for added singlets/doublets' : attempt === 4 ? 'best attempt, near-bound free widths started at existing lower bounds' : attempt === 5 ? 'supplied model start with at least five deterministic starting models' : 'continue best attempt', iterationLimit, algorithm, ...(fitted.search ? { search: structuredClone(fitted.search) } : {}) });
      if (!best || fitted.evaluation.objective < best.evaluation.objective) best = fitted;
      if (sufficient(fitted) && (!bestAcceptable || fitted.evaluation.objective < bestAcceptable.evaluation.objective)) bestAcceptable = fitted;
      if (bestAcceptable && bestAcceptable.evaluation.objective <= best.evaluation.objective + 1e-7 * Math.max(1, best.evaluation.objective)) {
        // Keep the model's configured iteration budget for subsequent datasets;
        // the per-attempt diagnostics preserve recovery budgets and outcomes.
        bestAcceptable.project.max_iterations = project.max_iterations;
        bestAcceptable.project.search_starts = project.search_starts;
        return bestAcceptable;
      }
    }
    checkFit(best!, `${stage} after ${attempts.length - 1} recovery attempts`);
    if (nullFit) improvement(nullFit, best!, `${stage} after ${attempts.length - 1} recovery attempts`);
    throw new Error(`${stage}: no reliable fit was found after bounded recovery. No simulated spectra were discarded.`);
  }
  return refit;
}
function* prepareComparisonSteps(a: Project, b: Project, options: ComparisonOptions, notify: Progress): NumericalSteps<PreparedComparison> {
  const issue = nestingIssue(a, b) ?? noiseIssue(a, options);
  if (issue) throw new Error(issue);
  if (!Number.isInteger(options.simulations) || options.simulations < 99 || options.simulations > 9999) throw new Error('Choose 99–9,999 simulations.');
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error('Seed must be an integer from 0 to 4,294,967,295.');
  if (!['poisson', 'gaussian'].includes(options.noise)) throw new Error('Choose a supported noise model.');
  if (options.workers !== undefined && (!Number.isInteger(options.workers) || options.workers < 0 || options.workers > 16)) throw new Error('Choose Auto or 1–16 parallel workers.');
  const fitAttempts: NonNullable<ComparisonResult['fitAttempts']> = [];
  const refit = createRefitter(options, notify, fitAttempts);
  notify({ phase: 'Fitting observed simpler model', completed: 0, total: options.simulations });
  const simpler = yield* refit(a, 'Observed simpler model', 0); checkFit(simpler, 'Observed simpler model');
  notify({ phase: 'Fitting observed larger model', completed: 0, total: options.simulations });
  const larger = yield* refit(b, 'Observed larger model', 0, simpler); checkFit(larger, 'Observed larger model');
  if (larger.free_parameters <= simpler.free_parameters) throw new Error('The larger model must have more independent free parameters.');
  const observed = improvement(simpler, larger, 'Observed models');
  // Independently check the null embedding in the actual numerical core.
  const embedded = structuredClone(larger.project);
  embedded.background = structuredClone(simpler.project.background);
  embedded.sites.splice(0, simpler.project.sites.length, ...structuredClone(simpler.project.sites));
  embedded.sites.slice(simpler.project.sites.length).forEach(site => { site.params.intensity.value = 0; });
  const nullCurve = ((yield { method: 'evaluate', project: embedded }) as Evaluation).y;
  if (nullCurve.some((v, i) => Math.abs(v - simpler.evaluation.y[i]) > 1e-8 * Math.max(1, Math.abs(v)))) throw new Error('The larger model could not reproduce the simpler model with added intensities set to zero.');
  const std = options.noise === 'gaussian' ? Math.sqrt(simpler.evaluation.sse / simpler.dof) : null;
  if (std !== null && (!(std > 0) || !Number.isFinite(std))) throw new Error('The simpler fit must have a positive finite residual std for Gaussian simulations.');
  return { options: { ...options }, simpler, larger, improvement: observed, noiseStd: std, fitAttempts };
}
// One ordered RNG stream generates the exact same observations as the original
// serial implementation. Fitting order and worker count never affect sampling.
export function comparisonGenerator(prepared: PreparedComparison) {
  const random = seededRandom(prepared.options.seed); let index = 0;
  return () => index >= prepared.options.simulations ? null : {
    index: index++, y: simulateSpectrum(prepared.simpler.evaluation.y, prepared.options, prepared.noiseStd, random),
  };
}
function* simulationSteps(prepared: PreparedComparison, index: number, y: number[], notify: Progress): NumericalSteps<SimulationOutcome> {
  const { simpler, larger, options } = prepared;
  if (!Number.isInteger(index) || index < 0 || index >= options.simulations || y.length !== simpler.project.spectrum.y.length || y.some(v => !Number.isFinite(v))) throw new Error('Invalid simulated spectrum.');
  const stage = `Simulation ${index + 1}`, fitAttempts: NonNullable<ComparisonResult['fitAttempts']> = [];
  const refit = createRefitter(options, notify, fitAttempts);
  notify({ phase: `${stage}: simpler model`, completed: index, total: options.simulations });
  if (simpler.project.weighting === 'counts' && y.some(v => v === 0)) throw new Error(`${stage}: Poisson sampling produced zero counts, which 1 / observed counts weighting cannot fit. Use unweighted fitting for both models. No zero counts are replaced or simulations discarded.`);
  const data = { x: simpler.project.spectrum.x, y };
  const sf = yield* refit({ ...structuredClone(simpler.project), spectrum: data }, `${stage}, simpler model`, index); checkFit(sf, `${stage}, simpler model`);
  notify({ phase: `${stage}: larger model`, completed: index, total: options.simulations });
  const lf = yield* refit({ ...structuredClone(larger.project), spectrum: data }, `${stage}, larger model`, index, sf); checkFit(lf, `${stage}, larger model`);
  return { index, improvement: improvement(sf, lf, stage), diagnostic: { simpler: diagnostic(sf), larger: diagnostic(lf) }, fitAttempts,
    verifiedStationary: Number(!sf.converged) + Number(!lf.converged),
    rankDeficient: sf.rank < sf.free_parameters || lf.rank < lf.free_parameters,
    bounded: [...sf.warnings, ...lf.warnings].some(w => /at a bound/.test(w)) };
}
// Both backends run the same recovery/acceptance state machine.
export function prepareComparison(a: Project, b: Project, options: ComparisonOptions, fit: LocalFit, evaluate: (p: Project) => Evaluation, notify: Progress = () => {}): PreparedComparison {
  return drive(prepareComparisonSteps(a, b, options, notify), fit, evaluate);
}
export function prepareComparisonAsync(a: Project, b: Project, options: ComparisonOptions, fit: AsyncFit, evaluate: AsyncEvaluate, notify: Progress = () => {}) {
  return driveAsync(prepareComparisonSteps(a, b, options, notify), fit, evaluate);
}
export function fitComparisonSimulation(prepared: PreparedComparison, index: number, y: number[], fit: LocalFit,
  notify: Progress = () => {}): SimulationOutcome {
  return drive(simulationSteps(prepared, index, y, notify), fit, () => { throw new Error('Unexpected evaluation'); });
}
export function fitComparisonSimulationAsync(prepared: PreparedComparison, index: number, y: number[], fit: AsyncFit, notify: Progress = () => {}) {
  return driveAsync(simulationSteps(prepared, index, y, notify), fit, async () => { throw new Error('Unexpected evaluation'); });
}
export function completeComparison(prepared: PreparedComparison, outcomes: SimulationOutcome[]): ComparisonResult {
  const { simpler, larger, options, improvement: observed, noiseStd } = prepared;
  if (outcomes.length !== options.simulations) throw new Error('The comparison is incomplete; no simulation p-value can be computed.');
  const ordered: SimulationOutcome[] = new Array(options.simulations);
  for (const outcome of outcomes) {
    if (!Number.isInteger(outcome.index) || outcome.index < 0 || outcome.index >= options.simulations || ordered[outcome.index] || !Number.isFinite(outcome.improvement) || outcome.improvement < 0) throw new Error('Missing, duplicate, or invalid simulation result.');
    ordered[outcome.index] = outcome;
  }
  const improvements = ordered.map(o => o.improvement), diagnostics = ordered.map(o => o.diagnostic);
  const fitAttempts = [...prepared.fitAttempts, ...ordered.flatMap(o => o.fitAttempts)], warnings: string[] = [];
  const exceedances = improvements.filter(delta => delta >= observed).length;
  const rankDeficient = ordered.filter(o => o.rankDeficient).length, bounded = ordered.filter(o => o.bounded).length;
  const verifiedStationary = Number(!simpler.converged) + Number(!larger.converged) + ordered.reduce((sum, o) => sum + o.verifiedStationary, 0);
  if (verifiedStationary) warnings.push(`${verifiedStationary} fits stopped with a numerical solver status but passed the independent bound-projected residual-gradient check (maximum normalized component ≤ 1e-6). Original termination codes are retained for observed fits.`);
  const recovered = fitAttempts.filter(a => a.attempts.length > 1).length;
  if (recovered) warnings.push(`${recovered} fits needed automatic recovery on the same data, using simpler-model/residual-peak starts, existing width-bound starts, bounded Levenberg–Marquardt continuation, or a deterministic multi-start search with up to 2,000 iterations per start. All attempts, algorithms, searches, and termination codes are included in the report.`);
  if (rankDeficient) warnings.push(`${rankDeficient} simulated pairs had rank-deficient parameters. This can occur when an added component vanishes; its symmetric parameter uncertainties are unavailable.`);
  if (bounded) warnings.push(`${bounded} simulated pairs reached parameter bounds.`);
  if (simpler.rank < simpler.free_parameters || larger.rank < larger.free_parameters) warnings.push('An observed fit is rank deficient; inspect parameter identifiability and residuals.');
  warnings.push('This plug-in parametric bootstrap assumes the fitted simpler model and chosen noise process. It does not establish the physical identity of an added site or guarantee global optimization.');
  return { version: 1, method: 'parametric-bootstrap', options: { ...options }, simpler, larger,
    improvement: observed, fStatistic: larger.evaluation.objective > 0 ? observed / (larger.free_parameters - simpler.free_parameters) / (larger.evaluation.objective / larger.dof) : null,
    exceedances, ...monteCarloSummary(exceedances, options.simulations), noiseStd, improvements, warnings, diagnostics, fitAttempts };
}

export function runComparison(a: Project, b: Project, options: ComparisonOptions, fit: LocalFit,
  evaluate: (p: Project) => Evaluation, notify: Progress = () => {}): ComparisonResult {
  const prepared = prepareComparison(a, b, options, fit, evaluate, notify), next = comparisonGenerator(prepared);
  const outcomes: SimulationOutcome[] = [];
  for (let job = next(); job; job = next()) {
    outcomes.push(fitComparisonSimulation(prepared, job.index, job.y, fit, notify));
    notify({ phase: 'Simulating under the simpler model', completed: outcomes.length, total: options.simulations });
  }
  return completeComparison(prepared, outcomes);
}

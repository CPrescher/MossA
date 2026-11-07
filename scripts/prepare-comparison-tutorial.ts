// Node 26: node --import tsx scripts/prepare-comparison-tutorial.ts
// Production-WASM parametric bootstrap; browser animation replays these results.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import init, { evaluate_json, fit_json, fit_recovery_json } from '../src/wasm/mossa_core.js';
import { fitMultiStart } from '../src/multistart.mjs';
import { parameter, newSite, type Project, type FitResult } from '../src/types';
import { newNuclearConstants } from '../src/nuclear-constants.mjs';
import { seededRandom, normalSample, prepareComparison, comparisonGenerator, fitComparisonSimulation, completeComparison, type ComparisonOptions } from '../src/comparison';
import { workspaceFromSnapshot, activeSpectrum } from '../src/workspace';
import { summarizeFit } from '../src/session';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';

const root = new URL('../manual/public/tutorial-data/site-comparison/', import.meta.url);
await mkdir(root, { recursive: true });
await init({ module_or_path: await readFile(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const evaluate = (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));
const fit = (p: Project, algorithm: 'trf' | 'bounded-lm' = 'trf'): FitResult => fitMultiStart(p,
  q => JSON.parse(algorithm === 'bounded-lm' ? fit_recovery_json(JSON.stringify(q)) : fit_json(JSON.stringify(q))), evaluate);
const options: ComparisonOptions = { simulations: 199, seed: 12345, noise: 'gaussian', doubledFirstChannel: false, workers: 1 };
const constants = newNuclearConstants();
const x = Array.from({ length: 81 }, (_, i) => -4 + i / 10);
const lines = [{ center: -.6, width: .45 }, { center: 1.1, width: .4 }];
const cal = { max: 4, shift: 0, sinusoidal: false, folding: false, center: 41, nuclear_constants: constants };
function models(extra: number): [Project, Project] {
  const site = newSite(0, 'Singlet'); site.name = 'Main line · fixed shape';
  site.params.cs = parameter(lines[0].center, false); site.params.fwhm = parameter(lines[0].width, false);
  site.params.intensity = parameter(80, true, 0);
  const a: Project = { nuclear_constants: constants, spectrum: { x, y: x.map(() => 1000) }, sites: [site],
    background: [parameter(1000)], mode: 'thin', source_fwhm: .097, source_squared: false,
    weighting: 'unweighted', max_iterations: 400, search_starts: 1 };
  const b = structuredClone(a), added = newSite(1, 'Singlet'); added.name = 'Extra line · fixed shape';
  added.params.cs = parameter(lines[1].center, false); added.params.fwhm = parameter(lines[1].width, false);
  added.params.intensity = parameter(extra, true, 0); b.sites.push(added);
  const truth = evaluate(b), rng = seededRandom(42);
  a.spectrum.y = truth.y.map((mu: number) => mu + 2 * normalSample(rng)); b.spectrum = structuredClone(a.spectrum);
  b.sites[1].params.intensity.value = 1;
  return [a, b];
}
const display = (f: FitResult) => ({ parameters: [f.project.background[0].value, ...f.project.sites.map(s => s.params.intensity.value)],
  objective: f.evaluation.objective, free: f.free_parameters, dof: f.dof });
const round = (v: number) => +v.toFixed(6);
const cases = [];
for (const [id, label, amplitude] of [['absent', 'No extra line', 0], ['weak', 'Weak extra line', 1], ['clear', 'Clear extra line', 8]] as const) {
  const [a, b] = models(amplitude);
  const prepared = prepareComparison(a, b, options, fit, evaluate);
  const next = comparisonGenerator(prepared), outcomes = [], samples = [];
  for (let job = next(); job; job = next()) {
    const calls: FitResult[] = [];
    const outcome = fitComparisonSimulation(prepared, job.index, job.y, (project, algorithm) => { const f = fit(project, algorithm); calls.push(f); return f; });
    const best = (sites: number) => calls.filter(f => f.project.sites.length === sites && Number.isFinite(f.evaluation.objective))
      .sort((a, b) => a.evaluation.objective - b.evaluation.objective)[0];
    const sf = best(1), lf = best(2);
    if (Math.abs(sf.evaluation.objective - outcome.diagnostic.simpler.objective) > 1e-6 || Math.abs(lf.evaluation.objective - outcome.diagnostic.larger.objective) > 1e-6) throw new Error('Replay fit mismatch.');
    outcomes.push(outcome); samples.push({ y: job.y.map(round), simpler: display(sf), larger: display(lf) });
  }
  const result = completeComparison(prepared, outcomes);
  const provenance = { purpose: 'Synthetic teaching example; fixed singlet positions and widths, Gaussian noise std 2. No measured spectra or unknown source parameters.',
    generationSeed: 42, generationExtraIntensity: amplitude, options, method: result.method, report: `${id}-report.json` };
  const workspace = workspaceFromSnapshot({ project: result.simpler.project, raw: null, cal, filename: `Synthetic · ${label}`, selected: 0, fit: summarizeFit(result.simpler), fitElapsed: null });
  workspace.name = `Site-comparison teaching · ${label}`;
  const entry = activeSpectrum(workspace);
  entry.models = [result.simpler, result.larger].map((f, i) => { const { spectrum: _, ...project } = f.project; return { id: `teaching-${id}-${i}`, name: i ? 'Two lines · extra area free' : 'One line', project, selected: i, fit: summarizeFit(f), fitElapsed: null }; });
  entry.activeModelId = entry.models[1].id;
  const file = await createWorkspaceFile(workspace, provenance);
  const reopened = await openWorkspaceFile(file, cal, `${id}.mossa`, async p => evaluate(p));
  if (reopened.notice || activeSpectrum(reopened.workspace).models.some(m => !m.fit)) throw new Error(`Project binding failed: ${id}`);
  await writeFile(new URL(`${id}.mossa`, root), JSON.stringify(file, null, 2) + '\n');
  await writeFile(new URL(`${id}-report.json`, root), JSON.stringify({ provenance, result }, null, 2) + '\n');
  cases.push({ id, label, amplitude, y: a.spectrum.y.map(round), simpler: display(result.simpler), larger: display(result.larger),
    improvement: result.improvement, f: result.fStatistic, noiseStd: result.noiseStd, exceedances: result.exceedances,
    p: result.pValue, interval: result.monteCarloInterval, improvements: result.improvements, samples });
  console.log(JSON.stringify({ id, improvement: result.improvement, f: result.fStatistic, exceedances: result.exceedances, p: result.pValue, interval: result.monteCarloInterval }));
}
await writeFile(new URL('replay.json', root), JSON.stringify({ version: 1, points: x, lines, simulations: options.simulations,
  seed: options.seed, generationSeed: 42, noise: 'Gaussian, true std 2; bootstrap std estimated separately from each simpler observed fit',
  wasmSHA256: createHash('sha256').update(await readFile(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url))).digest('hex'),
  displayPrecision: 'Observation values rounded to six decimals for replay. Full-precision fits, statistics, and diagnostics are in each report.', cases }) + '\n');

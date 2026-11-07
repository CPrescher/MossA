import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json, fit_recovery_json } from '../src/wasm/mossa_core.js';
import { fitMultiStart } from '../src/multistart.mjs';
import { parameter, newSite, type FitResult, type Project } from '../src/types';
import { acceptableFit, monteCarloSummary, nestingIssue, noiseIssue, normalSample, poissonSample, runComparison, seededRandom, simulateSpectrum, prepareComparison, comparisonGenerator, fitComparisonSimulation, completeComparison, type ComparisonOptions } from '../src/comparison';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const evaluate = (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));
const fit = (p: Project, algorithm: 'trf' | 'bounded-lm' = 'trf'): FitResult => fitMultiStart(p, q => JSON.parse(algorithm === 'bounded-lm' ? fit_recovery_json(JSON.stringify(q)) : fit_json(JSON.stringify(q))), evaluate);
const options: ComparisonOptions = { simulations: 99, seed: 12345, noise: 'gaussian', doubledFirstChannel: false };
function models(extra = 0, counts = false): [Project, Project] {
  const site = newSite(0, 'Singlet'); site.params.cs.value = -.6; site.params.fwhm.value = .45;
  site.params.intensity.value = counts ? 2000 : 80;
  site.params.cs.fit = false; site.params.fwhm.fit = false;
  const a: Project = { spectrum: { x: Array.from({ length: 81 }, (_, i) => -4 + i / 10), y: Array(81).fill(1000) }, sites: [site],
    background: [parameter(counts ? 20000 : 1000)], mode: 'thin', source_fwhm: .097, source_squared: false, weighting: counts ? 'counts' : 'unweighted', max_iterations: 400, search_starts: 1 };
  const b = structuredClone(a), added = newSite(1, 'Singlet');
  added.params.cs.value = 1.1; added.params.cs.fit = false; added.params.fwhm.value = .4; added.params.fwhm.fit = false;
  added.params.intensity.value = extra; b.sites.push(added);
  const truth = evaluate(b), random = seededRandom(87231);
  a.spectrum.y = truth.y.map((mu: number) => counts ? poissonSample(mu, random) : mu + 2 * normalSample(random));
  b.spectrum = structuredClone(a.spectrum);
  b.sites[1].params.intensity.value = counts ? 100 : 10;
  return [a, b];
}
test('nested constraints distinguish free starting values from changes in scientific hypotheses', () => {
  const [a, b] = models();
  assert.equal(nestingIssue(a, b), null);
  b.sites[0].params.intensity.value += 30; assert.equal(nestingIssue(a, b), null);
  const changes: [(p: Project) => void, RegExp][] = [
    [p => { p.weighting = 'counts'; }, /weighting/],
    [p => { p.spectrum.y[0]++; }, /observations/],
    [p => { p.sites[0].params.cs.value += .1; }, /original sites/],
    [p => { p.sites[0].params.intensity.max = 999; }, /original sites/],
    [p => { p.background[0].fit = false; }, /background/],
    [p => { p.sites[1].params.intensity.min = 1; }, /allow zero/],
    [p => { p.sites[1].params.intensity.max = 0; }, /allow zero/],
    [p => { p.sites[1].params.cs.link = { target: 'site:0:cs', factor: 1 }; }, /links/],
    [p => { p.mode = 'transmission'; }, /absorber mode/],
  ];
  for (const [change, message] of changes) { const p = structuredClone(b); change(p); assert.match(nestingIssue(a, p)!, message); }
  assert.match(nestingIssue(a, a)!, /additional sites/);
});
test('Poisson sampler has integer support, mean, and variance over low and high count regimes', () => {
  for (const mean of [.1, 5, 10, 100, 100000]) {
    const random = seededRandom(11), n = 60000; let sum = 0, squares = 0;
    for (let i = 0; i < n; i++) { const k = poissonSample(mean, random); assert.ok(Number.isInteger(k) && k >= 0); sum += k; squares += (k - mean) ** 2; }
    assert.ok(Math.abs(sum / n - mean) < 5 * Math.sqrt(mean / n), `mean ${mean}: ${sum / n}`);
    assert.ok(Math.abs(squares / n / mean - 1) < .045, `variance ${mean}: ${squares / n}`);
  }
  assert.equal(poissonSample(0, seededRandom(1)), 0);
  assert.throws(() => poissonSample(-1, seededRandom(1)), /means/);
});
test('Gaussian sampler and doubled turnaround have the required variance and reproducible seeds', () => {
  const random = seededRandom(1), n = 30000; let sum = 0, squares = 0, doubleVariance = 0;
  const opt = { ...options, noise: 'poisson' as const, doubledFirstChannel: true };
  for (let i = 0; i < n; i++) {
    const v = normalSample(random); sum += v; squares += v * v;
    const y = simulateSpectrum([100, 100], opt, null, random); assert.equal(y[0] % 2, 0); doubleVariance += (y[0] - 100) ** 2;
  }
  assert.ok(Math.abs(sum / n) < .02); assert.ok(Math.abs(squares / n - 1) < .03);
  assert.ok(Math.abs(doubleVariance / n - 200) < 8);
  assert.deepEqual(simulateSpectrum([100, 200], opt, null, seededRandom(5)), simulateSpectrum([100, 200], opt, null, seededRandom(5)));
});
test('Monte Carlo p-values never report zero and the uncertainty interval reflects resolution', () => {
  const low = monteCarloSummary(0, 99), high = monteCarloSummary(99, 99), middle = monteCarloSummary(5, 99);
  assert.equal(low.pValue, .01); assert.equal(high.pValue, 1);
  assert.ok(low.monteCarloInterval[1] < .05); assert.ok(middle.monteCarloInterval[0] < .05 && middle.monteCarloInterval[1] > .05);
  assert.ok(monteCarloSummary(0, 999).monteCarloInterval[1] < low.monteCarloInterval[1]);
});
test('actual WASM bootstrap detects a real extra line and reproduces the complete result without mutating models', () => {
  const [a, b] = models(35), before = JSON.stringify([a, b]), progress: number[] = [];
  const result = runComparison(a, b, options, fit, evaluate, p => progress.push(p.completed));
  assert.equal(result.pValue, .01); assert.equal(result.exceedances, 0); assert.equal(result.improvements.length, 99);
  assert.equal(result.simpler.free_parameters, 2); assert.equal(result.larger.free_parameters, 3);
  assert.ok(result.improvement > 100); assert.ok(result.noiseStd! > 2);
  assert.equal(progress.at(-1), 99); assert.equal(JSON.stringify([a, b]), before);
  assert.deepEqual(runComparison(a, b, options, fit, evaluate), result);
});
test('actual WASM bootstrap does not justify an absent component in a null spectrum', () => {
  const [a, b] = models();
  const result = runComparison(a, b, options, fit, evaluate);
  assert.ok(result.pValue > .05, `null p=${result.pValue}`);
});
test('actual WASM bootstrap supports count weighting and Poisson simulation', () => {
  const [a, b] = models(800, true), opt = { ...options, noise: 'poisson' as const };
  assert.equal(noiseIssue(a, opt), null);
  const result = runComparison(a, b, opt, fit, evaluate);
  assert.equal(result.pValue, .01); assert.equal(result.noiseStd, null); assert.equal(result.improvements.length, 99);
  assert.match(noiseIssue(a, options)!, /unweighted/);
  const [continuous] = models(); assert.match(noiseIssue(continuous, opt)!, /integer counts/);
});
test('failed, unconverged, incomplete-search, or worse-fitting pairs invalidate the run instead of disappearing from its denominator', () => {
  const [a, b] = models(35); let calls = 0;
  assert.throws(() => runComparison(a, b, options, p => { const f = fit(p); if (++calls >= 3) { f.converged = false; f.termination = 'MaxIter'; } return f; }, evaluate), /Simulation 1.*did not converge/);
  calls = 0;
  assert.throws(() => runComparison(a, b, options, p => { const f = fit(p); if (++calls >= 4) f.evaluation.objective = 1e30; return f; }, evaluate), /Simulation 1.*fitted worse/);
  assert.throws(() => runComparison(a, b, options, () => { throw new Error('Fitting failed'); }, evaluate), /Fitting failed/);
  assert.throws(() => runComparison(a, b, { ...options, simulations: 10 }, fit, evaluate), /99/);
  assert.throws(() => runComparison(a, b, { ...options, seed: -1 }, fit, evaluate), /Seed/);
  assert.throws(() => runComparison(a, b, options, p => { const f = fit(p); f.search = { requested: 4, completed: 3, best_start: 1, failed_starts: 1, rejected_candidates: 0, total_iterations: 1, objectives: [1, 2, 3] }; return f; }, evaluate), /search starts failed/);
});
test('independent stationarity diagnostic recognizes a constrained optimum and rejects unresolved numerical and iteration-limit stops', () => {
  const [a] = models();
  a.background[0].fit = false;
  a.spectrum.y = a.spectrum.y.map(() => a.background[0].value + 2);
  const f = fit(a);
  assert.ok(f.project.sites[0].params.intensity.value < 1e-6);
  assert.ok(f.stationarity! <= 1e-6, `bound stationarity ${f.stationarity}`);
  assert.equal(acceptableFit({ converged: false, termination: 'NumericalNoProgress', stationarity: f.stationarity }), true);
  assert.equal(acceptableFit({ converged: false, termination: 'SolverFailed', stationarity: .01 }), false);
  assert.equal(acceptableFit({ converged: false, termination: 'SolverFailed', stationarity: null }), false);
  assert.equal(acceptableFit({ converged: false, termination: 'MaxIterations', stationarity: 0 }), false);
});
test('Poisson simulations with zero counts invalidate count weighting instead of clipping or discarding the sample', () => {
  const [a, b] = models(0, true);
  a.spectrum.y = a.spectrum.y.map(() => 1); b.spectrum = structuredClone(a.spectrum);
  a.sites = []; a.background[0].value = 1; b.sites = [b.sites[1]]; b.background[0].value = 1;
  b.sites[0].params.intensity.value = .01;
  assert.throws(() => runComparison(a, b, { ...options, noise: 'poisson' }, fit, evaluate), /zero counts.*No zero counts are replaced/);
});

test('a stalled simulated fit is recovered on the same observations with recorded bounded attempts and unchanged constraints', () => {
  const [a, b] = models(35), before = JSON.stringify([a, b]); let calls = 0; let recoveryData: number[] | undefined;
  const result = runComparison(a, b, options, p => {
    const f = fit(p);
    if (calls === 3) recoveryData = [...p.spectrum.y];
    if (calls === 4) { assert.deepEqual(p.spectrum.y, recoveryData); assert.equal(nestingIssue({ ...a, spectrum: p.spectrum }, p), null); }
    if (++calls === 4) { f.converged = false; f.termination = 'MaxIter'; }
    return f;
  }, evaluate);
  assert.equal(result.improvements.length, 99); assert.equal(result.diagnostics.length, 99);
  const recovered = result.fitAttempts!.find(a => a.stage === 'Simulation 1, larger model')!;
  assert.ok(recovered.attempts.length >= 2); assert.ok(recovered.attempts.length <= 6);
  assert.equal(recovered.attempts[0].termination, 'MaxIter');
  assert.equal(recovered.attempts[1].start, 'simpler-fit start, 5% added area');
  assert.ok(recovered.attempts.every(a => a.iterationLimit <= 2000));
  assert.equal(result.simpler.project.max_iterations, a.max_iterations);
  assert.equal(result.larger.project.max_iterations, b.max_iterations);
  assert.equal(JSON.stringify([a, b]), before);
  assert.ok(result.warnings.some(w => w.includes('automatic recovery')));
});
test('Gaussian and Poisson results and recovery diagnostics are unchanged when simulated fits complete in reverse order', () => {
  for (const noise of ['gaussian', 'poisson'] as const) {
    const [a,b] = models(noise === 'gaussian' ? 35 : 800,noise === 'poisson'), opt = {...options,noise};
    const expected = runComparison(a,b,opt,fit,evaluate), prepared = prepareComparison(a,b,opt,fit,evaluate);
    const next = comparisonGenerator(prepared), jobs: {index:number;y:number[]}[] = [];
    for (let job = next(); job; job = next()) jobs.push(job);
    const outcomes = jobs.reverse().map(job=>fitComparisonSimulation(prepared,job.index,job.y,fit));
    assert.deepEqual(completeComparison(prepared,outcomes),expected);
    assert.throws(()=>completeComparison(prepared,outcomes.slice(1)),/incomplete/);
    assert.throws(()=>completeComparison(prepared,[...outcomes.slice(1),outcomes[1]]),/duplicate/);
  }
});
test('residual-based recovery retains the same simulated observations, constraints, and complete denominator', () => {
  const [a,b] = models(35); let phase = '', attempts = 0; const observations: number[][] = [];
  const result = runComparison(a,b,options,(p,algorithm)=>{
    const f = fit(p,algorithm);
    if (/^Simulation 1[,:]/.test(phase) && phase.includes('larger model')) {
      observations.push([...p.spectrum.y]); attempts++;
      assert.equal(nestingIssue({...a,spectrum:p.spectrum},p),null);
      if (attempts <= 2) { f.converged = false; f.termination = 'MaxIter'; }
    }
    return f;
  },evaluate,p=>{phase=p.phase;});
  assert.ok(attempts >= 3); assert.deepEqual(observations[0],observations[1]); assert.deepEqual(observations[1],observations[2]);
  assert.match(result.fitAttempts!.find(a=>a.stage==='Simulation 1, larger model')!.attempts[2].start,/residual peaks/);
  assert.equal(result.improvements.length,99);
});
test('bounded LM recovery preserves fixed values, linked intensity ratios, linked bounds, and original model inputs', () => {
  for (const counts of [false,true]) {
    const [,b] = models(counts ? 800 : 35,counts);
    b.sites[0].params.intensity.value = counts ? 1000 : 20;
    b.sites[1].params.intensity.link = {target:'site:0:intensity',factor:.25};
    b.sites[1].params.intensity.max = counts ? 400 : 10;
    const before = JSON.stringify(b), initial = evaluate(b).objective, result = fit(b,'bounded-lm');
    assert.equal(acceptableFit(result),true);
    assert.ok(result.evaluation.objective < initial);
    assert.ok(result.project.sites[1].params.intensity.value <= b.sites[1].params.intensity.max! * (1+1e-10));
    assert.equal(result.project.sites[1].params.intensity.value,.25*result.project.sites[0].params.intensity.value);
    for (let i=0;i<2;i++) { assert.equal(result.project.sites[i].params.cs.value,b.sites[i].params.cs.value); assert.equal(result.project.sites[i].params.fwhm.value,b.sites[i].params.fwhm.value); }
    assert.equal(JSON.stringify(b),before);
  }
});
test('a stalled width narrower than the channel spacing is retried at its existing bound while remaining free', () => {
  const [a,b] = models(35), originalSimpler = JSON.stringify(a);
  b.sites[1].params.fwhm.fit = true; b.sites[1].params.fwhm.min = .01;
  const configured = JSON.stringify(b); let attempts = 0;
  const prepared = prepareComparison(a,b,options,(p,algorithm)=>{
    if (p.sites.length === 1) return fit(p,algorithm);
    attempts++;
    if (attempts === 5) {
      assert.equal(algorithm,'bounded-lm');
      assert.equal(p.sites[1].params.fwhm.value,.01);
      assert.equal(p.sites[1].params.fwhm.fit,true);
      assert.equal(nestingIssue(a,p),null);
      assert.deepEqual(p.spectrum,a.spectrum);
      assert.deepEqual(p.sites[0].params.fwhm,a.sites[0].params.fwhm);
    }
    const f = fit(p,algorithm);
    if (attempts <= 4) {
      f.project.sites[1].params.fwhm.value = .06;
      f.evaluation.objective = 1e20;
      f.converged = false; f.termination = 'MaxIter';
    }
    return f;
  },evaluate);
  assert.equal(attempts,5);
  assert.match(prepared.fitAttempts[1].attempts[4].start,/existing lower bounds/);
  assert.equal(prepared.fitAttempts[1].attempts[4].iterationLimit,2000);
  assert.equal(JSON.stringify(b),configured);
  assert.equal(JSON.stringify(a),originalSimpler);
});
test('persistent local failure invokes a recorded deterministic search without propagating recovery settings', () => {
  const [a,b] = models(35), original = JSON.stringify([a,b]); let attempts = 0;
  const prepared = prepareComparison(a,b,options,(p,algorithm)=>{
    const f = fit(p,algorithm);
    if (p.sites.length === 2 && ++attempts <= 4) {
      f.converged = false; f.termination = 'MaxIter'; f.evaluation.objective = 1e20;
    }
    return f;
  },evaluate);
  const last = prepared.fitAttempts[1].attempts.at(-1)!;
  assert.equal(attempts,5);
  assert.match(last.start,/five deterministic/);
  assert.equal(last.algorithm,'trf'); assert.equal(last.iterationLimit,1000);
  assert.equal(last.search?.requested,5); assert.equal(last.search?.completed,5);
  assert.equal(prepared.larger.project.search_starts,b.search_starts);
  assert.equal(prepared.larger.project.max_iterations,b.max_iterations);
  assert.equal(JSON.stringify([a,b]),original);
});

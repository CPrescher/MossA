import { nuclearConstants } from './nuclear-constants.mjs';
// Deterministic exploration around the supplied model and the best local fit.
// This is a search wrapper, not a guarantee of the global optimum.
const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
function halton(index, base) {
  let value = 0, fraction = 1;
  while (index) { fraction /= base; value += fraction * (index % base); index = Math.floor(index / base); }
  return value;
}
const copy = value => structuredClone(value);
// Fixed policy, qualified against full searches rather than tuned per spectrum.
export const explorationPolicy = Object.freeze({ iterations: 24, iterations_per_parameter: 4, objective_margin: .1 });

export function searchCandidate(project, index) {
  const p = copy(project);
  const span = p.spectrum.x.at(-1) - p.spectrum.x[0];
  p.sites.forEach((site, i) => {
    const width = site.params.fwhm.value;
    const active = ['cs', 'fwhm', 'intensity', ...(site.kind === 'Singlet' ? [] : ['qs', 'a12']), ...(site.kind === 'Sextet' ? ['bhf', 'a13'] : []), ...(site.profile === 'PseudoVoigt' ? ['mix'] : [])];
    active.forEach((key, k) => {
      const param = site.params[key];
      if (!param.fit || param.link) return;
      const u = 2 * halton(index + 1 + Math.floor(i / primes.length), primes[(i * 7 + k) % primes.length]) - 1;
      let v = param.value;
      if (key === 'cs') v += u * Math.max(width, span * .015);
      else if (key === 'qs') v += u * Math.max(width, .3);
      else if (key === 'bhf') v += u * Math.max(3, width / nuclearConstants(p.nuclear_constants).coefficients[0]);
      else if (key === 'fwhm' || key === 'intensity' || key === 'a13' || (key === 'a12' && site.kind === 'Sextet')) v = (v || (key === 'intensity' ? .01 : .2)) * Math.exp(u * .8);
      else v += u * .25;
      // Physical bounds mirror the local core. Linked bounds are subsequently
      // checked by evaluate(), so a rejected trial never changes the fit model.
      const intrinsic = key === 'fwhm' ? [1e-6, Infinity] : key === 'intensity' || key === 'bhf' ? [0, Infinity] : key === 'mix' || (key === 'a12' && site.kind === 'Doublet') ? [0, 1] : key === 'a12' || key === 'a13' ? [1e-6, Infinity] : [-Infinity, Infinity];
      const lo = Math.max(param.min ?? -Infinity, intrinsic[0]);
      const hi = Math.min(param.max ?? Infinity, intrinsic[1]);
      param.value = Math.max(lo, Math.min(hi, v));
    });
  });
  return p;
}

// A single validation sequence is used by ordered and speculative restarts.
function* prepareCandidate(base, start, count) {
  let rejected = 0;
  for (let retry = 0; retry < 12; retry++) {
    const project = searchCandidate(base, start + retry * count);
    try { yield { method: 'evaluate', project }; return { project, rejected }; }
    catch { rejected++; }
  }
  return { project: null, rejected };
}

function* search(project, onProgress, finalize, parallel = false) {
  // Probe controls belong to this invocation, never to imported projects or
  // an earlier local fit. In particular the first fit must remain unpruned.
  project = copy(project);
  delete project.search_probe;
  delete project.search_defer_uncertainties;
  const count = project.search_starts ?? 1;
  const strategy = project.search_strategy ?? 'full';
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('Search starts must be an integer from 1 to 32.');
  if (!['full', 'selective'].includes(strategy)) throw new Error('Unknown starting-model search strategy.');
  if (count === 1) {
    const result = yield { method: 'fit', project, progress: onProgress };
    if (result.finalization) throw new Error('Single-start fit returned deferred uncertainty data.');
    if (project.search_strategy !== undefined) result.project.search_strategy = strategy;
    return result;
  }
  // Fail on invalid user input before starting any search. Keep the original
  // trial first, ensuring exploration cannot worsen its objective.
  yield { method: 'evaluate', project, initial: true };
  let best = null, bestStart = 1, completed = 0, rejected = 0, failures = 0, totalIterations = 0;
  const objectives = [], trials = [];
  let pruned = 0;
  let explorationIterations = explorationPolicy.iterations;
  const started = performance.now();
  for (let start = 0; start < count; start++) {
    let trial = project;
    if (start) {
      const prepared = parallel && start % 3 === 0
        ? yield { method: 'restart', start }
        : yield* prepareCandidate(start % 3 === 0 ? project : best.project, start, count);
      rejected += prepared.rejected;
      if (!prepared.project) continue;
      trial = prepared.project;
    }
    const notify = state => {
      const shown = best && best.evaluation.objective <= state.evaluation.objective ? { project: best.project, evaluation: best.evaluation } : state;
      const snapshot = { ...shown.project, max_iterations: project.max_iterations, search_starts: count };
      delete snapshot.search_probe;
      delete snapshot.search_defer_uncertainties;
      if (project.search_strategy !== undefined) snapshot.search_strategy = strategy;
      onProgress?.({ ...state, ...shown, project: snapshot, iteration: totalIterations + state.iteration, elapsed_ms: performance.now() - started, search_start: start + 1, search_starts: count });
    };
    let result;
    const candidate = copy(trial);
    if (finalize) candidate.search_defer_uncertainties = true;
    // Only alternatives are screened. The supplied model always gets its full
    // budget, retaining the same single-start quality floor as a full search.
    // Original-model restarts protect exploration of distant basins: a poor
    // early objective there can precede a late escape. Screen only local
    // perturbations of the incumbent, not every third original-model restart.
    if (start % 3 !== 0 && strategy === 'selective' && project.max_iterations > explorationIterations) {
      candidate.search_probe = { after_iterations: explorationIterations,
        objective_ceiling: Math.min(Number.MAX_VALUE, best.evaluation.objective * (1 + explorationPolicy.objective_margin)) };
    }
    try { result = yield { method: 'fit', project: candidate, progress: notify, start }; }
    catch (error) { if (!best) throw error; failures++; continue; }
    completed++; totalIterations += result.iterations;
    if (!start) explorationIterations = Math.min(project.max_iterations, Math.max(explorationPolicy.iterations, explorationPolicy.iterations_per_parameter * result.free_parameters));
    objectives.push(result.evaluation.objective);
    const discarded = result.termination === 'ExplorationPruned';
    if (discarded) pruned++;
    trials.push({ start: start + 1, iterations: result.iterations, objective: result.evaluation.objective, termination: result.termination, pruned: discarded, screened: candidate.search_probe !== undefined });
    if (!discarded && (!best || result.evaluation.objective < best.evaluation.objective)) { best = result; bestStart = start + 1; }
    notify({ project: best.project, evaluation: best.evaluation, iteration: 0 });
  }
  if (best.finalization) {
    if (!finalize) throw new Error('A search candidate needs uncertainty finalization.');
    const selected = best;
    best = yield { method: 'finalize', finalization: best.finalization };
    if (best.finalization || !best.errors || !Array.isArray(best.warnings)
      || best.evaluation.objective !== selected.evaluation.objective || best.iterations !== selected.iterations
      || best.termination !== selected.termination || best.converged !== selected.converged) {
      throw new Error('Uncertainty finalization changed the selected fit or returned an incomplete result.');
    }
  }
  best.project.search_starts = count;
  if (project.search_strategy !== undefined) best.project.search_strategy = strategy;
  delete best.project.search_probe;
  delete best.project.search_defer_uncertainties;
  best.search = { requested: count, completed, best_start: bestStart, rejected_candidates: rejected, failed_starts: failures, objectives, total_iterations: totalIterations };
  if (strategy === 'selective') Object.assign(best.search, { strategy, exploration_iterations: explorationIterations,
    objective_margin: explorationPolicy.objective_margin, pruned_starts: pruned, trials });
  best.warnings.push(`Search explored ${completed} starts; best result from start ${bestStart}. A global optimum is not guaranteed.`);
  if (strategy === 'selective') best.warnings.push(`Selective continuation screened alternatives after ${explorationIterations} iterations and pruned ${pruned} starts more than ${100 * explorationPolicy.objective_margin}% above the incumbent objective. Full exploration can find a better minimum.`);
  if (failures || completed < count) best.warnings.push('Some search starts could not be completed; inspect the search diagnostics.');
  return best;
}


// Shared ordered search, driven synchronously by browser comparison workers or
// asynchronously by native commands. Validation and recovery are identical.
export function fitMultiStart(project, fitLocal, evaluate, onProgress, finalize) {
  const steps = search(project, onProgress, finalize); let state = steps.next();
  while (!state.done) {
    let value;
    try { const step = state.value; value = step.method === 'evaluate' ? evaluate(step.project) : step.method === 'finalize' ? finalize(step.finalization) : fitLocal(step.project, step.progress); }
    catch (error) { state = steps.throw(error); continue; }
    state = steps.next(value);
  }
  return state.value;
}
export async function fitMultiStartAsync(project, fitLocal, evaluate, onProgress, finalize, execution = {}) {
  const parallel = typeof execution.independentFit === 'function';
  const steps = search(project, onProgress, finalize, parallel);
  const jobs = new Map();
  let closed = false, state = steps.next();
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const startLane = base => {
    for (let start = 3; start < base.search_starts; start += 3) jobs.set(start, { prepared: deferred(), result: deferred(), latest: null, notify: null });
    // One helper lane bounds CPU/memory use. It never consumes an incumbent or
    // publishes a winner: the ordered generator alone makes those decisions.
    void (async () => {
      for (const [start, job] of jobs) {
        if (closed) return;
        execution.check?.();
        const preparation = prepareCandidate(base, start, base.search_starts);
        let next = preparation.next();
        while (!next.done) {
          if (closed) return;
          execution.check?.();
          try { const value = await evaluate(next.value.project); execution.check?.(); next = preparation.next(value); }
          catch (error) { execution.check?.(); next = preparation.throw(error); }
        }
        job.prepared.resolve({ value: next.value });
        if (!next.value.project) { job.result.resolve({}); continue; }
        const candidate = copy(next.value.project);
        if (finalize) candidate.search_defer_uncertainties = true;
        try {
          const value = await execution.independentFit(candidate, progress => {
            if (!closed) { job.latest = progress; job.notify?.(progress); }
          });
          job.result.resolve({ value });
        } catch (error) { job.result.resolve({ error }); }
        job.notify = null;
      }
    })().catch(error => {
      // Settled packets avoid unhandled rejections when cancellation or an
      // earlier fatal fit means these future starts are never consumed.
      for (const job of jobs.values()) { job.prepared.resolve({ error }); job.result.resolve({ error }); }
    });
  };
  try {
    while (!state.done) {
      execution.check?.();
      let value;
      try {
        const step = state.value;
        if (step.method === 'evaluate') {
          value = await evaluate(step.project);
          if (step.initial && parallel) startLane(step.project);
        } else if (step.method === 'restart') {
          const packet = await jobs.get(step.start).prepared.promise;
          if ('error' in packet) throw packet.error;
          value = packet.value;
        } else if (step.method === 'finalize') value = await finalize(step.finalization);
        else if (parallel && step.start > 0 && step.start % 3 === 0) {
          const job = jobs.get(step.start);
          job.notify = step.progress;
          if (job.latest) job.notify?.(job.latest);
          const packet = await job.result.promise;
          job.notify = null;
          execution.check?.();
          // Worker/transport failure must not turn a successful serial start
          // into a failed search. Retry that exact candidate on the main lane.
          value = 'error' in packet ? await fitLocal(step.project, step.progress) : packet.value;
        } else value = await fitLocal(step.project, step.progress);
      } catch (error) { state = steps.throw(error); continue; }
      execution.check?.();
      state = steps.next(value);
    }
    return state.value;
  } finally {
    closed = true;
    for (const job of jobs.values()) job.notify = null;
    if (!state.done) execution.cancelIndependent?.();
  }
}

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

function* search(project, onProgress) {
  const count = project.search_starts ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('Search starts must be an integer from 1 to 32.');
  if (count === 1) return yield { method: 'fit', project, progress: onProgress };
  // Fail on invalid user input before starting any search. Keep the original
  // trial first, ensuring exploration cannot worsen its objective.
  yield { method: 'evaluate', project };
  let best = null, bestStart = 1, completed = 0, rejected = 0, failures = 0, totalIterations = 0;
  const objectives = [];
  const started = performance.now();
  for (let start = 0; start < count; start++) {
    let trial = project;
    if (start) {
      let valid = false;
      for (let retry = 0; retry < 12; retry++) {
        trial = searchCandidate(start % 3 === 0 ? project : best.project, start + retry * count);
        try { yield { method: 'evaluate', project: trial }; valid = true; break; } catch { rejected++; }
      }
      if (!valid) continue;
    }
    const notify = state => {
      const shown = best && best.evaluation.objective <= state.evaluation.objective ? { project: best.project, evaluation: best.evaluation } : state;
      onProgress?.({ ...state, ...shown, iteration: totalIterations + state.iteration, elapsed_ms: performance.now() - started, search_start: start + 1, search_starts: count });
    };
    let result;
    try { result = yield { method: 'fit', project: copy(trial), progress: notify }; }
    catch (error) { if (!best) throw error; failures++; continue; }
    completed++; totalIterations += result.iterations;
    objectives.push(result.evaluation.objective);
    if (!best || result.evaluation.objective < best.evaluation.objective) { best = result; bestStart = start + 1; }
    notify({ project: best.project, evaluation: best.evaluation, iteration: 0 });
  }
  best.project.search_starts = count;
  best.search = { requested: count, completed, best_start: bestStart, rejected_candidates: rejected, failed_starts: failures, objectives, total_iterations: totalIterations };
  best.warnings.push(`Search explored ${completed} starts; best result from start ${bestStart}. A global optimum is not guaranteed.`);
  if (failures || completed < count) best.warnings.push('Some search starts could not be completed; inspect the search diagnostics.');
  return best;
}


// Shared ordered search, driven synchronously by browser comparison workers or
// asynchronously by native commands. Validation and recovery are identical.
export function fitMultiStart(project, fitLocal, evaluate, onProgress) {
  const steps = search(project, onProgress); let state = steps.next();
  while (!state.done) {
    let value;
    try { const step = state.value; value = step.method === 'evaluate' ? evaluate(step.project) : fitLocal(step.project, step.progress); }
    catch (error) { state = steps.throw(error); continue; }
    state = steps.next(value);
  }
  return state.value;
}
export async function fitMultiStartAsync(project, fitLocal, evaluate, onProgress) {
  const steps = search(project, onProgress); let state = steps.next();
  while (!state.done) {
    let value;
    try { const step = state.value; value = await (step.method === 'evaluate' ? evaluate(step.project) : fitLocal(step.project, step.progress)); }
    catch (error) { state = steps.throw(error); continue; }
    state = steps.next(value);
  }
  return state.value;
}

import { prepareComparisonAsync, fitComparisonSimulationAsync, comparisonGenerator, completeComparison, type ComparisonOptions, type ComparisonProgress, type SimulationOutcome } from './comparison';
import type { Project } from './types';
import { fitMultiStartAsync } from './multistart.mjs';
import { NativeSession } from './native-session';
import { comparisonWorkerCount } from './comparison-workers';
export { comparisonWorkerCount } from './comparison-workers';

export function startComparison(simpler: Project, larger: Project, options: ComparisonOptions, onProgress: (p: ComparisonProgress) => void, createSession = () => new NativeSession()) {
  simpler = structuredClone(simpler); larger = structuredClone(larger); options = { ...options };
  const count = comparisonWorkerCount(options.workers), session = createSession();
  let settled = false, completed = 0;
  const notify = (progress: ComparisonProgress) => {
    if (!settled) onProgress({ ...progress, completed, phase: count > 1 ? `${count} workers · ${progress.phase}` : progress.phase });
  };
  const fit = async (project: Project, algorithm: 'trf' | 'bounded-lm' = 'trf') => {
    const result = await fitMultiStartAsync(project, candidate => session.fit(candidate, algorithm, undefined, { derivativeWorkers: 1 }), candidate => session.evaluate(candidate), undefined, pending => session.finalize(pending, { derivativeWorkers: 1 }));
    session.check(); return result;
  };
  const promise = Promise.resolve().then(async () => {
    session.check();
    const prepared = await prepareComparisonAsync(simpler, larger, options, fit, project => session.evaluate(project), notify);
    session.check();
    // Only this ordered generator consumes RNG values. Native threads fit
    // independent pairs; completion order cannot change simulated observations.
    const next = comparisonGenerator(prepared), outcomes: SimulationOutcome[] = new Array(options.simulations);
    const lane = async () => {
      for (;;) {
        session.check(); const job = next(); if (!job) return;
        const outcome = await fitComparisonSimulationAsync(prepared, job.index, job.y, fit, notify);
        session.check();
        if (outcome.index !== job.index || outcomes[job.index]) throw new Error('Invalid or duplicate native simulation result.');
        outcomes[job.index] = outcome; completed++;
        notify({ phase: 'Simulating under the simpler model', completed, total: options.simulations });
      }
    };
    await Promise.all(Array.from({ length: count }, lane));
    session.check();
    const result = completeComparison(prepared, outcomes);
    result.execution = { workers: count, backend: 'native-rust' };
    return result;
  }).finally(() => { settled = true; session.stop(); });
  return { promise, cancel() { if (!settled) { settled = true; session.stop(); } } };
}

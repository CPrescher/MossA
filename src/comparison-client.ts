import type { ComparisonOptions, ComparisonProgress, ComparisonResult, SimulationOutcome } from './comparison';
import type { Project } from './types';

import { comparisonWorkerCount } from './comparison-workers';
export { comparisonWorkerCount } from './comparison-workers';

export function startComparison(simpler: Project, larger: Project, options: ComparisonOptions, onProgress: (p: ComparisonProgress) => void) {
  const count = comparisonWorkerCount(options.workers), workers = new Set<Worker>();
  let rejectRun: (e: Error) => void;
  let settled = false;
  const terminate = () => { for (const worker of workers) worker.terminate(); workers.clear(); };
  const promise = new Promise<ComparisonResult>((resolve, reject) => {
    rejectRun = reject;
    let completed = 0;
    const fail = (error: Error) => { if (settled) return; settled = true; terminate(); reject(error); };
    const succeed = (result: ComparisonResult) => {
      if (settled) return; settled = true; terminate();
      if (result && typeof result === 'object') result.execution = { workers: count };
      resolve(result);
    };
    const notify = (p: ComparisonProgress) => onProgress({ ...p, phase: count > 1 ? `${count} workers · ${p.phase}` : p.phase,
      completed: count > 1 ? completed : p.completed });
    const spawn = (handle: (data: any, worker: Worker) => void) => {
      const worker = new Worker(new URL('./comparison-worker.ts', import.meta.url), { type: 'module' }); workers.add(worker);
      worker.onmessage = ({ data }) => {
        if (settled) return;
        try {
          if (data.error) fail(new Error(data.error));
          else if (data.progress) notify(data.progress);
          else handle(data, worker);
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      };
      worker.onerror = event => fail(new Error(event.message || 'The comparison worker failed.'));
      return worker;
    };
    try {
      if (count === 1) {
        spawn(data => succeed(data.result)).postMessage({ simpler, larger, options });
        return;
      }
      // The coordinator fits observations and generates the original ordered
      // RNG stream off the UI thread. Pool workers only fit independent pairs.
      const waiting: Worker[] = [], assigned = new Map<Worker, number>();
      const outcomes: SimulationOutcome[] = new Array(options.simulations);
      let issued = 0, completing = false, configured = false;
      const request = (worker: Worker) => {
        if (issued < options.simulations) { issued++; waiting.push(worker); coordinator.postMessage({ method: 'generate' }); }
        else if (completed === options.simulations && !completing) {
          completing = true; coordinator.postMessage({ method: 'complete', outcomes });
        }
      };
      const coordinator = spawn(data => {
        if (data.prepared) {
          if (configured) throw new Error('Duplicate comparison preparation.'); configured = true;
          for (let i = 0; i < count; i++) {
            spawn((message, worker) => {
              if (message.configured) { request(worker); return; }
              const outcome = message.outcome as SimulationOutcome;
              if (!outcome || assigned.get(worker) !== outcome.index || outcomes[outcome.index]) throw new Error('Invalid or duplicate worker result.');
              assigned.delete(worker); outcomes[outcome.index] = outcome; completed++;
              notify({ phase: 'Simulating under the simpler model', completed, total: options.simulations });
              request(worker);
            }).postMessage({ method: 'configure', prepared: data.prepared });
          }
        } else if ('job' in data) {
          const worker = waiting.shift();
          if (!worker || !data.job) throw new Error('The simulation generator returned an unexpected result.');
          assigned.set(worker, data.job.index); worker.postMessage({ method: 'simulate', job: data.job });
        } else if (data.result) succeed(data.result);
        else throw new Error('Unexpected comparison coordinator message.');
      });
      coordinator.postMessage({ method: 'prepare', simpler, larger, options });
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  });
  return { promise, cancel() { if (settled) return; settled = true; terminate(); rejectRun(new Error('Simulation canceled. No simulation p-value was computed.')); } };
}

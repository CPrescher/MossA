import init, { evaluate_json, fit_json_with_progress, fit_recovery_json, finalize_fit_json } from './wasm/mossa_core';
import { fitMultiStart } from './multistart.mjs';
import { runComparison, prepareComparison, comparisonGenerator, fitComparisonSimulation, completeComparison, type PreparedComparison, type ComparisonProgress } from './comparison';
const ready = init();
const evaluate = (project: Parameters<typeof runComparison>[0]) => JSON.parse(evaluate_json(JSON.stringify(project)));
const fit = (project: Parameters<typeof runComparison>[0], algorithm: 'trf' | 'bounded-lm' = 'trf') => fitMultiStart(project,
  p => JSON.parse(algorithm === 'bounded-lm' ? fit_recovery_json(JSON.stringify(p)) : fit_json_with_progress(JSON.stringify(p), () => {})), evaluate, undefined, pending => JSON.parse(finalize_fit_json(JSON.stringify(pending))));
let prepared: PreparedComparison | null = null, next: ReturnType<typeof comparisonGenerator> | null = null;
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const notify = (progress: ComparisonProgress) => self.postMessage({ progress });
    if (data.method === 'prepare') {
      prepared = prepareComparison(data.simpler, data.larger, data.options, fit, evaluate, notify);
      next = comparisonGenerator(prepared); self.postMessage({ prepared });
    } else if (data.method === 'configure') {
      prepared = data.prepared; self.postMessage({ configured: true });
    } else if (data.method === 'generate') {
      if (!next) throw new Error('Simulation generator is not ready.');
      self.postMessage({ job: next() });
    } else if (data.method === 'simulate') {
      if (!prepared) throw new Error('Simulation worker is not configured.');
      self.postMessage({ outcome: fitComparisonSimulation(prepared, data.job.index, data.job.y, fit, notify) });
    } else if (data.method === 'complete') {
      if (!prepared) throw new Error('Observed fits are unavailable.');
      self.postMessage({ result: completeComparison(prepared, data.outcomes) });
    } else {
      self.postMessage({ result: runComparison(data.simpler, data.larger, data.options, fit, evaluate, notify) });
    }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};

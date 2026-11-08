import init, { evaluate_json, fit_json_with_progress, evaluate_source_json, fit_source_json_with_progress, FitSession } from './wasm/mossa_core';
import { fitMultiStartAsync } from './multistart.mjs';
import { DerivativePool, DerivativePoolError, derivativeWorkerCount, synchronousDerivativesAvailable } from './derivative-pool';
import { fitParallel } from './parallel-fit';
import type { Project, FitProgress, FitResult } from './types';
const ready = init();
ready.then(() => self.postMessage({ type: 'ready' })).catch(e => self.postMessage({ type: 'fatal', error: String(e) }));
let pool: DerivativePool | null = null;
let poolSize = 0;
let poolReady: { resolve: (pool: DerivativePool) => void; reject: (error: Error) => void } | null = null;
async function getPool(count: number): Promise<DerivativePool> {
  if (pool && count === poolSize) return pool;
  pool?.fail('Replacing derivative worker pool.'); pool = null;
  poolSize = count;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { poolReady = null; reject(new DerivativePoolError('Derivative workers could not start.')); }, 30000);
    poolReady = { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } };
    self.postMessage({ type: 'derivative-pool', count });
  });
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  // Pool setup and errors must be handled while a fit awaits its columns.
  if (data.type === 'derivative-pool-ready') {
    if (!poolReady) { for (const port of data.ports) port.close(); return; }
    pool = new DerivativePool(data.ports); poolReady.resolve(pool); poolReady = null; return;
  }
  if (data.type === 'derivative-pool-error') {
    const error = new DerivativePoolError(data.error);
    pool?.fail(error.message); pool = null;
    poolReady?.reject(error); poolReady = null; return;
  }
  queue = queue.then(() => run(data));
};
async function run(data: any) {
  try {
    await ready;
    const start = performance.now();
    const json = JSON.stringify(data.project);
    const notify = (progress: string) => self.postMessage({ id: data.id, progress: JSON.parse(progress) });
    let usedWorkers = 1, fallback: string | undefined;
    let transport = 'serial';
    const timings: object[] = [];
    const fitLocal = async (project: Project, progress?: (state: FitProgress) => void, calibration = false): Promise<FitResult> => {
      const count = data.derivative_workers ?? derivativeWorkerCount();
      if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('Derivative workers must be 1–8.');
      const serial = () => JSON.parse((calibration ? fit_source_json_with_progress : fit_json_with_progress)(JSON.stringify(project), (state: string) => progress?.(JSON.parse(state))));
      if (count === 1 || (data.derivative_workers === undefined && project.mode !== 'transmission')) return serial();
      const probe = new FitSession(JSON.stringify(project), calibration);
      const parameters = probe.free_parameters; probe.free();
      // Small fits retain the lower-latency serial path. An explicit count is
      // available to the benchmark without changing saved scientific inputs.
      if (parameters === 0 || (data.derivative_workers === undefined && parameters < 6)) return serial();
      if (data.derivative_workers === undefined) {
        const distributed = project.sites.some(site => site.xvbf);
        // Message-only checkpoint retries repeat solver algebra. Avoid that
        // measured regression for ordinary models with many free parameters.
        if (!synchronousDerivativesAvailable() && parameters > 8 && !distributed) return serial();
        // Starting helper WASM instances costs more than a small one-off fit.
        if (!pool && parameters < 10 && !distributed && !calibration && (project.search_starts ?? 1) === 1) return serial();
      }
      try {
        const workers = Math.min(count, parameters);
        const active = await getPool(workers);
        const result = await fitParallel(project, calibration, active, progress, timing => timings.push(timing));
        usedWorkers = Math.max(usedWorkers, workers);
        transport = active.synchronous ? 'shared' : 'messages';
        return result;
      } catch (error) {
        if (!(error instanceof DerivativePoolError)) throw error;
        fallback = error.message;
        pool?.fail(fallback); pool = null;
        self.postMessage({ type: 'release-derivative-pool' });
        return serial();
      }
    };
    const result = data.method === 'fit-source' ? await fitLocal(data.project, state => notify(JSON.stringify(state)), true)
      : data.method === 'evaluate-source' ? evaluate_source_json(json)
      : data.method === 'fit' ? await fitMultiStartAsync(data.project, fitLocal,
          project => JSON.parse(evaluate_json(JSON.stringify(project))),
          progress => self.postMessage({ id: data.id, progress })) : evaluate_json(json);
    self.postMessage({ id: data.id, result: typeof result === 'string' ? JSON.parse(result) : result, elapsed: performance.now() - start,
      execution: { derivative_workers: usedWorkers, transport, ...(fallback ? { fallback } : {}), ...(timings.length ? { timings } : {}) } });
  } catch (e) { self.postMessage({ id: data.id, error: String(e) }); }
}

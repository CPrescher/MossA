import type { Evaluation, FitProgress, FitResult, Project, FitState, LocalFitResult } from './types';
import { fitMultiStartAsync } from './multistart.mjs';
import { usesAnalyticalDerivatives } from './analytical-derivatives';
import { NativeSession, type NativeResponse, type NativeTransport, type NativeOperation } from './native-session';

/** Desktop replacement selected at build time; no fitting WASM is loaded. */
export class Engine {
  private session: NativeSession;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private transport?: NativeTransport;
  private helper: NativeSession | null = null;
  constructor(onReady: () => void, onError: (message: string) => void, transport?: NativeTransport) {
    this.transport = transport;
    this.session = new NativeSession(transport);
    void this.session.ready.then(() => { if (!this.stopped) onReady(); }).catch(error => { if (!this.stopped) onError(String(error)); });
  }
  request(method: 'fit' | 'evaluate' | 'fit-source' | 'evaluate-source', project: Project, onProgress?: (state: FitProgress) => void, options?: { derivativeWorkers?: number; searchWorkers?: number }): Promise<NativeResponse> {
    // Preserve the browser worker's ordering, including evaluate requests made
    // while fitting. Each fit still runs outside the UI thread, in Rust.
    const snapshot = structuredClone(project);
    const request = this.queue.then(async () => {
      this.session.check(); const start = performance.now();
      const execution: NativeResponse['execution'] = { backend: 'native-rust', derivative_workers: 1 };
      const compute = async (operation: NativeOperation, candidate: Project, progress?: (state: FitProgress) => void, state?: FitState) => {
        const response = await this.session.compute(operation, candidate, progress, options, state);
        execution.derivative_workers = Math.max(execution.derivative_workers, response.execution.derivative_workers);
        if (response.execution.fallback) execution.fallback = response.execution.fallback;
        return response.result;
      };
      if (options?.searchWorkers !== undefined && ![1, 2].includes(options.searchWorkers)) throw new Error('Search workers must be 1 or 2.');
      const eligible = method === 'fit' && (snapshot.search_starts ?? 1) >= 4 && snapshot.mode === 'thin' && usesAnalyticalDerivatives(snapshot);
      const hardware = typeof navigator === 'undefined' ? 2 : (navigator.hardwareConcurrency ?? 2);
      const parallel = eligible && (options?.searchWorkers ?? (hardware > 1 ? 2 : 1)) === 2;
      const helper = parallel ? new NativeSession(this.transport) : null;
      this.helper = helper;
      try {
        const result = method === 'fit' ? await fitMultiStartAsync(snapshot,
          async (candidate, progress) => await compute('fit', candidate, onProgress ? progress : undefined) as LocalFitResult,
          candidate => this.session.evaluate(candidate), onProgress,
          async pending => await compute('finalize-fit', pending.project, undefined, pending.state) as FitResult,
          helper ? { check: () => this.session.check(), independentFit: async (candidate, progress) => {
            execution.search_workers = 2;
            try { return await helper.fit(candidate, 'trf', onProgress ? progress : undefined, { derivativeWorkers: 1 }); }
            catch (error) { execution.fallback = `Search helper: ${String(error)}`; throw error; }
          } } : undefined)
          : await compute(method, snapshot, onProgress);
        this.session.check();
        return { result, elapsed: performance.now() - start, execution };
      } finally { helper?.stop(); this.helper = null; }
    });
    this.queue = request.catch(() => {});
    return request;
  }
  stop() { this.stopped = true; this.session.stop(); this.helper?.stop(); }
}

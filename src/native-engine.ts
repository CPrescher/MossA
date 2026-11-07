import type { Evaluation, FitProgress, FitResult, Project } from './types';
import { fitMultiStartAsync } from './multistart.mjs';
import { NativeSession, type NativeResponse, type NativeTransport } from './native-session';

/** Desktop replacement selected at build time; no fitting WASM is loaded. */
export class Engine {
  private session: NativeSession;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  constructor(onReady: () => void, onError: (message: string) => void, transport?: NativeTransport) {
    this.session = new NativeSession(transport);
    void this.session.ready.then(() => { if (!this.stopped) onReady(); }).catch(error => { if (!this.stopped) onError(String(error)); });
  }
  request(method: 'fit' | 'evaluate' | 'fit-source' | 'evaluate-source', project: Project, onProgress?: (state: FitProgress) => void, _options?: { derivativeWorkers?: number }): Promise<NativeResponse> {
    // Preserve the browser worker's ordering, including evaluate requests made
    // while fitting. Each fit still runs outside the UI thread, in Rust.
    const snapshot = structuredClone(project);
    const request = this.queue.then(async () => {
      this.session.check(); const start = performance.now();
      const result = method === 'fit' ? await fitMultiStartAsync(snapshot,
        (candidate, progress) => this.session.fit(candidate, 'trf', onProgress ? progress : undefined),
        candidate => this.session.evaluate(candidate), onProgress)
        : (await this.session.compute(method, snapshot, onProgress)).result;
      this.session.check();
      return { result, elapsed: performance.now() - start, execution: { backend: 'native-rust' as const, derivative_workers: 1 } };
    });
    this.queue = request.catch(() => {});
    return request;
  }
  stop() { this.stopped = true; this.session.stop(); }
}

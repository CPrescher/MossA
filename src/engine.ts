import type { Project, FitProgress } from './types';
export type EngineResponse = { result: unknown; elapsed: number; execution?: { derivative_workers: number; search_workers?: number; fallback?: string } };
export class Engine {
  worker: Worker;
  derivativeWorkers = new Set<Worker>();
  searchWorker: Worker | null = null;
  private searchGeneration = 0;
  counter = 0;
  pending = new Map<number, { resolve: (v: EngineResponse) => void; reject: (e: Error) => void; onProgress?: (v: FitProgress) => void }>();
  constructor(onReady: () => void, onError: (message: string) => void) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'search-worker') {
        this.stopSearchWorker(); this.searchGeneration = data.generation;
        try {
          const worker = new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' });
          this.searchWorker = worker;
          worker.onmessage = event => { if (this.searchWorker === worker) this.worker.postMessage({ type: 'search-message', generation: data.generation, message: event.data }); };
          worker.onerror = event => { if (this.searchWorker === worker) this.worker.postMessage({ type: 'search-message', generation: data.generation, message: { kind: 'fatal', error: event.message || 'Search helper failed.' } }); };
        } catch (error) { this.worker.postMessage({ type: 'search-message', generation: data.generation, message: { kind: 'fatal', error: String(error) } }); }
        return;
      }
      if (data.type === 'search-send') {
        if (data.generation !== this.searchGeneration) return;
        try {
          if (!this.searchWorker) throw new Error('Search helper is unavailable.');
          this.searchWorker.postMessage(data.message);
        } catch (error) { this.worker.postMessage({ type: 'search-message', generation: data.generation, message: { kind: 'fatal', error: String(error) } }); }
        return;
      }
      if (data.type === 'release-search-worker') { if (data.generation === this.searchGeneration) this.stopSearchWorker(); return; }
      if (data.type === 'derivative-pool') {
        try {
          const count = Math.min(8, Math.max(1, Math.floor(data.count)));
          this.stopDerivativeWorkers();
          const ports: MessagePort[] = [];
          for (let i = 0; i < count; i++) {
            const worker = new Worker(new URL('./derivative-worker.ts', import.meta.url), { type: 'module' });
            this.derivativeWorkers.add(worker);
            worker.onerror = event => { this.worker.postMessage({ type: 'derivative-pool-error', error: event.message || 'A derivative worker failed.' }); this.stopDerivativeWorkers(); };
            const channel = new MessageChannel(); ports.push(channel.port1);
            worker.postMessage({ port: channel.port2 }, [channel.port2]);
          }
          this.worker.postMessage({ type: 'derivative-pool-ready', ports }, ports);
        } catch (error) { this.stopDerivativeWorkers(); this.worker.postMessage({ type: 'derivative-pool-error', error: String(error) }); }
        return;
      }
      if (data.type === 'release-derivative-pool') { this.stopDerivativeWorkers(); return; }
      if (data.type === 'ready') return onReady();
      if (data.type === 'fatal') { onError(data.error); this.stop(); return; }
      const p = this.pending.get(data.id); if (!p) return;
      if (data.progress) { p.onProgress?.(data.progress); return; }
      this.pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve({ result: data.result, elapsed: data.elapsed, execution: data.execution });
    };
    this.worker.onerror = e => { onError(e.message || 'The fitting worker failed.'); this.stop(); };
  }
  request(method: 'fit' | 'evaluate' | 'fit-source' | 'evaluate-source', project: Project, onProgress?: (v: FitProgress) => void, options?: { derivativeWorkers?: number; searchWorkers?: number }) {
    return new Promise<EngineResponse>((resolve, reject) => {
      const id = ++this.counter; this.pending.set(id, { resolve, reject, onProgress }); this.worker.postMessage({ id, method, project, ...(options?.derivativeWorkers === undefined ? {} : { derivative_workers: options.derivativeWorkers }), ...(options?.searchWorkers === undefined ? {} : { search_workers: options.searchWorkers }) });
    });
  }
  private stopSearchWorker() { this.searchWorker?.terminate(); this.searchWorker = null; }
  private stopDerivativeWorkers() { for (const worker of this.derivativeWorkers) worker.terminate(); this.derivativeWorkers.clear(); }
  stop() { this.worker.terminate(); this.stopDerivativeWorkers(); this.stopSearchWorker(); for (const p of this.pending.values()) p.reject(new Error('Calculation canceled.')); this.pending.clear(); }
}

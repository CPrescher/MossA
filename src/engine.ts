import type { Project, FitProgress } from './types';
export class Engine {
  worker: Worker;
  counter = 0;
  pending = new Map<number, { resolve: (v: { result: unknown; elapsed: number }) => void; reject: (e: Error) => void; onProgress?: (v: FitProgress) => void }>();
  constructor(onReady: () => void, onError: (message: string) => void) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'ready') return onReady();
      if (data.type === 'fatal') { onError(data.error); this.stop(); return; }
      const p = this.pending.get(data.id); if (!p) return;
      if (data.progress) { p.onProgress?.(data.progress); return; }
      this.pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve({ result: data.result, elapsed: data.elapsed });
    };
    this.worker.onerror = e => { onError(e.message || 'The fitting worker failed.'); this.stop(); };
  }
  request(method: 'fit' | 'evaluate', project: Project, onProgress?: (v: FitProgress) => void) {
    return new Promise<{ result: unknown; elapsed: number }>((resolve, reject) => {
      const id = ++this.counter; this.pending.set(id, { resolve, reject, onProgress }); this.worker.postMessage({ id, method, project });
    });
  }
  stop() { this.worker.terminate(); for (const p of this.pending.values()) p.reject(new Error('Calculation canceled.')); this.pending.clear(); }
}

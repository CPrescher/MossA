import { Channel, invoke } from '@tauri-apps/api/core';
import type { Evaluation, FitProgress, FitResult, Project } from './types';

export type NativeOperation = 'evaluate' | 'fit' | 'evaluate-source' | 'fit-source' | 'fit-recovery';
export type NativeResponse = { result: Evaluation | FitResult; elapsed: number; execution: { backend: 'native-rust'; derivative_workers: number } };
export type NativeTransport = {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  channel(callback: (state: FitProgress) => void): unknown;
};
const transport: NativeTransport = {
  invoke,
  channel(callback) { const channel = new Channel<FitProgress>(); channel.onmessage = callback; return channel; },
};

/** One cancelable Rust scope per analysis engine or model comparison. */
export class NativeSession {
  readonly id = globalThis.crypto?.randomUUID?.() ?? `native-${Date.now()}-${Math.random()}`;
  readonly ready: Promise<void>;
  private stopped = false;
  private pending = new Set<(error: Error) => void>();
  constructor(private bridge: NativeTransport = transport) {
    this.ready = bridge.invoke<void>('native_compute_start', { session: this.id });
  }
  check() { if (this.stopped) throw new Error('Calculation canceled.'); }
  compute(operation: NativeOperation, project: Project, progress?: (state: FitProgress) => void): Promise<NativeResponse> {
    return new Promise((resolve, reject) => {
      this.pending.add(reject);
      void (async () => {
        await this.ready; this.check();
        const channel = progress ? this.bridge.channel(state => { if (!this.stopped) progress(state); }) : null;
        const response = await this.bridge.invoke<NativeResponse>('native_compute', { session: this.id, operation, project, progress: channel });
        this.check(); return response;
      })().then(resolve, reject).finally(() => this.pending.delete(reject));
    });
  }
  async evaluate(project: Project) { return (await this.compute('evaluate', project)).result as Evaluation; }
  async fit(project: Project, algorithm: 'trf' | 'bounded-lm' = 'trf', progress?: (state: FitProgress) => void) {
    return (await this.compute(algorithm === 'bounded-lm' ? 'fit-recovery' : 'fit', project, progress)).result as FitResult;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const reject of this.pending) reject(new Error('Calculation canceled.'));
    this.pending.clear();
    // Order cancellation after registration, even if stopped during startup.
    // Window destruction also cancels all scopes on the Rust side.
    void this.ready.then(() => this.bridge.invoke('native_compute_cancel', { session: this.id })).catch(() => {});
  }
}

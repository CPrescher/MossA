import type { FitProgress, LocalFitResult, Project } from './types';

/** One serial helper, owned and terminated by Engine together with its parent. */
export class SearchLane {
  readonly ready: Promise<void>;
  failed = false;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private counter = 0;
  private pending = new Map<number, { resolve: (result: LocalFitResult) => void; reject: (error: Error) => void; progress?: (state: FitProgress) => void }>();
  private timeout: ReturnType<typeof setTimeout>;
  constructor(private send: (message: object) => void) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.timeout = setTimeout(() => this.fail('Search helper could not start.'), 30000);
  }
  receive(message: any) {
    if (this.failed) return;
    if (message.kind === 'ready') { clearTimeout(this.timeout); this.resolveReady(); return; }
    if (message.kind === 'fatal') { this.fail(message.error); return; }
    const request = this.pending.get(message.id); if (!request) return;
    if (message.kind === 'progress') { request.progress?.(message.progress); return; }
    this.pending.delete(message.id);
    if (message.kind === 'error') request.reject(new Error(message.error));
    else if (message.kind === 'result') request.resolve(message.result);
    else request.reject(new Error('Invalid search helper response.'));
  }
  async fit(project: Project, progress?: (state: FitProgress) => void): Promise<LocalFitResult> {
    await this.ready;
    if (this.failed) throw new Error('Search helper is unavailable.');
    return new Promise((resolve, reject) => {
      const id = ++this.counter; this.pending.set(id, { resolve, reject, progress });
      try { this.send({ id, project }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  fail(message: string) {
    if (this.failed) return;
    this.failed = true; clearTimeout(this.timeout);
    const error = new Error(message); this.rejectReady(error);
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

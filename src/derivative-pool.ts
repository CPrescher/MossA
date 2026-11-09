export class DerivativePoolError extends Error {}
export function synchronousDerivativesAvailable() {
  return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined' && typeof Atomics.wait === 'function';
}

export function derivativeWorkerCount(hardware = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency) {
  return Math.min(4, Math.max(1, Math.floor(Number.isFinite(hardware) ? hardware : 2) - 1));
}

export class DerivativePool {
  get synchronous() { return synchronousDerivativesAvailable(); }
  private next = 0;
  private failed = false;
  private pending = new Map<number, { resolve: (data: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  constructor(readonly ports: MessagePort[], private timeoutMs = 30000) {
    if (!ports.length) throw new DerivativePoolError('No derivative workers available.');
    for (const port of ports) {
      port.onmessage = ({ data }) => {
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id); clearTimeout(request.timeout);
        if (data.error) { request.reject(new DerivativePoolError(data.error)); this.fail(data.error); }
        else request.resolve(data);
      };
      port.onmessageerror = () => this.fail('Could not receive derivative worker output.');
      port.start();
    }
  }
  fail(message: string) {
    this.failed = true;
    for (const port of this.ports) port.close();
    for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new DerivativePoolError(message)); }
    this.pending.clear();
  }
  private request(port: MessagePort, data: object): Promise<any> {
    if (this.failed) return Promise.reject(new DerivativePoolError('Derivative worker pool is unavailable.'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.fail('Derivative worker did not respond.'), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try { port.postMessage({ ...data, id }); }
      catch (error) { this.fail(String(error)); }
    });
  }
  async prepare(json: string, calibration: boolean) {
    await Promise.all(this.ports.map(port => this.request(port, { method: 'prepare', json, calibration })));
  }
  async columns(x: number[], rows: number, columns: number): Promise<Float64Array> {
    const count = Math.min(columns, this.ports.length);
    const result = new Float64Array(rows * columns);
    await Promise.all(this.ports.slice(0, count).map(async (port, index) => {
      const first = Math.floor(index * columns / count), end = Math.floor((index + 1) * columns / count);
      const data = await this.request(port, { method: 'columns', x, first, end });
      if (!(data.values instanceof Float64Array) || data.values.length !== (end - first) * rows || !data.values.every(Number.isFinite)) {
        this.fail('Invalid derivative worker output.'); throw new DerivativePoolError('Invalid derivative worker output.');
      }
      // Each worker writes disjoint, ordered columns. Never reduce or sum
      // floating-point results across workers, regardless of completion order.
      result.set(data.values, first * rows);
    }));
    return result;
  }
  columnsSync(x: Float64Array, rows: number, columns: number): Float64Array {
    if (this.failed) throw new DerivativePoolError('Derivative worker pool is unavailable.');
    const count = Math.min(columns, this.ports.length);
    const result = new Float64Array(new SharedArrayBuffer(rows * columns * 8));
    const control = new Int32Array(new SharedArrayBuffer(count * 4));
    for (let index = 0; index < count; index++) {
      const first = Math.floor(index * columns / count), end = Math.floor((index + 1) * columns / count);
      this.ports[index].postMessage({ method: 'columns-shared', x, first, end, rows, result: result.buffer, control: control.buffer, index });
    }
    const deadline = performance.now() + this.timeoutMs;
    for (let index = 0; index < count; index++) {
      while (Atomics.load(control, index) === 0) {
        const remaining = deadline - performance.now();
        if (remaining <= 0 || Atomics.wait(control, index, 0, remaining) === 'timed-out') {
          this.fail('Derivative worker did not respond.'); throw new DerivativePoolError('Derivative worker did not respond.');
        }
      }
      if (Atomics.load(control, index) !== 1) { this.fail('Derivative worker failed.'); throw new DerivativePoolError('Derivative worker failed.'); }
    }
    return result;
  }
}

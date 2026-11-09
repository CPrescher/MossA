import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import type { NativeTransport } from '../src/native-session';

/** Real native core and job registry, with JSON lines replacing Tauri IPC. */
export class NativeFixture {
  private child: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; progress?: (value: any) => void }>();
  private exit: Promise<void>;
  readonly scopes = new Set<string>();
  highWater = 0;
  private active = 0;
  constructor(executable = process.env.MOSSA_NATIVE_FIXTURE || resolve('rust-core/target/release/examples/native_fixture' + (process.platform === 'win32' ? '.exe' : ''))) {
    this.child = spawn(executable, [], { stdio: ['pipe','pipe','pipe'] });
    let stderr = '';
    this.child.stderr.on('data', chunk => { stderr += chunk; });
    createInterface({ input: this.child.stdout }).on('line', line => {
      const value = JSON.parse(line), pending = this.pending.get(value.id); if (!pending) return;
      if (value.progress) { pending.progress?.(value.progress); return; }
      this.pending.delete(value.id);
      value.error ? pending.reject(new Error(value.error)) : pending.resolve(value.result);
    });
    this.exit = new Promise((resolveExit, rejectExit) => {
      this.child.on('error', error => { for (const pending of this.pending.values()) pending.reject(error); rejectExit(error); });
      this.child.on('exit', code => { if (code === 0) resolveExit(); else { const error = new Error(`Native fixture failed (${code}): ${stderr}`); for (const pending of this.pending.values()) pending.reject(error); rejectExit(error); } });
    });
  }
  readonly transport: NativeTransport = {
    channel: callback => callback,
    invoke: async <T,>(command: string, args: Record<string, any>): Promise<T> => {
      if (command === 'native_compute_start') this.scopes.add(args.session);
      const computing = command === 'native_compute';
      if (computing) { this.active++; this.highWater = Math.max(this.highWater, this.active); }
      try {
        return await new Promise<T>((resolve, reject) => {
          const id = ++this.next;
          this.pending.set(id, { resolve, reject, progress: args.progress });
          this.child.stdin.write(JSON.stringify({ id, command, args: { ...args, progress: !!args.progress } }) + '\n');
        });
      } finally { if (computing) this.active--; }
    },
  };
  async idle() {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const status = await this.transport.invoke<{active:number}>('status', {});
      if (status.active === 0) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Native CPU jobs did not stop after cancellation.');
  }
  async close() {
    for (const session of this.scopes) await this.transport.invoke('native_compute_cancel', { session });
    await this.idle(); this.child.stdin.end(); await this.exit;
  }
}

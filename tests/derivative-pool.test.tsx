import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { DerivativePool, derivativeWorkerCount } from '../src/derivative-pool';
import { Engine } from '../src/engine';

test('derivative pool assembles uneven columns in order despite reversed worker completion', async () => {
  const channels = Array.from({ length: 3 }, () => new MessageChannel());
  const pool = new DerivativePool(channels.map(c => c.port1 as unknown as MessagePort));
  channels.forEach((c, index) => c.port2.on('message', data => {
    if (data.method === 'prepare') c.port2.postMessage({ id: data.id, ready: true });
    else setTimeout(() => c.port2.postMessage({ id: data.id, values: new Float64Array(Array.from({ length: (data.end - data.first) * 2 }, (_, i) => data.first * 2 + i)) }), (2 - index) * 5);
  }));
  try {
    await pool.prepare('{}', false);
    assert.deepEqual(await pool.columns([0, 0, 0, 0, 0], 2, 5), Float64Array.from({ length: 10 }, (_, i) => i));
    assert.deepEqual(await pool.columns([0], 2, 1), new Float64Array([0, 1]));
  } finally { pool.fail('Test complete'); channels.forEach(c => c.port2.close()); }
});

test('failed or malformed derivative workers reject outstanding work without hanging', async () => {
  for (const mode of ['timeout', 'error', 'malformed']) {
    const c = new MessageChannel(), pool = new DerivativePool([c.port1 as unknown as MessagePort], 30);
    c.port2.on('message', data => {
      if (mode === 'error') c.port2.postMessage({ id: data.id, error: 'worker failed' });
      if (mode === 'malformed') c.port2.postMessage({ id: data.id, values: new Float64Array([NaN]) });
    });
    try { await assert.rejects(pool.columns([0], 1, 1), /respond|failed|Invalid/); }
    finally { pool.fail('Test complete'); c.port2.close(); }
  }
});

test('automatic worker count reserves a core and limits concurrent derivative helpers', () => {
  for (const [hardware, expected] of [[1, 1], [2, 1], [3, 2], [8, 4], [32, 4], [NaN, 1]]) assert.equal(derivativeWorkerCount(hardware), expected);
});

test('canceling an Engine terminates every helper and rejects pending requests', async () => {
  const original = globalThis.Worker;
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    terminated = false;
    ports: MessagePort[] = [];
    constructor() { workers.push(this); }
    postMessage(data: any) { if (data.port) this.ports.push(data.port); if (data.ports) this.ports.push(...data.ports); }
    terminate() { this.terminated = true; this.ports.forEach(p => p.close()); }
  }
  Object.assign(globalThis, { Worker: FakeWorker });
  const engine = new Engine(() => {}, () => {});
  try {
    const pending = engine.request('fit', {} as any);
    workers[0].onmessage!({ data: { type: 'derivative-pool', count: 3 } });
    assert.equal(workers.length, 4);
    const rejected = assert.rejects(pending, /canceled/);
    engine.stop(); await rejected;
    assert.ok(workers.every(w => w.terminated));
    assert.equal(engine.derivativeWorkers.size, 0);
  } finally { engine.stop(); Object.assign(globalThis, { Worker: original }); }
});

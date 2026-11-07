import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonWorkerCount, startComparison } from '../src/comparison-client';
import { completeComparison, type PreparedComparison, type SimulationOutcome } from '../src/comparison';
import { demo } from '../src/demo';

test('automatic parallelism leaves a logical processor free, caps automatic use, and validates manual settings', () => {
  for (const [hardware, expected] of [[1,1],[2,1],[4,3],[8,7],[14,8],[128,8],[NaN,1]]) assert.equal(comparisonWorkerCount(0, hardware), expected);
  assert.equal(comparisonWorkerCount(1,14),1); assert.equal(comparisonWorkerCount(4,14),4);
  for (const requested of [-1,1.5,17,Infinity]) assert.throws(() => comparisonWorkerCount(requested,14), /workers/);
});

async function exercise(fault: '' | 'error' | 'reported-error' | 'duplicate' | 'cancel' = '') {
  const previous = globalThis.Worker, instances: FakeWorker[] = [], assigned: number[] = [], completed: number[] = [], progress: number[] = [];
  let generated = 0, active = 0, highWater = 0, completeCalls = 0;
  const project = demo(), options = { simulations: 99, seed: 1, noise: 'gaussian' as const, doubledFirstChannel: false, workers: 3 };
  const evaluation = { parameters: {}, y: project.spectrum.y, residual: project.spectrum.y.map(() => 1), components: [], background: [], sse: 512, objective: 512 };
  const fit = { project, evaluation, errors: {}, iterations: 1, converged: true, termination: 'Converged', free_parameters: 10, dof: 502, rank: 10, reduced_objective: 1, warnings: [] };
  const prepared: PreparedComparison = { options, simpler: fit, larger: { ...fit, free_parameters: 14, dof: 498 }, improvement: 20, noiseStd: 1, fitAttempts: [] };
  class FakeWorker {
    onmessage?: (event: {data: any}) => void; onerror?: (event: {message: string}) => void;
    terminated = false;
    constructor() { instances.push(this); }
    send(data: any) { queueMicrotask(() => { if (!this.terminated) this.onmessage?.({data}); }); }
    postMessage(data: any) {
      if (data.method === 'prepare') this.send({prepared});
      else if (data.method === 'configure') this.send({configured: true});
      else if (data.method === 'generate') { const index = generated++; this.send({job:{index,y:[index]}}); }
      else if (data.method === 'simulate') {
        const index = data.job.index; assert.deepEqual(data.job.y,[index]); assigned.push(index); active++; highWater = Math.max(highWater,active);
        setTimeout(() => {
          active--; if (this.terminated) return;
          this.onmessage?.({data:{progress:{phase:`Simulation ${index + 1}`,completed:index,total:99}}});
          if (index === 2 && fault === 'error') { this.onerror?.({message:'Worker failed'}); return; }
          if (index === 2 && fault === 'reported-error') { this.send({error:'Unconverged simulated fit'}); return; }
          completed.push(index);
          const outcome: SimulationOutcome = { index, improvement:index / 10, diagnostic: {simpler:fit,larger:fit}, fitAttempts: [], verifiedStationary:0,rankDeficient:false,bounded:false };
          this.send({outcome}); if (fault === 'duplicate' && index === 2) this.send({outcome});
        }, index === 0 || fault === 'cancel' ? 20 : 0);
      } else if (data.method === 'complete') { completeCalls++; this.send({result:completeComparison(prepared,data.outcomes)}); }
    }
    terminate() { this.terminated = true; }
  }
  Object.assign(globalThis,{Worker:FakeWorker});
  try {
    const task = startComparison(project,project,options,p => progress.push(p.completed));
    if (fault === 'cancel') {
      const rejection = assert.rejects(task.promise,/canceled/);
      await new Promise(resolve => setTimeout(resolve,1)); task.cancel(); await rejection;
    } else if (fault) await assert.rejects(task.promise, fault === 'duplicate' ? /duplicate/ : fault === 'error' ? /Worker failed/ : /Unconverged/);
    else {
      const result = await task.promise;
      assert.equal(generated,99); assert.deepEqual(assigned,Array.from({length:99},(_,i)=>i));
      assert.equal(new Set(completed).size,99); assert.notEqual(completed[0],0);
      assert.deepEqual(result.improvements,Array.from({length:99},(_,i)=>i/10));
      assert.equal(result.execution?.workers,3); assert.equal(completeCalls,1);
      assert.ok(highWater > 1 && highWater <= 3);
    }
    assert.equal(instances.length,4); assert.ok(instances.every(w=>w.terminated));
    assert.ok(progress.every((value,index)=>index===0||value>=progress[index-1]),'global progress must never decrease when jobs finish out of order');
    if (fault) assert.equal(completeCalls,0);
  } finally { Object.assign(globalThis,{Worker:previous}); }
}
test('parallel workers dynamically share jobs, aggregate in simulation order, and report monotone global progress',async()=>exercise());
test('canceling a parallel comparison terminates the coordinator and every fitting worker',async()=>exercise('cancel'));
test('worker crashes, rejected fits, and duplicate results abort the complete pool without a p-value',async()=>{
  await exercise('error'); await exercise('reported-error'); await exercise('duplicate');
});

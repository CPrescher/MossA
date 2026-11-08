import { FitSession, fit_parallel_json } from './wasm/mossa_core';
import type { FitProgress, FitResult, Project } from './types';
import type { DerivativePool } from './derivative-pool';

export async function fitParallel(project: Project, calibration: boolean, pool: DerivativePool, onProgress?: (state: FitProgress) => void, report?: (timings: object) => void): Promise<FitResult> {
  const json = JSON.stringify(project), session = new FitSession(json, calibration);
  let last = -Infinity;
  const timings = { prepare_ms: 0, solver_ms: 0, derivative_wait_ms: 0, batches: 0, advances: 0 };
  try {
    let begin = performance.now();
    await pool.prepare(json, calibration);
    timings.prepare_ms += performance.now() - begin;
    if (pool.synchronous) {
      let failure: unknown;
      try {
        return JSON.parse(fit_parallel_json(json, calibration, (x: Float64Array) => {
          const start = performance.now(); timings.batches++;
          try { return pool.columnsSync(x, project.spectrum.x.length, x.length); }
          catch (error) { failure = error; throw error; }
          finally { timings.derivative_wait_ms += performance.now() - start; }
        }, (json: string) => onProgress?.(JSON.parse(json))));
      } catch (error) { throw failure ?? error; }
    }
    for (;;) {
      begin = performance.now();
      const state = JSON.parse(session.advance());
      timings.solver_ms += performance.now() - begin; timings.advances++;
      if (state.kind === 'done') return state.result;
      if (state.kind === 'derivatives') {
        begin = performance.now();
        session.supply(await pool.columns(state.x, state.rows, state.columns));
        timings.derivative_wait_ms += performance.now() - begin; timings.batches++;
      }
      else if (onProgress && performance.now() - last >= 100) {
        last = performance.now(); onProgress(JSON.parse(session.progress()));
      }
    }
  } finally { report?.(timings); session.free(); }
}

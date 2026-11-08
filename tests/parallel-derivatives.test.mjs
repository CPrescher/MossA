import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { FitSession, DerivativeModel, fit_json, fit_source_json, evaluate_source_json, fit_parallel_json } from '../src/wasm/mossa_core.js';
import { fitMultiStart, fitMultiStartAsync } from '../src/multistart.mjs';
import { evaluate_json } from '../src/wasm/mossa_core.js';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const cases = ['transmission-performance.json', 'transmission-measured-performance.json'].flatMap(name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))).cases);
function run(c, progress = false) {
  const json = JSON.stringify(c.project), session = new FitSession(json, !!c.calibration), worker = new DerivativeModel(json, !!c.calibration);
  const iterations = [];
  try {
    for (let calls = 0; calls < 5000; calls++) {
      const state = JSON.parse(session.advance());
      if (state.kind === 'done') return { result: state.result, iterations };
      if (state.kind === 'derivatives') {
        // Uneven chunks in reverse completion order must retain column order.
        const columns = new Float64Array(state.rows * state.columns);
        for (let end = state.columns; end > 0; end -= 3) {
          const first = Math.max(0, end - 3);
          columns.set(worker.columns(state.x, first, end), first * state.rows);
        }
        session.supply(columns);
      } else if (progress) iterations.push(JSON.parse(session.progress()).iteration);
    }
    assert.fail('Session did not terminate');
  } finally { session.free(); worker.free(); }
}
for (const c of cases) test(`checkpointed derivative batches preserve every fit field: ${c.id}`, () => {
  const { result, iterations } = run(c, true);
  assert.deepEqual(result, c.result);
  assert.equal(iterations[0], 0);
  assert.ok(iterations.every((v, i) => !i || v >= iterations[i - 1]));
});

test('uninterrupted parallel-column callback preserves every baseline fit and uncertainty', () => {
  for (const c of cases) {
    const json = JSON.stringify(c.project), model = new DerivativeModel(json, !!c.calibration);
    try {
      const result = JSON.parse(fit_parallel_json(json, !!c.calibration, x => model.columns(x, 0, x.length), () => {}));
      assert.deepEqual(result, c.result, c.id);
    } finally { model.free(); }
  }
});

test('uninterrupted callback rejects invalid Jacobians rather than publishing a fit', () => {
  const json = JSON.stringify(cases[0].project);
  assert.throws(() => fit_parallel_json(json, false, () => new Float64Array(1), () => {}), /Invalid derivative/);
});

test('parallel derivatives preserve fitted Gaussian sources and dependent distribution-weight std', () => {
  const gaussian = structuredClone(cases.find(c => c.id === 'source-calibration-lorentzian'));
  gaussian.project.source_gaussians = [{ center: 0, fwhm: .21, weight: 1 }, { center: .34, fwhm: .37, weight: .28 }];
  gaussian.project.spectrum.y = JSON.parse(evaluate_source_json(JSON.stringify(gaussian.project))).y.map((v, i) => v + .1 * Math.sin(17.3 * i));
  gaussian.project.source_gaussians[1].fwhm *= 1.05;
  const distribution = structuredClone(cases.find(c => c.id === 'xvbf-transmission'));
  const model = distribution.project.sites[0].xvbf;
  model.cs.push(structuredClone(model.cs[0]));
  model.cs[1].center.value = -.4; model.cs[1].width.value = .08;
  model.cs[0].weight = { value: .65, fit: true, min: 0, max: 1, link: null };
  model.cs[1].weight = { value: .35, fit: true, min: 0, max: 1, link: null };
  distribution.project.spectrum.y = JSON.parse(evaluate_json(JSON.stringify(distribution.project))).y.map((v, i) => v + .1 * Math.sin(17.3 * i));
  model.cs[0].weight.value = .6; model.cs[1].weight.value = .4;
  for (const c of [gaussian, distribution]) {
    const json = JSON.stringify(c.project), expected = JSON.parse((c.calibration ? fit_source_json : fit_json)(json));
    assert.deepEqual(run(c).result, expected);
    const helper = new DerivativeModel(json, !!c.calibration);
    try { assert.deepEqual(JSON.parse(fit_parallel_json(json, !!c.calibration, x => helper.columns(x, 0, x.length), () => {})), expected); }
    finally { helper.free(); }
  }
});

test('all-fixed and iteration-limited sessions preserve the serial result', () => {
  const c = structuredClone(cases[3]); c.project.max_iterations = 1;
  assert.deepEqual(run(c).result, JSON.parse(fit_json(JSON.stringify(c.project))));
  for (const site of c.project.sites) for (const p of Object.values(site.params)) p.fit = false;
  c.project.background.forEach(p => p.fit = false);
  assert.deepEqual(run(c).result, JSON.parse(fit_json(JSON.stringify(c.project))));
});

test('session rejects malformed, stale, missing and nonfinite derivative output', () => {
  const c = cases[0], json = JSON.stringify(c.project), session = new FitSession(json, false), worker = new DerivativeModel(json, false);
  try {
    assert.throws(() => session.supply(new Float64Array()), /Invalid/);
    const state = JSON.parse(session.advance());
    assert.equal(state.kind, 'derivatives');
    assert.throws(() => worker.columns([], 0, 1), /Invalid/);
    assert.throws(() => worker.columns(state.x, 0, state.columns + 1), /Invalid/);
    assert.throws(() => session.supply(new Float64Array(3)), /Invalid/);
    const values = worker.columns(state.x, 0, state.columns), bad = values.slice(); bad[0] = NaN;
    assert.throws(() => session.supply(bad), /Invalid/);
    session.supply(values);
    assert.throws(() => session.supply(values), /Invalid/);
  } finally { session.free(); worker.free(); }
});

test('async multistart retains adaptive start order, diagnostics, and uncertainty output exactly', async () => {
  const p = structuredClone(cases[0].project); p.search_starts = 4;
  const evaluate = q => JSON.parse(evaluate_json(JSON.stringify(q)));
  const expected = fitMultiStart(p, q => JSON.parse(fit_json(JSON.stringify(q))), evaluate);
  const actual = await fitMultiStartAsync(p, async q => run({ project: q }).result, evaluate);
  assert.deepEqual(actual, expected);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, evaluate_source_json, fit_json, fit_source_json } from '../src/wasm/mossa_core.js';
import { compare } from '../scripts/transmission-equivalence.mjs';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const cases = ['transmission-performance.json', 'transmission-measured-performance.json'].flatMap(file => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url))).cases);
// These frozen receipts qualify the explicit numerical override. Default
// analytical/checkpoint behavior is covered by analytical-derivatives.test.mjs.
for (const c of cases) {
  c.project.derivative_method='numerical';c.result.project.derivative_method='numerical';
}

for (const c of cases) {
  test(`optimized core retains pre-optimization curves, fits and std: ${c.id}`, () => {
    const json = JSON.stringify(c.project);
    const initial = JSON.parse((c.calibration ? evaluate_source_json : evaluate_json)(json));
    for (const field of ['y', 'background', 'residual']) {
      initial[field].forEach((v, i) => assert.ok(Math.abs(v - c.initial_evaluation[field][i]) < 1e-7, `${field}[${i}]`));
    }
    initial.components.forEach((curve, k) => curve.forEach((v, i) => assert.ok(Math.abs(v - c.initial_evaluation.components[k][i]) < 1e-9, `component ${k}[${i}]`)));
    assert.deepEqual(initial, c.initial_evaluation, 'default scalar evaluation stays bit-for-bit identical');
    const result = JSON.parse((c.calibration ? fit_source_json : fit_json)(json));
    compare(c, result);
    assert.deepEqual(result, c.result, 'explicit numerical fit, diagnostics and std stay bit-for-bit identical');
  });
}

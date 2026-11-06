import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { foldCenterScan, estimateFoldCenter, foldingPairs, foldingGaussianScore } from '../src/folding';
import { foldCounts, parseSpectrum } from '../src/io.mjs';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fit = async (p: unknown) => JSON.parse(fit_json(JSON.stringify(p)));

test('MATLAB-style fold search recovers shifted integer and half-integer centers without an iron model', async () => {
  for (const [n, center] of [[512, 254], [514, 258.5], [513, 256.5]]) {
    const data = Array.from({ length: n }, (_, i) => 10000 + 300 * Math.cos(2 * Math.PI * (i + 1 - center) / n) + 80 * Math.cos(14 * Math.PI * (i + 1 - center) / n) + .001 * Math.sin(i * 2.39));
    const found = await estimateFoldCenter(data, fit);
    assert.equal(found.center, center);
    assert.equal(found.scan.centers.length, 24);
    assert.equal(found.scan.centers[0], n / 2 - 5.5);
    assert.equal(found.scan.centers.at(-1), n / 2 + 6);
    const at = found.scan.centers.indexOf(center);
    assert.ok(found.scan.mismatch[at] < Math.max(...found.scan.mismatch) * 1e-6);
    assert.equal(foldCounts(data, found.center).length, Math.floor(n / 2));
  }
});

test('diagnostic halves reproduce fold.m, exclude self-pairs from RMS, and expose wrong-center mismatch', () => {
  const data = Array.from({ length: 514 }, (_, i) => 10000 + 300 * Math.cos(2 * Math.PI * (i + 1 - 258) / 514) + 80 * Math.cos(14 * Math.PI * (i + 1 - 258) / 514));
  for (const center of [258, 258.5, 254]) {
    const pairs = foldingPairs(data, center);
    assert.deepEqual(pairs.left.map((v, i) => v + pairs.right[i]), foldCounts(data, center));
    const independent = pairs.selfPaired ? pairs.difference.slice(1) : pairs.difference;
    assert.equal(pairs.pairs, independent.length);
    assert.equal(pairs.rms, Math.sqrt(independent.reduce((sum, v) => sum + v * v, 0) / independent.length));
  }
  assert.ok(foldingPairs(data, 258).rms < 1e-8);
  assert.ok(foldingPairs(data, 254).rms > 10);
  assert.throws(() => foldingPairs(data, 258.2), /half-integer/);
});

test('displayed Gaussian symmetry curve is the inverse of the actual WASM fit model', async () => {
  const data = Array.from({ length: 514 }, (_, i) => 10000 + 300 * Math.cos(2 * Math.PI * (i + 1 - 258) / 514) + 80 * Math.cos(14 * Math.PI * (i + 1 - 258) / 514));
  const estimate = await estimateFoldCenter(data, fit);
  const modeled = JSON.parse(evaluate_json(JSON.stringify(estimate.fit.project)));
  const displayed = { ...estimate, refined: true };
  estimate.scan.centers.forEach((center, i) => assert.ok(Math.abs(foldingGaussianScore(displayed, center)! - (100 - modeled.y[i])) < 1e-9));
  assert.equal(foldingGaussianScore({ ...estimate, refined: false }, 258), null);
});

test('failed Gaussian refinement uses the discrete symmetry minimum; flat counts are not assigned a fake center', async () => {
  const data = Array.from({ length: 512 }, (_, i) => 1000 + 100 * Math.cos(2 * Math.PI * (i + 1 - 255) / 512));
  const scan = foldCenterScan(data);
  const found = await estimateFoldCenter(data, async project => ({ ...(await fit(project)), converged: false }));
  assert.equal(found.center, scan.best);
  assert.equal(found.refined, false);
  assert.throws(() => foldCenterScan(Array(512).fill(1000)), /no identifiable/);
});

test('513 and 514 numeric rows import without adding or dropping a data point; odd folding follows fold.m', () => {
  for (const n of [513, 514]) {
    const parsed = parseSpectrum('counts\n' + Array.from({ length: n }, (_, i) => 10000 + i).join('\n') + '\n');
    assert.equal(parsed.raw!.length, n);
    assert.equal(parsed.raw![0], 10000);
    assert.equal(parsed.raw!.at(-1), 10000 + n - 1);
    assert.equal(foldCounts(parsed.raw!, n / 2 + .5).length, Math.floor(n / 2));
  }
  const odd = Array.from({ length: 17 }, (_, i) => i + 1);
  assert.deepEqual(foldCounts(odd, 8.5), Array(8).fill(17));
  assert.deepEqual(foldCounts(odd, 8), Array(8).fill(16));
});

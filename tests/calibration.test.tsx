import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { applyVelocityCalibration, finishCalibration, referenceProject, referenceSeeds, type CalibrationSettings, type VelocityCalibration } from '../src/calibration';
import { calibrateCounts } from '../src/io.mjs';
import { decodeSession, defaultLayout, summarizeFit, type Snapshot } from '../src/session';
import { historyReducer } from '../src/history';
import type { FitResult } from '../src/types';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });

// Independent six-line Lorentzian generator, using sextet.m's coefficients.
function reference(max: number, shift: number, sinusoidal: boolean, field = 33, folded = false) {
  const n = 512, x = Array.from({ length: n }, (_, i) => (sinusoidal ? -Math.cos(i * Math.PI / (n - 1)) : -1 + 2 * i / (n - 1)) * max);
  const offsets = [-.1613, -.0934, -.0255, .0255, .0934, .1613], weights = [3, 2, 1, 1, 2, 3];
  const y = x.map((v, i) => 100000 + 12 * v - offsets.reduce((sum, k, j) => sum + 2400 * weights[j] / 12 / (Math.PI * .14 * (1 + ((v - shift - k * field) / .14) ** 2)), 0) + Math.sin(i * 2.399) * .2);
  if (!folded) return y;
  const raw = Array(n * 2).fill(0);
  for (let i = 0; i < n; i++) raw[n - 1 - i] = raw[n + i] = y[i] / 2;
  return raw;
}

function calibrate(counts: number[], settings: CalibrationSettings): VelocityCalibration {
  const results: VelocityCalibration[] = [], failures: string[] = [];
  for (const project of referenceSeeds(counts, settings)) {
    const fit = JSON.parse(fit_json(JSON.stringify(project))) as FitResult;
    try { results.push(finishCalibration(counts, settings, 'Synthetic iron reference', fit)); }
    catch (e) { failures.push(`${e}: ${fit.termination}, rank ${fit.rank}/${fit.free_parameters}`); }
  }
  assert.ok(results.length, failures.join('\n'));
  return results.sort((a, b) => a.fit.evaluation.sse - b.fit.evaluation.sse)[0];
}

test('WASM reference calibration recovers linear, sinusoidal, and folded velocity scales and center shifts', () => {
  for (const c of [
    { max: 8, shift: .27, sinusoidal: false, field: 33, folding: false, initial: 10 },
    { max: 10, shift: -.18, sinusoidal: true, field: 33, folding: false, initial: 8 },
    { max: 7, shift: .12, sinusoidal: false, field: 32.95, folding: true, initial: 10 },
  ]) {
    const counts = reference(c.max, c.shift, c.sinusoidal, c.field, c.folding);
    const settings = { ...c, max: c.initial, center: counts.length / 2 + .5 };
    const result = calibrate(counts, settings);
    assert.ok(Math.abs(result.max - c.max) < .002, `maximum: ${result.max} vs ${c.max}`);
    assert.ok(Math.abs(result.shift - c.shift) < .002, `center: ${result.shift} vs ${c.shift}`);
    const preview = JSON.parse(evaluate_json(JSON.stringify(result.preview)));
    assert.ok(Math.abs(result.preview.sites[0].params.bhf.value - c.field) < 1e-10);
    preview.y.forEach((v: number, i: number) => assert.ok(Math.abs(v - result.fit.evaluation.y[i]) < 1e-9, 'exact scale change preserves the fitted curve'));
    const corrected = calibrateCounts(counts, result.max, result.shift, c.sinusoidal, c.folding ? settings.center : null);
    assert.ok(Math.abs((corrected.x[0] + corrected.x.at(-1)!) / 2 + c.shift) < .002);
  }
});

test('applying a reference is one undoable change, preserves sample counts and sites, and survives session reload', () => {
  const counts = reference(8, .27, false), settings = { max: 10, field: 33, sinusoidal: false, folding: false, center: 256.5 };
  const result = calibrate(counts, settings), project = { ...referenceProject(counts, settings), spectrum: calibrateCounts(counts, settings.max, 0, false) };
  const original: Snapshot = { project, raw: counts, cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 }, filename: 'sample', selected: 0, fit: summarizeFit(result.fit), fitElapsed: 42 };
  const next = applyVelocityCalibration(original, result);
  assert.deepEqual(next.project.spectrum.y, original.project.spectrum.y);
  assert.equal(next.project.sites, original.project.sites);
  assert.equal(next.raw, original.raw);
  assert.equal(next.fit, null);
  const history = historyReducer({ past: [], present: original, future: [] }, { type: 'set', value: next, record: true });
  const undone = historyReducer(history, { type: 'undo' });
  assert.deepEqual(undone.present, original);
  assert.deepEqual(historyReducer(undone, { type: 'redo' }).present, next);
  const restored = decodeSession(JSON.stringify({ version: 1, snapshot: next, layout: defaultLayout, fit: null, elapsed: null }));
  assert.deepEqual(restored.snapshot.cal.reference, result.reference);
  const velocityColumn = { ...original, raw: null };
  const retained = applyVelocityCalibration(velocityColumn, result);
  assert.equal(retained.project, velocityColumn.project);
  assert.equal(retained.fit, velocityColumn.fit);
  assert.equal(retained.cal.max, result.max);
});

test('invalid references, incomplete scans, and unsuccessful fits cannot produce calibration coefficients', () => {
  const settings = { max: 10, field: 33, sinusoidal: false, folding: false, center: 256.5 };
  assert.throws(() => referenceProject(Array(32).fill(100), settings), /no absorption/);
  assert.throws(() => referenceProject([NaN, ...Array(31).fill(100)], settings), /finite/);
  assert.throws(() => referenceProject(reference(8, 0, false), { ...settings, field: 0 }), /positive/);
  const result = calibrate(reference(8, .27, false), settings);
  assert.throws(() => finishCalibration(result.reference.counts, settings, 'reference', { ...result.fit, converged: false }), /did not converge/);
  assert.throws(() => finishCalibration(result.reference.counts, settings, 'reference', { ...result.fit, rank: 1 }), /full-rank/);
  const truncated = structuredClone(result.fit);
  truncated.project.sites[0].params.bhf.value = 1000;
  assert.throws(() => finishCalibration(result.reference.counts, settings, 'reference', truncated), /all six/);
});

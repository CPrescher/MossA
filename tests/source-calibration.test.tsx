import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, evaluate_source_json, fit_source_json, fit_source_json_with_progress } from '../src/wasm/mossa_core.js';
import { sourceReferenceProject, sourceReferenceSeeds, finishSourceCalibration, applySourceCalibration, validSourceReference } from '../src/source-calibration';
import { decodeSession, defaultLayout, type Snapshot } from '../src/session';
import { historyReducer } from '../src/history';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import type { FitResult, Project } from '../src/types';
await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const settings = { absorberFwhm: .097, initialSourceFwhm: .4, squared: false };
const cal = { max: 4, shift: 0, folding: false, sinusoidal: false, center: 256.5 };
const evaluate = (p: Project) => JSON.parse(evaluate_source_json(JSON.stringify(p)));
// Independent literal MATLAB src_calib_model transcription: direct discrete
// convolution on -30:.01:30 at grid-aligned observations, then sampled-max
// normalization. Coefficients below are the ADDITIVE browser convention;
// MATLAB's x(2),x(3) have opposite signs. No Rust profile/FFT is used here.
function reference(squared: boolean, width = .31, area = .3, center = .23) {
  const x = Array.from({ length: 301 }, (_, i) => -3 + .02 * i);
  const lor = (v: number, cs: number, w: number, a: number) => a * (w / 2) / Math.PI / ((v - cs) ** 2 + (w / 2) ** 2);
  const source = Array.from({ length: 6001 }, (_, i) => squared ? 2 / (Math.PI * width / 2) / (1 + ((-30 + i * .01) / (width / 2)) ** 2) ** 2 : lor(-30 + i * .01, 0, width, 1));
  const absorber = Array.from({ length: 6001 }, (_, i) => Math.exp(-lor(-30 + i * .01, center, .097, area)));
  const convolved = x.map(v => { const k = Math.round((v + 30) * 100) + 3000; let sum = 0; for (let j = Math.max(0, k - 6000); j <= Math.min(6000, k); j++) sum += source[j] * absorber[k - j]; return sum; });
  const max = Math.max(...convolved);
  return { x, y: x.map((v, i) => 10000 * convolved[i] / max - 7 * v + 2 * v * v) };
}
const fixtures = [false, true].map(squared => ({ squared, spectrum: reference(squared) }));
function fitted(squared = false): FitResult {
  const fixture = fixtures.find(f => f.squared === squared)!;
  const results = sourceReferenceSeeds(fixture.spectrum, { ...settings, squared }).map(p => JSON.parse(fit_source_json(JSON.stringify(p))) as FitResult);
  return results.sort((a,b) => a.evaluation.sse - b.evaluation.sse)[0];
}

test('source evaluator matches independent MATLAB direct convolution and sampled-maximum normalization for both source shapes', () => {
  for (const { squared, spectrum } of fixtures) {
    const p = sourceReferenceProject(spectrum, { ...settings, squared });
    p.source_fwhm = .31; p.sites[0].params.cs.value = .23; p.sites[0].params.intensity.value = .3;
    p.background.forEach((b, i) => b.value = [10000, -7, 2][i]);
    const actual = evaluate(p);
    actual.y.forEach((v: number, i: number) => assert.ok(Math.abs(v - spectrum.y[i]) < 1e-7, `${squared} at ${i}: ${v-spectrum.y[i]}`));
    assert.ok(JSON.parse(evaluate_json(JSON.stringify(p))).y.some((v: number, i: number) => Math.abs(v - actual.y[i]) > 1), 'ordinary transmission retains its distinct normalization');
  }
});

test('compiled WASM recovers source width, center, optical-depth area, and quadratic background with fixed known absorber width', () => {
  for (const squared of [false, true]) {
    const fit = fitted(squared);
    assert.equal(fit.converged, true, JSON.stringify({ termination:fit.termination, iterations:fit.iterations, sse:fit.evaluation.sse, width:fit.project.source_fwhm, center:fit.project.sites[0].params.cs.value }));
    const result = finishSourceCalibration('synthetic singlet', fit);
    assert.equal(fit.converged, true); assert.equal(fit.free_parameters, 6); assert.equal(fit.rank, 6);
    assert.ok(fit.evaluation.sse < 1e-6, `${squared}: ${fit.evaluation.sse}`);
    assert.ok(Math.abs(result.reference.sourceFwhm - .31) < 1e-5);
    assert.ok(Math.abs(result.reference.center - .23) < 1e-5);
    assert.ok(Math.abs(result.reference.intensity - .3) < 1e-5);
    assert.equal(fit.project.sites[0].params.fwhm.value, .097); assert.equal(fit.errors['site:0:fwhm'], null);
    fit.project.background.forEach((b, i) => assert.ok(Math.abs(b.value - [10000,-7,2][i]) < 1e-4));
    assert.ok(result.reference.sourceStd >= 0);
  }
});

test('source fit progress includes variable source width and is throttled to at most ten updates per second', () => {
  const p = sourceReferenceProject(fixtures[0].spectrum, settings), updates: any[] = [];
  const fit = JSON.parse(fit_source_json_with_progress(JSON.stringify(p), (json: string) => updates.push(JSON.parse(json))));
  assert.equal(fit.converged, true); assert.ok(updates.length > 0);
  assert.equal(updates[0].evaluation.y.length, p.spectrum.x.length);
  assert.ok(updates.every(u => Number.isFinite(u.evaluation.parameters['source:fwhm'])));
  for (let i=1;i<updates.length;i++) assert.ok(updates[i].elapsed_ms - updates[i-1].elapsed_ms >= 99);
});

test('applying source calibration preserves sample sites/data, invalidates only changed transmission fits, and round-trips history/session/project files', async () => {
  const result = finishSourceCalibration('reference', fitted());
  const p = sourceReferenceProject(fixtures[0].spectrum, settings);
  const fakeFit = { ...result.fit, project: p }; // Existing sample metadata must survive Undo exactly.
  const { project: _p, evaluation: _e, ...summary } = fakeFit;
  const before: Snapshot = { project: p, raw: [1,2,3,4,5,6,7,8], cal, filename: 'sample', selected: 0, fit: summary, fitElapsed: 42 };
  const next = applySourceCalibration(before, result);
  assert.equal(next.project.sites, before.project.sites); assert.equal(next.project.spectrum, before.project.spectrum); assert.equal(next.raw, before.raw);
  assert.equal(next.fit, null); assert.equal(next.project.mode, 'transmission');
  let history = historyReducer({ past: [] as Snapshot[], present: before, future: [] as Snapshot[] }, { type:'set', value:next, record:true });
  history = historyReducer(history, { type:'undo' }); assert.deepEqual(history.present, before);
  history = historyReducer(history, { type:'redo' }); assert.deepEqual(history.present, next);
  assert.deepEqual(decodeSession(JSON.stringify({ version:1, snapshot:next, layout:defaultLayout, fit:null, elapsed:null })).snapshot.cal.sourceReference, result.reference);
  const file = await createProjectFile(next, {});
  assert.deepEqual((await openProjectFile(JSON.parse(JSON.stringify(file)), cal, 'file', async p => JSON.parse(evaluate_json(JSON.stringify(p))))).snapshot.cal.sourceReference, result.reference);
  const already = { ...next, fit: summary, fitElapsed: 43 };
  assert.equal(applySourceCalibration(already, result).project, already.project); assert.equal(applySourceCalibration(already, result).fit, summary);
  const thin = { ...before, project: { ...p, mode: 'thin' as const } };
  assert.equal(applySourceCalibration(thin, result).fit, thin.fit);
});

test('invalid, unconverged, and unresolved source calibrations cannot be applied', () => {
  assert.throws(() => sourceReferenceProject({ x:fixtures[0].spectrum.x, y:fixtures[0].spectrum.y.map(()=>100) }, settings), /no absorption/);
  assert.throws(() => sourceReferenceProject(fixtures[0].spectrum, {...settings, absorberFwhm:0}), /absorber FWHM/);
  assert.throws(() => sourceReferenceProject(fixtures[0].spectrum, {...settings, initialSourceFwhm:6}), /0.001–5/);
  const fit = fitted();
  assert.throws(() => finishSourceCalibration('bad', {...fit, converged:false}), /did not converge/);
  assert.throws(() => finishSourceCalibration('bad', {...fit, rank:1}), /not resolved/);
  const invalid = structuredClone(fit.project); invalid.sites[0].params.fwhm.fit = true;
  assert.throws(() => evaluate(invalid), /fixed absorber FWHM/);
  assert.equal(validSourceReference({...finishSourceCalibration('test',fit).reference, sourceStd:NaN}), false);
});

test('source fits handle non-grid observation velocities, noisy counts, and different count scales', () => {
  for (const [squared, counts, area] of [[false, 1000, .1], [true, 1000000, 2]] as const) {
    const x = Array.from({length:257}, (_, i) => -2.73 + 5.48 * i / 256);
    const truth = sourceReferenceProject({x, y:x.map(v => counts * (1 - .1 * Math.exp(-v*v)))}, {...settings, squared});
    truth.source_fwhm = .25; truth.sites[0].params.cs.value = -.17; truth.sites[0].params.intensity.value = area;
    truth.background[0].value = counts;
    const y = evaluate(truth).y.map((v:number, i:number) => v + .3 * Math.sqrt(counts) * Math.sin(17.3 * i));
    const fits = sourceReferenceSeeds({x,y}, {...settings, squared}).map(p => JSON.parse(fit_source_json(JSON.stringify(p))) as FitResult);
    const usable = fits.filter(f => f.converged && f.rank === 6).sort((a,b) => a.evaluation.sse - b.evaluation.sse);
    assert.ok(usable.length, JSON.stringify(fits.map(f=>[f.termination,f.project.source_fwhm])));
    const result = finishSourceCalibration('noisy standard',usable[0]);
    assert.ok(Math.abs(result.reference.sourceFwhm - .25) < .01, `${counts}: ${result.reference.sourceFwhm}`);
    assert.ok(result.reference.sourceStd > 0);
    assert.ok(Math.abs(result.reference.center + .17) < .003);
  }
});

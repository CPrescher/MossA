import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { summarizeFit, type Snapshot } from '../src/session';
import { historyReducer, type History } from '../src/history';
import type { FitResult, Project } from '../src/types';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fitted = JSON.parse(fit_json(JSON.stringify(demo()))) as FitResult;
const cal = { max: 10, shift: .12, folding: false, sinusoidal: false, center: 256.5 };
function snapshot(): Snapshot { return { project: structuredClone(fitted.project), fit: summarizeFit(fitted), fitElapsed: 91.23456789, raw: null, cal, filename: 'Completed fit', selected: 1 }; }
const evaluate = async (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));

test('portable project round-trip restores exact fit errors, fractions, diagnostics, timing, and selection without optimization', async () => {
  const original = snapshot(), encoded = await createProjectFile(original, { application: 'MossA test' });
  const file = JSON.parse(JSON.stringify(encoded));
  let evaluations = 0;
  const restored = await openProjectFile(file, cal, 'file.mossa.json', async p => { evaluations++; return evaluate(p); });
  assert.equal(evaluations, 1, 'opening only evaluates curves; no fit callback is available');
  assert.deepEqual(restored.snapshot, original);
  assert.equal(restored.notice, '');
  restored.evaluation.y.forEach((v: number, i: number) => assert.ok(Math.abs(v - fitted.evaluation.y[i]) < 1e-8));
  assert.equal('project' in file.fit, false);
  assert.equal('evaluation' in file.fit, false);
  assert.match(file.fit_state.binding.value, /^[a-f0-9]{64}$/);
});

test('changed data, bounds, fit flags, and links invalidate stored uncertainties while retaining the edited project', async () => {
  for (const change of [
    (p: Project) => { p.spectrum.y[0] += 1; },
    (p: Project) => { p.sites[0].params.cs.min = -9; },
    (p: Project) => { p.sites[0].params.cs.fit = false; },
    (p: Project) => { p.sites[1].params.fwhm.link = { target: 'site:0:fwhm', factor: 1 }; },
  ]) {
    const file = await createProjectFile(snapshot(), {});
    change(file.project);
    const restored = await openProjectFile(file, cal, 'file', evaluate);
    assert.equal(restored.snapshot.fit, null);
    assert.equal(restored.snapshot.fitElapsed, null);
    assert.deepEqual(restored.snapshot.project, file.project);
    assert.match(restored.notice, /does not match/);
  }
});

test('site renaming, metadata edits, and reordered JSON keys preserve matching fitted results', async () => {
  const original = snapshot(), file = await createProjectFile(original, {});
  file.project.sites[0].name = 'Renamed site'; file.name = 'Renamed project';
  const reversed = JSON.parse(JSON.stringify(file), (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
  const restored = await openProjectFile(reversed, cal, 'file', evaluate);
  assert.deepEqual(restored.snapshot.fit, original.fit);
  assert.equal(restored.snapshot.filename, 'Renamed project');
  assert.equal(restored.snapshot.project.sites[0].name, 'Renamed site');
});

test('legacy and stopped fits restore their original status; malformed or inconsistent results are discarded', async () => {
  const original = snapshot();
  const legacy = JSON.parse(JSON.stringify(await createProjectFile(original, {})));
  delete legacy.fit_state;
  const restored = await openProjectFile(legacy, cal, 'legacy', evaluate);
  assert.deepEqual(restored.snapshot.fit!.errors, original.fit!.errors);
  assert.equal(restored.snapshot.fitElapsed, null);
  assert.ok(restored.snapshot.fit!.warnings.some(w => w.includes('Legacy fit')));
  const stopped = await createProjectFile({ ...original, fit: { ...original.fit!, converged: false, termination: 'MaximumIterations', warnings: ['Iteration limit reached'] } }, {});
  assert.equal((await openProjectFile(stopped, cal, 'stopped', evaluate)).snapshot.fit!.converged, false);
  assert.deepEqual((await openProjectFile(stopped, cal, 'stopped', evaluate)).snapshot.fit!.warnings, ['Iteration limit reached']);
  const broken = JSON.parse(JSON.stringify(await createProjectFile(snapshot(), {})));
  broken.fit!.errors['site:0:cs'] = -1;
  assert.equal((await openProjectFile(broken, cal, 'broken', evaluate)).snapshot.fit, null);
  const inconsistent = JSON.parse(JSON.stringify(await createProjectFile(snapshot(), {})));
  inconsistent.fit!.reduced_objective *= 2;
  assert.match((await openProjectFile(inconsistent, cal, 'inconsistent', evaluate)).notice, /objective/);
  const unfitted = await createProjectFile({ ...snapshot(), fit: null, fitElapsed: null }, {});
  assert.equal((await openProjectFile(unfitted, cal, 'unfitted', evaluate)).snapshot.fit, null);
});

test('opening a fitted project is one history step and Undo/Redo preserve both projects and their completed results', async () => {
  const before = snapshot(); before.filename = 'Previous project';
  const next = await openProjectFile(await createProjectFile({ ...snapshot(), filename: 'Opened project', fitElapsed: 47 }, {}), cal, 'file', evaluate);
  let history: History<Snapshot> = { past: [], present: before, future: [] };
  history = historyReducer(history, { type: 'set', value: next.snapshot, record: true });
  assert.equal(history.past.length, 1);
  history = historyReducer(history, { type: 'undo' }); assert.deepEqual(history.present, before);
  history = historyReducer(history, { type: 'redo' }); assert.deepEqual(history.present, next.snapshot);
});

test('plain HTTP without WebCrypto can save and restore a locally bound completed fit', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const file = await createProjectFile(snapshot(), {});
    assert.equal(file.fit_state!.binding.algorithm, 'canonical-project-v1');
    const restored = await openProjectFile(JSON.parse(JSON.stringify(file)), cal, 'file', evaluate);
    assert.deepEqual(restored.snapshot.fit, snapshot().fit);
    file.project.spectrum.y[0] += 1;
    assert.equal((await openProjectFile(file, cal, 'edited', evaluate)).snapshot.fit, null);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test('a corrupt embedded legacy fit project does not prevent loading valid sample data', async () => {
  const file = JSON.parse(JSON.stringify(await createProjectFile(snapshot(), {})));
  delete file.fit_state; file.fit.project = {};
  const restored = await openProjectFile(file, cal, 'file', evaluate);
  assert.equal(restored.snapshot.fit, null);
  assert.deepEqual(restored.snapshot.project, file.project);
  assert.match(restored.notice, /legacy fit/);
});

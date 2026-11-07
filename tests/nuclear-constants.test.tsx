import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { newSite, parameter, type Project, type FitResult } from '../src/types';
import { nuclearConstants, newNuclearConstants, CURRENT_NUCLEAR_CONVENTION, LEGACY_NUCLEAR_CONVENTION } from '../src/nuclear-constants.mjs';
import { applyRawCalibration, applyVelocityCalibration, importedSpectrumConstants, referenceProject, referenceSeeds, finishCalibration } from '../src/calibration';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { decodeSession, writeSession, defaultLayout, summarizeFit, type Snapshot } from '../src/session';
import { placedParameters } from '../src/placement.mjs';
import { calibrateCounts } from '../src/io.mjs';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const evaluate = (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));
const fit = (p: Project): FitResult => JSON.parse(fit_json(JSON.stringify(p)));
const cal = { max: 8, shift: 0, sinusoidal: false, folding: false, center: 256.5 };
const modern = newNuclearConstants();

// Enumerate the six dipole-allowed transitions independently of the registry
// and numerical core. Positive/negative velocities have equal pair weights.
const K = 1000 * 299792458 * 5.0507837393e-27 / (14412.497 * 1.602176634e-19);
const transitions: { coefficient: number; weight: number }[] = [];
for (const mg of [-.5, .5]) for (const me of [-1.5, -.5, .5, 1.5]) {
  if (Math.abs(me - mg) > 1) continue;
  const coefficient = K * (-(-.15531 / 1.5) * me + (.09064 / .5) * mg);
  transitions.push({ coefficient, weight: Math.abs(me) === 1.5 ? 3 : Math.abs(me - mg) < .1 ? 2 : 1 });
}
function synthetic(): Project {
  const site = newSite(0, 'Sextet');
  for (const param of Object.values(site.params)) param.fit = false;
  for (const [key, value] of Object.entries({ cs: .17, qs: 0, fwhm: .24, intensity: .24, bhf: 33, a12: 1.5, a13: 3 })) site.params[key].value = value;
  site.params.bhf.fit = true;
  const x = Array.from({ length: 512 }, (_, i) => -8 + 16 * i / 511);
  const y = x.map(v => 100 - transitions.reduce((sum, t) => sum + (.24 * t.weight / 12) * (.24 / 2) / Math.PI / ((v - .17 - 33 * t.coefficient) ** 2 + (.24 / 2) ** 2), 0));
  return { nuclear_constants: modern, spectrum: { x, y }, sites: [site], background: [parameter(100, false)], mode: 'thin', weighting: 'unweighted', source_fwhm: .097, source_squared: false, max_iterations: 200 };
}
function snapshot(project: Project): Snapshot { return { project, raw: null, cal, filename: 'constants test', selected: 0 }; }

test('new defaults and graph initialization use the unrounded evaluated coefficients; legacy seeds stay unchanged', () => {
  assert.equal(demo().nuclear_constants?.id, CURRENT_NUCLEAR_CONVENTION);
  const expected = transitions.filter(t => t.coefficient > 0).map(t => t.coefficient).sort((a,b) => b-a);
  modern.coefficients.forEach((v,i) => assert.ok(Math.abs(v - expected[i]) < 3e-17));
  assert.equal(nuclearConstants().id, LEGACY_NUCLEAR_CONVENTION);
  assert.deepEqual(importedSpectrumConstants(undefined, cal), modern, 'new velocity columns');
  assert.deepEqual(importedSpectrumConstants([1,2], cal), nuclearConstants(), 'reuse original calibration');
  assert.deepEqual(importedSpectrumConstants([1,2], { ...cal, nuclear_constants: modern }), modern);
  const position = (constants?: typeof modern) => placedParameters('Sextet', 'Lorentzian', { x: -33*modern.coefficients[0], y: 90 }, { x: -5, y: 95 }, { x: 33*modern.coefficients[0], y: 90 }, 100, 'thin', .5, constants).bhf;
  assert.ok(Math.abs(position(modern) - 33) < 1e-14);
  assert.equal(position(), 66 * modern.coefficients[0] * 3.097);
});

test('compiled WASM fits independent modern Zeeman transitions and preserves the convention in its output', () => {
  const p = synthetic();
  assert.ok(evaluate(p).sse < 1e-24);
  p.sites[0].params.bhf.value = 32.7;
  const result = fit(p);
  assert.ok(result.evaluation.sse < 1e-16);
  assert.ok(Math.abs(result.project.sites[0].params.bhf.value - 33) < 1e-7);
  assert.deepEqual(result.project.nuclear_constants, modern);
  const legacy = { ...result.project }; delete legacy.nuclear_constants;
  assert.ok(evaluate(legacy).sse > 1e-8, 'same BHF with legacy coefficients is a different curve');
});

test('archived version-1 measured fit retains its exact model, axes, calibration, errors and binding through re-save', async () => {
  // Frozen pre-migration artifact from the public-data benchmark. Provenance
  // and the original curve/model binding are retained inside the fixture.
  const file = JSON.parse(readFileSync(new URL('./fixtures/legacy-hematite-fitted.mossa.json', import.meta.url), 'utf8'));
  const originalText = JSON.stringify(file);
  assert.equal(file.project.nuclear_constants, undefined);
  const opened = await openProjectFile(file, { ...cal, nuclear_constants: modern }, 'archive', async p => evaluate(p));
  assert.equal(opened.notice, '');
  assert.deepEqual(opened.snapshot.project, file.project);
  assert.deepEqual(opened.snapshot.cal, file.preprocessing.controls);
  assert.deepEqual(opened.snapshot.fit, file.fit);
  const saved = await createProjectFile(opened.snapshot, {});
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.fit_state, file.fit_state);
  assert.equal(saved.project.nuclear_constants, undefined);
  assert.equal(saved.provenance.nuclear_constants.id, LEGACY_NUCLEAR_CONVENTION);
  assert.equal(JSON.stringify(file), originalText, 'opening never migrates or mutates the archive');
  const explicit = { ...file.project, nuclear_constants: nuclearConstants() };
  assert.deepEqual(evaluate(explicit), opened.evaluation, 'untagged and explicit legacy evaluate identically');
  let text = '';
  writeSession({ version: 1, snapshot: opened.snapshot, layout: defaultLayout, fit: file.fit, elapsed: opened.snapshot.fitElapsed! }, { getItem: () => null, setItem: (_k,v) => { text = v; } });
  const restored = decodeSession(text);
  assert.equal(restored.version, 1);
  assert.deepEqual(restored.snapshot.project, file.project);
  assert.deepEqual(restored.snapshot.cal, file.preprocessing.controls);
  assert.deepEqual(restored.fit, file.fit);
});

test('modern project and autosave round-trips use version 2 and retain matching fit and calibration', async () => {
  const result = fit(synthetic());
  const original = { ...snapshot(result.project), cal: { ...cal, nuclear_constants: modern }, fit: summarizeFit(result), fitElapsed: 42 };
  const file = await createProjectFile(original, {});
  assert.equal(file.version, 2);
  assert.deepEqual(file.provenance.nuclear_constants, modern);
  assert.deepEqual(file.provenance.calibration_nuclear_constants, modern);
  const opened = await openProjectFile(JSON.parse(JSON.stringify(file)), cal, 'modern', async p => evaluate(p));
  assert.deepEqual(opened.snapshot, original);
  assert.equal(opened.notice, '');
  assert.ok(fit(opened.snapshot.project).evaluation.sse < 1e-16);
  let text = '';
  assert.equal(writeSession({ version: 1, snapshot: original, layout: defaultLayout, fit: original.fit, elapsed: 42 }, { getItem: () => null, setItem: (_k,v) => { text = v; } }), true);
  const restored = decodeSession(text);
  assert.equal(restored.version, 2);
  assert.deepEqual(restored.snapshot, (({ fit: _f, fitElapsed: _e, ...s }) => s)(original));
  assert.deepEqual(restored.fit, original.fit);
  const calibrationOnly = await createProjectFile({ ...snapshot(demo(nuclearConstants())), cal: original.cal }, {});
  assert.equal(calibrationOnly.version, 2, 'a modern saved calibration also requires a modern reader');
});

test('unknown or edited constants are rejected by project/session loading and the numerical core', async () => {
  for (const constants of [{ ...modern, id: 'unknown' }, { ...modern, coefficients: [.1613, .0934, .0255] }, null]) {
    const p = { ...synthetic(), nuclear_constants: constants } as Project;
    assert.throws(() => evaluate(p), constants === null ? /NuclearConstants/ : /nuclear constants/);
    assert.throws(() => decodeSession(JSON.stringify({ version: 2, snapshot: snapshot(p) })), /nuclear constants/);
    const file = { format: 'mossa-project', version: 2, project: p };
    await assert.rejects(openProjectFile(file, cal, 'bad', async p => evaluate(p)), /nuclear constants/);
  }
  const p = snapshot(synthetic()); p.raw = p.project.spectrum.y;
  assert.throws(() => decodeSession(JSON.stringify({ version: 2, snapshot: p })), /different nuclear constants/);
});

test('modern iron calibration recovers its scale and stores the convention without modifying existing velocity columns', () => {
  const truth = synthetic(), counts = truth.spectrum.y;
  const settings = { ...cal, field: 33, nuclear_constants: modern };
  const seed = referenceSeeds(counts, settings)[0];
  assert.deepEqual(seed.nuclear_constants, modern);
  const result = finishCalibration(counts, settings, 'modern reference', fit(referenceProject(counts, settings)));
  assert.ok(Math.abs(result.max - 8) < 1e-6);
  assert.ok(Math.abs(result.shift - .17) < 1e-6);
  const raw = { ...snapshot(truth), raw: counts, cal: { ...cal, nuclear_constants: modern }, fit: summarizeFit(result.fit), fitElapsed: 42 };
  raw.project = { ...truth, spectrum: calibrateCounts(counts, cal.max, cal.shift, false) };
  assert.equal(applyRawCalibration(raw), raw, 'reapplying identical modern calibration preserves fit identity');
  const applied = applyVelocityCalibration(raw, result);
  assert.deepEqual(applied.cal.nuclear_constants, modern);
  assert.deepEqual(applied.project.nuclear_constants, modern);
  assert.equal(applied.fit, null);
  const velocityColumns = { ...raw, raw: null };
  const legacyResult = { ...result, reference: { ...result.reference, settings: { ...settings, nuclear_constants: undefined } } };
  const retained = applyVelocityCalibration(velocityColumns, legacyResult);
  assert.equal(retained.project, velocityColumns.project);
  assert.equal(retained.fit, velocityColumns.fit);
  assert.equal(retained.cal.nuclear_constants, undefined);
  const conventionChanged = applyRawCalibration(raw, cal);
  assert.equal(conventionChanged.project.nuclear_constants, undefined);
  assert.equal(conventionChanged.fit, null, 'even an unchanged axis cannot reuse a fit under different constants');
});

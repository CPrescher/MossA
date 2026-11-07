import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { applyRawCalibration } from '../src/calibration';
import { calibrationForImport, calibrationFromReference, controlsFromPreset, makeCalibrationPreset, sameCalibration } from '../src/calibration-presets';
import { activeSnapshot, activeSpectrum, addModel, appendSpectra, decodeWorkspace, selectEntry, updateActiveSnapshot, workspaceFromSnapshot } from '../src/workspace';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';
import { decodeWorkspaceSession } from '../src/workspaceStorage';
import { defaultLayout, summarizeFit, type Snapshot } from '../src/session';
import type { Evaluation, FitResult, Project } from '../src/types';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fitted = JSON.parse(fit_json(JSON.stringify(demo()))) as FitResult;
const evaluate = async (project: Project): Promise<Evaluation> => JSON.parse(evaluate_json(JSON.stringify(project)));
const snapshot = (): Snapshot => ({ project: structuredClone(fitted.project), raw: null, cal: { max: 5, shift: 0, sinusoidal: false, folding: false, center: 256.5, nuclear_constants: fitted.project.nuclear_constants }, filename: 'Sample', selected: 0, fit: summarizeFit(fitted), fitElapsed: 1 });

test('imports use the explicit default even after selecting or recalibrating another spectrum', () => {
  let workspace = workspaceFromSnapshot(snapshot());
  const first = workspace.activeSpectrumId;
  const ten = workspace.calibrationPresets.find(p => p.cal.max === 10)!;
  workspace = { ...workspace, importCalibrationPresetId: ten.id };
  const importCal = () => calibrationForImport(workspace.calibrationPresets.find(p => p.id === workspace.importCalibrationPresetId)!, 64);
  assert.equal(importCal().max, 10);
  workspace = appendSpectra(workspace, [{ ...snapshot(), filename: 'Other', cal: { ...snapshot().cal, max: 8 } }]);
  workspace = selectEntry(workspace, first);
  assert.equal(activeSnapshot(workspace).cal.max, 5);
  assert.equal(importCal().max, 10);
  workspace = updateActiveSnapshot(workspace, { ...activeSnapshot(workspace), cal: { ...activeSnapshot(workspace).cal, max: 7 } });
  assert.equal(importCal().max, 10);
});

test('applied presets are independent copies; recalibration affects all models of only that spectrum', () => {
  const raw = Array.from({ length: 32 }, (_, i) => 1000 + i);
  let workspace = addModel(workspaceFromSnapshot(applyRawCalibration({ ...snapshot(), raw })), true);
  const first = workspace.activeSpectrumId;
  workspace = appendSpectra(workspace, [snapshot()]);
  const unchanged = activeSpectrum(workspace);
  workspace = selectEntry(workspace, first);
  const ten = workspace.calibrationPresets.find(p => p.cal.max === 10)!;
  workspace = updateActiveSnapshot(workspace, applyRawCalibration(activeSnapshot(workspace), controlsFromPreset(ten)));
  assert.equal(activeSnapshot(workspace).project.spectrum.x[0], -10);
  assert.ok(activeSpectrum(workspace).models.every(m => m.fit === null));
  assert.equal(workspace.spectra[1], unchanged);
  ten.name = 'Renamed'; ten.cal.max = 20;
  assert.equal(activeSnapshot(workspace).cal.max, 10);
  assert.equal(activeSnapshot(workspace).cal.preset?.name, '10 mm/s');
  assert.equal(unchanged.models[0].fit?.converged, true);
});

test('presets, import defaults, provenance and completed fits survive portable export and autosave', async () => {
  let workspace = workspaceFromSnapshot(snapshot());
  const ten = workspace.calibrationPresets.find(p => p.cal.max === 10)!;
  workspace = { ...workspace, importCalibrationPresetId: ten.id };
  const file = JSON.parse(JSON.stringify(await createWorkspaceFile(workspace, {})));
  const opened = await openWorkspaceFile(file, snapshot().cal, 'presets.mossa', evaluate);
  assert.deepEqual(opened.workspace, workspace);
  const session = decodeWorkspaceSession(JSON.parse(JSON.stringify({ version: 1, workspace, layout: defaultLayout })));
  assert.deepEqual(session.workspace, workspace);
  // Migration seeds defaults without altering a legacy spectrum or its fit.
  delete file.workspace.calibrationPresets; delete file.workspace.importCalibrationPresetId;
  const migrated = await openWorkspaceFile(file, snapshot().cal, 'older.mossa', evaluate);
  assert.deepEqual(activeSnapshot(migrated.workspace), activeSnapshot(workspace));
  assert.equal(migrated.workspace.calibrationPresets[0].cal.max, 5);
});

test('reference presets keep measured provenance and constants, without source settings or sample fold centers leaking into imports', () => {
  const reference = { name: 'Fe.dat', counts: Array(64).fill(100), settings: { max: 10, field: 33, sinusoidal: true, folding: true, autoCenter: true, center: 32.5, nuclear_constants: fitted.project.nuclear_constants }, fittedField: 32.9, rms: .02, date: '2026-11-06T12:00:00Z' };
  const result = { max: 10.00123456789, shift: .123456789, reference, preview: fitted.project, fit: fitted };
  const calibration = calibrationFromReference(snapshot().cal, result);
  const preset = makeCalibrationPreset('Measured standard', calibration);
  assert.equal(preset.cal.max, result.max);
  assert.equal(preset.cal.shift, result.shift);
  assert.deepEqual(preset.cal.reference, reference);
  assert.deepEqual(preset.cal.nuclear_constants, fitted.project.nuclear_constants);
  const imported = calibrationForImport(preset, 1024);
  assert.equal(imported.center, 512.5);
  assert.equal(imported.reference?.settings.center, 32.5);
  assert.equal(imported.preset?.name, preset.name);
  imported.reference!.counts[0] = 0;
  assert.equal(preset.cal.reference!.counts[0], 100);
  assert.equal(calibrationForImport(preset, 8).folding, false);
  assert.equal(calibrationForImport(makeCalibrationPreset('Manual center', { ...calibration, autoFold: false, center: 31.5 }), 128).center, 31.5);
  assert.ok(sameCalibration(calibration, { ...calibration, center: 300.5 }));
  assert.ok(!sameCalibration(calibration, { ...calibration, max: 5 }));
});

test('invalid presets and missing defaults are rejected without accepting corrupted calibration data', () => {
  assert.throws(() => makeCalibrationPreset('', snapshot().cal), /name/);
  assert.throws(() => makeCalibrationPreset('Bad scale', { ...snapshot().cal, max: 0 }), /positive/);
  assert.throws(() => makeCalibrationPreset('Bad center', { ...snapshot().cal, folding: true, center: 1.2 }), /half-integer/);
  for (const corrupt of [
    (w: any) => { w.importCalibrationPresetId = 'missing'; },
    (w: any) => { w.calibrationPresets[0].cal.max = -10; },
    (w: any) => { w.calibrationPresets.push(w.calibrationPresets[0]); },
    (w: any) => { w.calibrationPresets[0].cal.nuclear_constants = { id: 'unknown' }; },
  ]) { const workspace = workspaceFromSnapshot(snapshot()); corrupt(workspace); assert.throws(() => decodeWorkspace(workspace)); }
});

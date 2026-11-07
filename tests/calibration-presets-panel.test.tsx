import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { CalibrationPresetsPanel } from '../src/CalibrationPresets';
import { calibrationForImport } from '../src/calibration-presets';
import { applyRawCalibration } from '../src/calibration';
import { demo } from '../src/demo';
import { activeSnapshot, activeSpectrum, appendSpectra, selectEntry, updateActiveSnapshot, workspaceFromSnapshot } from '../src/workspace';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = await import('react-dom/client');
// JSDOM has no native dialog top layer; model only its open/close events here.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };

test('preset preview, import default and apply are independent; manual creation saves without recalibrating', async () => {
  const root = createRoot(document.getElementById('root')!);
  const raw = Array.from({ length: 64 }, (_, i) => 1000 + i);
  const first = applyRawCalibration({ project: demo(), raw, cal: { max: 5, shift: 0, sinusoidal: false, folding: false, center: 32.5 }, filename: 'First', selected: 0 });
  let current = appendSpectra(workspaceFromSnapshot(first), [{ ...first, filename: 'Second' }]);
  const firstId = current.spectra[0].id;
  current = selectEntry(current, firstId);
  function Harness() {
    const [workspace, setWorkspace] = useState(current); current = workspace;
    const spectrum = activeSpectrum(workspace), snapshot = activeSnapshot(workspace);
    return <><button onClick={() => setWorkspace(w => selectEntry(w, w.spectra.find(s => s.id !== w.activeSpectrumId)!.id))}>Switch spectrum</button><CalibrationPresetsPanel key={spectrum.id} cal={spectrum.cal} raw={spectrum.raw} calibrationPresets={workspace.calibrationPresets} importCalibrationPresetId={workspace.importCalibrationPresetId}
      onChange={settings => setWorkspace(w => ({ ...w, ...settings }))} onApply={cal => setWorkspace(w => updateActiveSnapshot(w, applyRawCalibration(snapshot, cal)))} onInspectFolding={() => {}} onDialogChange={() => {}}/></>;
  }
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
  const select = () => document.querySelector<HTMLSelectElement>('[aria-label="Calibration preset"]')!;
  const pick = async (name: string) => act(async () => { select().value = Array.from(select().options).find(o => o.textContent === name)!.value; select().dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const clickLabel = async (label: string) => act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
  try {
    await act(async () => root.render(<Harness/>));
    const before = activeSnapshot(current), originalDefault = current.importCalibrationPresetId;
    await pick('10 mm/s');
    assert.equal(activeSnapshot(current).project.spectrum, before.project.spectrum);
    assert.equal(current.importCalibrationPresetId, originalDefault);
    assert.equal(document.querySelector('.calibration-applied')!.textContent, 'Applied to spectrum: 5 mm/s · max. 5 mm/s');
    await clickLabel('Use preset for new imports');
    assert.equal(calibrationForImport(current.calibrationPresets.find(p => p.id === current.importCalibrationPresetId)!, raw.length).max, 10);
    assert.equal(activeSnapshot(current).cal.max, 5);
    await act(async () => button('Switch spectrum').click());
    assert.equal(current.calibrationPresets.find(p => p.id === current.importCalibrationPresetId)!.cal.max, 10);
    await pick('10 mm/s'); await act(async () => button('Apply to this spectrum').click());
    assert.equal(activeSnapshot(current).project.spectrum.x[0], -10);
    assert.equal(current.spectra.find(s => s.id === firstId)!.cal.max, 5);
    await clickLabel('Add calibration preset');
    assert.ok(button('Define manually…Enter a velocity scale and folding settings'));
    await act(async () => button('Define manually…Enter a velocity scale and folding settings').click());
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('[aria-label="Calibration preset name"]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Evening run');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const priorCal = activeSnapshot(current).cal;
    await act(async () => button('Save preset').click());
    assert.ok(current.calibrationPresets.some(p => p.name === 'Evening run'));
    assert.deepEqual(activeSnapshot(current).cal, priorCal);
    assert.equal(current.calibrationPresets.find(p => p.id === current.importCalibrationPresetId)!.name, '10 mm/s');
    await clickLabel('Add calibration preset');
    await act(async () => document.querySelector('.calibration-preset-add')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('.calibration-preset-menu'), null);
  } finally { await act(async () => root.unmount()); }
});

test('editing an existing preset saves in place, updates future imports, and leaves applied data and fits intact', async () => {
  const root = createRoot(document.getElementById('root')!);
  const raw = Array.from({ length: 64 }, (_, i) => 1000 + i);
  const first = applyRawCalibration({ project: demo(), raw, cal: { max: 5, shift: 0, sinusoidal: false, folding: false, center: 32.5 }, filename: 'First', selected: 0 });
  let current = workspaceFromSnapshot({ ...first, fit: { converged: true, termination: 'test fixture', iterations: 1, free_parameters: 0, dof: 64, rank: 0, reduced_objective: 0, errors: {}, warnings: [] }, fitElapsed: 5 });
  let prior = current;
  function Harness() {
    const [workspace, setWorkspace] = useState(current); current = workspace;
    const spectrum = activeSpectrum(workspace);
    return <><button onClick={() => setWorkspace(prior)}>Undo preset edit</button><CalibrationPresetsPanel cal={spectrum.cal} raw={spectrum.raw} calibrationPresets={workspace.calibrationPresets} importCalibrationPresetId={workspace.importCalibrationPresetId}
      onChange={settings => { prior = workspace; setWorkspace(w => ({ ...w, ...settings })); }} onApply={cal => setWorkspace(w => updateActiveSnapshot(w, applyRawCalibration(activeSnapshot(w), cal)))} onInspectFolding={() => {}} onDialogChange={() => {}}/></>;
  }
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
  const maximum = () => document.querySelector<HTMLInputElement>('[aria-label="Maximum velocity"]')!;
  const editMaximum = async (value: string) => {
    await act(async () => maximum().focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(maximum(), value);
      maximum().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => maximum().blur());
  };
  try {
    await act(async () => root.render(<Harness/>));
    const before = activeSnapshot(current), preset = current.calibrationPresets[0], count = current.calibrationPresets.length;
    assert.equal(document.querySelector('.calibration-presets [aria-label="Maximum velocity"]'), null, 'sidebar contains no edit fields');
    await act(async () => button('Edit preset…').click());
    assert.equal(document.querySelector<HTMLDialogElement>('.calibration-preset-editor')!.open, true);
    assert.equal(document.querySelector('#calibration-preset-editor-title')!.textContent, 'Edit calibration preset');
    assert.ok(button('Recalibrate from reference…'));
    assert.equal(button('Save changes to preset').disabled, true);
    await editMaximum('6.25');
    assert.equal(current.calibrationPresets[0].cal.max, 5, 'typing does not overwrite the saved preset');
    assert.match(document.querySelector('.preset-editor-footer')!.textContent!, /Unsaved changes/);
    assert.equal(button('Save changes to preset').disabled, false);
    assert.equal(document.querySelector('.calibration-presets .calibration-preset-summary strong')!.textContent, '5 mm/s', 'sidebar continues to show saved values');
    await act(async () => button('Save changes to preset').click());
    assert.equal(current.calibrationPresets.length, count);
    assert.equal(current.calibrationPresets[0].id, preset.id);
    assert.equal(current.calibrationPresets[0].name, preset.name);
    assert.equal(current.calibrationPresets[0].cal.max, 6.25);
    assert.equal(current.importCalibrationPresetId, preset.id);
    assert.equal(calibrationForImport(current.calibrationPresets[0], raw.length).max, 6.25);
    assert.equal(activeSnapshot(current).project.spectrum, before.project.spectrum);
    assert.equal(activeSnapshot(current).fit, before.fit);
    assert.equal(activeSnapshot(current).cal.max, 5);
    assert.match(document.querySelector('.calibration-edit-status')!.textContent!, /Preset saved/);
    await act(async () => button('Undo preset edit').click());
    assert.equal(document.querySelector('.calibration-preset-editor'), null, 'save closes the editor');
    assert.equal(document.querySelector('.calibration-presets .calibration-preset-summary strong')!.textContent, '5 mm/s', 'Undo refreshes the saved summary');
    await act(async () => button('Edit preset…').click());
    await editMaximum('0');
    await act(async () => button('Save changes to preset').click());
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /positive/);
    assert.equal(current.calibrationPresets[0].cal.max, 5);
    await act(async () => button('Cancel').click());
    assert.equal(document.querySelector('.calibration-preset-editor'), null);
    await act(async () => button('Edit preset…').click());
    assert.equal(maximum().value, '5', 'Cancel discarded the draft');
    await editMaximum('6.25'); await act(async () => button('Save changes to preset').click());
    const secondPreset = current.calibrationPresets.find(p => p.id !== preset.id)!;
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Calibration preset"]')!;
    await act(async () => { select.value = secondPreset.id; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { select.value = preset.id; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => button('Edit preset…').click());
    assert.equal(maximum().value, '6.25', 'switching presets restores the saved edit');
    await editMaximum('6.5');
    await act(async () => document.querySelector('.calibration-preset-editor')!.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })));
    assert.equal(document.querySelector('.calibration-preset-editor'), null, 'Escape cancels the draft');
    assert.equal(current.calibrationPresets[0].cal.max, 6.25);
    await act(async () => button('Apply to this spectrum').click());
    assert.equal(activeSnapshot(current).project.spectrum.x[0], -6.25);
    assert.equal(activeSnapshot(current).fit, null);
    assert.equal(activeSnapshot(current).cal.preset?.id, preset.id);
  } finally { await act(async () => root.unmount()); }
});

after(() => dom.window.close());

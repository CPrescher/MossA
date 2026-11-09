import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { activeModel, activeSnapshot, activeSpectrum, addModel, appendSpectra, decodeWorkspace, freshWorkspace, modelSnapshot, removeModel, removeSpectrum, renameEntry, selectEntry, updateActiveSnapshot, workspaceFromSnapshot } from '../src/workspace';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';
import { createProjectFile } from '../src/projectFile';
import { summarizeFit, type Snapshot } from '../src/session';
import { historyReducer } from '../src/history';
import { applyRawCalibration } from '../src/calibration';
import { decodeWorkspaceSession } from '../src/workspaceStorage';
import type { Evaluation, FitResult, Project } from '../src/types';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fit = JSON.parse(fit_json(JSON.stringify(demo()))) as FitResult;
const evaluate = async (p: Project): Promise<Evaluation> => JSON.parse(evaluate_json(JSON.stringify(p)));
function snapshot(name = 'Sample A'): Snapshot {
  return { project: structuredClone(fit.project), filename: name, raw: null,
    cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 },
    selected: 1, fit: summarizeFit(fit), fitElapsed: 12.3456789 };
}

test('starting fresh clears every spectrum, model, calibration, and fit, while Undo/Redo restore complete projects', () => {
  const before = appendSpectra(addModel(workspaceFromSnapshot(snapshot()), true), [snapshot('Sample B')]);
  before.name = 'Heating series';
  before.calibrationPresets[0].name = 'Old reference';
  const fresh = freshWorkspace(), draft = activeSnapshot(fresh);
  assert.equal(fresh.name, 'Untitled project');
  assert.deepEqual(draft.project.spectrum, { x: [], y: [] });
  assert.deepEqual(draft.project.sites, []);
  assert.equal(draft.raw, null); assert.equal(draft.fit, null); assert.equal(draft.fitElapsed, null);
  assert.equal(draft.cal.reference, undefined); assert.equal(draft.cal.sourceReference, undefined);
  assert.equal(fresh.calibrationPresets.some(p => p.name === 'Old reference'), false);
  let history = historyReducer({ past: [] as typeof fresh[], present: before, future: [] as typeof fresh[] }, { type: 'set', value: fresh, record: true });
  history = historyReducer(history, { type: 'undo' }); assert.deepEqual(history.present, before);
  history = historyReducer(history, { type: 'redo' }); assert.deepEqual(history.present, fresh);
  const imported = appendSpectra(fresh, [snapshot('New A'), snapshot('New B')]);
  assert.equal(imported.spectra.length, 2);
  assert.equal(activeSpectrum(imported).name, 'New A');
  assert.equal(imported.spectra.some(s => !s.spectrum.x.length), false);
});

test('empty projects survive autosave and portable save/open without numerical evaluation', async () => {
  const workspace = freshWorkspace();
  const session = { version: 1, workspace, layout: { resultsHeight: 200, sitesHeight: 104, tab: 'Gen', optionsOpen: false } };
  assert.deepEqual(decodeWorkspaceSession(JSON.parse(JSON.stringify(session))).workspace, workspace);
  const saved = await createWorkspaceFile(workspace, {});
  const opened = await openWorkspaceFile(JSON.parse(JSON.stringify(saved)), activeSnapshot(workspace).cal, 'Empty.mossa', async () => { throw new Error('An empty draft must not be evaluated'); });
  assert.deepEqual(opened.workspace, workspace); assert.equal(opened.evaluation, null);
  const withSites = structuredClone(workspace); activeModel(withSites).project.sites = demo().sites;
  assert.throws(() => decodeWorkspace(withSites), /Invalid saved spectrum/);
  const mixed = structuredClone(workspace); mixed.spectra.push(workspaceFromSnapshot(snapshot()).spectra[0]);
  assert.throws(() => decodeWorkspace(mixed), /single editing slot/);
  const withFit = structuredClone(workspace); activeModel(withFit).fit = summarizeFit(fit);
  assert.throws(() => decodeWorkspace(withFit), /Invalid saved spectrum/);
});

test('deleting the last spectrum preserves project settings, persists empty, and restores all models with Undo', async () => {
  const before = addModel(workspaceFromSnapshot(snapshot()), true);
  before.name = 'Heating series';
  before.calibrationPresets[0].name = 'Saved reference';
  const empty = removeSpectrum(before), draft = activeSnapshot(empty);
  assert.equal(empty.name, before.name);
  assert.deepEqual(empty.calibrationPresets, before.calibrationPresets);
  assert.equal(empty.importCalibrationPresetId, before.importCalibrationPresetId);
  assert.deepEqual(draft.project.spectrum, { x: [], y: [] });
  assert.deepEqual(draft.project.sites, []);
  assert.equal(draft.raw, null); assert.equal(draft.fit, null); assert.equal(draft.fitElapsed, null);
  assert.equal(removeSpectrum(empty), empty);
  const saved = await createWorkspaceFile(empty, {});
  const opened = await openWorkspaceFile(JSON.parse(JSON.stringify(saved)), draft.cal, 'Heating series.mossa', async () => { throw new Error('Deleted spectra must not be evaluated'); });
  assert.deepEqual(opened.workspace, empty); assert.equal(opened.evaluation, null);
  let history = historyReducer({ past: [] as typeof before[], present: before, future: [] as typeof before[] }, { type: 'set', value: empty, record: true });
  history = historyReducer(history, { type: 'undo' }); assert.deepEqual(history.present, before);
  history = historyReducer(history, { type: 'redo' }); assert.deepEqual(history.present, empty);
  const imported = appendSpectra(empty, [snapshot('Replacement')]);
  assert.equal(imported.spectra.length, 1);
  assert.equal(activeSpectrum(imported).name, 'Replacement');
});

test('duplicating a fitted model shares observations but isolates sites, bounds, links, and fit results', () => {
  const initial = workspaceFromSnapshot(snapshot()), originalId = activeModel(initial).id;
  let workspace = addModel(initial, true);
  const copied = activeSnapshot(workspace);
  assert.equal(copied.project.spectrum, activeSpectrum(initial).spectrum);
  assert.deepEqual(copied.fit, activeSnapshot(initial).fit);
  assert.notEqual(copied.project.sites, activeModel(initial).project.sites);
  const changed = structuredClone(copied.project.sites);
  changed[0].params.cs.value += .125; changed[0].params.cs.min = -8;
  changed[1].params.fwhm.link = { target: 'site:0:fwhm', factor: 1 };
  workspace = updateActiveSnapshot(workspace, { ...copied, project: { ...copied.project, sites: changed }, fit: null, fitElapsed: null });
  workspace = selectEntry(workspace, workspace.activeSpectrumId, originalId);
  assert.deepEqual(activeSnapshot(workspace), activeSnapshot(initial));
  assert.equal(activeSpectrum(workspace).models[1].fit, null);
});

test('spectra retain independent model selections, raw data, and calibrations; new models start without sites', () => {
  let workspace = addModel(workspaceFromSnapshot(snapshot()), true);
  const first = activeSpectrum(workspace), selectedModel = activeModel(workspace).id;
  workspace = appendSpectra(workspace, [{ ...snapshot('Sample B'), cal: { ...snapshot().cal, max: 7 } }, snapshot('Sample C')]);
  assert.equal(workspace.spectra.length, 3);
  assert.equal(activeSpectrum(workspace).name, 'Sample B');
  assert.equal(activeSnapshot(workspace).cal.max, 7);
  workspace = selectEntry(workspace, first.id);
  assert.equal(activeModel(workspace).id, selectedModel);
  assert.equal(activeSnapshot(workspace).cal.max, 10);
  workspace = addModel(workspace, false);
  assert.deepEqual(activeModel(workspace).project.sites, []);
  assert.equal(activeModel(workspace).fit, null);
  assert.equal(activeSnapshot(workspace).project.spectrum, first.spectrum);
});

test('recalibration updates all models of one raw spectrum and clears their fits; other spectra stay intact', () => {
  const raw = Array.from({ length: 32 }, (_, i) => 1000 + i);
  const original = { ...snapshot(), raw };
  original.cal.nuclear_constants = original.project.nuclear_constants;
  let workspace = addModel(workspaceFromSnapshot(applyRawCalibration(original)), true);
  // Use synthetic fit metadata here only to track invalidation, not for export.
  workspace.spectra[0].models.forEach(m => { m.fit = summarizeFit(fit); m.fitElapsed = 10; });
  const firstId = workspace.activeSpectrumId;
  workspace = appendSpectra(workspace, [snapshot('Unchanged')]);
  const second = activeSpectrum(workspace);
  workspace = selectEntry(workspace, firstId);
  const next = applyRawCalibration(activeSnapshot(workspace), { ...activeSnapshot(workspace).cal, max: 8 });
  workspace = updateActiveSnapshot(workspace, next);
  for (const m of activeSpectrum(workspace).models) {
    const s = modelSnapshot(activeSpectrum(workspace), m);
    assert.equal(s.project.spectrum, next.project.spectrum);
    assert.equal(s.cal.max, 8); assert.equal(m.fit, null); assert.equal(m.fitElapsed, null);
  }
  assert.equal(workspace.spectra[1], second);
  assert.ok(second.models[0].fit);
});

test('source settings and reference drafts remain independent per model; names preserve completed fits', () => {
  let workspace = addModel(workspaceFromSnapshot(snapshot()), true);
  const before = activeSnapshot(workspace);
  workspace = updateActiveSnapshot(workspace, { ...before, project: { ...before.project, source_fwhm: .2 }, fit: null });
  assert.equal(activeSpectrum(workspace).models[0].project.source_fwhm, fit.project.source_fwhm);
  assert.ok(activeSpectrum(workspace).models[0].fit);
  workspace = selectEntry(workspace, workspace.activeSpectrumId, activeSpectrum(workspace).models[0].id);
  workspace = renameEntry(renameEntry(renameEntry(workspace, 'model', 'Two sites'), 'spectrum', '300 K'), 'project', 'Heating series');
  assert.deepEqual(activeModel(workspace).fit, before.fit);
  assert.equal(activeSnapshot(workspace).filename, '300 K');
  assert.equal(activeModel(workspace).name, 'Two sites');
});

test('site selection retains the numerical model identity used by the curve cache; blank models cannot retain orphan site links', async () => {
  let workspace = workspaceFromSnapshot(snapshot());
  const originalModel = activeModel(workspace).project;
  workspace = updateActiveSnapshot(workspace, { ...activeSnapshot(workspace), selected: 0 });
  assert.equal(activeModel(workspace).project, originalModel);
  assert.equal(activeSnapshot(workspace).selected, 0);
  workspace = updateActiveSnapshot(workspace, { ...activeSnapshot(workspace), project: { ...activeSnapshot(workspace).project,
    background: [{ ...originalModel.background[0], link: { target: 'site:0:intensity', factor: 1 } }],
  }, fit: null });
  workspace = addModel(workspace, false);
  assert.equal(activeModel(workspace).project.background[0].link, null);
  await assert.doesNotReject(() => evaluate(activeSnapshot(workspace).project));
});

test('whole-project files round-trip all spectra, models, fit uncertainties, selections, and timing without fitting', async () => {
  let workspace = addModel(workspaceFromSnapshot(snapshot()), true);
  const first = workspace.activeSpectrumId;
  workspace = appendSpectra(workspace, [snapshot('Sample B')]);
  workspace = addModel(workspace, false);
  workspace = selectEntry(workspace, first);
  const file = await createWorkspaceFile(workspace, { application: 'MossA test' });
  assert.equal('spectrum' in file.workspace.spectra[0].models[0].project, false);
  assert.equal('raw' in file.workspace.spectra[0].models[0], false);
  let evaluations = 0;
  const opened = await openWorkspaceFile(JSON.parse(JSON.stringify(file)), snapshot().cal, 'series.mossa', p => { evaluations++; return evaluate(p); });
  assert.equal(evaluations, 4);
  assert.deepEqual(opened.workspace, workspace);
  assert.equal(opened.notice, '');
  assert.deepEqual(opened.evaluation, await evaluate(activeSnapshot(workspace).project));
});

test('tampered inactive models lose their own fit; changing shared data invalidates every affected fit', async () => {
  const workspace = appendSpectra(addModel(workspaceFromSnapshot(snapshot()), true), [snapshot('Sample B')]);
  const file = JSON.parse(JSON.stringify(await createWorkspaceFile(workspace, {})));
  file.workspace.spectra[0].models[0].project.sites[0].params.cs.value += .2;
  let opened = await openWorkspaceFile(file, snapshot().cal, 'series', evaluate);
  assert.equal(opened.workspace.spectra[0].models[0].fit, null);
  assert.ok(opened.workspace.spectra[0].models[1].fit);
  assert.ok(opened.workspace.spectra[1].models[0].fit);
  file.workspace.spectra[0].spectrum.y[0] += 5;
  opened = await openWorkspaceFile(file, snapshot().cal, 'series', evaluate);
  assert.ok(opened.workspace.spectra[0].models.every(m => !m.fit));
  assert.ok(opened.workspace.spectra[1].models[0].fit);
});

test('older single-spectrum files import without changing numerical conventions or stored results', async () => {
  const original = snapshot();
  const old = await createProjectFile(original, {});
  const opened = await openWorkspaceFile(old, original.cal, 'legacy.mossa', evaluate);
  assert.equal(opened.workspace.spectra.length, 1);
  assert.deepEqual(activeSnapshot(opened.workspace), original);
});

test('removing spectra/models is undoable and always leaves a valid selected entry', () => {
  let workspace = appendSpectra(addModel(workspaceFromSnapshot(snapshot()), true), [snapshot('Second')]);
  let history = { past: [] as typeof workspace[], present: workspace, future: [] as typeof workspace[] };
  history = historyReducer(history, { type: 'set', value: removeSpectrum(workspace), record: true });
  assert.equal(history.present.spectra.length, 1);
  history = historyReducer(history, { type: 'undo' }); assert.deepEqual(history.present, workspace);
  workspace = selectEntry(workspace, workspace.spectra[0].id);
  const removed = removeModel(workspace); assert.equal(activeSpectrum(removed).models.length, 1);
  assert.equal(removeModel(removed), removed);
  assert.equal(removeSpectrum(removeSpectrum(workspace)).spectra.length, 1);
  assert.deepEqual(decodeWorkspace(removed), removed);
});

test('malformed collections, duplicate IDs, and missing active entries are rejected before load', () => {
  for (const mutate of [
    (w: any) => { w.spectra = []; }, (w: any) => { w.spectra[0].models = []; },
    (w: any) => { w.activeSpectrumId = 'missing'; }, (w: any) => { w.spectra[0].activeModelId = 'missing'; },
    (w: any) => { w.spectra[0].models[0].id = w.spectra[0].id; },
    (w: any) => { w.spectra[0].spectrum.y = [1]; },
  ]) {
    const workspace = workspaceFromSnapshot(snapshot()); mutate(workspace);
    assert.throws(() => decodeWorkspace(workspace));
  }
  const workspace = workspaceFromSnapshot(snapshot());
  const session = decodeWorkspaceSession({ version: 1, workspace, layout: { resultsHeight: -10, sitesHeight: 999, tab: 'Invalid' } });
  assert.equal(session.layout.resultsHeight, 196); assert.equal(session.layout.sitesHeight, 300); assert.equal(session.layout.tab, 'Gen');
});

test('per-model figure settings round-trip portable files and restart autosave while completed fits stay exact',async()=>{
 const {defaultFigureSettings,rememberFigureSettings,storeFigureSettings}=await import('../src/figure-settings');
 const {updateFigureSettings}=await import('../src/workspace');
 let workspace=addModel(workspaceFromSnapshot(snapshot()),true);
 const model=activeModel(workspace),scientific=modelSnapshot(activeSpectrum(workspace),model);
 const settings=defaultFigureSettings(scientific.project,'Sample A · Model copy');
 settings.format='pdf';settings.dpi=600;settings.options={...settings.options,width:90,height:90,style:'transparent',fillOpacity:.35,legendFractions:true,legend:'above',range:[-2,2]};settings.options.sites[0].name='Custom Fe$^{3+}$';settings.options.sites[0].color='#123456';settings.options.sites.reverse();
 const stored=storeFigureSettings(rememberFigureSettings(settings,scientific.project,'Sample A · Model copy'));
 workspace=updateFigureSettings(workspace,model.id,stored);
 assert.equal(activeModel(workspace).project,model.project);assert.equal(activeModel(workspace).fit,model.fit);
 assert.deepEqual(activeSnapshot(workspace),scientific);assert.equal(updateFigureSettings(workspace,model.id,stored),workspace);
 assert.equal('site' in stored.sourceSites[0],false);
 const session={version:1,workspace,layout:{resultsHeight:200,sitesHeight:104,tab:'Gen',optionsOpen:false}};
 const restarted=decodeWorkspaceSession(JSON.parse(JSON.stringify(session))).workspace;
 assert.deepEqual(activeModel(restarted).figureExport,stored);
 const saved=await createWorkspaceFile(workspace,{});
 const reopened=await openWorkspaceFile(JSON.parse(JSON.stringify(saved)),scientific.cal,'Saved.mossa',evaluate);
 assert.deepEqual(activeModel(reopened.workspace).figureExport,stored);
 assert.deepEqual(activeSnapshot(reopened.workspace),scientific);
 assert.equal(activeSpectrum(reopened.workspace).models[0].figureExport,undefined,'appearance is independent per model');
 const malformed=structuredClone(workspace);activeModel(malformed).figureExport!.options.width=-100;
 assert.equal(activeModel(decodeWorkspace(malformed)).figureExport,undefined);
 assert.deepEqual(activeSnapshot(decodeWorkspace(malformed)),scientific,'bad appearance cannot discard or alter the analysis');
});

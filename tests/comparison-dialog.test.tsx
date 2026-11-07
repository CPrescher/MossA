import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CompareModelsDialog } from '../src/CompareModels';
import { startComparison } from '../src/comparison-client';
import { parameter, newSite, type Evaluation, type FitResult, type Project } from '../src/types';
import type { SpectrumEntry } from '../src/workspace';
import type { ComparisonProgress, ComparisonResult, ComparisonOptions } from '../src/comparison';

function fixture(): SpectrumEntry {
  const project: Omit<Project, 'spectrum'> = { sites: [newSite(0, 'Singlet')], background: [parameter(1000)], mode: 'thin', source_fwhm: .097, source_squared: false, weighting: 'unweighted', max_iterations: 100 };
  const larger = structuredClone(project); larger.sites.push(newSite(1, 'Singlet'));
  return { id: 'spectrum', name: 'Synthetic comparison', spectrum: { x: [-4,-3,-2,-1,0,1,2,3,4], y: [1000,999,998,970,900,975,998,1000,1001] }, raw: null,
    cal: { max: 4, shift: 0, sinusoidal: false, folding: false, center: 4.5 }, activeModelId: 'larger',
    models: [{ id: 'simpler', name: 'One site', project, selected: 0, fit: null, fitElapsed: null }, { id: 'larger', name: 'Two sites', project: larger, selected: 0, fit: null, fitElapsed: null }] };
}
const evaluate = async (p: Project): Promise<Evaluation> => ({ parameters: {}, y: p.spectrum.y.map(y => y + 1), background: p.spectrum.y.map(() => 1000), components: [], residual: p.spectrum.y.map(() => -1), sse: 9, objective: 9 });
test('reversed integer folding sends the last turnaround channel to Poisson simulations', async () => {
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  const root=createRoot(document.getElementById('root')!), spectrum=fixture();
  spectrum.raw=Array(18).fill(500);spectrum.cal.folding=true;spectrum.cal.center=9;
  spectrum.velocityReversed=true;spectrum.spectrum.y[0]=1001;spectrum.spectrum.y[8]=1000;
  let captured:ComparisonOptions|undefined;
  const run:typeof startComparison=(_a,_b,options)=>{captured=options;return {promise:new Promise(()=>{}),cancel(){}};};
  try {
    await act(async()=>root.render(<CompareModelsDialog spectrum={spectrum} activeModelId="larger" evaluate={evaluate} onClose={()=>{}} run={run}/>));
    const start=[...document.querySelectorAll('button')].find(b=>b.textContent==='Run simulation test')!;
    assert.equal(start.disabled,false,'odd first observation is ordinary; last observation is doubled');
    await act(async()=>start.click());
    assert.equal(captured?.doubledFirstChannel,false);assert.equal(captured?.doubledLastChannel,true);
  } finally {await act(async()=>root.unmount());dom.window.close();}
});
test('comparison dialog handles completed results, invalid pairs, seed changes, cancellation, and late worker messages', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  const root = createRoot(document.getElementById('root')!), spectrum = fixture(), before = JSON.stringify(spectrum);
  let resolve!: (r: ComparisonResult) => void, reject!: (e: Error) => void, reportProgress!: (p: ComparisonProgress) => void, canceled = 0, runCount = 0;
  const run: typeof startComparison = (_a, _b, _options, notify) => {
    runCount++; reportProgress = notify;
    return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { canceled++; reject(new Error('Canceled')); } };
  };
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text)!;
  const select = (label: string) => document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
  const setSelect = async (label: string, value: string) => { await act(async () => { const s = select(label); s.value = value; s.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); };
  try {
    await act(async () => root.render(<CompareModelsDialog spectrum={spectrum} activeModelId="larger" evaluate={evaluate} onClose={() => {}} run={run}/>));
    assert.equal(document.querySelectorAll('svg').length, 1);
    assert.equal(select('Measurement noise').value, 'poisson');
    await setSelect('Measurement noise', 'gaussian');
    await act(async () => button('Run simulation test').click());
    assert.equal(button('Run simulation test').disabled, true);
    assert.equal(select('Simpler model').closest('fieldset')!.disabled, true);
    await act(async () => reportProgress({ phase: 'Simulation 5', completed: 4, total: 199 }));
    assert.match(document.body.textContent!, /Simulation 5.*4\/199/);
    const p = { ...spectrum.models[0].project, spectrum: spectrum.spectrum }, ev = await evaluate(p);
    const fit: FitResult = { project: p, evaluation: ev, errors: {}, converged: true, termination: 'Converged', iterations: 1, free_parameters: 4, dof: 5, rank: 4, reduced_objective: 1.8, warnings: [] };
    const result: ComparisonResult = { version: 1, method: 'parametric-bootstrap', options: { noise: 'gaussian', seed: 7812, simulations: 199, doubledFirstChannel: false }, simpler: fit, larger: { ...fit, free_parameters: 7, dof: 2 }, improvement: 20, fStatistic: 5, exceedances: 0, pValue: .005, monteCarloInterval: [0, .02], noiseStd: 2, improvements: [], warnings: [], diagnostics: [] };
    await act(async () => resolve(result));
    assert.match(document.body.textContent!, /Prefer the 2-site model/);
    assert.equal(document.querySelectorAll('.comparison-stat-explanation').length, 5);
    assert.equal(document.querySelector('.comparison-key-statistics')!.closest('details'), null, 'key statistics and interpretations must remain visible');
    assert.match(document.body.textContent!, /not the probability that either model is correct/);
    assert.match(document.body.textContent!, /None of the 199 noise-only spectra/);
    assert.equal(button('Export comparison report').disabled, false);
    await setSelect('Simulated spectra', '999');
    assert.doesNotMatch(document.body.textContent!, /Simulation p-value/);
    await act(async () => button('Run simulation test').click());
    await act(async () => button('Cancel simulation').click());
    assert.equal(canceled, 1); assert.match(document.body.textContent!, /Simulation canceled/);
    await act(async () => { reportProgress({ phase: 'Stale worker', completed: 999, total: 999 }); resolve(result); });
    assert.doesNotMatch(document.body.textContent!, /Stale worker|Simulation p-value/);
    await setSelect('Larger model', 'simpler');
    assert.equal(button('Run simulation test').disabled, true); assert.match(document.body.textContent!, /Choose two different models/);
    assert.equal(runCount, 2); assert.equal(JSON.stringify(spectrum), before);
    await setSelect('Larger model', 'larger');
    await act(async () => button('Run simulation test').click());
    await act(async () => root.unmount()); assert.equal(canceled, 2);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
test('comparison worker client forwards progress, returns the result, and terminates on completion or cancellation', async () => {
  const previous = globalThis.Worker, instances: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void; onerror?: (event: { message: string }) => void;
    terminated = false; payload: unknown;
    constructor() { instances.push(this); }
    postMessage(payload: unknown) { this.payload = payload; }
    terminate() { this.terminated = true; }
  }
  Object.assign(globalThis, { Worker: FakeWorker });
  try {
    const s = fixture(), a = { ...s.models[0].project, spectrum: s.spectrum }, b = { ...s.models[1].project, spectrum: s.spectrum }, progress: ComparisonProgress[] = [];
    const options = { noise: 'gaussian' as const, seed: 1, simulations: 99, doubledFirstChannel: false, workers: 1 };
    const task = startComparison(a, b, options, p => progress.push(p));
    assert.deepEqual(instances[0].payload, { simpler: a, larger: b, options });
    instances[0].onmessage!({ data: { progress: { phase: 'Simulating', completed: 1, total: 99 } } }); assert.equal(progress[0].completed, 1);
    instances[0].onmessage!({ data: { result: 'completed' } }); assert.equal(await task.promise, 'completed'); assert.equal(instances[0].terminated, true);
    const canceled = startComparison(a, b, options, () => {}); canceled.cancel();
    await assert.rejects(canceled.promise, /canceled/); assert.equal(instances[1].terminated, true);
    const failed = startComparison(a, b, options, () => {}); instances[2].onerror!({ message: 'Worker crashed' });
    await assert.rejects(failed.promise, /Worker crashed/); assert.equal(instances[2].terminated, true);
  } finally { Object.assign(globalThis, { Worker: previous }); }
});

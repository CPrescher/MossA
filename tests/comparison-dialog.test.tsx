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
async function completedComparison(spectrum:SpectrumEntry,options:ComparisonOptions,questionable=false):Promise<ComparisonResult> {
  const fits:FitResult[]=spectrum.models.map((model,index)=>{
    const project=structuredClone({...model.project,spectrum:spectrum.spectrum});if(index)project.sites[1].params.fwhm.value=2.5;
    const amplitude=questionable ? index ? 80 : 100 : index ? .9 : 1;
    const residual=project.spectrum.y.map((_,i)=>i===8 ? 0 : amplitude*(i%2 ? -1 : 1));
    const sse=residual.reduce((sum,v)=>sum+v*v,0),mean=project.spectrum.y.map((y,i)=>y-residual[i]);
    return {project,evaluation:{parameters:{},y:mean,residual,background:mean.map(()=>1000),components:[],sse,objective:sse},errors:Object.fromEntries(project.sites.flatMap((_,i)=>['cs','fwhm','intensity'].map(k=>[`site:${i}:${k}`,.01]))),intensity_fractions:project.sites.map(()=>({value:100/project.sites.length,error:1})),converged:true,termination:'Converged',iterations:1,free_parameters:index?7:4,rank:index?7:4,dof:index?2:5,reduced_objective:sse/(index?2:5),warnings:[]};
  });
  return {version:1,method:'parametric-bootstrap',options,simpler:fits[0],larger:fits[1],improvement:fits[0].evaluation.objective-fits[1].evaluation.objective,fStatistic:3,exceedances:3,pValue:.02,monteCarloInterval:[.01,.04],noiseStd:options.noise==='gaussian'?100:null,improvements:[],diagnostics:[],warnings:[]};
}
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
    const result: ComparisonResult = { version: 1, method: 'parametric-bootstrap', options: { noise: 'gaussian', seed: 7812, simulations: 199, doubledFirstChannel: false }, simpler: fit, larger: { ...fit, project:{...spectrum.models[1].project,spectrum:spectrum.spectrum}, free_parameters: 7, rank:7, dof: 2 }, improvement: 20, fStatistic: 5, exceedances: 0, pValue: .005, monteCarloInterval: [0, .02], noiseStd: 2, improvements: [], warnings: [], diagnostics: [] };
    await act(async () => resolve(result));
    assert.match(document.body.textContent!, /Extra component needs caution/);
    assert.match(document.body.textContent!, /not an automatic recommendation to add a physical site/);
    assert.doesNotMatch(document.body.textContent!, /Prefer the 2-site model/);
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
test('noise sensitivity retains the original result on cancellation, compares both completed checks, and exports diagnostics',async()=>{
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLAnchorElement.prototype.click=function(){};
  const root=createRoot(document.getElementById('root')!),spectrum=fixture(),before=JSON.stringify(spectrum);
  const calls:{options:ComparisonOptions;resolve:(r:ComparisonResult)=>void;reject:(e:Error)=>void}[]=[];
  const run:typeof startComparison=(_a,_b,options)=>{let resolve!:(r:ComparisonResult)=>void,reject!:(e:Error)=>void;const promise=new Promise<ComparisonResult>((yes,no)=>{resolve=yes;reject=no;});calls.push({options,resolve,reject});return {promise,cancel(){reject(new Error('Canceled'));}};};
  const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
  const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;let blob:Blob|undefined;
  URL.createObjectURL=(b:Blob)=>{blob=b;return 'blob:test';};URL.revokeObjectURL=()=>{};
  const makeFit=async(index:number):Promise<FitResult>=>{const project=structuredClone({...spectrum.models[index].project,spectrum:spectrum.spectrum});if(index)project.sites[1].params.fwhm.value=2.5;return {project,evaluation:await evaluate(project),errors:Object.fromEntries(project.sites.flatMap((_,i)=>['cs','fwhm','intensity'].map(k=>[`site:${i}:${k}`,.01]))),intensity_fractions:project.sites.map(()=>({value:100/project.sites.length,error:1})),converged:true,termination:'Converged',iterations:1,free_parameters:index?7:4,rank:index?7:4,dof:index?2:5,reduced_objective:1,warnings:[]};};
  try{
    await act(async()=>root.render(<CompareModelsDialog spectrum={spectrum} activeModelId="larger" evaluate={evaluate} onClose={()=>{}} run={run}/>));
    const primary:ComparisonResult={version:1,method:'parametric-bootstrap',options:{noise:'poisson',seed:7812,simulations:199,doubledFirstChannel:false,workers:1},simpler:await makeFit(0),larger:await makeFit(1),improvement:2,fStatistic:3,exceedances:3,pValue:.02,monteCarloInterval:[.01,.04],noiseStd:null,improvements:[],diagnostics:[],warnings:[]};
    await act(async()=>button('Run simulation test').click());primary.options=calls[0].options;
    await act(async()=>calls[0].resolve(primary));assert.match(document.body.textContent!,/Statistical improvement detected/);
    await act(async()=>button('Check Gaussian noise sensitivity').click());
    assert.equal(calls[1].options.noise,'gaussian');assert.equal(calls[1].options.seed,primary.options.seed);assert.equal(calls[1].options.simulations,primary.options.simulations);assert.equal(calls[1].options.doubledFirstChannel,false);
    await act(async()=>button('Cancel noise check').click());assert.match(document.body.textContent!,/original comparison is retained/);assert.match(document.body.textContent!,/Simulation p-value/);
    const alternative={...structuredClone(primary),options:calls[1].options,pValue:.044,exceedances:8,monteCarloInterval:[.032,.057] as [number,number],noiseStd:2};
    await act(async()=>calls[1].resolve(alternative));assert.equal(document.querySelector('[aria-label="Noise sensitivity results"]'),null,'late canceled results must be ignored');
    await act(async()=>button('Check Gaussian noise sensitivity').click());
    await act(async()=>calls[2].reject(new Error('Alternative fit did not converge')));
    assert.match(document.body.textContent!,/Alternative fit did not converge/);assert.match(document.body.textContent!,/Simulation p-value/);
    assert.equal(document.querySelector('[aria-label="Noise sensitivity results"]'),null);
    await act(async()=>button('Check Gaussian noise sensitivity').click());alternative.options=calls[3].options;
    await act(async()=>calls[3].resolve(alternative));
    assert.match(document.body.textContent!,/statistical conclusion depends on the noise assumption/);
    assert.match(document.querySelector('[aria-label="Noise sensitivity results"]')!.textContent!,/Poisson0.02.*Gaussian0.044/);
    await act(async()=>button('Export comparison report').click());
    const report=JSON.parse(await blob!.text());assert.equal(report.result.pValue,.02);assert.equal(report.noiseSensitivity.pValue,.044);assert.equal(report.interpretation.rules.relativeStd,.5);assert.ok(report.interpretation.flags.some((f:{code:string})=>f.code==='noise-sensitive'));
    assert.equal(JSON.stringify(spectrum),before);
  }finally{await act(async()=>root.unmount());URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;dom.window.close();}
});
for (const outcome of ['complete','cancel','fail'] as const) test(`questionable Poisson noise automatically starts one Gaussian check and preserves the primary result on ${outcome}`,async()=>{
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLAnchorElement.prototype.click=function(){};
  const root=createRoot(document.getElementById('root')!),spectrum=fixture();
  spectrum.raw=Array(18).fill(500);spectrum.cal.folding=true;spectrum.cal.center=9;spectrum.velocityReversed=true;spectrum.spectrum.y[0]=1001;spectrum.spectrum.y[8]=1000;
  const before=JSON.stringify(spectrum),calls:{a:Project;b:Project;options:ComparisonOptions;resolve:(r:ComparisonResult)=>void;reject:(e:Error)=>void;notify:(p:ComparisonProgress)=>void}[]=[];
  let canceled=0,blob:Blob|undefined;const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=(b:Blob)=>{blob=b;return 'blob:test';};URL.revokeObjectURL=()=>{};
  const run:typeof startComparison=(a,b,options,notify)=>{let resolve!:(r:ComparisonResult)=>void,reject!:(e:Error)=>void;const promise=new Promise<ComparisonResult>((yes,no)=>{resolve=yes;reject=no;});calls.push({a,b,options,notify,resolve,reject});return {promise,cancel(){canceled++;reject(new Error('Canceled'));}};};
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===name)!;
  const render=()=>root.render(<CompareModelsDialog spectrum={spectrum} activeModelId="larger" evaluate={evaluate} onClose={()=>{}} run={run}/>);
  try {
    await act(async()=>render());await act(async()=>button('Run simulation test').click());
    const primary=await completedComparison(spectrum,calls[0].options,true);primary.pValue=.8;primary.monteCarloInterval=[.7,.9];
    await act(async()=>calls[0].resolve(primary));assert.equal(calls.length,2);
    assert.equal(calls[0].options.doubledLastChannel,true);assert.equal(calls[1].options.noise,'gaussian');
    assert.equal(calls[1].options.doubledFirstChannel,false);assert.equal(calls[1].options.doubledLastChannel,false);
    for(const key of ['seed','simulations','workers'] as const)assert.equal(calls[1].options[key],calls[0].options[key]);
    assert.deepEqual(calls[1].a,calls[0].a);assert.deepEqual(calls[1].b,calls[0].b);
    assert.match(document.body.textContent!,/running automatically/);assert.match(document.body.textContent!,/Simulation p-value0.8/);
    await act(async()=>{calls[1].notify({phase:'Second fit',completed:1,total:199});calls[0].notify({phase:'Late primary',completed:199,total:199});});
    assert.match(document.body.textContent!,/gaussian sensitivity · Second fit/);assert.doesNotMatch(document.body.textContent!,/Late primary/);
    if(outcome==='complete'){
      const alternative=await completedComparison(spectrum,calls[1].options,true);alternative.pValue=.044;alternative.monteCarloInterval=[.032,.057];
      await act(async()=>calls[1].resolve(alternative));assert.match(document.body.textContent!,/ran automatically/);
      assert.match(document.querySelector('[aria-label="Noise sensitivity results"]')!.textContent!,/Poisson0.8.*Gaussian0.044/);
    }else if(outcome==='cancel'){
      await act(async()=>button('Cancel noise check').click());assert.equal(canceled,1);
      assert.match(document.body.textContent!,/automatic Gaussian check was canceled/);
      await act(async()=>calls[1].notify({phase:'Late secondary',completed:199,total:199}));assert.doesNotMatch(document.body.textContent!,/Late secondary/);
    }else{
      await act(async()=>calls[1].reject(new Error('Gaussian fit did not converge')));
      assert.match(document.body.textContent!,/automatic Gaussian check failed/);assert.match(document.body.textContent!,/Gaussian fit did not converge/);
    }
    await act(async()=>render());assert.equal(calls.length,2,'rerenders must not restart completed, failed, or canceled checks');
    assert.match(document.body.textContent!,/Simulation p-value0.8/);assert.equal(button('Export comparison report').disabled,false);
    await act(async()=>button('Export comparison report').click());const report=JSON.parse(await blob!.text());
    assert.equal(report.result.pValue,.8);assert.equal(report.noiseSensitivityStatus.origin,'automatic');
    assert.deepEqual(report.noiseSensitivityStatus.triggerCodes,['excess-scatter']);
    assert.equal(report.noiseSensitivityStatus.status,outcome==='complete'?'complete':outcome==='cancel'?'canceled':'failed');
    assert.equal(report.noiseSensitivity?.pValue,outcome==='complete'?.044:undefined);
    assert.equal(JSON.stringify(spectrum),before);
  } finally {await act(async()=>root.unmount());URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();}
});
test('automatic Gaussian sensitivity explains incompatible count weighting without modifying the Poisson fit',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  const root=createRoot(document.getElementById('root')!),spectrum=fixture();spectrum.models.forEach(m=>m.project.weighting='counts');const before=JSON.stringify(spectrum);
  let count=0,resolve!:(r:ComparisonResult)=>void,options!:ComparisonOptions;
  const run:typeof startComparison=(_a,_b,o)=>{count++;options=o;return {promise:new Promise(yes=>{resolve=yes;}),cancel(){}};};
  try {
    await act(async()=>root.render(<CompareModelsDialog spectrum={spectrum} activeModelId="larger" evaluate={evaluate} onClose={()=>{}} run={run}/>));
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Run simulation test')!.click());
    const primary=await completedComparison(spectrum,options,true);await act(async()=>resolve(primary));
    assert.equal(count,1);assert.match(document.body.textContent!,/automatic Gaussian sensitivity is unavailable/);assert.match(document.body.textContent!,/unweighted/i);
    assert.match(document.body.textContent!,/Simulation p-value0.02/);assert.equal(JSON.stringify(spectrum),before);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

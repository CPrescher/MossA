import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json, fit_recovery_json, evaluate_source_json, fit_source_json } from '../src/wasm/mossa_core.js';
import { Engine } from '../src/native-engine';
import { NativeSession } from '../src/native-session';
import { startComparison } from '../src/native-comparison';
import { fitMultiStart, fitMultiStartAsync } from '../src/multistart.mjs';
import { acceptableFit, runComparison, seededRandom, normalSample, poissonSample, type ComparisonOptions } from '../src/comparison';
import { sourceReferenceProject } from '../src/source-calibration';
import { demo } from '../src/demo';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { summarizeFit } from '../src/session';
import { newSite, parameter, type Evaluation, type FitProgress, type FitResult, type Project } from '../src/types';
import { NativeFixture } from './native-transport';
import { compareAnalytical } from '../scripts/analytical-validation.mjs';
await init({ module_or_path: readFileSync('src/wasm/mossa_core_bg.wasm') });
const evaluate = (project: Project): Evaluation => JSON.parse(evaluate_json(JSON.stringify(project)));
const fit = (project: Project, algorithm: 'trf' | 'bounded-lm' = 'trf'): FitResult => fitMultiStart(project,
  candidate => JSON.parse((algorithm === 'trf' ? fit_json : fit_recovery_json)(JSON.stringify(candidate))), evaluate);
const close = (a: number, b: number, relative = 1e-7) => assert.ok(Math.abs(a-b) <= relative*Math.max(1,Math.abs(a),Math.abs(b)), `${a} differs from ${b}`);

test('ordered native helper preserves complete measured full/selective fits, std and progress with bounded concurrency',async()=>{
 const fixture=new NativeFixture();let engine:Engine;
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const rows=JSON.parse(readFileSync('tests/fixtures/deterministic-search-measured.json','utf8')).runs;
  for(const row of rows){
   const reference=await engine!.request('fit',row.project,undefined,{searchWorkers:1});
   equalFit(reference.result as FitResult,row.analytical);
   for(const [key,std]of Object.entries(row.analytical.errors)){
    const value=(reference.result as FitResult).errors[key];
    if(std===null)assert.equal(value,null);else close(value!,std as number,1e-4);
   }
   fixture.highWater=0;const progress:FitProgress[]=[];
   const actual=await engine!.request('fit',row.project,s=>progress.push(s),{searchWorkers:2});
   assert.deepEqual(actual.result,reference.result);assert.equal(actual.execution.search_workers,2);assert.equal(actual.execution.fallback,undefined);
   assert.equal(fixture.highWater,2);assert.ok(progress.every((p,i)=>!i||p.search_start!>=progress[i-1].search_start!));
  }
  for(const workers of [0,3,1.5,NaN])await assert.rejects(engine!.request('fit',demo(),undefined,{searchWorkers:workers}),/Search workers/);
  engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('native helper transport failure retries its candidate without changing the winner, std or search diagnostics',async()=>{
 const fixture=new NativeFixture();let engine:Engine;let root:string|undefined;let failed=0;
 const invoke=fixture.transport.invoke;
 fixture.transport.invoke=async<T,>(command:string,args:Record<string,unknown>):Promise<T>=>{
  if(command==='native_compute_start'&&!root)root=String(args.session);
  if(command==='native_compute'&&args.operation==='fit'&&args.session!==root&&!failed++){throw new Error('injected helper transport failure');}
  return invoke<T>(command,args);
 };
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const project=demo();project.search_starts=4;
  const reference=await engine!.request('fit',project,undefined,{searchWorkers:1});
  const actual=await engine!.request('fit',project,undefined,{searchWorkers:2});
  assert.deepEqual(actual.result,reference.result);assert.match(actual.execution.fallback!,/injected helper/);assert.ok(failed);
  engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('canceling while a native search helper starts cancels both scopes without publishing a fit',async()=>{
 const fixture=new NativeFixture();let engine:Engine;let root:string|undefined;let stopped=false;
 const invoke=fixture.transport.invoke;
 fixture.transport.invoke=async<T,>(command:string,args:Record<string,unknown>):Promise<T>=>{
  if(command==='native_compute_start'&&!root)root=String(args.session);
  if(command==='native_compute'&&args.operation==='fit'&&args.session!==root&&!stopped){stopped=true;engine!.stop();}
  return invoke<T>(command,args);
 };
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const project=demo();project.search_starts=12;
  await assert.rejects(engine!.request('fit',project,undefined,{searchWorkers:2}),/canceled/i);assert.ok(stopped);await fixture.idle();
 }finally{await fixture.close();}
});
function equalFit(a: FitResult, b: FitResult, stationaryThinControl = false) {
  if (stationaryThinControl && a.converged !== b.converged) {
    // Qualified Linux x64 four-start thin-control case: different rounding can
    // select a marginally lower native minimum with a raw NoProgress stop.
    // Preserve its nonconverged status/warning; never relax minimum/std gates.
    assert.equal(a.converged, false); assert.equal(b.converged, true);
    assert.equal(a.termination, 'NumericalNoProgress');
    assert.ok(Number.isFinite(a.stationarity) && a.stationarity! <= 1e-6);
    assert.ok(a.warnings.some(w => /stopped without satisfying its convergence criterion/.test(w)));
    const quality = compareAnalytical(b, a);
    assert.ok(quality.passed, JSON.stringify(quality));
  } else assert.equal(a.converged, b.converged);
  close(a.evaluation.objective,b.evaluation.objective);
  assert.equal(a.free_parameters,b.free_parameters); assert.equal(a.rank,b.rank);
  for (const key of Object.keys(a.evaluation.parameters)) close(a.evaluation.parameters[key],b.evaluation.parameters[key],1e-5);
  a.evaluation.y.forEach((v,i) => close(v,b.evaluation.y[i]));
}
function models(counts = false): [Project,Project] {
  const site = newSite(0,'Singlet'); Object.assign(site.params.cs,{value:-.6,fit:false}); Object.assign(site.params.fwhm,{value:.45,fit:false});
  site.params.intensity.value = counts ? 2000 : 80;
  const a: Project = { spectrum:{x:Array.from({length:81},(_,i)=>-4+i/10),y:Array(81).fill(1000)},sites:[site],background:[parameter(counts ? 20000 : 1000)],mode:'thin',source_fwhm:.097,source_squared:false,weighting:counts?'counts':'unweighted',max_iterations:400,search_starts:1 };
  const b = structuredClone(a), added = newSite(1,'Singlet'); Object.assign(added.params.cs,{value:1.1,fit:false}); Object.assign(added.params.fwhm,{value:.4,fit:false}); added.params.intensity.value=counts?100:3; b.sites.push(added);
  const truth=evaluate(b),random=seededRandom(87231); a.spectrum.y=truth.y.map(mu=>counts?poissonSample(mu,random):mu+2*normalSample(random)); b.spectrum=structuredClone(a.spectrum); b.sites[1].params.intensity.value=counts?100:10;
  return [a,b];
}

test('native analysis uses the shared multi-start search and publishes accepted fit progress', async () => {
  const fixture = new NativeFixture(); const states: any[]=[]; let engine: Engine;
  try {
    const ready = new Promise<void>((resolve,reject) => { engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport); }); await ready;
    const project=demo(); project.search_starts=3; const original=structuredClone(project);
    const response=await engine!.request('fit',project,p=>states.push(p));
    const actual=response.result as FitResult, reference=fit(project); equalFit(actual,reference);
    assert.equal(response.execution.backend,'native-rust'); assert.equal(actual.search?.requested,3); assert.equal(actual.search?.completed,3);
    assert.deepEqual(actual.search?.objectives.map(x=>Number(x.toPrecision(7))),reference.search?.objectives.map(x=>Number(x.toPrecision(7))));
    assert.ok(states.some(p=>p.search_start===1));assert.ok(states.some(p=>p.search_start===3));
    const scope = new NativeSession(fixture.transport);
    equalFit(await scope.fit(project,'bounded-lm'),fit(project,'bounded-lm'));scope.stop();
    assert.deepEqual(project,original); engine!.stop(); await fixture.idle();
  } finally { await fixture.close(); }
});

test('native source evaluation and calibration retain the browser model and progress', async () => {
  const fixture=new NativeFixture(); let engine: Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const x=Array.from({length:101},(_,i)=>-3+.06*i),project=sourceReferenceProject({x,y:x.map(v=>10000-1000*Math.exp(-v*v))},{absorberFwhm:.097,initialSourceFwhm:.4,squared:false});
    project.source_fwhm=.31;project.sites[0].params.cs.value=.23;project.sites[0].params.intensity.value=.3;
    project.spectrum.y=JSON.parse(evaluate_source_json(JSON.stringify(project))).y;project.source_fwhm=.4;
    const evaluated=await engine!.request('evaluate-source',project),expected=JSON.parse(evaluate_source_json(JSON.stringify(project)));
    (evaluated.result as Evaluation).y.forEach((v,i)=>close(v,expected.y[i]));
    const states:any[]=[];const result=await engine!.request('fit-source',project,p=>states.push(p));
    equalFit(result.result as FitResult,JSON.parse(fit_source_json(JSON.stringify(project))));assert.ok(states.length>0);
    engine!.stop();await fixture.idle();
  } finally {await fixture.close();}
});

test('native Engine worker overrides retain every result/std field and report actual execution', async () => {
  const fixture=new NativeFixture();let engine:Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const project:Project=JSON.parse(readFileSync('tests/fixtures/transmission-measured-performance.json','utf8')).cases[1].project;
    const original=structuredClone(project),reference=await engine!.request('fit',project,undefined,{derivativeWorkers:1});
    assert.equal(reference.execution.derivative_workers,1);
    for(const workers of [2,4,8,undefined]) {
      const actual=await engine!.request('fit',project,undefined,workers?{derivativeWorkers:workers}:undefined);
      assert.deepEqual(actual.result,reference.result);
      assert.ok(actual.execution.derivative_workers>=1&&actual.execution.derivative_workers<=(workers??8));
      assert.equal(actual.execution.fallback,undefined);
    }
    for(const workers of [0,9,1.5,NaN])await assert.rejects(engine!.request('fit',project,undefined,{derivativeWorkers:workers}),/Derivative workers/);
    assert.deepEqual(project,original);engine!.stop();await fixture.idle();
  }finally{await fixture.close();}
});

test('native multistart calculates std once and preserves eager full/selective results exactly', async () => {
  const fixture=new NativeFixture();let engine:Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const session=new NativeSession(fixture.transport);
    const project:Project=JSON.parse(readFileSync('tests/fixtures/transmission-measured-performance.json','utf8')).cases[1].project;
    project.search_starts=4;
    for(const strategy of ['full','selective'] as const){
      project.search_strategy=strategy;
      const expected=await fitMultiStartAsync(project,p=>session.fit(p,'trf',undefined,{derivativeWorkers:1}),p=>session.evaluate(p));
      let trials=0,finalized=0;const invoke=fixture.transport.invoke;
      fixture.transport.invoke=async<T,>(command:string,args:Record<string,unknown>):Promise<T>=>{
        const response=await invoke<T>(command,args);
        if(command==='native_compute'&&args.operation==='fit'){
          const r=(response as any).result;assert.ok(r.finalization);assert.equal(r.errors,undefined);assert.equal(r.rank,undefined);trials++;
        }
        if(command==='native_compute'&&args.operation==='finalize-fit')finalized++;
        return response;
      };
      const actual=await engine!.request('fit',project);
      fixture.transport.invoke=invoke;
      assert.deepEqual(actual.result,expected);assert.equal(trials,4);assert.equal(finalized,1);
      assert.equal((actual.result as any).finalization,undefined);
      assert.equal((actual.result as any).project.search_defer_uncertainties,undefined);
    }
    session.stop();engine!.stop();await fixture.idle();
  }finally{await fixture.close();}
});

test('canceling during native uncertainty finalization never publishes a partial result', async () => {
  const fixture=new NativeFixture();let engine:Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const invoke=fixture.transport.invoke;let finalizing=false;
    fixture.transport.invoke=async<T,>(command:string,args:Record<string,unknown>):Promise<T>=>{
      if(command==='native_compute'&&args.operation==='finalize-fit'){finalizing=true;engine!.stop();}
      return invoke<T>(command,args);
    };
    const project=demo();project.search_starts=4;
    await assert.rejects(engine!.request('fit',project),/canceled/i);
    assert.ok(finalizing);await fixture.idle();
  }finally{await fixture.close();}
});

test('native selective continuation prunes a stalled measured start and retains the full-search minimum', async () => {
  const fixture = new NativeFixture(); let engine: Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const project: Project = JSON.parse(readFileSync('tests/fixtures/transmission-measured-performance.json','utf8')).cases[1].project;
    project.derivative_method='numerical';
    project.search_starts=4;project.search_strategy='selective';
    const original=structuredClone(project),states:FitProgress[]=[];
    const actual=(await engine!.request('fit',project,p=>states.push(p))).result as FitResult;
    const reference=fit({...project,search_strategy:'full'});
    equalFit(actual,reference);
    assert.equal(actual.search?.pruned_starts,1);
    assert.equal(actual.search?.exploration_iterations,64);
    assert.equal(actual.project.search_strategy,'selective');
    assert.ok(actual.search!.trials!.some(t=>t.pruned&&t.iterations===64&&t.termination==='ExplorationPruned'));
    assert.ok(states.some(s=>s.search_start===3));
    assert.ok(states.every(s=>s.project.search_strategy==='selective'&&s.project.search_starts===4&&!(s.project as any).search_probe));
    assert.deepEqual(project,original);engine!.stop();await fixture.idle();
  } finally {await fixture.close();}
});

test('native parallel comparisons retain seeded results and diagnostics across worker counts and WASM', async () => {
  const fixture=new NativeFixture();
  const derivativeRequests:number[]=[];let batchFits=0;const invoke=fixture.transport.invoke;
  fixture.transport.invoke=async<T,>(command:string,args:Record<string,unknown>):Promise<T>=>{
    if(command==='native_compute'&&(String(args.operation).startsWith('fit')||args.operation==='finalize-fit'))derivativeRequests.push(args.derivativeWorkers as number);
    if(command==='native_comparison_batch')batchFits+=(args.request as any).operations.filter((op:any)=>op.operation!=='evaluate').length;
    return invoke<T>(command,args);
  };
  try {
    for (const counts of [false,true]) {
      const [a,b]=models(counts),original=structuredClone([a,b]);
      const options:ComparisonOptions={simulations:99,seed:12345,noise:counts?'poisson':'gaussian',doubledFirstChannel:false,workers:1};
      const serial=await startComparison(a,b,options,()=>{},()=>new NativeSession(fixture.transport)).promise;
      const progress:number[]=[];
      const parallel=await startComparison(a,b,{...options,workers:4},p=>progress.push(p.completed),()=>new NativeSession(fixture.transport)).promise;
      assert.deepEqual({...parallel,options:serial.options,execution:undefined},{...serial,execution:undefined});
      const browser=runComparison(a,b,options,fit,evaluate);
      assert.equal(parallel.pValue,browser.pValue);assert.equal(parallel.exceedances,browser.exceedances);
      parallel.improvements.forEach((v,i)=>close(v,browser.improvements[i],1e-5));
      assert.equal(parallel.diagnostics.length,99);assert.equal(parallel.execution?.backend,'native-rust');assert.equal(parallel.execution?.workers,4);
      assert.ok(progress.every((value,i)=>i===0||value>=progress[i-1]));assert.equal(progress.at(-1),99);assert.ok(fixture.highWater>=2&&fixture.highWater<=4);
      assert.deepEqual([a,b],original);
    }
    await fixture.idle();
    assert.ok(derivativeRequests.length+batchFits>100);assert.ok(derivativeRequests.every(n=>n===1));
  } finally {await fixture.close();}
});

test('canceling a native fit rejects queued work, suppresses late progress, and stops native CPU jobs', async () => {
  const fixture=new NativeFixture();let engine:Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const project=demo();project.search_starts=32;project.search_strategy='selective';let stopped=false,late=0;
    const fitting=engine!.request('fit',project,state=>{if(stopped)late++;else if(state.search_start === 2){stopped=true;engine!.stop();}}, {derivativeWorkers:4});
    const queued=engine!.request('evaluate',project);
    await Promise.all([assert.rejects(fitting,/canceled/i),assert.rejects(queued,/canceled/i)]);
    assert.ok(stopped);await fixture.idle();assert.equal(late,0);
    // A fresh scope still works after the previous session's cancellation.
    const session=new NativeSession(fixture.transport);await session.evaluate(project);
    assert.deepEqual(await session.fit(project,'trf',undefined,{derivativeWorkers:4}),await session.fit(project,'trf',undefined,{derivativeWorkers:1}));
    session.stop();await fixture.idle();
  } finally {await fixture.close();}
});

test('canceling a parallel comparison and a failed native fit never produce a partial p-value', async () => {
  const fixture=new NativeFixture();
  try {
    const [a,b]=models();const options:ComparisonOptions={simulations:9999,seed:19,noise:'gaussian',doubledFirstChannel:false,workers:4};
    let task:ReturnType<typeof startComparison>;let stopped=false;
    task=startComparison(a,b,options,p=>{if(p.completed>=2&&!stopped){stopped=true;task.cancel();}},()=>new NativeSession(fixture.transport));
    await assert.rejects(task.promise,/canceled/i);assert.ok(stopped);await fixture.idle();
    let fits=0;
    const failing = { ...fixture.transport, invoke: async <T,>(command: string, args: Record<string, any>): Promise<T> => {
      if (command === 'native_compute' && args.operation === 'fit' && ++fits === 5) throw new Error('Injected native fit failure');
      if (command === 'native_comparison_batch' && args.request.operations.some((op: any)=>op.operation==='fit'&&++fits===5)) throw new Error('Injected native fit failure');
      return fixture.transport.invoke<T>(command,args);
    } };
    await assert.rejects(startComparison(a,b,{...options,simulations:99},()=>{},()=>new NativeSession(failing)).promise,/Injected native fit failure/);
    await fixture.idle();
    const invalid=structuredClone(a);invalid.spectrum.y[0]=NaN;
    const session=new NativeSession(fixture.transport);await assert.rejects(session.fit(invalid));session.stop();await fixture.idle();
  } finally {await fixture.close();}
});

test('compact nonlinear comparisons preserve every legacy result and release independent spectra',async()=>{
  const fixture=new NativeFixture();let packets=0;
  const invoke=fixture.transport.invoke;
  fixture.transport.invoke=async<T,>(command:string,args:Record<string,any>):Promise<T>=>{if(command==='native_comparison_batch')packets++;return invoke<T>(command,args);};
  try {
    const c=JSON.parse(readFileSync('tests/fixtures/ftest-boundary-replays.json','utf8')).cases[0];
    const options={...c.options,simulations:99,workers:4};
    const legacy=await startComparison(c.simpler,c.larger,options,()=>{},()=>new NativeSession(fixture.transport),{compact:false}).promise;
    const compact=await startComparison(c.simpler,c.larger,options,()=>{},()=>new NativeSession(fixture.transport)).promise;
    assert.deepEqual(compact,legacy);assert.ok(packets>100);assert.ok(fixture.highWater<=4);
    await fixture.idle();
  }finally{await fixture.close();}
});
test('canceling an in-flight compact batch stops its native work without publishing a p-value',async()=>{
  const fixture=new NativeFixture();let task:ReturnType<typeof startComparison>,canceled=false;
  const invoke=fixture.transport.invoke;
  fixture.transport.invoke=async<T,>(command:string,args:Record<string,any>):Promise<T>=>{
    if(command==='native_comparison_batch'&&args.request.operations.some((op:any)=>op.operation==='fit'||op.prefit==='fit')&&!canceled){canceled=true;queueMicrotask(()=>task.cancel());}
    return invoke<T>(command,args);
  };
  try {
    const c=JSON.parse(readFileSync('tests/fixtures/ftest-boundary-replays.json','utf8')).cases[0];
    task=startComparison(c.simpler,c.larger,{...c.options,simulations:9999,workers:4},()=>{},()=>new NativeSession(fixture.transport));
    await assert.rejects(task.promise,/canceled/i);assert.ok(canceled);await fixture.idle();
    const fresh=new NativeSession(fixture.transport);await fresh.evaluate(c.simpler);fresh.stop();await fixture.idle();
  }finally{await fixture.close();}
});


test('native evaluation reopens a browser-fitted project with its saved result and uncertainties', async () => {
  const fixture = new NativeFixture(), session = new NativeSession(fixture.transport);
  try {
    const result = fit(demo());
    const cal = { max:10,shift:0,folding:false,sinusoidal:false,center:256.5 };
    const snapshot = { project:result.project,raw:null,cal,filename:'Browser fit',selected:0,fit:summarizeFit(result),fitElapsed:10 };
    const file = await createProjectFile(snapshot,{fitting_backend:'wasm'});
    const reopened = await openProjectFile(file,cal,'browser-fit.mossa',project=>session.evaluate(project));
    assert.ok(reopened.snapshot.fit,'a backend change must not discard a matching saved fit');
    assert.deepEqual(reopened.snapshot.fit!.errors,snapshot.fit.errors);
    assert.deepEqual(reopened.snapshot.project,result.project);
    session.stop();await fixture.idle();
  } finally {await fixture.close();}
});

test('native analytical thin fits retain browser minima and std, bypass column pools, and finalize searches',async()=>{
 const fixture=new NativeFixture();let engine:Engine;
 try {
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const p=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json','utf8')).cases.find((c:any)=>c.id==='thin-control').project as Project;
  p.derivative_method='analytical';
  for(const starts of [1,4]) {
   p.search_starts=starts;p.search_strategy='selective';
   const expected=fit(p),response=await engine!.request('fit',p,undefined,{derivativeWorkers:4}),actual=response.result as FitResult;
   equalFit(actual,expected,starts===4);assert.equal(actual.project.derivative_method,'analytical');assert.equal(response.execution.derivative_workers,1);assert.equal(response.execution.fallback,undefined);
   for(const [key,std]of Object.entries(expected.errors)) {
    const next=actual.errors[key];assert.equal(next===null,std===null);
    if(std!==null&&next!==null)assert.ok(Math.abs(next-std)<=1e-10+1e-4*std,`${key}: native/browser std differ`);
   }
   const serial=await engine!.request('fit',p,undefined,{derivativeWorkers:1});assert.deepEqual(serial.result,actual);
  }
  engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('default native coincidence separation and its objective safeguard match WASM',async()=>{
 const fixture=new NativeFixture();let engine:Engine;
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const project=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json','utf8')).cases.find((c:any)=>c.id==='thin-control').project as Project;
  project.sites=[structuredClone(project.sites[0]),structuredClone(project.sites[0])];
  project.spectrum.y=evaluate(project).y.map((v,i)=>v+.001*Math.sin(1.7*i));project.max_iterations=1;
  const response=await engine!.request('fit',project,undefined,{derivativeWorkers:4}),actual=response.result as FitResult;
  equalFit(actual,fit(project));assert.ok(actual.evaluation.objective<=evaluate(project).objective);assert.equal(response.execution.derivative_workers,1);
  assert.equal(actual.project.derivative_method,undefined);engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('analytical transmission FFT columns preserve native/browser minima and std across worker counts',async()=>{
 const fixture=new NativeFixture();let engine:Engine;
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  const cases=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json','utf8')).cases;
  for(const id of ['three-sites-lorentzian-source','three-sites-squared-source','asymmetric-gaussian-source']){
   const project=cases.find((c:any)=>c.id===id).project as Project,reference=fit(project);
   const serial=await engine!.request('fit',project,undefined,{derivativeWorkers:1}),actual=serial.result as FitResult;
   // At the numerical floor, native and WASM may differ in whether the
   // solver reports RelativeCostTolerance or stationary NumericalNoProgress.
   assert.ok(acceptableFit(actual));assert.ok(acceptableFit(reference));
   close(actual.evaluation.objective,reference.evaluation.objective,1e-8);
   assert.equal(actual.rank,reference.rank);assert.equal(actual.free_parameters,reference.free_parameters);
   actual.evaluation.y.forEach((v,i)=>close(v,reference.evaluation.y[i]));
   for(const key of Object.keys(reference.evaluation.parameters))close(actual.evaluation.parameters[key],reference.evaluation.parameters[key],1e-5);
   for(const [key,std]of Object.entries(reference.errors)){const next=actual.errors[key];assert.equal(std===null,next===null);if(std!==null&&next!==null)assert.ok(Math.abs(std-next)<=1e-10+1e-4*std,key);}
   for(const workers of [4,8]){const r=await engine!.request('fit',project,undefined,{derivativeWorkers:workers});assert.deepEqual(r.result,actual);assert.equal(r.execution.fallback,undefined);}
  }
  engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('analytical source calibration and xVBF retain minima/std and worker-count determinism',async()=>{
 const {sourceXvbfCases}=await import('../scripts/source-xvbf-analytical-cases.mjs');
 const cases=sourceXvbfCases(evaluate,(p:Project)=>JSON.parse(evaluate_source_json(JSON.stringify(p))));
 const fixture=new NativeFixture();let engine:Engine;
 try{
  await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
  for(const id of ['source-calibration-squared','source-calibration-gaussian-2','xvbf-transmission-mixture','xvbf-thin-mixture','xvbf-perfect-correlation']){
   const c=cases.find((c:any)=>c.id===id);const expected=JSON.parse((c.calibration?fit_source_json:fit_json)(JSON.stringify(c.project))) as FitResult;
   const response=await engine!.request(c.calibration?'fit-source':'fit',c.project,undefined,{derivativeWorkers:1}),actual=response.result as FitResult;
   close(actual.evaluation.objective,expected.evaluation.objective,1e-8);assert.equal(actual.rank,expected.rank);
   actual.evaluation.y.forEach((v,i)=>close(v,expected.evaluation.y[i]));
   for(const [key,std]of Object.entries(expected.errors)){const next=actual.errors[key];assert.equal(std===null,next===null,key);if(std!==null&&next!==null)assert.ok(Math.abs(std-next)<=1e-10+1e-4*std,key);}
   const parallel=await engine!.request(c.calibration?'fit-source':'fit',c.project,undefined,{derivativeWorkers:8});assert.deepEqual(parallel.result,actual);assert.equal(parallel.execution.fallback,undefined);
  }
  engine!.stop();await fixture.idle();
 }finally{await fixture.close();}
});

test('native thin variable projection matches WASM minima/std and retains complete deferred/progress states',async()=>{
 const {variableProjectionCases}=await import('../scripts/variable-projection-cases.mjs');
 const {compareAnalytical}=await import('../scripts/analytical-validation.mjs');
 const wasm=await import('../src/wasm/mossa_core.js');
 const cases=variableProjectionCases((p:any)=>JSON.parse(wasm.evaluate_json(JSON.stringify(p))),(p:any)=>JSON.parse(wasm.evaluate_source_json(JSON.stringify(p))));
 const fixture=new NativeFixture();
 try{
  await fixture.transport.invoke('native_compute_start',{session:'projection'});
  for(const id of ['Sextet-PseudoVoigt','bounded-intensity','linked-linear-roots','rank-deficient-areas','MS-Fe2O3-Fe3O4_70-30_coarse']){
   const p={...cases.find((c:any)=>c.id===id).project,thin_solver:'variable_projection'};
   const reference=JSON.parse(wasm.fit_json(JSON.stringify(p)));
   const response:any=await fixture.transport.invoke('native_compute',{session:'projection',operation:'fit',project:p});
   const quality=compareAnalytical(reference,response.result);assert.ok(quality.passed&&quality.same_minimum,JSON.stringify(quality));
   assert.ok(response.execution.projected_parameters>0||id==='rank-deficient-areas');
   const deferred:any=await fixture.transport.invoke('native_compute',{session:'projection',operation:'fit',project:{...p,search_defer_uncertainties:true}});
   const final:any=await fixture.transport.invoke('native_compute',{session:'projection',operation:'finalize-fit',project:deferred.result.finalization.project,state:deferred.result.finalization.state});
   assert.deepEqual(final.result,response.result);
  }
 }finally{await fixture.close();}
});

test('native joint continuation preserves WASM results, full deferred states, and progress across the handoff',async()=>{
 const f=JSON.parse(readFileSync('tests/fixtures/variable-projection-slow-trial.json','utf8'));
 const expected=JSON.parse(fit_json(JSON.stringify(f.project)));
 const fixture=new NativeFixture();let previous=-1;let progressCount=0;
 try{
  await fixture.transport.invoke('native_compute_start',{session:'continuation'});
  const actual:any=await fixture.transport.invoke('native_compute',{session:'continuation',operation:'fit',project:f.project,progress:(p:FitProgress)=>{
   assert.ok(p.iteration>=previous);previous=p.iteration;progressCount++;
   assert.equal(p.evaluation.y.length,f.project.spectrum.y.length);close(p.evaluation.objective,evaluate(p.project).objective,1e-10);
  }});
  assert.equal(actual.execution.projection_handoffs.length,1);assert.ok(actual.execution.projection_handoffs[0]>=56&&actual.execution.projection_handoffs[0]<100);assert.ok(progressCount>0);assert.ok(actual.result.iterations<200);
  const {compareAnalytical}=await import('../scripts/analytical-validation.mjs');const q=compareAnalytical(expected,actual.result);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));
  const trial:any=await fixture.transport.invoke('native_compute',{session:'continuation',operation:'fit',project:{...f.project,search_defer_uncertainties:true}});
  assert.equal(trial.result.finalization.state.x.length,actual.result.free_parameters);
  const result:any=await fixture.transport.invoke('native_compute',{session:'continuation',operation:'finalize-fit',project:trial.result.finalization.project,state:trial.result.finalization.state});assert.deepEqual(result.result,actual.result);
 }finally{await fixture.close();}
});


test('native omitted thin solver defaults to projection and explicit joint remains available',async()=>{
 const p:Project=structuredClone(JSON.parse(readFileSync('tests/fixtures/transmission-performance.json','utf8')).cases.find((c:any)=>c.id==='thin-control').project);
 delete p.thin_solver;const fixture=new NativeFixture();const results:any[]=[];
 try{
  await fixture.transport.invoke('native_compute_start',{session:'default-thin'});
  for(const thin_solver of [undefined,'variable_projection','joint'] as const){
   const project={...p,thin_solver};
   const r:any=await fixture.transport.invoke('native_compute',{session:'default-thin',operation:'fit',project});
   equalFit(r.result,JSON.parse(fit_json(JSON.stringify(project))));
   assert.equal((r.execution.projected_parameters??0)>0,thin_solver!=='joint');
   const result=structuredClone(r.result);delete result.project.thin_solver;results.push(result);
  }
  assert.deepEqual(results[0],results[1]);
 }finally{await fixture.close();}
});

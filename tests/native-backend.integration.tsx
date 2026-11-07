import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json, fit_recovery_json, evaluate_source_json, fit_source_json } from '../src/wasm/mossa_core.js';
import { Engine } from '../src/native-engine';
import { NativeSession } from '../src/native-session';
import { startComparison } from '../src/native-comparison';
import { fitMultiStart } from '../src/multistart.mjs';
import { runComparison, seededRandom, normalSample, poissonSample, type ComparisonOptions } from '../src/comparison';
import { sourceReferenceProject } from '../src/source-calibration';
import { demo } from '../src/demo';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { summarizeFit } from '../src/session';
import { newSite, parameter, type Evaluation, type FitResult, type Project } from '../src/types';
import { NativeFixture } from './native-transport';
await init({ module_or_path: readFileSync('src/wasm/mossa_core_bg.wasm') });
const evaluate = (project: Project): Evaluation => JSON.parse(evaluate_json(JSON.stringify(project)));
const fit = (project: Project, algorithm: 'trf' | 'bounded-lm' = 'trf'): FitResult => fitMultiStart(project,
  candidate => JSON.parse((algorithm === 'trf' ? fit_json : fit_recovery_json)(JSON.stringify(candidate))), evaluate);
const close = (a: number, b: number, relative = 1e-7) => assert.ok(Math.abs(a-b) <= relative*Math.max(1,Math.abs(a),Math.abs(b)), `${a} differs from ${b}`);
function equalFit(a: FitResult, b: FitResult) {
  assert.equal(a.converged, b.converged); close(a.evaluation.objective,b.evaluation.objective);
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

test('native parallel comparisons retain seeded results and diagnostics across worker counts and WASM', async () => {
  const fixture=new NativeFixture();
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
  } finally {await fixture.close();}
});

test('canceling a native fit rejects queued work, suppresses late progress, and stops native CPU jobs', async () => {
  const fixture=new NativeFixture();let engine:Engine;
  try {
    await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,message=>reject(new Error(message)),fixture.transport);});
    const project=demo();project.search_starts=32;let stopped=false,late=0;
    const fitting=engine!.request('fit',project,state=>{if(stopped)late++;else if(state.search_start === 2){stopped=true;engine!.stop();}});
    const queued=engine!.request('evaluate',project);
    await Promise.all([assert.rejects(fitting,/canceled/i),assert.rejects(queued,/canceled/i)]);
    assert.ok(stopped);await fixture.idle();assert.equal(late,0);
    // A fresh scope still works after the previous session's cancellation.
    const session=new NativeSession(fixture.transport);await session.evaluate(project);session.stop();await fixture.idle();
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
      return fixture.transport.invoke<T>(command,args);
    } };
    await assert.rejects(startComparison(a,b,{...options,simulations:99},()=>{},()=>new NativeSession(failing)).promise,/Injected native fit failure/);
    await fixture.idle();
    const invalid=structuredClone(a);invalid.spectrum.y[0]=NaN;
    const session=new NativeSession(fixture.transport);await assert.rejects(session.fit(invalid));session.stop();await fixture.idle();
  } finally {await fixture.close();}
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

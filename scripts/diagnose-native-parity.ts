import { readFileSync, writeFileSync } from 'node:fs';
import init, {evaluate_json,fit_json} from '../src/wasm/mossa_core.js';
import {fitMultiStart} from '../src/multistart.mjs';
import {Engine} from '../src/native-engine';
import {NativeFixture} from '../tests/native-transport';
import {compareAnalytical} from './analytical-validation.mjs';
import type {FitResult,Project} from '../src/types';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const fixture=new NativeFixture();let engine:Engine;
const rows:any[]=[];
try {
 await new Promise<void>((resolve,reject)=>{engine=new Engine(resolve,reject,fixture.transport);});
 const base=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json','utf8')).cases.find((c:any)=>c.id==='thin-control').project as Project;
 for(const derivative of ['analytical','numerical'] as const)for(const solver of ['default','joint'])for(const starts of [1,4]) {
  const p=structuredClone(base);p.derivative_method=derivative;p.search_starts=starts;p.search_strategy='selective';
  if(solver==='joint')p.thin_solver='joint';
  const expected=fitMultiStart(p,q=>JSON.parse(fit_json(JSON.stringify(q))),q=>JSON.parse(evaluate_json(JSON.stringify(q))));
  const response=await engine!.request('fit',p,undefined,{derivativeWorkers:4});const actual=response.result as FitResult;
  const summary=(r:FitResult)=>({objective:r.evaluation.objective,sse:r.evaluation.sse,converged:r.converged,termination:r.termination,stationarity:r.stationarity,rank:r.rank,free_parameters:r.free_parameters,iterations:r.iterations,parameters:r.evaluation.parameters,errors:r.errors});
  const row={derivative,solver,starts,native:summary(actual),wasm:summary(expected),scientific:compareAnalytical(expected,actual),actual,expected};rows.push(row);
  console.log(JSON.stringify({...row,actual:undefined,expected:undefined}));
  if(!row.scientific.passed) throw new Error('Native/WASM scientific parity failed');
 }
} finally {engine!?.stop();await fixture.close();}
writeFileSync('native-parity-diagnostic.json',JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,rows},null,2)+'\n');

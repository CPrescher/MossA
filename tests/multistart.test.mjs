import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{fit_json,evaluate_json} from '../src/wasm/mossa_core.js';
import {fitMultiStart,fitMultiStartAsync,searchCandidate} from '../src/multistart.mjs';
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const local=p=>JSON.parse(fit_json(JSON.stringify(p)));
const evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p)));
const fixture=JSON.parse(readFileSync(new URL('fixtures/public-mixture-coarse.json',import.meta.url))).project;
test('explicit numerical coarse-start mixture retains its qualified multistart escape',()=>{
 const p={...structuredClone(fixture),derivative_method:'numerical'},original=structuredClone(p);p.search_starts=4;
 const single=local(p);const progress=[];
 const result=fitMultiStart(p,local,evaluate,s=>progress.push(s));
 assert.ok(result.evaluation.objective < single.evaluation.objective*.27);
 assert.equal(result.search.completed,4);assert.equal(result.search.best_start,4);
 assert.equal(result.project.search_starts,4);
 assert.deepEqual(result.project.sites.map(s=>[s.kind,s.profile]),p.sites.map(s=>[s.kind,s.profile]));
 assert.ok(progress.every((s,i)=>!i||s.evaluation.objective<=progress[i-1].evaluation.objective+1e-6));
 delete p.search_starts;assert.deepEqual(p,original);
});
test('fixed parameters and proportional links survive search with restrictive linked bounds',()=>{
 const p=structuredClone(fixture);p.search_starts=4;p.sites=p.sites.slice(0,2);
 for(const s of p.sites)for(const q of Object.values(s.params))q.fit=false;
 const a=p.sites[0].params,b=p.sites[1].params;
 a.fwhm.value=.35;a.fwhm.fit=true;a.fwhm.min=.3499;a.fwhm.max=.3501;
 b.fwhm.value=.7;b.fwhm.min=.6999;b.fwhm.max=.7001;b.fwhm.link={target:'site:0:fwhm',factor:2};
 const candidate=searchCandidate(p,3);
 assert.equal(candidate.sites[0].params.bhf.value,a.bhf.value);
 assert.deepEqual(candidate.sites[1].params.fwhm.link,b.fwhm.link);
 const result=fitMultiStart(p,local,evaluate);
 const fitted=result.project.sites.map(s=>s.params.fwhm.value);
 assert.ok(fitted[1]>=.6999&&fitted[1]<=.7001);assert.ok(Math.abs(fitted[1]-2*fitted[0])<1e-12);
 assert.equal(result.project.sites[0].params.bhf.value,a.bhf.value);
 assert.ok(result.evaluation.objective<=result.search.objectives[0]*(1+1e-12));
 const selective=fitMultiStart({...p,search_strategy:'selective'},local,evaluate);
 const selected=selective.project.sites.map(s=>s.params.fwhm.value);
 assert.ok(selected[1]>=.6999&&selected[1]<=.7001);assert.ok(Math.abs(selected[1]-2*selected[0])<1e-12);
 assert.equal(selective.project.sites[0].params.bhf.value,a.bhf.value);
 assert.ok(selective.evaluation.objective<=selective.search.objectives[0]*(1+1e-12));
});
test('single-start remains the direct local fit and invalid counts are rejected',()=>{
 const p=structuredClone(fixture);p.max_iterations=1;
 assert.deepEqual(fitMultiStart(p,local,evaluate),local(p));
 for(const n of [0,1.5,33])assert.throws(()=>fitMultiStart({...p,search_starts:n},local,evaluate),/Search starts/);
});

test('selective search keeps the original full fit and records genuine pruning without selecting it', async () => {
 const p=structuredClone(fixture);p.search_starts=4;p.search_strategy='selective';
 p.search_probe={after_iterations:1,objective_ceiling:0}; // stale/imported controls must not prune the first fit
 const original=structuredClone(p),progress=[];let calls=0;
 // A controlled local fitter isolates the wrapper's selection and diagnostics.
 const localFit=(q,notify)=>{
  calls++;
  assert.equal(q.max_iterations,p.max_iterations);
  if(calls===1||calls===4)assert.equal(q.search_probe,undefined);
  else assert.equal(q.search_probe.after_iterations,24);
  const pruned=!!q.search_probe;
  const result={project:structuredClone(q),evaluation:{objective:calls===1?100:200},free_parameters:2,iterations:pruned?24:40,termination:pruned?'ExplorationPruned':'Converged',converged:!pruned,warnings:[]};
  notify?.({project:q,evaluation:result.evaluation,iteration:result.iterations});
  return result;
 };
 const actual=fitMultiStart(p,localFit,()=>({}),s=>progress.push(s));
 assert.equal(actual.evaluation.objective,100);assert.equal(actual.converged,true);
 assert.equal(actual.search.pruned_starts,2);assert.equal(actual.search.total_iterations,128);
 assert.equal(actual.search.completed,4);assert.equal(actual.search.trials.length,4);
 assert.equal(actual.project.search_probe,undefined);
 assert.ok(progress.every(s=>s.project.search_probe===undefined&&s.project.search_strategy==='selective'&&s.project.search_starts===4));
 assert.deepEqual(p,original);
 calls=0;
 assert.deepEqual(await fitMultiStartAsync(p,async(q,n)=>localFit(q,n),()=>({})),actual);
});

test('selective single starts stay full, low iteration limits are respected, and invalid strategies fail',()=>{
 const p=structuredClone(fixture);p.search_strategy='selective';p.max_iterations=1;
 assert.deepEqual(fitMultiStart(p,local,evaluate),{...local(p),project:{...local(p).project,search_strategy:'selective'}});
 p.search_starts=4;const result=fitMultiStart(p,local,evaluate);
 assert.equal(result.search.pruned_starts,0);assert.ok(result.search.trials.every(t=>t.iterations<=1));
 assert.equal(result.project.max_iterations,1);
 assert.throws(()=>fitMultiStart({...p,search_strategy:'unknown'},local,evaluate),/search strategy/);
});

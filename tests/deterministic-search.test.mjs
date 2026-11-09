import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitMultiStartAsync} from '../src/multistart.mjs';
const seed=JSON.parse(readFileSync(new URL('fixtures/public-mixture-coarse.json',import.meta.url))).project;
const tick=()=>new Promise(r=>setImmediate(r));
function local(q,notify) {
 const project=structuredClone(q),site=project.sites[0];
 const objective=1+Math.abs(site.params.cs.value-.3)+Math.abs(site.params.bhf.value-31);
 site.params.cs.value=(site.params.cs.value+.3)/2;
 const pruned=!!q.search_probe&&objective>q.search_probe.objective_ceiling;
 const result={project,evaluation:{objective,y:[objective],parameters:{cs:site.params.cs.value}},iterations:pruned?24:40,free_parameters:2,dof:100,rank:2,converged:!pruned,termination:pruned?'ExplorationPruned':'Converged',errors:{cs:.01},intensity_fractions:[],warnings:[]};
 notify?.({project,evaluation:result.evaluation,iteration:result.iterations});
 return result;
}
test('one helper preserves full candidates, retries, ties, progress and complete results in original order',async()=>{
 for(const strategy of ['full']) {
  const p={...structuredClone(seed),search_starts:12,search_strategy:strategy};
  const initial=structuredClone(p),serialInputs=[],parallelInputs=[],progress=[];
  const evaluate=q=>{if(q.sites[0].params.fwhm.value<.27)throw new Error('linked bound');return {};};
  const serial=await fitMultiStartAsync(p,async q=>{serialInputs.push(structuredClone(q));return local(q);},evaluate);
  let active=0,highWater=0,helpers=0;
  const fit=async(q,n,helper)=>{
   parallelInputs.push(structuredClone(q));active++;highWater=Math.max(highWater,active);if(helper)helpers++;
   try {await tick();return local(q,n);}finally{active--;}
  };
  const actual=await fitMultiStartAsync(p,(q,n)=>fit(q,n,false),evaluate,s=>progress.push(s),undefined,{independentFit:(q,n)=>fit(q,n,true)});
  assert.deepEqual(actual,serial);assert.deepEqual(p,initial);
  assert.equal(helpers,3);assert.equal(highWater,2);assert.equal(active,0);
  const canonical=a=>a.map(v=>JSON.stringify(v)).sort();assert.deepEqual(canonical(parallelInputs),canonical(serialInputs));
  assert.ok(progress.every((s,i)=>!i||s.search_start>=progress[i-1].search_start));
  assert.ok(progress.every((s,i)=>!i||s.evaluation.objective<=progress[i-1].evaluation.objective));
 }
});
test('failed helpers retry the exact candidate on the main lane without losing starts or changing results',async()=>{
 const p={...structuredClone(seed),search_starts:10};
 const serial=await fitMultiStartAsync(p,async q=>local(q),()=>({}));
 let failed=0,main=0;
 const actual=await fitMultiStartAsync(p,async q=>{main++;return local(q);},()=>({}),undefined,undefined,{independentFit:async()=>{failed++;throw undefined;}});
 assert.deepEqual(actual,serial);assert.equal(failed,3);assert.equal(main,10);
});
test('a helper finishing an equal minimum first cannot change the original tie winner',async()=>{
 const p={...structuredClone(seed),search_starts:10};
 const tied=q=>{const r=local(q);r.evaluation.objective=7;return r;};
 const serial=await fitMultiStartAsync(p,async q=>tied(q),()=>({}));
 const actual=await fitMultiStartAsync(p,async q=>{await tick();return tied(q);},()=>({}),undefined,undefined,{independentFit:async q=>tied(q)});
 assert.deepEqual(actual,serial);assert.equal(actual.search.best_start,1);
});
test('invalid independent candidates are skipped with the same rejected-candidate counts',async()=>{
 const p={...structuredClone(seed),search_starts:10};
 const evaluate=q=>{if(q.sites[0].params.cs.value!==p.sites[0].params.cs.value)throw new Error('invalid trial');return {};};
 const serial=await fitMultiStartAsync(p,async q=>local(q),evaluate);
 const actual=await fitMultiStartAsync(p,async q=>local(q),evaluate,undefined,undefined,{independentFit:async q=>local(q)});
 assert.deepEqual(actual,serial);assert.ok(actual.search.rejected_candidates>0);
});
test('fatal first-fit failure closes the helper lane and prevents later speculative starts',async()=>{
 const p={...structuredClone(seed),search_starts:12};let helperCalls=0,canceled=0,release;
 const gate=new Promise(r=>{release=r;});
 await assert.rejects(fitMultiStartAsync(p,async()=>{await tick();throw new Error('first failed');},()=>({}),undefined,undefined,{
  independentFit:async q=>{helperCalls++;await gate;return local(q);},
  cancelIndependent:()=>{canceled++;release();},
 }),/first failed/);
 await tick();assert.equal(canceled,1);assert.equal(helperCalls,1);
});
test('invalid input and single starts never start the helper',async()=>{
 let helpers=0;const execution={independentFit:async q=>{helpers++;return local(q);}};
 for(const n of [0,1.5,33])await assert.rejects(fitMultiStartAsync({...structuredClone(seed),search_starts:n},async q=>local(q),()=>({}),undefined,undefined,execution),/Search starts/);
 const p={...structuredClone(seed),search_starts:1};assert.deepEqual(await fitMultiStartAsync(p,async q=>local(q),()=>({}),undefined,undefined,execution),local(p));assert.equal(helpers,0);
});

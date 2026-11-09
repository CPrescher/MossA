// node --import tsx scripts/benchmark-transmission-analytical.mjs [--repeats 5] [--search]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
import {transmissionAnalyticalCases} from './transmission-analytical-cases.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const repeats=Number(option('--repeats','5')),search=args.includes('--search'),informed=false;
const baseline=new NativeFixture(resolve('validation-data/performance/runtime/transmission-analytical/baseline/native_fixture')),current=new NativeFixture();
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const out=option('--output',`validation-data/performance/transmission-analytical-${informed?'informed':search?'search':'native'}.json`);
const report={date:new Date().toISOString(),repeats,cpu:cpus()[0].model,node:process.version,method:'One excluded warmup, alternating paired full-fit wall times including native JSON transport, Frozen numerical default versus analytical transmission derivatives, with the original forward model, starting coordinates, bounds and solver criteria; current explicit numerical override must retain frozen outputs. Quality thresholds are fixed in analytical-validation.mjs; complete frozen-baseline numeric results must remain exact.',hashes:Object.fromEntries(['scripts/benchmark-transmission-analytical.mjs','scripts/analytical-validation.mjs','src/multistart.mjs','rust-core/src/parallel.rs','rust-core/src/analytical.rs','rust-core/src/analytical/transmission.rs','rust-core/src/native/derivatives.rs','scripts/transmission-analytical-cases.mjs','src/analytical-derivatives.ts','src/comparison.ts','rust-core/src/lib.rs','rust-core/target/release/examples/native_fixture','validation-data/performance/runtime/transmission-analytical/baseline/native_fixture','scripts/analytical-validation.mjs'].map(p=>[p,hash(p)])),runs:[]};
const executions=new WeakMap();
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
async function compute(f,operation,project,state){const response=await f.transport.invoke('native_compute',{session:'analytical',operation,project,...(state?{state}:{})});assert.equal(response.execution.fallback,undefined);const active=executions.get(f);if(active)active.derivative_workers=Math.max(active.derivative_workers,response.execution.derivative_workers);return response.result;}
async function run(f,p){const execution={derivative_workers:1};executions.set(f,execution);let pending;const t=performance.now();const r=search?await fitMultiStartAsync(p,q=>compute(f,'fit',q),q=>compute(f,'evaluate',q),undefined,q=>{pending=q;return compute(f,'finalize-fit',q.project,q.state);}):await compute(f,'fit',p);return {result:r,ms:performance.now()-t,pending,execution};}
try {
 for(const f of [baseline,current])await f.transport.invoke('native_compute_start',{session:'analytical'});
 // Evaluate is synchronous here using the frozen numeric WASM forward model.
 const wasm=await import('../validation-data/performance/runtime/transmission-analytical/baseline/mossa_core.js');await wasm.default({module_or_path:readFileSync('validation-data/performance/runtime/transmission-analytical/baseline/mossa_core_bg.wasm')});
 let cases=transmissionAnalyticalCases(p=>JSON.parse(wasm.evaluate_json(JSON.stringify(p))));

 if(search) cases=cases.filter(c=>['three-sites-squared-source','MS_MexicanMagnetite_transmission','asymmetric-gaussian-source'].includes(c.id)).flatMap(c=>['full','selective'].map(strategy=>({...c,id:c.id+'-'+strategy,project:{...c.project,search_starts:Number(option('--starts','4')),search_strategy:strategy}})));
 if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(option('--case','')));
 for(const c of cases) {
   const p={...c.project};delete p.derivative_method;
   const expected=await run(baseline,c.project),numeric=await run(current,{...c.project,derivative_method:'numerical'});delete numeric.result.project.derivative_method;assert.deepEqual(numeric.result,expected.result,`${c.id}: numerical regression`);
   const warm=await run(current,p);const quality=compareAnalytical(expected.result,warm.result);if(expected.result.converged&&!acceptableFit(warm.result)){quality.passed=false;quality.failures.push('lost-convergence');}const samples={numerical:[],analytical:[]};
   for(let i=0;i<repeats;i++)for(const mode of i%2?['analytical','numerical']:['numerical','analytical']) {
     const r=await run(mode==='analytical'?current:baseline,mode==='analytical'?p:c.project);
     assert.deepEqual(r.result,mode==='analytical'?warm.result:expected.result,`${c.id}: nondeterminism`);samples[mode].push(r.ms);
   }
   const pending=warm.pending??(await compute(current,'fit',{...p,search_defer_uncertainties:true})).finalization;
   assert.ok(pending,'Missing original-coordinate finalization');
   const atPoint=await compute(current,'finalize-fit',pending.project,pending.state);
   if(!search)assert.deepEqual(atPoint,warm.result);
   const numericalAtPoint=await compute(current,'finalize-fit',{...pending.project,derivative_method:'numerical'},pending.state);
   const samePoint=compareAnalytical(numericalAtPoint,atPoint);
   const row={id:c.id,initial_project:p,...quality,same_point_uncertainties:samePoint,execution:{numerical:expected.execution,analytical:warm.execution},converged:[expected.result.converged,warm.result.converged],numerical_ms:median(samples.numerical),analytical_ms:median(samples.analytical),speedup:median(samples.numerical)/median(samples.analytical),samples_ms:samples,reference:expected.result,analytical:warm.result};report.runs.push(row);save();
   console.log(`${c.id}: ${row.numerical_ms.toFixed(2)} -> ${row.analytical_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x); quality ${quality.passed?'PASS':quality.failures.join(',')} objective delta ${quality.delta_objective}`);
 }
 report.passed=report.runs.every(r=>r.passed&&r.same_point_uncertainties.passed);save();if(!report.passed)process.exitCode=1;
}finally{await baseline.close();await current.close();}

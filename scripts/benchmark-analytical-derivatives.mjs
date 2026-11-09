// node --import tsx scripts/benchmark-analytical-derivatives.mjs [--repeats 5] [--search]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {analyticalCases,compareAnalytical} from './analytical-validation.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const repeats=Number(option('--repeats','5')),search=args.includes('--search'),informed=args.includes('--informed');
const baseline=new NativeFixture(resolve('validation-data/performance/runtime/analytical/baseline/native_fixture')),current=new NativeFixture();
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const out=option('--output',`validation-data/performance/analytical-${informed?'informed':search?'search':'native'}.json`);
const report={date:new Date().toISOString(),repeats,cpu:cpus()[0].model,node:process.version,method:'One excluded warmup, alternating paired full-fit wall times including native JSON transport, Auto numerical workers versus analytical Jacobian. Quality thresholds are fixed in analytical-validation.mjs; complete frozen-baseline numeric results must remain exact.',hashes:Object.fromEntries(['rust-core/src/analytical.rs','rust-core/src/lib.rs','rust-core/target/release/examples/native_fixture','validation-data/performance/runtime/analytical/baseline/native_fixture','scripts/analytical-validation.mjs'].map(p=>[p,hash(p)])),runs:[]};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
async function compute(f,operation,project,state){return (await f.transport.invoke('native_compute',{session:'analytical',operation,project,...(state?{state}:{})})).result;}
async function run(f,p){const t=performance.now();const r=search?await fitMultiStartAsync(p,q=>compute(f,'fit',q),q=>compute(f,'evaluate',q),undefined,q=>compute(f,'finalize-fit',q.project,q.state)):await compute(f,'fit',p);return {result:r,ms:performance.now()-t};}
try {
 for(const f of [baseline,current])await f.transport.invoke('native_compute_start',{session:'analytical'});
 // Evaluate is synchronous here using the frozen numeric WASM forward model.
 const wasm=await import('../validation-data/performance/runtime/analytical/baseline/mossa_core.js');await wasm.default({module_or_path:readFileSync('validation-data/performance/runtime/analytical/baseline/mossa_core_bg.wasm')});
 let cases=analyticalCases(p=>JSON.parse(wasm.evaluate_json(JSON.stringify(p))));
 if(informed) {
   cases=cases.filter(c=>c.id.endsWith('_coarse'));
   for(const c of cases) {c.project=(await run(baseline,c.project)).result.project;c.id=c.id.replace('_coarse','_informed');for(const site of c.project.sites){site.params.cs.value+=.01;site.params.fwhm.value*=1.03;site.params.intensity.value*=.98;site.params.bhf.value+=.1;}}
 }
 if(search) cases=cases.filter(c=>['MS_MexicanMagnetite_coarse','MS_Fe2O3-Fe3O4_30-70_coarse','linked-mixed-sites'].includes(c.id)).flatMap(c=>['full','selective'].map(strategy=>({...c,id:c.id+'-'+strategy,project:{...c.project,search_starts:4,search_strategy:strategy}})));
 if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(option('--case','')));
 for(const c of cases) {
   const p={...c.project,derivative_method:'analytical'};
   const expected=await run(baseline,c.project),numeric=await run(current,c.project);assert.deepEqual(numeric.result,expected.result,`${c.id}: numerical regression`);
   const warm=await run(current,p);const quality=compareAnalytical(expected.result,warm.result),samples={numerical:[],analytical:[]};
   for(let i=0;i<repeats;i++)for(const mode of i%2?['analytical','numerical']:['numerical','analytical']) {
     const r=await run(mode==='analytical'?current:baseline,mode==='analytical'?p:c.project);
     assert.deepEqual(r.result,mode==='analytical'?warm.result:expected.result,`${c.id}: nondeterminism`);samples[mode].push(r.ms);
   }
   const row={id:c.id,...quality,numerical_ms:median(samples.numerical),analytical_ms:median(samples.analytical),speedup:median(samples.numerical)/median(samples.analytical),samples_ms:samples,reference:expected.result,analytical:warm.result};report.runs.push(row);save();
   console.log(`${c.id}: ${row.numerical_ms.toFixed(2)} -> ${row.analytical_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x); quality ${quality.passed?'PASS':quality.failures.join(',')} objective delta ${quality.delta_objective}`);
 }
 report.passed=report.runs.every(r=>r.passed);save();if(!report.passed)process.exitCode=1;
}finally{await baseline.close();await current.close();}
